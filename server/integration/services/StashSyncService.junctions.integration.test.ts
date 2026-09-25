/**
 * Integration tests for the batch writers' junctions, against the real test
 * SQLite database (item 42).
 *
 * SYNC-09: a batch deletes its studios' `StudioTag` rows (its groups'
 * `GroupTag` rows) once, then inserts the tags Stash returned. A studio or
 * group whose tags were all removed in Stash loses its rows: when only the
 * ones with tags were rewritten, the old rows survived and kept passing their
 * tags on to the scenes.
 *
 * SYNC-11: a batch writes its rows and their junctions in one transaction,
 * one statement after another, so a failure midway leaves the batch's rows
 * and links as they were (the junction deletes used to commit on their own,
 * and the inserts ran side by side after the upsert). Entities a page
 * references that Peek has not synced yet are fetched by id and written
 * first, before the batch's transaction opens: no Stash request runs while
 * the write lock is held.
 *
 * Item 42 (SYNC-21): after a full sync of a type, the ids in Stash's id list
 * (read by its cleanup) that no page returned are fetched by id: paging by
 * offset skips an entity when another is edited mid-sync.
 *
 * Item 42 (SYNC-17): Stash's tag and performer merges rewrite the links of
 * every entity that carried the merged one without moving its updated_at,
 * and deleting a studio clears its entities' studio the same way. After an
 * incremental sync's cleanup soft-deletes the merged or deleted entity, what
 * linked to it is fetched again by id, into the change set as changed. The
 * derived values (inherited tags, tag counts via performers, gallery
 * inheritance) pass on nothing from a soft-deleted performer, studio, group
 * or tag.
 *
 * Item 42 (SYNC-18): adding images to a gallery in Stash, removing them, or
 * editing its scenes from the gallery moves only the gallery's updated_at,
 * and a gallery's deletion moves nothing, while Peek writes ImageGallery
 * and SceneGallery from the image's and scene's side. After an incremental
 * sync's cleanups, the images and scenes of every gallery it changed or
 * soft-deleted are fetched again by id (the ones Peek links to it and the
 * ones Stash lists in it), into the change set as changed, so what they
 * inherit from the gallery is current after that sync.
 *
 * Rows are seeded under two made-up instances, jn-a and jn-b, with the same
 * ids, which real sync never touches; the batch writers are called directly
 * with Stash-shaped rows, and the page loop with a stub Stash.
 */
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import type {
  FindFilterType,
  MultiCriterionInput,
  TimestampCriterionInput,
} from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { clipPreviewProber } from "../../services/ClipPreviewProber.js";
import {
  type ImageCountScope,
  entityImageCountService,
} from "../../services/EntityImageCountService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { imageGalleryInheritanceService } from "../../services/ImageGalleryInheritanceService.js";
import { sceneTagInheritanceService } from "../../services/SceneTagInheritanceService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  ENTITY_SYNC,
  SYNC_ORDER,
  type SyncEntityOf,
  type SyncRunContext,
  stashSyncService,
} from "../../services/StashSyncService.js";
import {
  type BatchChanges,
  SCOPE_LIMIT,
  SyncChangeSet,
  noChanges,
} from "../../services/SyncChangeSet.js";
import { userStatsService } from "../../services/UserStatsService.js";
import {
  arrayContaining,
  objectContaining,
} from "../../tests/helpers/matchers.js";
import { must } from "../../tests/helpers/must.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";
import { recordStatements } from "../helpers/statementRecorder.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const JN_A = "jn-a";
const JN_B = "jn-b";
const INSTANCES = [JN_A, JN_B];

/** The tags every seeded studio and group points at, on both instances */
const TAG_IDS = ["1", "2", "3"];

const CREATED_AT = "2026-01-01T00:00:00Z";
const UPDATED_AT = "2026-01-02T00:00:00Z";
/** Removing a tag in Stash moves the entity's updated_at */
const LATER_AT = "2026-01-03T00:00:00Z";

type SyncStudio = SyncEntityOf<"studio">;
type SyncGroup = SyncEntityOf<"group">;
type SyncScene = SyncEntityOf<"scene">;
type SyncTag = SyncEntityOf<"tag">;
type SyncGallery = SyncEntityOf<"gallery">;
type SyncPerformer = SyncEntityOf<"performer">;
type SyncClip = SyncEntityOf<"clip">;
type SyncImage = SyncEntityOf<"image">;

/** A studio as Stash's sync query returns it */
function studioRow(
  id: string,
  tagIds: string[],
  updatedAt = UPDATED_AT
): SyncStudio {
  return partialRow<SyncStudio>({
    id,
    name: `Junctions IT studio ${id}`,
    stash_ids: [],
    parent_studio: null,
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    created_at: CREATED_AT,
    updated_at: updatedAt,
  });
}

/** A group as Stash's sync query returns it */
function groupRow(
  id: string,
  tagIds: string[],
  updatedAt = UPDATED_AT
): SyncGroup {
  return partialRow<SyncGroup>({
    id,
    name: `Junctions IT group ${id}`,
    urls: [],
    studio: null,
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    created_at: CREATED_AT,
    updated_at: updatedAt,
  });
}

/** A scene as Stash's compact scene query returns it, with its links */
function sceneRow(
  id: string,
  links: {
    title?: string;
    performers?: string[];
    tags?: string[];
    groups?: string[];
    galleries?: string[];
    studio?: string | null;
  },
  updatedAt = UPDATED_AT
): SyncScene {
  return partialRow<SyncScene>({
    id,
    title: links.title ?? `Junctions IT scene ${id}`,
    urls: [],
    files: [],
    captions: [],
    studio: links.studio ? partialRow({ id: links.studio }) : null,
    performers: (links.performers ?? []).map((p) => partialRow({ id: p })),
    tags: (links.tags ?? []).map((t) => partialRow({ id: t })),
    groups: (links.groups ?? []).map((g, i) =>
      partialRow({ group: partialRow({ id: g }), scene_index: i + 1 })
    ),
    galleries: (links.galleries ?? []).map((g) => partialRow({ id: g })),
    created_at: CREATED_AT,
    updated_at: updatedAt,
  });
}

/** A tag as Stash's sync query returns it */
function tagRow(id: string): SyncTag {
  return partialRow<SyncTag>({
    id,
    name: `Junctions IT tag ${id}`,
    stash_ids: [],
    aliases: [],
    parents: [],
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  });
}

/** A gallery as Stash's sync query returns it */
function galleryRow(
  id: string,
  studioId: string | null,
  links: { performers?: string[]; tags?: string[] } = {},
  updatedAt = UPDATED_AT
): SyncGallery {
  return partialRow<SyncGallery>({
    id,
    title: `Junctions IT gallery ${id}`,
    urls: [],
    files: [],
    performers: (links.performers ?? []).map((p) => partialRow({ id: p })),
    tags: (links.tags ?? []).map((t) => partialRow({ id: t })),
    scenes: [],
    studio: studioId === null ? null : partialRow({ id: studioId }),
    folder: null,
    cover: null,
    image_count: 0,
    created_at: CREATED_AT,
    updated_at: updatedAt,
  });
}

/** A performer as Stash's sync query returns it */
function performerRow(id: string, tagIds: string[]): SyncPerformer {
  return partialRow<SyncPerformer>({
    id,
    name: `Junctions IT performer ${id}`,
    stash_ids: [],
    alias_list: [],
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  });
}

/** A clip (scene marker) as Stash's sync query returns it */
function clipRow(
  id: string,
  sceneId: string,
  primaryTagId: string,
  tagIds: string[]
): SyncClip {
  const path = `http://stash.invalid/scene/${sceneId}/scene_marker/${id}`;
  return partialRow<SyncClip>({
    id,
    title: `Junctions IT clip ${id}`,
    seconds: 10,
    end_seconds: null,
    scene: partialRow({ id: sceneId }),
    primary_tag: partialRow({ id: primaryTagId }),
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    preview: `${path}/preview`,
    screenshot: `${path}/screenshot`,
    stream: `${path}/stream`,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  });
}

/** An image as Stash's sync query returns it, with its links */
function imageRow(
  id: string,
  links: {
    performers?: string[];
    tags?: string[];
    galleries?: string[];
    studio?: string | null;
  }
): SyncImage {
  return partialRow<SyncImage>({
    id,
    title: `Junctions IT image ${id}`,
    urls: [],
    files: [],
    paths: {},
    performers: (links.performers ?? []).map((p) => partialRow({ id: p })),
    tags: (links.tags ?? []).map((t) => partialRow({ id: t })),
    galleries: (links.galleries ?? []).map((g) => partialRow({ id: g })),
    studio: links.studio ? partialRow({ id: links.studio }) : null,
    created_at: CREATED_AT,
    updated_at: UPDATED_AT,
  });
}

