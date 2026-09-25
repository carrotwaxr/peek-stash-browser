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
import type { FindFilterType } from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  ENTITY_SYNC,
  type SyncEntityOf,
  type SyncRunContext,
  stashSyncService,
} from "../../services/StashSyncService.js";
import {
  type BatchChanges,
  SyncChangeSet,
} from "../../services/SyncChangeSet.js";
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
  },
  updatedAt = UPDATED_AT
): SyncScene {
  return partialRow<SyncScene>({
    id,
    title: links.title ?? `Junctions IT scene ${id}`,
    urls: [],
    files: [],
    captions: [],
    studio: null,
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
function galleryRow(id: string, studioId: string | null): SyncGallery {
  return partialRow<SyncGallery>({
    id,
    title: `Junctions IT gallery ${id}`,
    urls: [],
    files: [],
    performers: [],
    tags: [],
    scenes: [],
    studio: studioId === null ? null : partialRow({ id: studioId }),
    folder: null,
    cover: null,
    image_count: 0,
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
  rows: T[],
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
 */
function stubStash(
  library: {
    scenes: SyncScene[];
    tags: SyncTag[];
    galleries: SyncGallery[];
    studios: SyncStudio[];
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
      const { count, items } = page(library.tags, vars?.filter, vars?.ids);
      return Promise.resolve({ findTags: { count, tags: items } });
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
      // In order: the stored state, the old links, the rows, the new links
      const kind = (sql: string) =>
        (
          /^\s*(SELECT|DELETE FROM|INSERT OR IGNORE INTO|INSERT INTO)\s+"?(\w+)/.exec(
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
      ]);
      expect(await sceneLinks("SceneGroup")).toEqual(["1:1"]);
      expect(await sceneLinks("ScenePerformer")).toEqual(["1:1", "1:2", "2:2"]);
    });
  }
);
