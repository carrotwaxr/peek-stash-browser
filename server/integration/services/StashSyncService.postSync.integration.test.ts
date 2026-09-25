/**
 * Integration tests for the post-sync steps (item 42): they run once per
 * sync after every instance, only for what changed, and the exclusion
 * recompute covers the users who can see a changed instance.
 *
 * Two made-up instances, pc-a and pc-b, hold the same library (a tag, a
 * performer, a gallery with both, an image in the gallery whose performer
 * and tag rows are gallery-inherited, a scene, a clip), each with a stub
 * Stash client that answers from a small in-memory library, so the real
 * sync runs against the real test database. The post-step services are
 * spied on; gallery inheritance runs for real so its rows can be checked.
 */
import {
  type MockInstance,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import type {
  FindFilterType,
  FindGalleriesQuery,
  FindGroupsQuery,
  FindImagesQuery,
  FindPerformersQuery,
  FindSceneMarkersQuery,
  FindScenesCompactQuery,
  FindStudiosQuery,
  FindTagsQuery,
} from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { clipPreviewProber } from "../../services/ClipPreviewProber.js";
import { entityImageCountService } from "../../services/EntityImageCountService.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { imageGalleryInheritanceService } from "../../services/ImageGalleryInheritanceService.js";
import { sceneTagInheritanceService } from "../../services/SceneTagInheritanceService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  ENTITY_SYNC,
  stashSyncService,
} from "../../services/StashSyncService.js";
import { SCOPE_LIMIT } from "../../services/SyncChangeSet.js";
import { userStatsService } from "../../services/UserStatsService.js";
import { must } from "../../tests/helpers/must.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";
import { logger } from "../../utils/logger.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import { UNREACHABLE_STASH_URL } from "../helpers/stashTarget.js";
import { adminClient } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

// Made-up instances: no real Stash, so background sync never touches them.
const PC_A = "postsync-it-a";
const PC_B = "postsync-it-b";
const INSTANCES = [PC_A, PC_B];
const ID = "1";
const CREATED_AT = "2026-01-01T00:00:00-08:00";
const UPDATED_AT = "2026-01-02T03:04:05-08:00";
const LATER_AT = "2026-01-03T00:00:00-08:00";

/** The test's users: no selection, pc-b only, both. */
const USERS = {
  all: "postsync_it_all",
  b: "postsync_it_b",
  ab: "postsync_it_ab",
  api: "postsync_it_api",
} as const;
const API_PASSWORD = "PostSync-IT-password-1";

/** Every cached table of an instance, a clip before its scene and tag. */
const TABLES = [
  "StashClip",
  "StashImage",
  "StashGallery",
  "StashScene",
  "StashGroup",
  "StashPerformer",
  "StashStudio",
  "StashTag",
] as const;

const SYNC_TYPES = [
  "tag",
  "studio",
  "performer",
  "group",
  "gallery",
  "scene",
  "clip",
  "image",
] as const;

type SyncTag = FindTagsQuery["findTags"]["tags"][number];
type SyncStudio = FindStudiosQuery["findStudios"]["studios"][number];
type SyncPerformer =
  FindPerformersQuery["findPerformers"]["performers"][number];
type SyncGroup = FindGroupsQuery["findGroups"]["groups"][number];
type SyncGallery = FindGalleriesQuery["findGalleries"]["galleries"][number];
type SyncScene = FindScenesCompactQuery["findScenes"]["scenes"][number];
type SyncClip =
  FindSceneMarkersQuery["findSceneMarkers"]["scene_markers"][number];
type SyncImage = FindImagesQuery["findImages"]["images"][number];

/** What one stub Stash holds of each type. */
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

/**
 * What a stub Stash answers: `all` to a page without an updated_at filter
 * (a full sync) and to the id lists cleanup fetches; `updated` to a page or
 * count with one (an incremental sync), nothing by default.
 */
interface StashAnswer {
  all: Library;
  updated?: Partial<Library>;
}

const dates = { created_at: CREATED_AT, updated_at: UPDATED_AT };

/** The library both instances hold, as Stash returns it (no studio or group). */
function library(): Library {
  return {
    studio: [],
    group: [],
    tag: [
      partialRow<SyncTag>({
        id: ID,
        name: "PostSync IT tag",
        stash_ids: [],
        aliases: [],
        parents: [],
        ...dates,
      }),
    ],
    performer: [
      partialRow<SyncPerformer>({
        id: ID,
        name: "PostSync IT performer",
        stash_ids: [],
        alias_list: [],
        tags: [],
        ...dates,
      }),
    ],
    gallery: [
      partialRow<SyncGallery>({
        id: ID,
        title: "PostSync IT gallery",
        urls: [],
        files: [],
        performers: [partialRow({ id: ID })],
        tags: [partialRow({ id: ID })],
        scenes: [],
        studio: null,
        folder: null,
        cover: null,
        image_count: 1,
        ...dates,
      }),
    ],
    scene: [
      partialRow<SyncScene>({
        id: ID,
        title: "PostSync IT scene",
        urls: [],
        files: [],
        performers: [partialRow({ id: ID })],
        tags: [partialRow({ id: ID })],
        groups: [],
        galleries: [partialRow({ id: ID })],
        captions: [],
        studio: null,
        ...dates,
      }),
    ],
    clip: [
      partialRow<SyncClip>({
        id: ID,
        title: "PostSync IT clip",
        seconds: 10,
        end_seconds: null,
        scene: partialRow({ id: ID }),
        primary_tag: partialRow({ id: ID }),
        tags: [],
        preview: "http://stash.invalid/scene/1/scene_marker/1/preview",
        screenshot: "http://stash.invalid/scene/1/scene_marker/1/screenshot",
        stream: "http://stash.invalid/scene/1/scene_marker/1/stream",
        ...dates,
      }),
    ],
    image: [
      partialRow<SyncImage>({
        id: ID,
        title: "PostSync IT image",
        urls: [],
        files: [],
        paths: {},
        galleries: [partialRow({ id: ID })],
        studio: null,
        tags: [],
        performers: [],
        ...dates,
      }),
    ],
  };
}

/** The library's scene, updated in Stash after the last sync. */
function updatedScene(): SyncScene {
  return { ...must(library().scene[0]), updated_at: LATER_AT };
}