function newRun(): SyncRunContext {
  return {
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  };
}

function syncStudios(
  instanceId: string,
  studios: SyncStudio[]
): Promise<BatchChanges> {
  return ENTITY_SYNC.studio.processBatch(studios, instanceId, newRun());
}

function syncGroups(
  instanceId: string,
  groups: SyncGroup[]
): Promise<BatchChanges> {
  return ENTITY_SYNC.group.processBatch(groups, instanceId, newRun());
}

function syncScenes(
  instanceId: string,
  scenes: SyncScene[]
): Promise<BatchChanges> {
  return ENTITY_SYNC.scene.processBatch(scenes, instanceId, newRun());
}

/** A junction's rows on the seed instances, as `<near>@<instance>:<tag>@<instance>` */
async function tagLinks(table: "StudioTag" | "GroupTag"): Promise<string[]> {
  const [near, nearInstance] =
    table === "StudioTag"
      ? ["studioId", "studioInstanceId"]
      : ["groupId", "groupInstanceId"];
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      nearId: string;
      nearInstanceId: string;
      tagId: string;
      tagInstanceId: string;
    }>
  >(
    `SELECT "${near}" AS nearId, "${nearInstance}" AS nearInstanceId, tagId, tagInstanceId
     FROM "${table}" WHERE "${nearInstance}" IN (?, ?)`,
    JN_A,
    JN_B
  );
  return rows
    .map((r) => `${r.nearId}@${r.nearInstanceId}:${r.tagId}@${r.tagInstanceId}`)
    .sort();
}

/** A scene junction's rows on jn-a, as `<scene>:<far>` */
async function sceneLinks(
  table: "ScenePerformer" | "SceneTag" | "SceneGroup" | "SceneGallery"
): Promise<string[]> {
  const far = {
    ScenePerformer: "performerId",
    SceneTag: "tagId",
    SceneGroup: "groupId",
    SceneGallery: "galleryId",
  }[table];
  const rows = await prisma.$queryRawUnsafe<
    Array<{ sceneId: string; farId: string }>
  >(
    `SELECT sceneId, "${far}" AS farId FROM "${table}" WHERE sceneInstanceId = ?`,
    JN_A
  );
  return rows.map((r) => `${r.sceneId}:${r.farId}`).sort();
}

/** jn-a's scene rows and every scene junction, as a later read would see them */
async function sceneState() {
  const scenes = await prisma.$queryRawUnsafe<
    Array<{ id: string; title: string | null; updatedAt: string | null }>
  >(
    `SELECT id, title, CAST(stashUpdatedAt AS TEXT) AS updatedAt
     FROM StashScene WHERE stashInstanceId = ? ORDER BY id`,
    JN_A
  );
  return {
    scenes,
    performers: await sceneLinks("ScenePerformer"),
    tags: await sceneLinks("SceneTag"),
    groups: await sceneLinks("SceneGroup"),
    galleries: await sceneLinks("SceneGallery"),
  };
}

/** The performers, group and gallery jn-a's scenes link to */
async function seedSceneParents(): Promise<void> {
  await prisma.stashPerformer.createMany({
    data: ["1", "2"].map((id) => ({
      id,
      stashInstanceId: JN_A,
      name: `Junctions IT performer ${id}`,
    })),
  });
  await prisma.stashGroup.create({
    data: { id: "1", stashInstanceId: JN_A, name: "Junctions IT group 1" },
  });
  await prisma.stashGallery.create({
    data: { id: "1", stashInstanceId: JN_A, title: "Junctions IT gallery 1" },
  });
}

/** `id@instance` of each ref, sorted */
function refs(list: ReadonlyArray<{ id: string; instanceId: string }>) {
  return list.map((r) => `${r.id}@${r.instanceId}`).sort();
}

async function clearSeed(): Promise<void> {
  const inSeed = { in: INSTANCES };
  await prisma.clipTag.deleteMany({ where: { clipInstanceId: inSeed } });
  await prisma.stashClip.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.imagePerformer.deleteMany({
    where: { imageInstanceId: inSeed },
  });
  await prisma.imageTag.deleteMany({ where: { imageInstanceId: inSeed } });
  await prisma.imageGallery.deleteMany({ where: { imageInstanceId: inSeed } });
  await prisma.stashImage.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.galleryPerformer.deleteMany({
    where: { galleryInstanceId: inSeed },
  });
  await prisma.galleryTag.deleteMany({ where: { galleryInstanceId: inSeed } });
  await prisma.performerTag.deleteMany({
    where: { performerInstanceId: inSeed },
  });
  await prisma.scenePerformer.deleteMany({
    where: { sceneInstanceId: inSeed },
  });
  await prisma.sceneTag.deleteMany({ where: { sceneInstanceId: inSeed } });
  await prisma.sceneGroup.deleteMany({ where: { sceneInstanceId: inSeed } });
  await prisma.sceneGallery.deleteMany({ where: { sceneInstanceId: inSeed } });
  await prisma.studioTag.deleteMany({ where: { studioInstanceId: inSeed } });
  await prisma.groupTag.deleteMany({ where: { groupInstanceId: inSeed } });
  await prisma.stashScene.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashGallery.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashPerformer.deleteMany({
    where: { stashInstanceId: inSeed },
  });
  await prisma.stashStudio.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashGroup.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.stashTag.deleteMany({ where: { stashInstanceId: inSeed } });
  await prisma.syncState.deleteMany({ where: { stashInstanceId: inSeed } });
}

/** What the stub Stash was asked for, and whether a transaction was open */
interface StashRequest {
  op: string;
  ids?: string[];
  inTransaction: boolean;
}

/** The id list a request narrows to, if any (GraphQL takes one id alone) */
type IdsVariable = string | readonly string[] | null | undefined;
const idList = (ids: IdsVariable) => (ids == null ? undefined : [ids].flat());

/** One page of `rows` as `filter` asks for it, narrowed to `ids` when given */
function page<T extends { id: string }>(
  rows: readonly T[],
  filter: FindFilterType | null | undefined,
  ids: IdsVariable
): { count: number; items: T[] } {
  const wanted = idList(ids);
  const matching = wanted
    ? rows.filter((row) => wanted.includes(row.id))
    : rows;
  const perPage = filter?.per_page ?? 25;
  const pageNo = filter?.page ?? 1;
  return {
    count: matching.length,
    items: matching.slice((pageNo - 1) * perPage, pageNo * perPage),
  };
}

/**
 * Routes jn-a's Stash client to a stub holding `library`, recording each
 * request and whether an interactive transaction was open when it went out.
 * Tag pages leave out `tagsMissingFromPages` unless asked for them by id;
 * Stash's tag id list (the cleanup's) has every tag.
 */
function stubStash(
  library: {
    scenes: SyncScene[];
    tags: SyncTag[];
    galleries: SyncGallery[];
    studios: SyncStudio[];
    tagsMissingFromPages?: string[];
  },
  inTransaction: () => boolean
): StashRequest[] {
  const requests: StashRequest[] = [];
  const record = (op: string, ids: IdsVariable) => {
    const list = idList(ids);
    requests.push({
      op,
      ...(list ? { ids: list } : {}),
      inTransaction: inTransaction(),
    });
  };
  const client: StashClient = partialRow<StashClient>({
    findScenesCompact: (vars) => {
      record("findScenes", vars?.ids);
      const { count, items } = page(library.scenes, vars?.filter, vars?.ids);
      return Promise.resolve({
        findScenes: { count, duration: 0, filesize: 0, scenes: items },
      });
    },
    findTags: (vars) => {
      record("findTags", vars?.ids);
      const missing = vars?.ids ? [] : (library.tagsMissingFromPages ?? []);
      const { count, items } = page(
        library.tags.filter((tag) => !missing.includes(tag.id)),
        vars?.filter,
        vars?.ids
      );
      return Promise.resolve({ findTags: { count, tags: items } });
    },
    findTagIDs: (vars) => {
      record("findTagIDs", undefined);
      const { count, items } = page(library.tags, vars?.filter, undefined);
      return Promise.resolve({
        findTags: { count, tags: items.map(({ id }) => ({ id })) },
      });
    },
    findGalleries: (vars) => {
      record("findGalleries", vars?.ids);
      const { count, items } = page(library.galleries, vars?.filter, vars?.ids);
      return Promise.resolve({ findGalleries: { count, galleries: items } });
    },
    findStudios: (vars) => {
      record("findStudios", vars?.ids);
      const { count, items } = page(library.studios, vars?.filter, vars?.ids);
      return Promise.resolve({ findStudios: { count, studios: items } });
    },
    withSignal: () => client,
  });
  const realGet = stashInstanceManager.get.bind(stashInstanceManager);
  vi.spyOn(stashInstanceManager, "get").mockImplementation((id) =>
    id === JN_A ? client : realGet(id)
  );
  return requests;
}

