/**
 * Integration test for one entity type failing during a sync (item 20,
 * SYNC-10): the other types still sync and their SyncState rows advance, and
 * the failure is kept in the failing type's `lastError`, where the admin
 * sync status reads it.
 *
 * A made-up instance that real sync never touches gets a stub Stash client:
 * FindStudios fails as Stash answers a query that breaks on its side (a
 * GraphQL error), and every other type answers one row. smartIncrementalSync
 * runs against the real test database, post-sync steps included.
 */
import { GraphQLError } from "graphql";
import { ClientError } from "graphql-request";
import {
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
  FindGalleriesQuery,
  FindGroupsQuery,
  FindImagesQuery,
  FindPerformersQuery,
  FindSceneMarkersQuery,
  FindScenesCompactQuery,
  FindTagsQuery,
} from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { clipPreviewProber } from "../../services/ClipPreviewProber.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

// Made-up instance: no real Stash, so background sync never touches it.
const INSTANCE = "sync-errors-it";
const ID = "1";
const CREATED_AT = "2026-01-01T00:00:00-08:00";
const UPDATED_AT = "2026-01-02T03:04:05-08:00";

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

type SyncTag = FindTagsQuery["findTags"]["tags"][number];
type SyncPerformer =
  FindPerformersQuery["findPerformers"]["performers"][number];
type SyncGroup = FindGroupsQuery["findGroups"]["groups"][number];
type SyncGallery = FindGalleriesQuery["findGalleries"]["galleries"][number];
type SyncScene = FindScenesCompactQuery["findScenes"]["scenes"][number];
type SyncClip =
  FindSceneMarkersQuery["findSceneMarkers"]["scene_markers"][number];
type SyncImage = FindImagesQuery["findImages"]["images"][number];

const dates = { created_at: CREATED_AT, updated_at: UPDATED_AT };
const tag = partialRow<SyncTag>({
  id: ID,
  name: "Errors IT tag",
  stash_ids: [],
  aliases: [],
  parents: [],
  ...dates,
});
const performer = partialRow<SyncPerformer>({
  id: ID,
  name: "Errors IT performer",
  stash_ids: [],
  alias_list: [],
  tags: [],
  ...dates,
});
const group = partialRow<SyncGroup>({
  id: ID,
  name: "Errors IT collection",
  urls: [],
  tags: [],
  ...dates,
});
const gallery = partialRow<SyncGallery>({
  id: ID,
  title: "Errors IT gallery",
  urls: [],
  files: [],
  performers: [],
  tags: [],
  scenes: [],
  studio: null,
  folder: null,
  cover: null,
  image_count: 0,
  ...dates,
});
const scene = partialRow<SyncScene>({
  id: ID,
  title: "Errors IT scene",
  urls: [],
  files: [],
  performers: [],
  tags: [],
  groups: [],
  galleries: [],
  captions: [],
  studio: null,
  ...dates,
});
const clip = partialRow<SyncClip>({
  id: ID,
  title: "Errors IT clip",
  seconds: 10,
  end_seconds: null,
  scene: partialRow({ id: ID }),
  primary_tag: partialRow({ id: ID }),
  tags: [],
  preview: "http://stash.invalid/scene/1/scene_marker/1/preview",
  screenshot: "http://stash.invalid/scene/1/scene_marker/1/screenshot",
  stream: "http://stash.invalid/scene/1/scene_marker/1/stream",
  ...dates,
});
const image = partialRow<SyncImage>({
  id: ID,
  title: "Errors IT image",
  urls: [],
  files: [],
  paths: {},
  galleries: [],
  studio: null,
  tags: [],
  performers: [],
  ...dates,
});

/**
 * What Stash answers when FindStudios breaks on its side: HTTP 200 with a
 * GraphQL error. The error carries the query and its variables, which the
 * stored text must not.
 */
const studioError = new ClientError(
  {
    status: 200,
    errors: [
      new GraphQLError(
        "runtime error: invalid memory address or nil pointer dereference",
        { path: ["findStudios", "studios", 0, "image_path"] }
      ),
    ],
  },
  {
    query:
      "query FindStudios($filter: FindFilterType) { findStudios { count } }",
    variables: { filter: { per_page: 500 } },
  }
);