/** One page of `rows` as `filter` asks for it; per_page 0 is a count. */
function page<T>(
  rows: T[],
  filter: FindFilterType | null | undefined
): { count: number; items: T[] } {
  const perPage = filter?.per_page ?? 25;
  const pageNo = filter?.page ?? 1;
  return {
    count: rows.length,
    items: rows.slice((pageNo - 1) * perPage, pageNo * perPage),
  };
}

/** Whether a type filter narrows to entities updated since a time. */
function since(typeFilter: unknown): boolean {
  return (
    typeof typeFilter === "object" &&
    typeFilter !== null &&
    "updated_at" in typeFilter
  );
}

/** The rows a page selects: what changed with an updated_at filter, else all. */
function rowsFor<K extends keyof Library>(
  answer: StashAnswer,
  type: K,
  typeFilter: unknown
): Library[K] {
  return since(typeFilter)
    ? (answer.updated?.[type] ?? ([] as unknown as Library[K]))
    : answer.all[type];
}

/** A Stash client answering `answer` for every sync and cleanup request. */
function stubClient(answer: StashAnswer): StashClient {
  const ids = (rows: Array<{ id: string }>) => rows.map(({ id }) => ({ id }));
  const client: StashClient = partialRow<StashClient>({
    findTags: (vars) => {
      const { count, items } = page(
        rowsFor(answer, "tag", vars?.tag_filter),
        vars?.filter
      );
      return Promise.resolve({ findTags: { count, tags: items } });
    },
    findStudios: (vars) => {
      const { count, items } = page(
        rowsFor(answer, "studio", vars?.studio_filter),
        vars?.filter
      );
      return Promise.resolve({ findStudios: { count, studios: items } });
    },
    findPerformers: (vars) => {
      const { count, items } = page(
        rowsFor(answer, "performer", vars?.performer_filter),
        vars?.filter
      );
      return Promise.resolve({
        findPerformers: { count, performers: items },
      });
    },
    findGroups: (vars) => {
      const { count, items } = page(
        rowsFor(answer, "group", vars?.group_filter),
        vars?.filter
      );
      return Promise.resolve({ findGroups: { count, groups: items } });
    },
    findGalleries: (vars) => {
      const { count, items } = page(
        rowsFor(answer, "gallery", vars?.gallery_filter),
        vars?.filter
      );
      return Promise.resolve({ findGalleries: { count, galleries: items } });
    },
    findScenesCompact: (vars) => {
      const { count, items } = page(
        rowsFor(answer, "scene", vars?.scene_filter),
        vars?.filter
      );
      return Promise.resolve({
        findScenes: { count, duration: 0, filesize: 0, scenes: items },
      });
    },
    // Clips page and list their ids for cleanup through the same operation
    findSceneMarkers: (vars) => {
      const { count, items } = page(
        rowsFor(answer, "clip", vars?.scene_marker_filter),
        vars?.filter
      );
      return Promise.resolve({
        findSceneMarkers: { count, scene_markers: items },
      });
    },
    findImages: (vars) => {
      const { count, items } = page(
        rowsFor(answer, "image", vars?.image_filter),
        vars?.filter
      );
      return Promise.resolve({ findImages: { count, images: items } });
    },
    // Cleanup's id lists: everything Stash holds
    findTagIDs: (vars) => {
      const { count, items } = page(ids(answer.all.tag), vars?.filter);
      return Promise.resolve({ findTags: { count, tags: items } });
    },
    findStudioIDs: (vars) => {
      const { count, items } = page(ids(answer.all.studio), vars?.filter);
      return Promise.resolve({ findStudios: { count, studios: items } });
    },
    findPerformerIDs: (vars) => {
      const { count, items } = page(ids(answer.all.performer), vars?.filter);
      return Promise.resolve({
        findPerformers: { count, performers: items },
      });
    },
    findGroupIDs: (vars) => {
      const { count, items } = page(ids(answer.all.group), vars?.filter);
      return Promise.resolve({ findGroups: { count, groups: items } });
    },
    findGalleryIDs: (vars) => {
      const { count, items } = page(ids(answer.all.gallery), vars?.filter);
      return Promise.resolve({ findGalleries: { count, galleries: items } });
    },
    findSceneIDs: (vars) => {
      const { count, items } = page(ids(answer.all.scene), vars?.filter);
      return Promise.resolve({ findScenes: { count, scenes: items } });
    },
    findImageIDs: (vars) => {
      const { count, items } = page(ids(answer.all.image), vars?.filter);
      return Promise.resolve({ findImages: { count, images: items } });
    },
    // The sync scopes its client to its abort signal
    withSignal: () => client,
  });
  return client;
}

/** Route `stashInstanceManager.get` to a stub per made-up instance. */
function stubInstances(answers: Record<string, StashAnswer>): void {
  const realGet = stashInstanceManager.get.bind(stashInstanceManager);
  const clients = new Map(
    Object.entries(answers).map(([id, answer]) => [id, stubClient(answer)])
  );
  vi.spyOn(stashInstanceManager, "get").mockImplementation(
    (id) => clients.get(id) ?? realGet(id)
  );
}