describeWithDb(
  "StashSyncService studio and group tag junctions (integration)",
  () => {
    beforeEach(async () => {
      await clearSeed();
      // The same tag ids on both instances: the junctions' far sides
      await prisma.stashTag.createMany({
        data: INSTANCES.flatMap((stashInstanceId) =>
          TAG_IDS.map((id) => ({
            id,
            stashInstanceId,
            name: `Junctions IT tag ${id}`,
          }))
        ),
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await clearSeed();
    });

    it("a studio whose tags were all removed in Stash loses its StudioTag rows", async () => {
      await syncStudios(JN_A, [
        studioRow("1", ["1", "2"]),
        studioRow("2", ["3"]),
      ]);
      expect(await tagLinks("StudioTag")).toEqual([
        `1@${JN_A}:1@${JN_A}`,
        `1@${JN_A}:2@${JN_A}`,
        `2@${JN_A}:3@${JN_A}`,
      ]);

      // Studio 1's tags removed in Stash; studio 2 in the same page keeps its tag
      const changes = await syncStudios(JN_A, [
        studioRow("1", [], LATER_AT),
        studioRow("2", ["3"]),
      ]);

      expect(await tagLinks("StudioTag")).toEqual([`2@${JN_A}:3@${JN_A}`]);
      // Its scenes stop inheriting the tags: the post-sync steps see the change
      expect(refs(changes.tagSetChanged)).toEqual([`1@${JN_A}`]);
      // The far sides: the tags it lost
      expect(refs(changes.farSides.StudioTag ?? [])).toEqual([
        `1@${JN_A}`,
        `2@${JN_A}`,
      ]);
    });

    it("the same for a group", async () => {
      await syncGroups(JN_A, [groupRow("1", ["1", "2"]), groupRow("2", ["3"])]);
      expect(await tagLinks("GroupTag")).toEqual([
        `1@${JN_A}:1@${JN_A}`,
        `1@${JN_A}:2@${JN_A}`,
        `2@${JN_A}:3@${JN_A}`,
      ]);

      const changes = await syncGroups(JN_A, [
        groupRow("1", [], LATER_AT),
        groupRow("2", ["3"]),
      ]);

      expect(await tagLinks("GroupTag")).toEqual([`2@${JN_A}:3@${JN_A}`]);
      expect(refs(changes.tagSetChanged)).toEqual([`1@${JN_A}`]);
      // The far sides: the tags it lost
      expect(refs(changes.farSides.GroupTag ?? [])).toEqual([
        `1@${JN_A}`,
        `2@${JN_A}`,
      ]);
    });

    it("jn-b's StudioTag rows for the same studio id stay", async () => {
      await syncStudios(JN_A, [studioRow("1", ["1", "2"])]);
      await syncStudios(JN_B, [studioRow("1", ["1", "2"])]);

      // Studio 1 loses its tags on jn-a only
      await syncStudios(JN_A, [studioRow("1", [], LATER_AT)]);

      expect(await tagLinks("StudioTag")).toEqual([
        `1@${JN_B}:1@${JN_B}`,
        `1@${JN_B}:2@${JN_B}`,
      ]);
    });
    it("a scene batch whose tag insert fails leaves the batch's previous scene rows and junctions as they were", async () => {
      await seedSceneParents();
      await syncScenes(JN_A, [
        sceneRow("1", {
          performers: ["1"],
          tags: ["1", "2"],
          groups: ["1"],
          galleries: ["1"],
        }),
        sceneRow("2", { performers: ["2"], tags: ["3"] }),
      ]);
      const before = await sceneState();
      expect(before.tags).toEqual(["1:1", "1:2", "2:3"]);

      // Both scenes change; scene 2 now carries tag 9, which Peek does not
      // hold, so its SceneTag row fails the tag's foreign key
      await expect(
        syncScenes(JN_A, [
          sceneRow(
            "1",
            { title: "Renamed", performers: ["2"], tags: ["2"] },
            LATER_AT
          ),
          sceneRow("2", { performers: ["1"], tags: ["3", "9"] }, LATER_AT),
        ])
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);

      // The whole batch rolled back: titles, updated_at and every link
      expect(await sceneState()).toEqual(before);
    });

    it("a scene referencing a tag Peek has not synced yet is written with that tag", async () => {
      // Stash holds tag 9 and gallery 7 (of studio 4), which Peek has not
      // synced: created after this sync's tag, studio and gallery pages
      const recorder = recordStatements();
      const requests = stubStash(
        {
          scenes: [sceneRow("1", { tags: ["1", "9"], galleries: ["7"] })],
          tags: [tagRow("9")],
          galleries: [galleryRow("7", "4")],
          studios: [studioRow("4", [])],
        },
        () => recorder.inTransaction()
      );
      const run = newRun();
      try {
        await stashSyncService["paginate"]("scene", JN_A, {}, run);
      } finally {
        recorder.restore();
      }

      expect(await sceneLinks("SceneTag")).toEqual(["1:1", "1:9"]);
      expect(await sceneLinks("SceneGallery")).toEqual(["1:7"]);
      // The gallery's own studio came first, for its foreign key
      const gallery = await prisma.stashGallery.findUnique({
        where: { id_stashInstanceId: { id: "7", stashInstanceId: JN_A } },
        select: { studioId: true, studioInstanceId: true },
      });
      expect(gallery).toEqual({ studioId: "4", studioInstanceId: JN_A });
      expect(
        await prisma.stashStudio.count({
          where: { id: "4", stashInstanceId: JN_A },
        })
      ).toBe(1);

      // Each missing entity fetched by id, before its referrer's batch, and
      // no request while a transaction held the write lock
      expect(requests).toEqual([
        { op: "findScenes", inTransaction: false },
        { op: "findTags", ids: ["9"], inTransaction: false },
        { op: "findGalleries", ids: ["7"], inTransaction: false },
        { op: "findStudios", ids: ["4"], inTransaction: false },
      ]);
      // They reach the post-sync steps as new
      expect(refs(run.changes.changed("tag").refs)).toEqual([`9@${JN_A}`]);
      expect(refs(run.changes.changed("gallery").refs)).toEqual([`7@${JN_A}`]);
      expect(refs(run.changes.changed("studio").refs)).toEqual([`4@${JN_A}`]);
      expect(refs(run.changes.changed("scene").refs)).toEqual([`1@${JN_A}`]);
    });

    it("after a full sync, ids in Stash's id list that no page returned are fetched by id", async () => {
      // Stash holds tags 1-4, but its pages never return tag 4: an entity
      // edited mid-sync moved to the end of Stash's order and shifted tag 4
      // onto a page already fetched. Its id list, read by the cleanup, has it
      const requests = stubStash(
        {
          scenes: [],
          tags: ["1", "2", "3", "4"].map(tagRow),
          galleries: [],
          studios: [],
          tagsMissingFromPages: ["4"],
        },
        () => false
      );
      const run = newRun();

      const result = await stashSyncService["syncEntityType"](
        "tag",
        JN_A,
        "full",
        run,
        new Map()
      );

      const stored = await prisma.stashTag.findMany({
        where: { stashInstanceId: JN_A },
        select: { id: true, name: true },
        orderBy: { id: "asc" },
      });
      expect(stored).toEqual(
        ["1", "2", "3", "4"].map((id) => ({
          id,
          name: `Junctions IT tag ${id}`,
        }))
      );
      // The pages, the cleanup's id list, then the one tag no page returned
      expect(requests.map(({ op, ids }) => ({ op, ids }))).toEqual([
        { op: "findTags", ids: undefined },
        { op: "findTagIDs", ids: undefined },
        { op: "findTags", ids: ["4"] },
      ]);
      expect(result.error).toBeUndefined();
      // Written like any page: it reaches the post-sync steps (tags 1-3 were
      // seeded without Stash's updated_at, so they count as changed too)
      expect(refs(run.changes.changed("tag").refs)).toEqual(
        ["1", "2", "3", "4"].map((id) => `${id}@${JN_A}`)
      );
    });

    it("a batch's junction inserts run one after another on one connection", async () => {
      await seedSceneParents();
      const recorder = recordStatements();
      try {
        await syncScenes(JN_A, [
          sceneRow("1", {
            performers: ["1", "2"],
            tags: ["1", "2"],
            groups: ["1"],
            galleries: ["1"],
          }),
          sceneRow("2", { performers: ["2"], tags: ["3"] }),
        ]);
      } finally {
        recorder.restore();
      }

      // One transaction, every statement on it, never two at once
      expect(recorder.transactions()).toBe(1);
      expect(recorder.statements.filter((s) => !s.inTransaction)).toEqual([]);
      expect(recorder.maxInFlight()).toBe(1);
      // In order: the stored state, the old links, the rows, the new links,
      // the sort columns derived from them
      const kind = (sql: string) =>
        (
          /^\s*(SELECT|DELETE FROM|INSERT OR IGNORE INTO|INSERT INTO|UPDATE)\s+"?(\w+)/.exec(
            sql
          ) ?? []
        )
          .slice(1)
          .join(" ");
      expect(recorder.statements.map((s) => kind(s.sql))).toEqual([
        "SELECT id",
        "DELETE FROM ScenePerformer",
        "DELETE FROM SceneTag",
        "DELETE FROM SceneGroup",
        "DELETE FROM SceneGallery",
        "INSERT INTO StashScene",
        "INSERT OR IGNORE INTO ScenePerformer",
        "INSERT OR IGNORE INTO SceneTag",
        "INSERT OR IGNORE INTO SceneGroup",
        "INSERT OR IGNORE INTO SceneGallery",
        "UPDATE StashScene",
      ]);
      expect(await sceneLinks("SceneGroup")).toEqual(["1:1"]);
      expect(await sceneLinks("ScenePerformer")).toEqual(["1:1", "1:2", "2:2"]);
    });
  }
);

/** What a stub Stash holds, as each type's sync query returns it */
interface Library {
  tag: SyncTag[];
  studio: SyncStudio[];
  performer: SyncPerformer[];
  group: SyncGroup[];
  gallery: SyncGallery[];
  scene: SyncScene[];
  clip: SyncClip[];
  image: SyncImage[];
}

/** A library holding `rows`, and nothing of the other types */
function library(rows: Partial<Library>): Library {
  return {
    tag: [],
    studio: [],
    performer: [],
    group: [],
    gallery: [],
    scene: [],
    clip: [],
    image: [],
    ...rows,
  };
}

/** Writes `lib` on `instanceId` as a sync does, through each batch writer */
async function writeLibrary(instanceId: string, lib: Library): Promise<void> {
  const run = newRun();
  await ENTITY_SYNC.tag.processBatch(lib.tag, instanceId, run);
  await ENTITY_SYNC.studio.processBatch(lib.studio, instanceId, run);
  await ENTITY_SYNC.performer.processBatch(lib.performer, instanceId, run);
  await ENTITY_SYNC.group.processBatch(lib.group, instanceId, run);
  await ENTITY_SYNC.gallery.processBatch(lib.gallery, instanceId, run);
  await ENTITY_SYNC.scene.processBatch(lib.scene, instanceId, run);
  await ENTITY_SYNC.clip.processBatch(lib.clip, instanceId, run);
  await ENTITY_SYNC.image.processBatch(lib.image, instanceId, run);
}

/** Every type of `instanceId` synced up to UPDATED_AT: the next sync is incremental */
async function markSynced(instanceId: string): Promise<void> {
  await prisma.syncState.createMany({
    data: SYNC_ORDER.map((entityType) => ({
      stashInstanceId: instanceId,
      entityType,
      lastIncrementalSyncTimestamp: UPDATED_AT,
      lastIncrementalSyncActual: new Date(),
    })),
  });
}

/** A request the stub answered by ids */
interface IdRequest {
  op: string;
  ids: string[];
}

/**
 * Whether `row` was updated after an incremental page's `updated_at`
 * criterion, if any: sync sends its watermark without an offset, and Stash
 * compares wall-clock times (the rows here are in UTC)
 */
function updatedAfter(
  row: { updated_at?: string | null },
  since: TimestampCriterionInput | null | undefined
): boolean {
  if (!since) return true;
  return (
    typeof row.updated_at === "string" &&
    Date.parse(row.updated_at) > Date.parse(`${since.value}Z`)
  );
}

/** The rows in any of the galleries a `galleries` INCLUDES criterion names */
function inGalleries<T extends { galleries: ReadonlyArray<{ id: string }> }>(
  rows: T[],
  galleries: MultiCriterionInput | null | undefined
): T[] {
  if (!galleries) return rows;
  const wanted = new Set(galleries.value ?? []);
  return rows.filter((row) => row.galleries.some((g) => wanted.has(g.id)));
}

/**
 * Routes `instanceId`'s Stash client to a stub holding `lib`: a page asking
 * for what changed since the last sync gets the rows updated after it
 * (none, after an edit that moved no entity's updated_at, such as a merge
 * or a deletion), a page of ids gets those rows, the cleanup's id lists
 * hold every row, and the scene and image id lists narrow to a `galleries`
 * criterion. Returns the requests made by ids; one by ids for an operation
 * in `failing` fails.
 */
function stubStashLibrary(
  instanceId: string,
  lib: Library,
  failing: readonly string[] = []
): IdRequest[] {
  const requests: IdRequest[] = [];
  function answer<T extends { id: string; updated_at?: string | null }>(
    op: string,
    rows: T[],
    filter: FindFilterType | null | undefined,
    ids: IdsVariable,
    since: TimestampCriterionInput | null | undefined
  ): Promise<{ count: number; items: T[] }> {
    const wanted = idList(ids);
    if (wanted) {
      requests.push({ op, ids: wanted });
      if (failing.includes(op)) {
        return Promise.reject(new Error(`${op} failed: Stash is down`));
      }
    }
    return Promise.resolve(
      page(
        rows.filter((row) => updatedAfter(row, since)),
        filter,
        ids
      )
    );
  }
  const idsOf = (
    rows: ReadonlyArray<{ id: string }>,
    filter: FindFilterType | null | undefined
  ) => {
    const { count, items } = page(rows, filter, undefined);
    return { count, ids: items.map(({ id }) => ({ id })) };
  };

  const client: StashClient = partialRow<StashClient>({
    findTags: (vars) =>
      answer(
        "findTags",
        lib.tag,
        vars?.filter,
        vars?.ids,
        vars?.tag_filter?.updated_at
      ).then(({ count, items }) => ({ findTags: { count, tags: items } })),
    findStudios: (vars) =>
      answer(
        "findStudios",
        lib.studio,
        vars?.filter,
        vars?.ids,
        vars?.studio_filter?.updated_at
      ).then(({ count, items }) => ({
        findStudios: { count, studios: items },
      })),
    findPerformers: (vars) =>
      answer(
        "findPerformers",
        lib.performer,
        vars?.filter,
        vars?.ids,
        vars?.performer_filter?.updated_at
      ).then(({ count, items }) => ({
        findPerformers: { count, performers: items },
      })),
    findGroups: (vars) =>
      answer(
        "findGroups",
        lib.group,
        vars?.filter,
        vars?.ids,
        vars?.group_filter?.updated_at
      ).then(({ count, items }) => ({ findGroups: { count, groups: items } })),
    findGalleries: (vars) =>
      answer(
        "findGalleries",
        lib.gallery,
        vars?.filter,
        vars?.ids,
        vars?.gallery_filter?.updated_at
      ).then(({ count, items }) => ({
        findGalleries: { count, galleries: items },
      })),
    findScenesCompact: (vars) =>
      answer(
        "findScenes",
        lib.scene,
        vars?.filter,
        vars?.ids,
        vars?.scene_filter?.updated_at
      ).then(({ count, items }) => ({
        findScenes: { count, duration: 0, filesize: 0, scenes: items },
      })),
    // Clips page and list their ids for cleanup through the same operation
    findSceneMarkers: (vars) =>
      answer(
        "findSceneMarkers",
        lib.clip,
        vars?.filter,
        vars?.ids,
        vars?.scene_marker_filter?.updated_at
      ).then(({ count, items }) => ({
        findSceneMarkers: { count, scene_markers: items },
      })),
    // Images narrow by Stash's integer ids
    findImages: (vars) =>
      answer(
        "findImages",
        lib.image,
        vars?.filter,
        vars?.image_ids == null
          ? undefined
          : [vars.image_ids].flat().map(String),
        vars?.image_filter?.updated_at
      ).then(({ count, items }) => ({ findImages: { count, images: items } })),
    findTagIDs: (vars) => {
      const { count, ids } = idsOf(lib.tag, vars?.filter);
      return Promise.resolve({ findTags: { count, tags: ids } });
    },
    findStudioIDs: (vars) => {
      const { count, ids } = idsOf(lib.studio, vars?.filter);
      return Promise.resolve({ findStudios: { count, studios: ids } });
    },
    findPerformerIDs: (vars) => {
      const { count, ids } = idsOf(lib.performer, vars?.filter);
      return Promise.resolve({ findPerformers: { count, performers: ids } });
    },
    findGroupIDs: (vars) => {
      const { count, ids } = idsOf(lib.group, vars?.filter);
      return Promise.resolve({ findGroups: { count, groups: ids } });
    },
    findGalleryIDs: (vars) => {
      const { count, ids } = idsOf(lib.gallery, vars?.filter);
      return Promise.resolve({ findGalleries: { count, galleries: ids } });
    },
    findSceneIDs: (vars) => {
      const { count, ids } = idsOf(
        inGalleries(lib.scene, vars?.scene_filter?.galleries),
        vars?.filter
      );
      return Promise.resolve({ findScenes: { count, scenes: ids } });
    },
    findImageIDs: (vars) => {
      const { count, ids } = idsOf(
        inGalleries(lib.image, vars?.image_filter?.galleries),
        vars?.filter
      );
      return Promise.resolve({ findImages: { count, images: ids } });
    },
    // The collection hierarchy, read on every sync: none
    findGroupRelations: () =>
      Promise.resolve({
        findGroups: {
          count: lib.group.length,
          groups: lib.group.map(({ id }) => ({ id, sub_groups: [] })),
        },
      }),
    withSignal: () => client,
  });
  const realGet = stashInstanceManager.get.bind(stashInstanceManager);
  vi.spyOn(stashInstanceManager, "get").mockImplementation((id) =>
    id === instanceId ? client : realGet(id)
  );
  return requests;
}

/**
 * jn's library with one entity of every type linked to tag `tagId`, and
 * the tags `tagIds`: before tag 1 was merged into tag 2 in Stash (tag 1
 * everywhere, tags 1 and 2), and after (tag 2 everywhere, tag 2 alone),
 * the merge having moved no linked entity's updated_at. Scene 2 carries
 * tag 2 all along.
 */
function taggedLibrary(tagId: string, tagIds: string[]): Library {
  return library({
    tag: tagIds.map((id) => tagRow(id)),
    studio: [studioRow("1", [tagId])],
    performer: [performerRow("1", [tagId])],
    group: [groupRow("1", [tagId])],
    gallery: [galleryRow("1", null, { tags: [tagId] })],
    scene: [sceneRow("1", { tags: [tagId] }), sceneRow("2", { tags: ["2"] })],
    clip: [clipRow("1", "1", tagId, [tagId])],
    image: [imageRow("1", { tags: [tagId] })],
  });
}

/** The same for performer `performerId` of `performerIds` (a performer merge) */
function performerLibrary(
  performerId: string,
  performerIds: string[]
): Library {
  return library({
    performer: performerIds.map((id) => performerRow(id, [])),
    gallery: [galleryRow("1", null, { performers: [performerId] })],
    scene: [sceneRow("1", { performers: [performerId] })],
    image: [imageRow("1", { performers: [performerId] })],
  });
}

/** The same for studio `studioId` of `studioIds` (none: it was deleted) */
function studioLibrary(studioId: string | null, studioIds: string[]): Library {
  return library({
    studio: studioIds.map((id) => studioRow(id, [])),
    gallery: [galleryRow("1", studioId)],
    scene: [sceneRow("1", { studio: studioId })],
    image: [imageRow("1", { studio: studioId })],
  });
}

/** `instanceId`'s links to tags, per junction as `<near>:<tag>`, and its clips' primary tags */
async function tagLinksOn(
  instanceId: string
): Promise<Record<string, string[]>> {
  const junctions = [
    ["StudioTag", "studioId", "studioInstanceId"],
    ["PerformerTag", "performerId", "performerInstanceId"],
    ["GroupTag", "groupId", "groupInstanceId"],
    ["GalleryTag", "galleryId", "galleryInstanceId"],
    ["SceneTag", "sceneId", "sceneInstanceId"],
    ["ClipTag", "clipId", "clipInstanceId"],
    ["ImageTag", "imageId", "imageInstanceId"],
  ] as const;
  const links: Record<string, string[]> = {};
  for (const [table, near, nearInstance] of junctions) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ nearId: string; tagId: string }>
    >(
      `SELECT "${near}" AS nearId, "tagId" AS tagId FROM "${table}" WHERE "${nearInstance}" = ?`,
      instanceId
    );
    links[table] = rows.map((r) => `${r.nearId}:${r.tagId}`).sort();
  }
  const clips = await prisma.stashClip.findMany({
    where: { stashInstanceId: instanceId },
    select: { id: true, primaryTagId: true },
    orderBy: { id: "asc" },
  });
  links.clipPrimaryTag = clips.map((c) => `${c.id}:${c.primaryTagId}`);
  return links;
}

