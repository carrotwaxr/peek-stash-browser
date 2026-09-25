/**
 * Integration tests for StashSyncService.cleanupDeletedEntities, all eight
 * entity types, against the real test SQLite database (the mocked unit tests
 * are in tests/services/StashSyncService.cleanup.test.ts).
 *
 * Strategy: seed rows under two made-up instances, A and B, with the same
 * ids (so the real sync never touches them), stub A's Stash client to page
 * a controlled keep-set, run cleanup for A, and assert exactly which rows
 * got soft-deleted in the real DB, and that B's same-id rows did not.
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
  FindSceneMarkersQuery,
} from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { stringContaining } from "../../tests/helpers/matchers.js";
import { must } from "../../tests/helpers/must.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

// Made-up instances: no real Stash, so background sync never touches them.
const INSTANCE_A = "cleanup-it-a";
const INSTANCE_B = "cleanup-it-b";

/** The table each type's rows live in, and the columns a seed must fill. */
const TYPES = [
  { type: "scene", table: "StashScene", method: "findSceneIDs" },
  { type: "performer", table: "StashPerformer", method: "findPerformerIDs" },
  { type: "studio", table: "StashStudio", method: "findStudioIDs" },
  { type: "tag", table: "StashTag", method: "findTagIDs" },
  { type: "group", table: "StashGroup", method: "findGroupIDs" },
  { type: "gallery", table: "StashGallery", method: "findGalleryIDs" },
  { type: "image", table: "StashImage", method: "findImageIDs" },
  { type: "clip", table: "StashClip", method: "findSceneMarkers" },
] as const;

type CleanupType = (typeof TYPES)[number]["type"];
type CleanupTable = (typeof TYPES)[number]["table"];

/** The scene every seeded clip belongs to (clips need a parent scene). */
const CLIP_PARENT_SCENE = "cleanup-clip-parent";

const ids = (from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

/** Seed `rowIds` of one type under `instanceId`, with the columns it requires. */
async function seed(
  type: CleanupType,
  table: CleanupTable,
  instanceId: string,
  rowIds: string[]
): Promise<void> {
  const json = JSON.stringify(rowIds);
  switch (type) {
    case "performer":
    case "studio":
    case "tag":
    case "group":
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${table}" ("id", "stashInstanceId", "name")
         SELECT value, ?, 'Seed ' || value FROM json_each(?)`,
        instanceId,
        json
      );
      return;
    case "clip":
      await prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO "StashScene" ("id", "stashInstanceId") VALUES (?, ?)`,
        CLIP_PARENT_SCENE,
        instanceId
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "StashClip" ("id", "stashInstanceId", "sceneId", "sceneInstanceId", "seconds")
         SELECT value, ?, ?, ?, 0 FROM json_each(?)`,
        instanceId,
        CLIP_PARENT_SCENE,
        instanceId,
        json
      );
      return;
    case "scene":
    case "gallery":
    case "image":
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${table}" ("id", "stashInstanceId")
         SELECT value, ? FROM json_each(?)`,
        instanceId,
        json
      );
  }
}