/** Seed one instance's library as a completed sync would have stored it. */
async function seedLibrary(instanceId: string): Promise<void> {
  const base = { stashInstanceId: instanceId, stashUpdatedAt: UPDATED_AT };
  await prisma.stashTag.create({
    data: { id: ID, ...base, name: "PostSync IT tag" },
  });
  await prisma.stashPerformer.create({
    data: { id: ID, ...base, name: "PostSync IT performer" },
  });
  await prisma.stashGallery.create({
    data: { id: ID, ...base, title: "PostSync IT gallery", imageCount: 1 },
  });
  await prisma.stashImage.create({
    data: { id: ID, ...base, title: "PostSync IT image" },
  });
  await prisma.stashScene.create({
    data: { id: ID, ...base, title: "PostSync IT scene" },
  });
  await prisma.stashClip.create({
    data: {
      id: ID,
      stashInstanceId: instanceId,
      stashUpdatedAt: new Date(UPDATED_AT),
      sceneId: ID,
      sceneInstanceId: instanceId,
      seconds: 10,
      primaryTagId: ID,
      primaryTagInstanceId: instanceId,
    },
  });
  // Sync stores stashUpdatedAt as the text Stash sent (Prisma's typed
  // create above stored it as a number); clips are Prisma-written for real
  for (const table of TABLES) {
    if (table === "StashClip") continue;
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "stashUpdatedAt" = ? WHERE "stashInstanceId" = ?`,
      UPDATED_AT,
      instanceId
    );
  }

  const junctions: Array<[string, string, string, string, string]> = [
    [
      "GalleryPerformer",
      "galleryId",
      "galleryInstanceId",
      "performerId",
      "performerInstanceId",
    ],
    ["GalleryTag", "galleryId", "galleryInstanceId", "tagId", "tagInstanceId"],
    [
      "ImageGallery",
      "imageId",
      "imageInstanceId",
      "galleryId",
      "galleryInstanceId",
    ],
    // Gallery-inherited: the image has no performers or tags of its own
    [
      "ImagePerformer",
      "imageId",
      "imageInstanceId",
      "performerId",
      "performerInstanceId",
    ],
    ["ImageTag", "imageId", "imageInstanceId", "tagId", "tagInstanceId"],
    [
      "ScenePerformer",
      "sceneId",
      "sceneInstanceId",
      "performerId",
      "performerInstanceId",
    ],
    ["SceneTag", "sceneId", "sceneInstanceId", "tagId", "tagInstanceId"],
    [
      "SceneGallery",
      "sceneId",
      "sceneInstanceId",
      "galleryId",
      "galleryInstanceId",
    ],
  ];
  for (const [
    table,
    leftId,
    leftInstance,
    rightId,
    rightInstance,
  ] of junctions) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" ("${leftId}", "${leftInstance}", "${rightId}", "${rightInstance}")
       VALUES (?, ?, ?, ?)`,
      ID,
      instanceId,
      ID,
      instanceId
    );
  }

  // Every type synced whole at UPDATED_AT, so the smart path probes counts
  await prisma.syncState.createMany({
    data: SYNC_TYPES.map((entityType) => ({
      stashInstanceId: instanceId,
      entityType,
      lastFullSyncTimestamp: UPDATED_AT,
      lastFullSyncActual: new Date(),
    })),
  });
}

/** A second scene, cached but no longer in Stash (the stub never lists it). */
async function seedGoneScene(instanceId: string): Promise<void> {
  await prisma.stashScene.create({
    data: {
      id: "2",
      stashInstanceId: instanceId,
      stashUpdatedAt: UPDATED_AT,
      title: "PostSync IT gone scene",
    },
  });
}

async function clearSeed(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { username: { in: Object.values(USERS) } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  // Stats and rankings have no foreign key to User
  await prisma.userEntityStats.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userPerformerStats.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userStudioStats.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.userTagStats.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userEntityRanking.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await prisma.userExcludedEntity.deleteMany({
    where: { instanceId: { in: INSTANCES } },
  });
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "stashInstanceId" IN (?, ?)`,
      ...INSTANCES
    );
  }
  await prisma.syncState.deleteMany({
    where: { stashInstanceId: { in: INSTANCES } },
  });
  await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
}

/** The image's performer and tag rows on `instanceId` (gallery-inherited). */
async function inheritedRows(
  instanceId: string
): Promise<{ performers: number; tags: number }> {
  const [p] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM "ImagePerformer" WHERE "imageId" = ? AND "imageInstanceId" = ?`,
    ID,
    instanceId
  );
  const [t] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
    `SELECT COUNT(*) AS n FROM "ImageTag" WHERE "imageId" = ? AND "imageInstanceId" = ?`,
    ID,
    instanceId
  );
  return { performers: Number(p?.n ?? 0), tags: Number(t?.n ?? 0) };
}

async function pendingRows(userIds: number[]): Promise<number> {
  return prisma.userExcludedEntity.count({
    where: { userId: { in: userIds }, reason: "pending" },
  });
}

/** The scene's stashUpdatedAt as sync stored it (Stash's own text). */
async function sceneUpdatedAt(instanceId: string): Promise<string | null> {
  const [row] = await prisma.$queryRawUnsafe<
    Array<{ updatedAt: string | null }>
  >(
    `SELECT CAST("stashUpdatedAt" AS TEXT) AS updatedAt FROM "StashScene"
     WHERE "id" = ? AND "stashInstanceId" = ?`,
    ID,
    instanceId
  );
  return row?.updatedAt ?? null;
}

/** What every seeded scene's inheritedTagIds holds until a step rewrites it. */
const UNTOUCHED = "untouched";

/**
 * Scene tag inheritance's sources on one instance, beside the library's
 * performer 1 (no tags) on scene 1: tag 2 (the one Stash adds) and tag 3;
 * performer 2 on scene 2, studio 1 on scene 3 and group 1 on scene 4, each
 * carrying tag 3. Every scene's inheritedTagIds holds UNTOUCHED, so a
 * rewrite shows.
 */
async function seedInheritanceSources(instanceId: string): Promise<void> {
  const base = { stashInstanceId: instanceId, stashUpdatedAt: UPDATED_AT };
  await prisma.stashTag.createMany({
    data: [
      { id: "2", ...base, name: "PostSync IT added tag" },
      { id: "3", ...base, name: "PostSync IT kept tag" },
    ],
  });
  await prisma.stashPerformer.create({
    data: { id: "2", ...base, name: "PostSync IT performer 2" },
  });
  await prisma.stashStudio.create({
    data: { id: ID, ...base, name: "PostSync IT studio" },
  });
  await prisma.stashGroup.create({
    data: { id: ID, ...base, name: "PostSync IT group" },
  });
  await prisma.stashScene.createMany({
    data: [
      { id: "2", ...base, title: "PostSync IT performer 2's scene" },
      { id: "3", ...base, title: "PostSync IT studio's scene", studioId: ID },
      { id: "4", ...base, title: "PostSync IT group's scene" },
    ],
  });
  for (const table of TABLES) {
    if (table === "StashClip") continue;
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "stashUpdatedAt" = ? WHERE "stashInstanceId" = ?`,
      UPDATED_AT,
      instanceId
    );
  }

  const links: Array<[string, string, string, string, string, string]> = [
    ["PerformerTag", "performerId", "performerInstanceId", "2", "tagId", "3"],
    ["StudioTag", "studioId", "studioInstanceId", ID, "tagId", "3"],
    ["GroupTag", "groupId", "groupInstanceId", ID, "tagId", "3"],
    ["ScenePerformer", "sceneId", "sceneInstanceId", "2", "performerId", "2"],
    ["SceneGroup", "sceneId", "sceneInstanceId", "4", "groupId", ID],
  ];
  for (const [table, nearId, nearInstance, near, farId, far] of links) {
    const farInstance = farId.replace(/Id$/, "InstanceId");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" ("${nearId}", "${nearInstance}", "${farId}", "${farInstance}")
       VALUES (?, ?, ?, ?)`,
      near,
      instanceId,
      far,
      instanceId
    );
  }

  await prisma.$executeRawUnsafe(
    `UPDATE "StashScene" SET "inheritedTagIds" = ? WHERE "stashInstanceId" = ?`,
    JSON.stringify([UNTOUCHED]),
    instanceId
  );
}