/** `instanceId`'s links to performers, per junction as `<near>:<performer>` */
async function performerLinksOn(
  instanceId: string
): Promise<Record<string, string[]>> {
  const junctions = [
    ["GalleryPerformer", "galleryId", "galleryInstanceId"],
    ["ScenePerformer", "sceneId", "sceneInstanceId"],
    ["ImagePerformer", "imageId", "imageInstanceId"],
  ] as const;
  const links: Record<string, string[]> = {};
  for (const [table, near, nearInstance] of junctions) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ nearId: string; performerId: string }>
    >(
      `SELECT "${near}" AS nearId, "performerId" AS performerId FROM "${table}" WHERE "${nearInstance}" = ?`,
      instanceId
    );
    links[table] = rows.map((r) => `${r.nearId}:${r.performerId}`).sort();
  }
  return links;
}

/** The studio of `instanceId`'s galleries, scenes and images, as `<id>:<studio>` */
async function studiosOn(
  instanceId: string
): Promise<Record<string, string[]>> {
  const studios: Record<string, string[]> = {};
  for (const table of ["StashGallery", "StashScene", "StashImage"] as const) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; studioId: string | null }>
    >(
      `SELECT "id", "studioId" FROM "${table}" WHERE "stashInstanceId" = ? ORDER BY "id"`,
      instanceId
    );
    studios[table] = rows.map((r) => `${r.id}:${r.studioId ?? "none"}`);
  }
  return studios;
}