/** Delete every row the tests seeded under A and B, clips before scenes. */
async function clearSeeds(): Promise<void> {
  for (const { table } of [...TYPES].reverse()) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "stashInstanceId" IN (?, ?)`,
      INSTANCE_A,
      INSTANCE_B
    );
  }
  await prisma.syncState.deleteMany({
    where: { stashInstanceId: { in: [INSTANCE_A, INSTANCE_B] } },
  });
}

/** A and B each have a SyncState row for `type` with `lastError`. */
async function seedSyncStates(
  type: CleanupType,
  lastError: string
): Promise<void> {
  await prisma.syncState.createMany({
    data: [INSTANCE_A, INSTANCE_B].map((stashInstanceId) => ({
      stashInstanceId,
      entityType: type,
      lastError,
    })),
  });
}

/** `lastError` of `type` on A and on B. */
async function lastErrors(
  type: CleanupType
): Promise<Record<string, string | null>> {
  const rows = await prisma.syncState.findMany({
    where: {
      stashInstanceId: { in: [INSTANCE_A, INSTANCE_B] },
      entityType: type,
    },
  });
  return Object.fromEntries(
    rows.map((row) => [row.stashInstanceId, row.lastError])
  );
}

/** Which rows of `table` under `instanceId` are alive and soft-deleted. */
async function snapshot(
  table: CleanupTable,
  instanceId: string
): Promise<{ alive: string[]; deleted: string[] }> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; gone: bigint }>
  >(
    `SELECT "id", "deletedAt" IS NOT NULL AS gone FROM "${table}"
     WHERE "stashInstanceId" = ?`,
    instanceId
  );
  const sorted = (list: string[]) => list.sort((a, b) => Number(a) - Number(b));
  return {
    alive: sorted(rows.filter((r) => !r.gone).map((r) => r.id)),
    deleted: sorted(rows.filter((r) => r.gone).map((r) => r.id)),
  };
}

/**
 * What the stubbed Stash answers: `keepSet` paged by the request's filter,
 * with `count` (default: the keep-set's size) as Stash's own total.
 */
interface StashAnswer {
  keepSet: string[];
  count?: number;
}

function page(
  answer: StashAnswer,
  filter: FindFilterType | null | undefined
): { ids: string[]; count: number } {
  const perPage = filter?.per_page ?? 25;
  const pageNo = filter?.page ?? 1;
  return {
    ids: answer.keepSet.slice((pageNo - 1) * perPage, pageNo * perPage),
    count: answer.count ?? answer.keepSet.length,
  };
}

type SceneMarkerRow =
  FindSceneMarkersQuery["findSceneMarkers"]["scene_markers"][number];

/** A Stash client whose id operation for `type` pages `answer`. */
function stubClient(type: CleanupType, answer: StashAnswer): StashClient {
  switch (type) {
    case "scene":
      return partialRow<StashClient>({
        findSceneIDs: (vars) => {
          const { ids: got, count } = page(answer, vars?.filter);
          return Promise.resolve({
            findScenes: { count, scenes: got.map((id) => ({ id })) },
          });
        },
      });
    case "performer":
      return partialRow<StashClient>({
        findPerformerIDs: (vars) => {
          const { ids: got, count } = page(answer, vars?.filter);
          return Promise.resolve({
            findPerformers: { count, performers: got.map((id) => ({ id })) },
          });
        },
      });
    case "studio":
      return partialRow<StashClient>({
        findStudioIDs: (vars) => {
          const { ids: got, count } = page(answer, vars?.filter);
          return Promise.resolve({
            findStudios: { count, studios: got.map((id) => ({ id })) },
          });
        },
      });
    case "tag":
      return partialRow<StashClient>({
        findTagIDs: (vars) => {
          const { ids: got, count } = page(answer, vars?.filter);
          return Promise.resolve({
            findTags: { count, tags: got.map((id) => ({ id })) },
          });
        },
      });
    case "group":
      return partialRow<StashClient>({
        findGroupIDs: (vars) => {
          const { ids: got, count } = page(answer, vars?.filter);
          return Promise.resolve({
            findGroups: { count, groups: got.map((id) => ({ id })) },
          });
        },
      });
    case "gallery":
      return partialRow<StashClient>({
        findGalleryIDs: (vars) => {
          const { ids: got, count } = page(answer, vars?.filter);
          return Promise.resolve({
            findGalleries: { count, galleries: got.map((id) => ({ id })) },
          });
        },
      });
    case "image":
      return partialRow<StashClient>({
        findImageIDs: (vars) => {
          const { ids: got, count } = page(answer, vars?.filter);
          return Promise.resolve({
            findImages: { count, images: got.map((id) => ({ id })) },
          });
        },
      });
    case "clip":
      return partialRow<StashClient>({
        findSceneMarkers: (vars) => {
          const { ids: got, count } = page(answer, vars?.filter);
          return Promise.resolve({
            findSceneMarkers: {
              count,
              scene_markers: got.map((id) =>
                partialRow<SceneMarkerRow>({ id })
              ),
            },
          });
        },
      });
  }
}

/** Route A's Stash client to the stub; any other instance keeps its real one. */
function stubStash(type: CleanupType, answer: StashAnswer): void {
  const realGet = stashInstanceManager.get.bind(stashInstanceManager);
  const client = stubClient(type, answer);
  // Under the lock (runCleanup) the client is scoped to the job's abort
  // signal; the stub stays itself
  Object.assign(client, { withSignal: () => client });
  vi.spyOn(stashInstanceManager, "get").mockImplementation((id) =>
    id === INSTANCE_A ? client : realGet(id)
  );
}

const ROWS = ids(1, 120);

describeWithDb.each(TYPES)(
  "StashSyncService.cleanupDeletedEntities, $type (integration)",
  ({ type, table }) => {
    beforeEach(async () => {
      await clearSeeds();
      await seed(type, table, INSTANCE_A, ROWS);
      await seed(type, table, INSTANCE_B, ROWS);
    });

    afterEach(async () => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      await clearSeeds();
    });

    it("soft-deletes exactly the rows missing from Stash, only on A", async () => {
      stubStash(type, { keepSet: ids(1, 100) });

      await stashSyncService["cleanupDeletedEntities"](type, INSTANCE_A);

      expect(await snapshot(table, INSTANCE_A)).toEqual({
        alive: ids(1, 100),
        deleted: ids(101, 120),
      });
      expect(await snapshot(table, INSTANCE_B)).toEqual({
        alive: ROWS,
        deleted: [],
      });
    });

    it("refuses when more than half would go", async () => {
      // 80 of 120 missing: a truncated list, not 80 deletions in Stash
      stubStash(type, { keepSet: ids(1, 40) });

      await stashSyncService["cleanupDeletedEntities"](type, INSTANCE_A);

      expect(await snapshot(table, INSTANCE_A)).toEqual({
        alive: ROWS,
        deleted: [],
      });
    });

    it("applies a refused deletion when an admin forces it, only on A", async () => {
      // 80 of 120 missing: refused by the sync's own cleanup
      stubStash(type, { keepSet: ids(1, 40) });
      const refused = await stashSyncService["cleanupDeletedEntities"](
        type,
        INSTANCE_A
      );
      expect(refused.skipped).toMatch(
        /^Cleanup refused: Stash no longer lists 80 of 120 /
      );
      await seedSyncStates(type, must(refused.skipped, "the refusal"));

      // Apply deletions (POST /api/sync/cleanup)
      await stashSyncService.runCleanup(type, INSTANCE_A, {
        ignoreRatioGuard: true,
      });

      expect(await snapshot(table, INSTANCE_A)).toEqual({
        alive: ids(1, 40),
        deleted: ids(41, 120),
      });
      expect(await snapshot(table, INSTANCE_B)).toEqual({
        alive: ROWS,
        deleted: [],
      });
      expect(await lastErrors(type)).toEqual({
        [INSTANCE_A]: null,
        [INSTANCE_B]: refused.skipped,
      });
    });

    it("keeps skipping a partial list when an admin forces the cleanup", async () => {
      stubStash(type, { keepSet: ids(1, 40), count: 120 });
      await seedSyncStates(type, "Cleanup refused: an earlier run");

      await stashSyncService.runCleanup(type, INSTANCE_A, {
        ignoreRatioGuard: true,
      });

      expect(await snapshot(table, INSTANCE_A)).toEqual({
        alive: ROWS,
        deleted: [],
      });
      expect(await lastErrors(type)).toEqual({
        [INSTANCE_A]: stringContaining(
          "Cleanup skipped: Stash returned 40 of 120"
        ),
        [INSTANCE_B]: "Cleanup refused: an earlier run",
      });
    });

    it("cleans a library too small for the ratio guard even when most rows go", async () => {
      // 8 of 10 missing is under the 50-row floor: a small library emptied in Stash
      await clearSeeds();
      await seed(type, table, INSTANCE_A, ids(1, 10));
      stubStash(type, { keepSet: ids(1, 2) });

      await stashSyncService["cleanupDeletedEntities"](type, INSTANCE_A);

      expect(await snapshot(table, INSTANCE_A)).toEqual({
        alive: ids(1, 2),
        deleted: ids(3, 10),
      });
    });

    it("refuses when a page comes back empty before the reported count", async () => {
      // Stash says 120; page 1 holds 100 ids and page 2 holds none
      stubStash(type, { keepSet: ids(1, 100), count: 120 });

      await stashSyncService["cleanupDeletedEntities"](type, INSTANCE_A);

      expect(await snapshot(table, INSTANCE_A)).toEqual({
        alive: ROWS,
        deleted: [],
      });
    });

    it("records deletedAt as Prisma writes it", async () => {
      const now = new Date("2026-09-24T12:34:56.789Z");
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      stubStash(type, { keepSet: ids(1, 119) });

      await stashSyncService["cleanupDeletedEntities"](type, INSTANCE_A);

      // Prisma stores DateTime in SQLite as integer epoch milliseconds
      // (an expression, so Prisma returns the stored number, not a Date)
      const stored = await prisma.$queryRawUnsafe<
        Array<{ kind: string; ms: bigint | number }>
      >(
        `SELECT typeof("deletedAt") AS kind, "deletedAt" + 0 AS ms FROM "${table}"
         WHERE "stashInstanceId" = ? AND "deletedAt" IS NOT NULL`,
        INSTANCE_A
      );
      expect(stored.map((r) => [r.kind, Number(r.ms)])).toEqual([
        ["integer", now.getTime()],
      ]);

      // ...and Prisma reads it back as the Date the cleanup used
      expect(await readDeletedAt(type, "120")).toEqual(now);
    });
  }
);

/** `deletedAt` of one row under A, read through the Prisma model. */
async function readDeletedAt(
  type: CleanupType,
  id: string
): Promise<Date | null | undefined> {
  const where = { id_stashInstanceId: { id, stashInstanceId: INSTANCE_A } };
  const select = { deletedAt: true } as const;
  switch (type) {
    case "scene":
      return (await prisma.stashScene.findUnique({ where, select }))?.deletedAt;
    case "performer":
      return (await prisma.stashPerformer.findUnique({ where, select }))
        ?.deletedAt;
    case "studio":
      return (await prisma.stashStudio.findUnique({ where, select }))
        ?.deletedAt;
    case "tag":
      return (await prisma.stashTag.findUnique({ where, select }))?.deletedAt;
    case "group":
      return (await prisma.stashGroup.findUnique({ where, select }))?.deletedAt;
    case "gallery":
      return (await prisma.stashGallery.findUnique({ where, select }))
        ?.deletedAt;
    case "image":
      return (await prisma.stashImage.findUnique({ where, select }))?.deletedAt;
    case "clip":
      return (await prisma.stashClip.findUnique({ where, select }))?.deletedAt;
  }
}

describeWithDb(
  "StashSyncService.cleanupDeletedEntities, a large image library (integration)",
  () => {
    const TOTAL = 300_003;
    const KEPT = 300_000;

    beforeEach(async () => {
      await clearSeeds();
      await prisma.$executeRawUnsafe(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
         INSERT INTO "StashImage" ("id", "stashInstanceId")
         SELECT CAST(i AS TEXT), ? FROM n`,
        TOTAL,
        INSTANCE_A
      );
    }, 120_000);

    afterEach(async () => {
      vi.restoreAllMocks();
      await clearSeeds();
    }, 120_000);

    it("cleans images with 300,000 ids", async () => {
      // 60 pages of 5,000: more ids than SQLite binds in one statement
      stubStash("image", { keepSet: ids(1, KEPT) });

      await stashSyncService["cleanupDeletedEntities"]("image", INSTANCE_A);

      const gone = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "StashImage"
         WHERE "stashInstanceId" = ? AND "deletedAt" IS NOT NULL
         ORDER BY CAST("id" AS INTEGER)`,
        INSTANCE_A
      );
      expect(gone.map((r) => r.id)).toEqual(ids(KEPT + 1, TOTAL));
    }, 120_000);
  }
);

// Instance and Stash ids with quotes: both must be bound, never spliced into
// the cleanup SQL (item 4, SYNC-23).
const QUOTED_INSTANCE = "cleanup-it-o'brien";
const SCENE_IDS = ids(1, 10);

async function clearQuotedScenes(): Promise<void> {
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: QUOTED_INSTANCE },
  });
}

describeWithDb(
  "StashSyncService.cleanupDeletedEntities with quoted ids (integration)",
  () => {
    let keepSet: string[] = [];

    beforeEach(async () => {
      await clearQuotedScenes();
      await prisma.stashScene.createMany({
        data: SCENE_IDS.map((id) => ({ id, stashInstanceId: QUOTED_INSTANCE })),
      });

      // Only QUOTED_INSTANCE gets the stub; any other instance keeps its real client.
      const realGet = stashInstanceManager.get.bind(stashInstanceManager);
      vi.spyOn(stashInstanceManager, "get").mockImplementation((id) =>
        id === QUOTED_INSTANCE
          ? partialRow<StashClient>({
              findSceneIDs: () =>
                Promise.resolve({
                  findScenes: {
                    scenes: keepSet.map((sceneId) => ({ id: sceneId })),
                    count: keepSet.length,
                  },
                }),
            })
          : realGet(id)
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    afterAll(async () => {
      await clearQuotedScenes();
    });

    it("soft-deletes exactly the missing scenes when the instance id and a Stash id contain quotes", async () => {
      keepSet = ["1", "2", "3", "4", "5", "6", "7", "it's-gone"];

      await stashSyncService["cleanupDeletedEntities"](
        "scene",
        QUOTED_INSTANCE
      );

      const rows = await prisma.stashScene.findMany({
        where: { stashInstanceId: QUOTED_INSTANCE },
        select: { id: true, deletedAt: true },
      });
      const deleted = rows.filter((r) => r.deletedAt !== null).map((r) => r.id);
      expect(new Set(deleted)).toEqual(new Set(["8", "9", "10"]));
    });
  }
);