/** A scene's inheritedTagIds as stored, sorted. */
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

/** Every seeded scene's inheritedTagIds on `instanceId`, by scene id. */
async function inheritedTagsByScene(
  instanceId: string
): Promise<Record<string, string[]>> {
  const byScene: Record<string, string[]> = {};
  for (const sceneId of ["1", "2", "3", "4"]) {
    byScene[sceneId] = await inheritedTagsOf(instanceId, sceneId);
  }
  return byScene;
}

/** A performer as Stash returns it, by default after an edit on LATER_AT. */
function performerRow(
  id: string,
  tagIds: string[],
  updatedAt = LATER_AT
): SyncPerformer {
  return {
    ...must(library().performer[0]),
    id,
    name: `PostSync IT performer ${id}`,
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    updated_at: updatedAt,
  };
}

/** Studio 1 as Stash returns it, by default after an edit on LATER_AT. */
function studioRow(tagIds: string[], updatedAt = LATER_AT): SyncStudio {
  return partialRow<SyncStudio>({
    id: ID,
    name: "PostSync IT studio",
    stash_ids: [],
    parent_studio: null,
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    created_at: CREATED_AT,
    updated_at: updatedAt,
  });
}

/** Group 1 as Stash returns it, by default after an edit on LATER_AT. */
function groupRow(tagIds: string[], updatedAt = LATER_AT): SyncGroup {
  return partialRow<SyncGroup>({
    id: ID,
    name: "PostSync IT group",
    urls: [],
    studio: null,
    tags: tagIds.map((tagId) => partialRow({ id: tagId })),
    created_at: CREATED_AT,
    updated_at: updatedAt,
  });
}

/**
 * The library with the inheritance sources, as seedInheritanceSources
 * stored it: what the smart sync's cleanup lists, so nothing is soft-deleted.
 */
function inheritanceLibrary(): Library {
  const lib = library();
  const tag = must(lib.tag[0]);
  const scene = must(lib.scene[0]);
  const bareScene = (id: string): SyncScene => ({
    ...scene,
    id,
    title: `PostSync IT scene ${id}`,
    performers: [],
    tags: [],
    galleries: [],
  });
  return {
    ...lib,
    tag: [
      ...lib.tag,
      { ...tag, id: "2", name: "PostSync IT added tag" },
      { ...tag, id: "3", name: "PostSync IT kept tag" },
    ],
    studio: [studioRow(["3"], UPDATED_AT)],
    performer: [...lib.performer, performerRow("2", ["3"], UPDATED_AT)],
    group: [groupRow(["3"], UPDATED_AT)],
    scene: [
      ...lib.scene,
      { ...bareScene("2"), performers: [partialRow({ id: "2" })] },
      { ...bareScene("3"), studio: partialRow({ id: ID }) },
      {
        ...bareScene("4"),
        groups: [partialRow({ group: partialRow({ id: ID }) })],
      },
    ],
  };
}

/** An image as Stash returns it, by default as seedImageCountSources stored it. */
function imageRow(
  id: string,
  {
    performers = [],
    tags = [],
    studio = null,
    galleries = [],
  }: {
    performers?: string[];
    tags?: string[];
    studio?: string | null;
    galleries?: string[];
  },
  updatedAt = UPDATED_AT
): SyncImage {
  return {
    ...must(library().image[0]),
    id,
    title: `PostSync IT image ${id}`,
    performers: performers.map((p) => partialRow({ id: p })),
    tags: tags.map((t) => partialRow({ id: t })),
    studio: studio ? partialRow({ id: studio }) : null,
    galleries: galleries.map((g) => partialRow({ id: g })),
    updated_at: updatedAt,
  };
}

/** Image 2 as stored: no gallery, performer 2, tag 2 and studio 1 of its own. */
const image2 = (updatedAt = UPDATED_AT): SyncImage =>
  imageRow("2", { performers: ["2"], tags: ["2"], studio: ID }, updatedAt);

/** The gallery as Stash returns it, with these performers. */
function galleryRow(performerIds: string[], updatedAt = LATER_AT): SyncGallery {
  return {
    ...must(library().gallery[0]),
    performers: performerIds.map((id) => partialRow({ id })),
    updated_at: updatedAt,
  };
}

/** The image counts seedImageCountSources stores: what a whole rebuild gives. */
const SEEDED_COUNTS = {
  performer: { "1": 2, "2": 1 },
  studio: { "1": 1 },
  tag: { "1": 2, "2": 1 },
};

/**
 * Image count sources on one instance, beside the library's image 1 in the
 * gallery: performer 2, tag 2 and studio 1 on image 2 (no gallery, all its
 * own), and image 3, a second gallery image with inherited rows. The counts
 * hold what a whole rebuild gives (SEEDED_COUNTS).
 */