/** The ids of `table`'s live rows on `instanceId` */
async function liveIds(
  table: "StashTag" | "StashPerformer" | "StashStudio",
  instanceId: string
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "${table}" WHERE "stashInstanceId" = ? AND "deletedAt" IS NULL ORDER BY "id"`,
    instanceId
  );
  return rows.map((r) => r.id);
}

/** A scene's inheritedTagIds as stored, sorted */
async function inheritedTagsOf(
  instanceId: string,
  sceneId: string
): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ tagId: string }>>(
    `SELECT je.value AS tagId
     FROM "StashScene" s, json_each(COALESCE(s."inheritedTagIds", '[]')) je
     WHERE s."id" = ? AND s."stashInstanceId" = ?
     ORDER BY je.value`,
    sceneId,
    instanceId
  );
  return rows.map((r) => r.tagId);
}

/**
 * Scene 1 of jn-a inherits from performers 1 (tags 1 and 3) and 2 (tag 2),
 * studio 1 and group 1 (tag 2 each); image 1 is in gallery 1, which has
 * performers 1 and 2 and tags 1 and 3 to hand down. Tag 3, performer 2,
 * studio 1 and group 1 are then soft-deleted, as a cleanup leaves what
 * Stash deleted or merged until what linked to it is fetched again.
 */
async function seedSoftDeletedSources(): Promise<void> {
  await writeLibrary(
    JN_A,
    library({
      tag: ["1", "2", "3"].map((id) => tagRow(id)),
      studio: [studioRow("1", ["2"])],
      performer: [performerRow("1", ["1", "3"]), performerRow("2", ["2"])],
      group: [groupRow("1", ["2"])],
      gallery: [
        galleryRow("1", null, { performers: ["1", "2"], tags: ["1", "3"] }),
      ],
      scene: [
        sceneRow("1", { performers: ["1", "2"], studio: "1", groups: ["1"] }),
      ],
      image: [imageRow("1", { galleries: ["1"] })],
    })
  );
  for (const [table, id] of [
    ["StashTag", "3"],
    ["StashPerformer", "2"],
    ["StashStudio", "1"],
    ["StashGroup", "1"],
  ] as const) {
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "deletedAt" = ? WHERE "id" = ? AND "stashInstanceId" = ?`,
      Date.now(),
      id,
      JN_A
    );
  }
}