/** A Stash that fails on FindStudios and lists one row of every other type. */
function stubClient(): StashClient {
  const one = <T>(rows: T[]) => ({ count: rows.length, rows });
  const client: StashClient = partialRow<StashClient>({
    findTags: () => {
      const { count, rows } = one([tag]);
      return Promise.resolve({ findTags: { count, tags: rows } });
    },
    findStudios: () => Promise.reject(studioError),
    findPerformers: () => {
      const { count, rows } = one([performer]);
      return Promise.resolve({ findPerformers: { count, performers: rows } });
    },
    findGroups: () => {
      const { count, rows } = one([group]);
      return Promise.resolve({ findGroups: { count, groups: rows } });
    },
    findGalleries: () => {
      const { count, rows } = one([gallery]);
      return Promise.resolve({ findGalleries: { count, galleries: rows } });
    },
    findScenesCompact: () => {
      const { count, rows } = one([scene]);
      return Promise.resolve({
        findScenes: { count, duration: 0, filesize: 0, scenes: rows },
      });
    },
    // Clips list their ids for cleanup through the same operation
    findSceneMarkers: () => {
      const { count, rows } = one([clip]);
      return Promise.resolve({
        findSceneMarkers: { count, scene_markers: rows },
      });
    },
    findImages: () => {
      const { count, rows } = one([image]);
      return Promise.resolve({ findImages: { count, images: rows } });
    },
    // Cleanup's id lists
    findTagIDs: () =>
      Promise.resolve({ findTags: { count: 1, tags: [{ id: ID }] } }),
    findStudioIDs: () =>
      Promise.resolve({ findStudios: { count: 0, studios: [] } }),
    findPerformerIDs: () =>
      Promise.resolve({
        findPerformers: { count: 1, performers: [{ id: ID }] },
      }),
    findGroupIDs: () =>
      Promise.resolve({ findGroups: { count: 1, groups: [{ id: ID }] } }),
    findGalleryIDs: () =>
      Promise.resolve({
        findGalleries: { count: 1, galleries: [{ id: ID }] },
      }),
    findSceneIDs: () =>
      Promise.resolve({ findScenes: { count: 1, scenes: [{ id: ID }] } }),
    findImageIDs: () =>
      Promise.resolve({ findImages: { count: 1, images: [{ id: ID }] } }),
    // The sync scopes its client to its abort signal
    withSignal: () => client,
  });
  return client;
}

/** Delete everything the sync stored for the made-up instance. */
async function clearInstance(): Promise<void> {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "stashInstanceId" = ?`,
      INSTANCE
    );
  }
  await prisma.syncState.deleteMany({ where: { stashInstanceId: INSTANCE } });
  await prisma.userExcludedEntity.deleteMany({
    where: { instanceId: INSTANCE },
  });
}

describeWithDb("StashSyncService, one type failing (integration)", () => {
  beforeAll(async () => {
    // The instances the server knows (the test Stash), as in production:
    // clip sync and the post-sync stats read the default one
    await stashInstanceManager.reload();
  });

  beforeEach(async () => {
    await clearInstance();
    const realGet = stashInstanceManager.get.bind(stashInstanceManager);
    const client = stubClient();
    vi.spyOn(stashInstanceManager, "get").mockImplementation((id) =>
      id === INSTANCE ? client : realGet(id)
    );
    // The clip's preview is on no real Stash
    vi.spyOn(clipPreviewProber, "probeBatch").mockResolvedValue(new Map());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearInstance();
  });

  it("a studio failure on a made-up instance is stored and the other types' SyncState rows advance", async () => {
    await stashSyncService.smartIncrementalSync(INSTANCE);

    const states = await prisma.syncState.findMany({
      where: { stashInstanceId: INSTANCE },
      orderBy: { entityType: "asc" },
    });
    expect(
      Object.fromEntries(
        states.map((s) => [
          s.entityType,
          {
            since: s.lastFullSyncTimestamp,
            count: s.lastSyncCount,
            lastError: s.lastError,
          },
        ])
      )
    ).toEqual({
      // Stash's own message and status, never the query or its variables
      studio: {
        since: null,
        count: 0,
        lastError:
          "runtime error: invalid memory address or nil pointer dereference (HTTP 200)",
      },
      tag: { since: UPDATED_AT, count: 1, lastError: null },
      performer: { since: UPDATED_AT, count: 1, lastError: null },
      group: { since: UPDATED_AT, count: 1, lastError: null },
      gallery: { since: UPDATED_AT, count: 1, lastError: null },
      scene: { since: UPDATED_AT, count: 1, lastError: null },
      clip: { since: UPDATED_AT, count: 1, lastError: null },
      image: { since: UPDATED_AT, count: 1, lastError: null },
    });

    // The rows of every type but studios are stored and live
    for (const table of TABLES) {
      const [row] = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*) AS n FROM "${table}"
         WHERE "stashInstanceId" = ? AND "deletedAt" IS NULL`,
        INSTANCE
      );
      expect([table, Number(row?.n)]).toEqual([
        table,
        table === "StashStudio" ? 0 : 1,
      ]);
    }
    expect(stashSyncService.isSyncing()).toBe(false);
  }, 60_000);
});