async function seedImageCountSources(instanceId: string): Promise<void> {
  const base = { stashInstanceId: instanceId, stashUpdatedAt: UPDATED_AT };
  await prisma.stashTag.create({
    data: { id: "2", ...base, name: "PostSync IT tag 2" },
  });
  await prisma.stashPerformer.create({
    data: { id: "2", ...base, name: "PostSync IT performer 2" },
  });
  await prisma.stashStudio.create({
    data: { id: ID, ...base, name: "PostSync IT studio" },
  });
  await prisma.stashImage.createMany({
    data: [
      {
        id: "2",
        ...base,
        title: "PostSync IT image 2",
        studioId: ID,
        studioInstanceId: instanceId,
      },
      { id: "3", ...base, title: "PostSync IT image 3" },
    ],
  });
  for (const table of TABLES) {
    if (table === "StashClip") continue;
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "stashUpdatedAt" = ? WHERE "stashInstanceId" = ?`,
      UPDATED_AT,
      instanceId
    );
  }

  const links: Array<[string, string, string, string, string, string]> = [
    ["ImagePerformer", "imageId", "imageInstanceId", "2", "performerId", "2"],
    ["ImageTag", "imageId", "imageInstanceId", "2", "tagId", "2"],
    ["ImageGallery", "imageId", "imageInstanceId", "3", "galleryId", ID],
    // Gallery-inherited, as for image 1
    ["ImagePerformer", "imageId", "imageInstanceId", "3", "performerId", ID],
    ["ImageTag", "imageId", "imageInstanceId", "3", "tagId", ID],
  ];
  for (const [table, nearId, nearInstance, near, farId, far] of links) {
    const farInstance = farId.replace(/Id$/, "InstanceId");
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${table}" ("${nearId}", "${nearInstance}", "${farId}", "${farInstance}")
       VALUES (?, ?, ?, ?)`,
      near,
      instanceId,
      far,
      instanceId
    );
  }

  await setImageCounts(instanceId, SEEDED_COUNTS);
}

type ImageCounts = Record<
  "performer" | "studio" | "tag",
  Record<string, number>
>;

const COUNT_TABLES = {
  performer: "StashPerformer",
  studio: "StashStudio",
  tag: "StashTag",
} as const;

async function setImageCounts(
  instanceId: string,
  counts: ImageCounts
): Promise<void> {
  for (const [type, table] of Object.entries(COUNT_TABLES)) {
    for (const [id, n] of Object.entries(counts[type as keyof ImageCounts])) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${table}" SET "imageCount" = ? WHERE "id" = ? AND "stashInstanceId" = ?`,
        n,
        id,
        instanceId
      );
    }
  }
}

/** Every performer's, studio's and tag's stored imageCount on `instanceId`. */
async function imageCountsOf(instanceId: string): Promise<ImageCounts> {
  const counts: ImageCounts = { performer: {}, studio: {}, tag: {} };
  for (const [type, table] of Object.entries(COUNT_TABLES)) {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; imageCount: bigint | number }>
    >(
      `SELECT "id", "imageCount" FROM "${table}" WHERE "stashInstanceId" = ? ORDER BY "id"`,
      instanceId
    );
    counts[type as keyof ImageCounts] = Object.fromEntries(
      rows.map((r) => [r.id, Number(r.imageCount)])
    );
  }
  return counts;
}

/** The library with the image count sources, as seedImageCountSources stored it. */
function imageCountLibrary(): Library {
  const lib = library();
  return {
    ...lib,
    tag: [
      ...lib.tag,
      { ...must(lib.tag[0]), id: "2", name: "PostSync IT tag 2" },
    ],
    studio: [studioRow([], UPDATED_AT)],
    performer: [...lib.performer, performerRow("2", [], UPDATED_AT)],
    image: [...lib.image, image2(), imageRow("3", { galleries: [ID] })],
  };
}

/** An image's performer and tag rows and its date, as stored. */
async function imageState(
  instanceId: string,
  imageId: string
): Promise<{ performers: string[]; tags: string[]; date: string | null }> {
  const performers = await prisma.imagePerformer.findMany({
    where: { imageId, imageInstanceId: instanceId },
    select: { performerId: true },
    orderBy: { performerId: "asc" },
  });
  const tags = await prisma.imageTag.findMany({
    where: { imageId, imageInstanceId: instanceId },
    select: { tagId: true },
    orderBy: { tagId: "asc" },
  });
  const image = await prisma.stashImage.findUnique({
    where: { id_stashInstanceId: { id: imageId, stashInstanceId: instanceId } },
    select: { date: true },
  });
  return {
    performers: performers.map((p) => p.performerId),
    tags: tags.map((t) => t.tagId),
    date: image?.date ?? null,
  };
}

type Step = MockInstance<() => Promise<void>>;

/** The message texts logged at info level. */
function infoMessages(spy: MockInstance<typeof logger.info>): string[] {
  return spy.mock.calls.map((call) => call[0]);
}