describeWithDb(
  "StashSyncService: what linked to entities Stash deleted or merged (integration)",
  () => {
    beforeEach(async () => {
      await clearSeed();
      // The clips' previews are on no real Stash
      vi.spyOn(clipPreviewProber, "probeBatch").mockResolvedValue(new Map());
      const realCredentials =
        stashInstanceManager.getCredentials.bind(stashInstanceManager);
      vi.spyOn(stashInstanceManager, "getCredentials").mockImplementation(
        (id) =>
          id !== undefined && INSTANCES.includes(id)
            ? { baseUrl: "http://stash.invalid", apiKey: "junctions-it-key" }
            : realCredentials(id)
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await clearSeed();
    });

    it("tags A and B merged into B in Stash: after the next incremental sync the scenes, performers, images and clips that carried A carry B", async () => {
      await writeLibrary(JN_A, taggedLibrary("1", ["1", "2"]));
      await markSynced(JN_A);
      const requests = stubStashLibrary(JN_A, taggedLibrary("2", ["2"]));
      const run = newRun();

      await stashSyncService["syncInstance"](JN_A, "incremental", run);

      expect(await tagLinksOn(JN_A)).toEqual({
        StudioTag: ["1:2"],
        PerformerTag: ["1:2"],
        GroupTag: ["1:2"],
        GalleryTag: ["1:2"],
        SceneTag: ["1:2", "2:2"],
        ClipTag: ["1:2"],
        ImageTag: ["1:2"],
        clipPrimaryTag: ["1:2"],
      });
      // The cleanup soft-deleted tag 1; what linked to it was fetched by
      // id, in sync order, and nothing else (scene 2 never carried it)
      expect(await liveIds("StashTag", JN_A)).toEqual(["2"]);
      expect(requests).toEqual([
        { op: "findStudios", ids: ["1"] },
        { op: "findPerformers", ids: ["1"] },
        { op: "findGroups", ids: ["1"] },
        { op: "findGalleries", ids: ["1"] },
        { op: "findScenes", ids: ["1"] },
        { op: "findSceneMarkers", ids: ["1"] },
        { op: "findImages", ids: ["1"] },
      ]);
      // Each refetched entity reaches the post-sync steps as changed, though
      // its updated_at did not move: images too, whose links the diff does
      // not compare, with the tags they lost and gained for the counts
      const changed = Object.fromEntries(
        SYNC_ORDER.map((type) => [type, refs(run.changes.changed(type).refs)])
      );
      expect(changed).toEqual({
        tag: [],
        studio: [`1@${JN_A}`],
        performer: [`1@${JN_A}`],
        group: [`1@${JN_A}`],
        gallery: [`1@${JN_A}`],
        scene: [`1@${JN_A}`],
        clip: [`1@${JN_A}`],
        image: [`1@${JN_A}`],
      });
      expect(refs(run.changes.farSides("ImageTag").refs)).toEqual([
        `1@${JN_A}`,
        `2@${JN_A}`,
      ]);
      expect(refs(run.changes.tagSetChanged("performer").refs)).toEqual([
        `1@${JN_A}`,
      ]);
      expect(refs(run.changes.deleted("tag").refs)).toEqual([`1@${JN_A}`]);
    });

    it("a full sync fetches every type after the tag cleanup whole, so it refetches nothing by id", async () => {
      await writeLibrary(JN_A, taggedLibrary("1", ["1", "2"]));
      await markSynced(JN_A);
      const requests = stubStashLibrary(JN_A, taggedLibrary("2", ["2"]));

      await stashSyncService["syncInstance"](JN_A, "full", newRun());

      expect((await tagLinksOn(JN_A)).SceneTag).toEqual(["1:2", "2:2"]);
      expect((await tagLinksOn(JN_A)).clipPrimaryTag).toEqual(["1:2"]);
      expect(requests).toEqual([]);
    });

    it("the same for a performer merge", async () => {
      await writeLibrary(JN_A, performerLibrary("1", ["1", "2"]));
      await markSynced(JN_A);
      const requests = stubStashLibrary(JN_A, performerLibrary("2", ["2"]));
      const run = newRun();

      await stashSyncService["syncInstance"](JN_A, "incremental", run);

      expect(await performerLinksOn(JN_A)).toEqual({
        GalleryPerformer: ["1:2"],
        ScenePerformer: ["1:2"],
        ImagePerformer: ["1:2"],
      });
      expect(await liveIds("StashPerformer", JN_A)).toEqual(["2"]);
      expect(requests).toEqual([
        { op: "findGalleries", ids: ["1"] },
        { op: "findScenes", ids: ["1"] },
        { op: "findImages", ids: ["1"] },
      ]);
      expect(refs(run.changes.changed("image").refs)).toEqual([`1@${JN_A}`]);
      expect(refs(run.changes.farSides("ImagePerformer").refs)).toEqual([
        `1@${JN_A}`,
        `2@${JN_A}`,
      ]);
    });

    it("a scene whose studio was deleted in Stash loses the studio on the next sync", async () => {
      await writeLibrary(JN_A, studioLibrary("1", ["1", "2"]));
      await markSynced(JN_A);
      const requests = stubStashLibrary(JN_A, studioLibrary(null, ["2"]));
      const run = newRun();

      await stashSyncService["syncInstance"](JN_A, "incremental", run);

      // Galleries and images lose it too
      expect(await studiosOn(JN_A)).toEqual({
        StashGallery: ["1:none"],
        StashScene: ["1:none"],
        StashImage: ["1:none"],
      });
      expect(await liveIds("StashStudio", JN_A)).toEqual(["2"]);
      expect(requests).toEqual([
        { op: "findGalleries", ids: ["1"] },
        { op: "findScenes", ids: ["1"] },
        { op: "findImages", ids: ["1"] },
      ]);
      // The studio they lost is recounted
      expect(refs(run.changes.studios().refs)).toEqual([`1@${JN_A}`]);
    });

    it("inherited tags and sceneCountViaPerformers ignore soft-deleted performers and tags", async () => {
      await seedSoftDeletedSources();

      await sceneTagInheritanceService.computeInheritedTags([
        { id: "1", instanceId: JN_A },
      ]);
      await stashSyncService.computeTagSceneCountsViaPerformers();

      // Performer 1's live tag only: nothing from performer 2, studio 1 or
      // group 1, and not tag 3
      expect(await inheritedTagsOf(JN_A, "1")).toEqual(["1"]);
      // Tag 2 reaches scene 1 only through performer 2
      const counts = await prisma.stashTag.findMany({
        where: { stashInstanceId: JN_A, id: { in: ["1", "2"] } },
        select: { id: true, sceneCountViaPerformers: true },
        orderBy: { id: "asc" },
      });
      expect(counts).toEqual([
        { id: "1", sceneCountViaPerformers: 1 },
        { id: "2", sceneCountViaPerformers: 0 },
      ]);
    });

    it("gallery inheritance hands down no soft-deleted performer or tag", async () => {
      await seedSoftDeletedSources();

      await imageGalleryInheritanceService.applyGalleryInheritance([
        { id: "1", instanceId: JN_A },
      ]);

      expect((await performerLinksOn(JN_A)).ImagePerformer).toEqual(["1:1"]);
      expect((await tagLinksOn(JN_A)).ImageTag).toEqual(["1:1"]);
    });

    it("jn-b's same-id rows are untouched", async () => {
      await writeLibrary(JN_A, taggedLibrary("1", ["1", "2"]));
      await writeLibrary(JN_B, taggedLibrary("1", ["1", "2"]));
      await markSynced(JN_A);
      const before = await tagLinksOn(JN_B);
      stubStashLibrary(JN_A, taggedLibrary("2", ["2"]));

      await stashSyncService["syncInstance"](JN_A, "incremental", newRun());

      expect((await tagLinksOn(JN_A)).SceneTag).toEqual(["1:2", "2:2"]);
      expect(await tagLinksOn(JN_B)).toEqual(before);
      expect(before.SceneTag).toEqual(["1:1", "2:2"]);
      expect(await liveIds("StashTag", JN_B)).toEqual(["1", "2"]);
    });

    it("a refetch that fails is recorded in its type's lastError, and the other types are still refetched", async () => {
      await writeLibrary(JN_A, taggedLibrary("1", ["1", "2"]));
      await markSynced(JN_A);
      stubStashLibrary(JN_A, taggedLibrary("2", ["2"]), ["findScenes"]);

      const results = await stashSyncService["syncInstance"](
        JN_A,
        "incremental",
        newRun()
      );

      const links = await tagLinksOn(JN_A);
      expect(links.SceneTag).toEqual(["1:1", "2:2"]);
      expect(links.ImageTag).toEqual(["1:2"]);
      const scene = must(
        results.find((r) => r.entityType === "scene"),
        "the scene result"
      );
      expect(scene.error).toBe(
        "Could not refetch 1 scenes that linked to what Stash deleted or merged: findScenes failed: Stash is down"
      );
      const state = await prisma.syncState.findFirst({
        where: { stashInstanceId: JN_A, entityType: "scene" },
        select: { lastError: true },
      });
      expect(state).toEqual({ lastError: scene.error });
    });

    it("Apply deletions refetches what linked to the entities it soft-deleted", async () => {
      await writeLibrary(JN_A, taggedLibrary("1", ["1", "2"]));
      await markSynced(JN_A);
      stubStashLibrary(JN_A, taggedLibrary("2", ["2"]));
      // The whole-library steps are not this test's
      vi.spyOn(userStatsService, "rebuildAllStats").mockResolvedValue(
        undefined
      );
      vi.spyOn(
        exclusionComputationService,
        "recomputeUsersForInstances"
      ).mockResolvedValue({ success: 0, failed: 0, errors: [] });
      const counts = vi.spyOn(entityImageCountService, "rebuildAllImageCounts");

      await stashSyncService.runCleanup("tag", JN_A, {
        ignoreRatioGuard: true,
      });

      expect((await tagLinksOn(JN_A)).SceneTag).toEqual(["1:2", "2:2"]);
      expect((await tagLinksOn(JN_A)).ImageTag).toEqual(["1:2"]);
      // The steps saw the refetched image's new tag
      expect(counts).toHaveBeenCalledWith(
        objectContaining<ImageCountScope>({
          tags: arrayContaining([{ id: "2", instanceId: JN_A }]),
        })
      );
    });
  }
);

/**
 * jn's library around gallery 1, which has performer 1, tag 1 and studio
 * `galleryStudio` to hand down (studios 1 and 2 exist) and was last
 * updated at `galleryUpdatedAt`, or which Stash deleted, and gallery 2,
 * with nothing to hand down, which stays (a cleanup skips a type Stash
 * lists none of): `images` and `scenes` by id, with the galleries each is
 * in, none with a performer, tag or studio of its own. Adding images to a gallery, removing them or
 * editing its scenes from the gallery moves only the gallery's updated_at
 * in Stash (`gallery.Service.AddImages` calls `Updated(gallery)`), so the
 * images and scenes keep theirs.
 */
function galleryLibrary({
  galleryStudio = "1",
  galleryUpdatedAt = UPDATED_AT,
  deleted = false,
  images = {},
  scenes = {},
}: {
  galleryStudio?: string;
  galleryUpdatedAt?: string;
  deleted?: boolean;
  images?: Record<string, string[]>;
  scenes?: Record<string, string[]>;
}): Library {
  return library({
    tag: [tagRow("1")],
    studio: [studioRow("1", []), studioRow("2", [])],
    performer: [performerRow("1", [])],
    gallery: [
      ...(deleted
        ? []
        : [
            galleryRow(
              "1",
              galleryStudio,
              { performers: ["1"], tags: ["1"] },
              galleryUpdatedAt
            ),
          ]),
      galleryRow("2", null),
    ],
    image: Object.entries(images).map(([id, galleries]) =>
      imageRow(id, { galleries })
    ),
    scene: Object.entries(scenes).map(([id, galleries]) =>
      sceneRow(id, { galleries })
    ),
  });
}

/**
 * Writes `lib` on `instanceId` as the last sync left it: gallery
 * inheritance applied to its images, every type synced up to UPDATED_AT
 */
async function seedSynced(instanceId: string, lib: Library): Promise<void> {
  await writeLibrary(instanceId, lib);
  await imageGalleryInheritanceService.applyGalleryInheritance(
    lib.image.map(({ id }) => ({ id, instanceId }))
  );
  await markSynced(instanceId);
}

/** `instanceId`'s gallery links, per junction as `<near>:<gallery>` */
async function galleryLinksOn(
  instanceId: string
): Promise<Record<"ImageGallery" | "SceneGallery", string[]>> {
  const read = async (
    table: "ImageGallery" | "SceneGallery",
    near: "imageId" | "sceneId",
    nearInstance: "imageInstanceId" | "sceneInstanceId"
  ) => {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ nearId: string; galleryId: string }>
    >(
      `SELECT "${near}" AS nearId, "galleryId" AS galleryId FROM "${table}" WHERE "${nearInstance}" = ?`,
      instanceId
    );
    return rows.map((r) => `${r.nearId}:${r.galleryId}`).sort();
  };
  return {
    ImageGallery: await read("ImageGallery", "imageId", "imageInstanceId"),
    SceneGallery: await read("SceneGallery", "sceneId", "sceneInstanceId"),
  };
}

/** `instanceId`'s images: their galleries, performers, tags and studio */
async function imagesOn(instanceId: string) {
  return {
    galleries: (await galleryLinksOn(instanceId)).ImageGallery,
    performers: (await performerLinksOn(instanceId)).ImagePerformer,
    tags: (await tagLinksOn(instanceId)).ImageTag,
    studios: (await studiosOn(instanceId)).StashImage,
  };
}

/** The requests by ids, each id list sorted */
function sortedIds(requests: IdRequest[]): IdRequest[] {
  return requests.map(({ op, ids }) => ({ op, ids: [...ids].sort() }));
}

describeWithDb(
  "StashSyncService: the images and scenes of galleries that changed (integration)",
  () => {
    beforeEach(async () => {
      await clearSeed();
      // The clips' previews are on no real Stash
      vi.spyOn(clipPreviewProber, "probeBatch").mockResolvedValue(new Map());
      const realCredentials =
        stashInstanceManager.getCredentials.bind(stashInstanceManager);
      vi.spyOn(stashInstanceManager, "getCredentials").mockImplementation(
        (id) =>
          id !== undefined && INSTANCES.includes(id)
            ? { baseUrl: "http://stash.invalid", apiKey: "junctions-it-key" }
            : realCredentials(id)
      );
      // The whole-library steps of a sync's post-sync steps are not these tests'
      vi.spyOn(userStatsService, "rebuildAllStats").mockResolvedValue(
        undefined
      );
      vi.spyOn(
        exclusionComputationService,
        "recomputeUsersForInstances"
      ).mockResolvedValue({ success: 0, failed: 0, errors: [] });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await clearSeed();
    });

    it("a gallery's studio corrected in Stash reaches the images that inherited it on the next incremental sync", async () => {
      await seedSynced(JN_A, galleryLibrary({ images: { "1": ["1"] } }));
      expect((await studiosOn(JN_A)).StashImage).toEqual(["1:1"]);
      // Only the gallery's updated_at moves
      const requests = stubStashLibrary(
        JN_A,
        galleryLibrary({
          galleryStudio: "2",
          galleryUpdatedAt: LATER_AT,
          images: { "1": ["1"] },
        })
      );

      await stashSyncService.incrementalSync(JN_A);

      expect(await studiosOn(JN_A)).toEqual({
        StashGallery: ["1:2", "2:none"],
        StashScene: [],
        StashImage: ["1:2"],
      });
      expect(requests).toEqual([{ op: "findImages", ids: ["1"] }]);
    });

    it("an image added to a gallery in Stash gets its ImageGallery row and inheritance", async () => {
      await seedSynced(
        JN_A,
        galleryLibrary({ images: { "1": ["1"], "2": [] } })
      );
      const requests = stubStashLibrary(
        JN_A,
        galleryLibrary({
          galleryUpdatedAt: LATER_AT,
          images: { "1": ["1"], "2": ["1"] },
        })
      );

      await stashSyncService.incrementalSync(JN_A);

      expect(await imagesOn(JN_A)).toEqual({
        galleries: ["1:1", "2:1"],
        performers: ["1:1", "2:1"],
        tags: ["1:1", "2:1"],
        studios: ["1:1", "2:1"],
      });
      // The member Peek had and the one Stash lists, fetched again by id
      expect(sortedIds(requests)).toEqual([
        { op: "findImages", ids: ["1", "2"] },
      ]);
    });

    it("an image removed from a gallery loses the row and the inherited values", async () => {
      await seedSynced(
        JN_A,
        galleryLibrary({ images: { "1": ["1"], "2": ["1"] } })
      );
      expect(await imagesOn(JN_A)).toEqual({
        galleries: ["1:1", "2:1"],
        performers: ["1:1", "2:1"],
        tags: ["1:1", "2:1"],
        studios: ["1:1", "2:1"],
      });
      stubStashLibrary(
        JN_A,
        galleryLibrary({
          galleryUpdatedAt: LATER_AT,
          images: { "1": ["1"], "2": [] },
        })
      );

      await stashSyncService.incrementalSync(JN_A);

      expect(await imagesOn(JN_A)).toEqual({
        galleries: ["1:1"],
        performers: ["1:1"],
        tags: ["1:1"],
        studios: ["1:1", "2:none"],
      });
      // Performer 1's inherited image count follows
      const performer = await prisma.stashPerformer.findUnique({
        where: { id_stashInstanceId: { id: "1", stashInstanceId: JN_A } },
        select: { imageCount: true },
      });
      expect(performer).toEqual({ imageCount: 1 });
    });

    it("a scene linked to a gallery from the gallery's side gets its SceneGallery row, and one unlinked loses it", async () => {
      await seedSynced(
        JN_A,
        galleryLibrary({ scenes: { "1": [], "2": ["1"] } })
      );
      const requests = stubStashLibrary(
        JN_A,
        galleryLibrary({
          galleryUpdatedAt: LATER_AT,
          scenes: { "1": ["1"], "2": [] },
        })
      );

      await stashSyncService.incrementalSync(JN_A);

      expect((await galleryLinksOn(JN_A)).SceneGallery).toEqual(["1:1"]);
      expect(sortedIds(requests)).toEqual([
        { op: "findScenes", ids: ["1", "2"] },
      ]);
    });

    it("the images and scenes it fetches again reach the post-sync steps as changed, with the galleries and links they lost", async () => {
      await seedSynced(
        JN_A,
        galleryLibrary({
          images: { "1": ["1"], "2": [] },
          scenes: { "1": ["1"] },
        })
      );
      stubStashLibrary(
        JN_A,
        galleryLibrary({
          galleryUpdatedAt: LATER_AT,
          images: { "1": [], "2": ["1"] },
          scenes: { "1": ["1"] },
        })
      );
      const run = newRun();

      await stashSyncService["syncInstance"](JN_A, "incremental", run);

      expect(refs(run.changes.changed("gallery").refs)).toEqual([`1@${JN_A}`]);
      // Image 1 left and image 2 joined; scene 1 stayed in the gallery and
      // counts as changed all the same (its updated_at did not move)
      expect(refs(run.changes.changed("image").refs)).toEqual([
        `1@${JN_A}`,
        `2@${JN_A}`,
      ]);
      expect(refs(run.changes.changed("scene").refs)).toEqual([`1@${JN_A}`]);
      expect(refs(run.changes.farSides("ImageGallery").refs)).toEqual([
        `1@${JN_A}`,
      ]);
      // The performer image 1 had inherited is recounted
      expect(refs(run.changes.farSides("ImagePerformer").refs)).toEqual([
        `1@${JN_A}`,
      ]);
    });

    it("a gallery deleted in Stash: its images and scenes lose the row and what they inherited", async () => {
      await seedSynced(
        JN_A,
        galleryLibrary({ images: { "1": ["1"] }, scenes: { "1": ["1"] } })
      );
      const requests = stubStashLibrary(
        JN_A,
        galleryLibrary({
          deleted: true,
          images: { "1": [] },
          scenes: { "1": [] },
        })
      );

      await stashSyncService.incrementalSync(JN_A);

      expect(await imagesOn(JN_A)).toEqual({
        galleries: [],
        performers: [],
        tags: [],
        studios: ["1:none"],
      });
      expect((await galleryLinksOn(JN_A)).SceneGallery).toEqual([]);
      expect(requests).toEqual([
        { op: "findScenes", ids: ["1"] },
        { op: "findImages", ids: ["1"] },
      ]);
    });

    it("Apply deletions of a gallery fetches again the images that were in it", async () => {
      await seedSynced(JN_A, galleryLibrary({ images: { "1": ["1"] } }));
      const requests = stubStashLibrary(
        JN_A,
        galleryLibrary({ deleted: true, images: { "1": [] } })
      );

      await stashSyncService.runCleanup("gallery", JN_A, {
        ignoreRatioGuard: true,
      });

      expect(await imagesOn(JN_A)).toEqual({
        galleries: [],
        performers: [],
        tags: [],
        studios: ["1:none"],
      });
      expect(requests).toEqual([{ op: "findImages", ids: ["1"] }]);
    });

    it("a refetch that fails is recorded in its type's lastError, and the other type is still fetched", async () => {
      await seedSynced(
        JN_A,
        galleryLibrary({ images: { "1": ["1"] }, scenes: { "1": [] } })
      );
      stubStashLibrary(
        JN_A,
        galleryLibrary({
          galleryUpdatedAt: LATER_AT,
          images: { "1": [] },
          scenes: { "1": ["1"] },
        }),
        ["findScenes"]
      );

      const results = await stashSyncService["syncInstance"](
        JN_A,
        "incremental",
        newRun()
      );

      expect(await galleryLinksOn(JN_A)).toEqual({
        ImageGallery: [],
        SceneGallery: [],
      });
      const scene = must(
        results.find((r) => r.entityType === "scene"),
        "the scene result"
      );
      expect(scene.error).toBe(
        "Could not refetch the scenes of galleries Stash changed or deleted: findScenes failed: Stash is down"
      );
      const state = await prisma.syncState.findFirst({
        where: { stashInstanceId: JN_A, entityType: "scene" },
        select: { lastError: true },
      });
      expect(state).toEqual({ lastError: scene.error });
    });

    it("jn-b's gallery with the same id keeps its members", async () => {
      const before = galleryLibrary({ images: { "1": ["1"], "2": ["1"] } });
      await seedSynced(JN_A, before);
      await seedSynced(JN_B, before);
      stubStashLibrary(
        JN_A,
        galleryLibrary({
          galleryUpdatedAt: LATER_AT,
          images: { "1": ["1"], "2": [] },
        })
      );

      await stashSyncService.incrementalSync(JN_A);

      expect((await imagesOn(JN_A)).galleries).toEqual(["1:1"]);
      expect(await imagesOn(JN_B)).toEqual({
        galleries: ["1:1", "2:1"],
        performers: ["1:1", "2:1"],
        tags: ["1:1", "2:1"],
        studios: ["1:1", "2:1"],
      });
    });

    it("a full sync fetches images and scenes whole after the galleries, so it fetches no member by id", async () => {
      await seedSynced(
        JN_A,
        galleryLibrary({ images: { "1": ["1"], "2": [] } })
      );
      const requests = stubStashLibrary(
        JN_A,
        galleryLibrary({
          galleryUpdatedAt: LATER_AT,
          images: { "1": [], "2": ["1"] },
        })
      );

      await stashSyncService["syncInstance"](JN_A, "full", newRun());

      expect((await galleryLinksOn(JN_A)).ImageGallery).toEqual(["2:1"]);
      expect(requests).toEqual([]);
    });

    it("past the change set's limit of galleries, every image and scene of the instance is fetched again", async () => {
      const lib = galleryLibrary({
        images: { "1": [], "2": [] },
        scenes: { "1": [] },
      });
      await seedSynced(JN_A, lib);
      stubStashLibrary(JN_A, lib);
      const run = newRun();
      run.changes.addBatch("gallery", {
        ...noChanges(),
        changed: Array.from({ length: SCOPE_LIMIT + 1 }, (_, i) => ({
          id: String(i + 1),
          instanceId: JN_A,
        })),
      });
      expect(run.changes.changed("gallery").whole).toBe(true);

      await stashSyncService["refetchGalleryMembers"](JN_A, [], run);

      // Which galleries changed on jn-a is no longer known
      expect(refs(run.changes.changed("scene").refs)).toEqual([`1@${JN_A}`]);
      expect(refs(run.changes.changed("image").refs)).toEqual([
        `1@${JN_A}`,
        `2@${JN_A}`,
      ]);
    });
  }
);