describeWithDb("StashSyncService post-sync steps (integration)", () => {
  /** The test's users by role, created per test. */
  let users: { all: number; b: number; ab: number };
  let steps: {
    sceneTags: MockInstance<
      typeof sceneTagInheritanceService.computeInheritedTags
    >;
    gallery: Step;
    imageCounts: Step;
    stats: Step;
    tagCounts: Step;
  };
  let recompute: MockInstance<
    typeof exclusionComputationService.recomputeForUser
  >;
  let info: MockInstance<typeof logger.info>;

  /** Which of the test's users were recomputed, by role. */
  const recomputedRoles = (): string[] =>
    Object.entries(users)
      .filter(([, id]) => recompute.mock.calls.some((call) => call[0] === id))
      .map(([role]) => role)
      .sort();

  const stepCalls = (): Record<string, number> =>
    Object.fromEntries(
      Object.entries(steps).map(([name, spy]) => [name, spy.mock.calls.length])
    );

  beforeAll(async () => {
    // The instances the server knows (the test Stash), as in production:
    // clip sync reads the default one's key
    await stashInstanceManager.reload();
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  beforeEach(async () => {
    await clearSeed();
    for (const [priority, id] of INSTANCES.entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: UNREACHABLE_STASH_URL,
          apiKey: "postsync-it-key",
          enabled: true,
          priority: 960 + priority,
        },
      });
      await seedLibrary(id);
    }
    const create = async (username: string, selection: string[]) => {
      const user = await prisma.user.create({
        data: { username, password: "not-a-real-hash" },
      });
      if (selection.length > 0) {
        await prisma.userStashInstance.createMany({
          data: selection.map((instanceId) => ({
            userId: user.id,
            instanceId,
          })),
        });
      }
      return user.id;
    };
    users = {
      all: await create(USERS.all, []),
      b: await create(USERS.b, [PC_B]),
      ab: await create(USERS.ab, [PC_A, PC_B]),
    };

    // The clip's preview is on no real Stash
    vi.spyOn(clipPreviewProber, "probeBatch").mockResolvedValue(new Map());
    steps = {
      sceneTags: vi
        .spyOn(sceneTagInheritanceService, "computeInheritedTags")
        .mockResolvedValue(undefined),
      // Real: its rows are what the image tests check
      gallery: vi.spyOn(
        imageGalleryInheritanceService,
        "applyGalleryInheritance"
      ),
      imageCounts: vi
        .spyOn(entityImageCountService, "rebuildAllImageCounts")
        .mockResolvedValue(undefined),
      stats: vi
        .spyOn(userStatsService, "rebuildAllStats")
        .mockResolvedValue(undefined),
      tagCounts: vi
        .spyOn(stashSyncService, "computeTagSceneCountsViaPerformers")
        .mockResolvedValue(undefined),
    };
    recompute = vi
      .spyOn(exclusionComputationService, "recomputeForUser")
      .mockResolvedValue(undefined);
    info = vi.spyOn(logger, "info");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearSeed();
    await stashInstanceManager.reload();
  });

  it("an incremental sync that finds nothing runs no post-sync step", async () => {
    stubInstances({ [PC_A]: { all: library() } });

    await stashSyncService.smartIncrementalSync(PC_A);

    expect(stepCalls()).toEqual({
      sceneTags: 0,
      gallery: 0,
      imageCounts: 0,
      stats: 0,
      tagCounts: 0,
    });
    expect(recomputedRoles()).toEqual([]);
    expect(infoMessages(info)).toContain(
      "nothing changed, post-sync steps skipped"
    );
    // The inherited rows stay, and nothing is held
    expect(await inheritedRows(PC_A)).toEqual({ performers: 1, tags: 1 });
    expect(await pendingRows(Object.values(users))).toBe(0);
  }, 60_000);

  it("with two instances the post-sync steps run once, after both", async () => {
    stubInstances({
      [PC_A]: { all: library(), updated: { scene: [updatedScene()] } },
      [PC_B]: { all: library(), updated: { scene: [updatedScene()] } },
    });
    vi.spyOn(stashInstanceManager, "getAllEnabled").mockReturnValue(
      INSTANCES.map((id) => ({ id, name: id }))
    );
    // What both instances' scenes carry when the steps run
    const seenAtSteps: Array<string | null> = [];
    steps.imageCounts.mockImplementation(async () => {
      seenAtSteps.push(await sceneUpdatedAt(PC_A), await sceneUpdatedAt(PC_B));
    });

    await stashSyncService.smartIncrementalSync();

    expect(stepCalls()).toEqual({
      sceneTags: 1,
      gallery: 0,
      imageCounts: 1,
      stats: 1,
      tagCounts: 1,
    });
    expect(seenAtSteps).toEqual([LATER_AT, LATER_AT]);
    // Each affected user once, not once per instance
    const perUser = Object.values(users).map(
      (id) => recompute.mock.calls.filter((call) => call[0] === id).length
    );
    expect(perUser).toEqual([1, 1, 1]);
  }, 60_000);

  it("a change on pc-a recomputes the users who can see pc-a and not a user whose instance selection is only pc-b", async () => {
    stubInstances({
      [PC_A]: { all: library(), updated: { scene: [updatedScene()] } },
    });

    await stashSyncService.smartIncrementalSync(PC_A);

    expect(recomputedRoles()).toEqual(["ab", "all"]);
  }, 60_000);

  it("an incremental sync that rewrites an unchanged image re-applies gallery inheritance and recomputes nobody", async () => {
    // Stash lists the image as updated but returns it as stored
    stubInstances({
      [PC_A]: { all: library(), updated: { image: library().image } },
    });

    await stashSyncService.smartIncrementalSync(PC_A);

    expect(stepCalls()).toEqual({
      sceneTags: 0,
      gallery: 1,
      imageCounts: 0,
      stats: 0,
      tagCounts: 0,
    });
    expect(recomputedRoles()).toEqual([]);
    // The rewrite dropped the inherited rows; the inheritance put them back
    expect(await inheritedRows(PC_A)).toEqual({ performers: 1, tags: 1 });
    expect(await pendingRows(Object.values(users))).toBe(0);
  }, 60_000);

  it("a full sync runs every post-sync step and recomputes every user, even when Stash returns rows identical to the stored ones", async () => {
    stubInstances({ [PC_A]: { all: library() } });

    await stashSyncService.fullSync(PC_A);

    expect(stepCalls()).toEqual({
      sceneTags: 1,
      gallery: 1,
      imageCounts: 1,
      stats: 1,
      tagCounts: 1,
    });
    const everyUser = (await prisma.user.findMany({ select: { id: true } }))
      .map((u) => u.id)
      .sort((a, b) => a - b);
    const recomputed = recompute.mock.calls
      .map((call) => call[0])
      .sort((a, b) => a - b);
    expect(recomputed).toEqual(everyUser);
    expect(await inheritedRows(PC_A)).toEqual({ performers: 1, tags: 1 });
    expect(await pendingRows(Object.values(users))).toBe(0);
  }, 60_000);

  it("users with pending holds are recomputed even when nothing changed", async () => {
    stubInstances({ [PC_A]: { all: library() } });
    // A hold a batch wrote (C18) for a user who cannot see pc-a
    await prisma.userExcludedEntity.create({
      data: {
        userId: users.b,
        entityType: "scene",
        entityId: ID,
        instanceId: PC_B,
        reason: "pending",
      },
    });

    await stashSyncService.smartIncrementalSync(PC_A);

    expect(recomputedRoles()).toEqual(["b"]);
    expect(stepCalls()).toEqual({
      sceneTags: 0,
      gallery: 0,
      imageCounts: 0,
      stats: 0,
      tagCounts: 0,
    });
    expect(infoMessages(info)).not.toContain(
      "nothing changed, post-sync steps skipped"
    );
  }, 60_000);

  it("the admin's Apply deletions runs the post-sync steps for what it soft-deleted", async () => {
    await seedGoneScene(PC_A);
    await seedGoneScene(PC_B);
    stubInstances({ [PC_A]: { all: library() } });

    const outcome = await stashSyncService.runCleanup("scene", PC_A, {
      ignoreRatioGuard: true,
    });

    expect(outcome.deleted).toBe(1);
    expect(stepCalls()).toEqual({
      sceneTags: 0,
      gallery: 0,
      imageCounts: 1,
      stats: 1,
      tagCounts: 1,
    });
    expect(recomputedRoles()).toEqual(["ab", "all"]);
    const gone = await prisma.stashScene.findMany({
      where: { id: "2", stashInstanceId: { in: INSTANCES } },
      select: { stashInstanceId: true, deletedAt: true },
    });
    expect(
      Object.fromEntries(
        gone.map((s) => [s.stashInstanceId, s.deletedAt !== null])
      )
    ).toEqual({ [PC_A]: true, [PC_B]: false });
  }, 60_000);

  it("adding an instance to a user's selection stores that instance's exclusion rows before any sync", async () => {
    const { id: userId, client } = await createApiUser(USERS.api, API_PASSWORD);
    // Always-hide the tag on pc-a; the selection is pc-b only, so far
    await prisma.userContentRestriction.create({
      data: {
        userId,
        entityType: "tags",
        mode: "EXCLUDE",
        entityIds: JSON.stringify([`${ID}:${PC_A}`]),
      },
    });
    await prisma.userStashInstance.create({
      data: { userId, instanceId: PC_B },
    });
    const rowsOnA = () =>
      prisma.userExcludedEntity.findMany({
        where: { userId, instanceId: PC_A },
        select: { entityType: true, entityId: true },
        orderBy: { entityType: "asc" },
      });
    expect(await rowsOnA()).toEqual([]);

    const response = await client.put("/api/user/stash-instances", {
      instanceIds: [PC_A, PC_B],
    });

    expect(response.status).toBe(200);
    const rows = await rowsOnA();
    expect(rows).toContainEqual({ entityType: "tag", entityId: ID });
    expect(rows).toContainEqual({ entityType: "scene", entityId: ID });
    expect(rows).toContainEqual({ entityType: "image", entityId: ID });
  }, 60_000);

  describe("scene tag inheritance", () => {
    beforeEach(async () => {
      for (const id of INSTANCES) await seedInheritanceSources(id);
      // Real here: the scenes' stored tags are what these tests check
      steps.sceneTags.mockRestore();
      steps.sceneTags = vi.spyOn(
        sceneTagInheritanceService,
        "computeInheritedTags"
      );
    });

    it("a tag added to a performer reaches the inherited tags of that performer's scenes on an incremental sync that fetched no scene", async () => {
      stubInstances({
        [PC_A]: {
          all: inheritanceLibrary(),
          updated: { performer: [performerRow(ID, ["2"])] },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await inheritedTagsOf(PC_A, ID)).toEqual(["2"]);
    }, 60_000);

    it("the same for a studio and for a group", async () => {
      stubInstances({
        [PC_A]: {
          all: inheritanceLibrary(),
          updated: {
            studio: [studioRow(["3", "2"])],
            group: [groupRow(["3", "2"])],
          },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await inheritedTagsOf(PC_A, "3")).toEqual(["2", "3"]);
      expect(await inheritedTagsOf(PC_A, "4")).toEqual(["2", "3"]);
    }, 60_000);

    it("a performer, studio or group whose tag set did not change leaves its scenes untouched", async () => {
      // Performer 1's new tag makes the step run; the others are edited in
      // Stash with the tags they had
      stubInstances({
        [PC_A]: {
          all: inheritanceLibrary(),
          updated: {
            performer: [performerRow(ID, ["2"]), performerRow("2", ["3"])],
            studio: [studioRow(["3"])],
            group: [groupRow(["3"])],
          },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await inheritedTagsByScene(PC_A)).toEqual({
        "1": ["2"],
        "2": [UNTOUCHED],
        "3": [UNTOUCHED],
        "4": [UNTOUCHED],
      });
    }, 60_000);

    it("pc-b's scenes with the same ids are untouched by a change on pc-a", async () => {
      stubInstances({
        [PC_A]: {
          all: inheritanceLibrary(),
          updated: { performer: [performerRow(ID, ["2"])] },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await inheritedTagsOf(PC_A, ID)).toEqual(["2"]);
      expect(await inheritedTagsByScene(PC_B)).toEqual({
        "1": [UNTOUCHED],
        "2": [UNTOUCHED],
        "3": [UNTOUCHED],
        "4": [UNTOUCHED],
      });
    }, 60_000);

    it("past SCOPE_LIMIT the whole library is recomputed", async () => {
      stubInstances({
        [PC_A]: {
          all: inheritanceLibrary(),
          updated: { performer: [performerRow(ID, ["2"])] },
        },
      });
      // The batch reports more changed tag sets than the change set keeps
      const performerSpec = ENTITY_SYNC.performer;
      const processPerformers = performerSpec.processBatch.bind(performerSpec);
      vi.spyOn(ENTITY_SYNC.performer, "processBatch").mockImplementation(
        async (items, instanceId, run) => {
          const changes = await processPerformers(items, instanceId, run);
          for (let i = 0; i <= SCOPE_LIMIT; i++) {
            changes.tagSetChanged.push({ id: `c4-${i}`, instanceId });
          }
          return changes;
        }
      );

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await inheritedTagsOf(PC_A, ID)).toEqual(["2"]);
      // pc-b had no change, and its scenes were recomputed all the same
      expect(await inheritedTagsByScene(PC_B)).toEqual({
        "1": [],
        "2": ["3"],
        "3": ["3"],
        "4": ["3"],
      });
    }, 60_000);
  });

  describe("image counts and gallery inheritance", () => {
    beforeEach(async () => {
      for (const id of INSTANCES) await seedImageCountSources(id);
      // Real here: the stored counts are what these tests check
      steps.imageCounts.mockRestore();
      steps.imageCounts = vi.spyOn(
        entityImageCountService,
        "rebuildAllImageCounts"
      );
    });

    it("removing a performer from an image lowers that performer's imageCount on an incremental sync", async () => {
      stubInstances({
        [PC_A]: {
          all: imageCountLibrary(),
          updated: {
            image: [imageRow("2", { tags: ["2"], studio: ID }, LATER_AT)],
          },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await imageCountsOf(PC_A)).toEqual({
        ...SEEDED_COUNTS,
        performer: { "1": 2, "2": 0 },
      });
    }, 60_000);

    it("a gallery gaining a performer raises the count by the gallery's images", async () => {
      stubInstances({
        [PC_A]: {
          all: imageCountLibrary(),
          updated: { gallery: [galleryRow([ID, "2"])] },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      // Image 2 of its own, images 1 and 3 through the gallery
      expect(await imageCountsOf(PC_A)).toEqual({
        ...SEEDED_COUNTS,
        performer: { "1": 2, "2": 3 },
      });
    }, 60_000);

    it("an incremental performer update keeps the inherited imageCount instead of Stash's direct count", async () => {
      // Stash lists performer 1, studio 1 and tag 1 as updated but returns
      // them as stored, with its own direct image count (no image of its own)
      const lib = imageCountLibrary();
      stubInstances({
        [PC_A]: {
          all: lib,
          updated: {
            performer: [{ ...must(lib.performer[0]), image_count: 0 }],
            studio: [{ ...must(lib.studio[0]), image_count: 0 }],
            tag: [{ ...must(lib.tag[0]), image_count: 0 }],
          },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await imageCountsOf(PC_A)).toEqual(SEEDED_COUNTS);
    }, 60_000);

    it("images written by the sync get gallery inheritance again; images not written keep theirs untouched", async () => {
      // The gallery has a date; image 5 is in it and was never given its
      // performer, tag or date, so a pass over it would show
      await prisma.$executeRawUnsafe(
        `UPDATE "StashGallery" SET "date" = '2026-01-01' WHERE "stashInstanceId" = ?`,
        PC_A
      );
      await prisma.stashImage.create({
        data: { id: "5", stashInstanceId: PC_A, title: "PostSync IT image 5" },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "StashImage" SET "stashUpdatedAt" = ? WHERE "id" = '5' AND "stashInstanceId" = ?`,
        UPDATED_AT,
        PC_A
      );
      await prisma.imageGallery.create({
        data: {
          imageId: "5",
          imageInstanceId: PC_A,
          galleryId: ID,
          galleryInstanceId: PC_A,
        },
      });
      const lib = imageCountLibrary();
      lib.image.push(imageRow("5", { galleries: [ID] }));
      // Stash lists image 1 as updated but returns it as stored
      stubInstances({
        [PC_A]: { all: lib, updated: { image: library().image } },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await imageState(PC_A, ID)).toEqual({
        performers: [ID],
        tags: [ID],
        date: "2026-01-01",
      });
      expect(await imageState(PC_A, "3")).toEqual({
        performers: [ID],
        tags: [ID],
        date: null,
      });
      expect(await imageState(PC_A, "5")).toEqual({
        performers: [],
        tags: [],
        date: null,
      });
    }, 60_000);

    it("pc-b's counts do not move on a pc-a change", async () => {
      const untouched = {
        performer: { "1": 99, "2": 99 },
        studio: { "1": 99 },
        tag: { "1": 99, "2": 99 },
      };
      await setImageCounts(PC_B, untouched);
      stubInstances({
        [PC_A]: {
          all: imageCountLibrary(),
          updated: {
            gallery: [galleryRow([ID, "2"])],
            image: [imageRow("2", { tags: ["2"], studio: ID }, LATER_AT)],
          },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await imageCountsOf(PC_A)).toEqual({
        ...SEEDED_COUNTS,
        performer: { "1": 2, "2": 2 },
      });
      expect(await imageCountsOf(PC_B)).toEqual(untouched);
    }, 60_000);

    it("an image joining a gallery raises the counts of the gallery's performer and tag", async () => {
      // Image 2 keeps its own performer and tag, so it inherits none
      stubInstances({
        [PC_A]: {
          all: imageCountLibrary(),
          updated: {
            image: [
              imageRow(
                "2",
                { performers: ["2"], tags: ["2"], studio: ID, galleries: [ID] },
                LATER_AT
              ),
            ],
          },
        },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await imageCountsOf(PC_A)).toEqual({
        ...SEEDED_COUNTS,
        performer: { "1": 3, "2": 1 },
        tag: { "1": 3, "2": 1 },
      });
    }, 60_000);

    it("an image Stash no longer has lowers the counts of its performer, tag and studio", async () => {
      const lib = imageCountLibrary();
      lib.image = lib.image.filter((image) => image.id !== "2");
      stubInstances({ [PC_A]: { all: lib } });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect(await imageCountsOf(PC_A)).toEqual({
        performer: { "1": 2, "2": 0 },
        studio: { "1": 0 },
        tag: { "1": 2, "2": 0 },
      });
    }, 60_000);

    it("a performer new to Peek gets the inherited count, not Stash's", async () => {
      const lib = imageCountLibrary();
      const newcomer = { ...performerRow("3", [], LATER_AT), image_count: 7 };
      lib.performer.push(newcomer);
      stubInstances({
        [PC_A]: { all: lib, updated: { performer: [newcomer] } },
      });

      await stashSyncService.smartIncrementalSync(PC_A);

      expect((await imageCountsOf(PC_A)).performer).toEqual({
        "1": 2,
        "2": 1,
        "3": 0,
      });
    }, 60_000);

    it("past SCOPE_LIMIT the counts are rebuilt for the whole library", async () => {
      await setImageCounts(PC_B, {
        performer: { "1": 99, "2": 99 },
        studio: { "1": 99 },
        tag: { "1": 99, "2": 99 },
      });
      stubInstances({
        [PC_A]: {
          all: imageCountLibrary(),
          updated: {
            image: [imageRow("2", { tags: ["2"], studio: ID }, LATER_AT)],
          },
        },
      });
      // The batch reports more far sides than the change set keeps
      const imageSpec = ENTITY_SYNC.image;
      const processImages = imageSpec.processBatch.bind(imageSpec);
      vi.spyOn(ENTITY_SYNC.image, "processBatch").mockImplementation(
        async (items, instanceId, run) => {
          const changes = await processImages(items, instanceId, run);
          const far = changes.farSides.ImagePerformer ?? [];
          for (let i = 0; i <= SCOPE_LIMIT; i++) {
            far.push({ id: `c5-${i}`, instanceId });
          }
          changes.farSides.ImagePerformer = far;
          return changes;
        }
      );

      await stashSyncService.smartIncrementalSync(PC_A);

      expect((await imageCountsOf(PC_A)).performer).toEqual({
        "1": 2,
        "2": 0,
      });
      // pc-b had no change, and its counts were rebuilt all the same
      expect(await imageCountsOf(PC_B)).toEqual(SEEDED_COUNTS);
    }, 60_000);
  });
});
