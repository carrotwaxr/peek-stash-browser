/**
 * Integration tests for StashSyncService.cleanupDeletedEntities (scene path).
 *
 * These run against the real test SQLite database (unlike the mocked unit tests
 * in tests/services/StashSyncService.cleanup.test.ts) and exercise the actual
 * temp-table `NOT IN` computation inside the single-connection transaction, plus
 * the #526 delete-ratio safety threshold.
 *
 * Strategy: seed scenes under a dedicated, isolated stashInstanceId (so the real
 * sync never touches them), stub getStashClient to return a controlled keep-set
 * for that instance only, run cleanup, and assert exactly which scenes got
 * soft-deleted in the real DB.
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
import prisma from "../../prisma/singleton.js";
import { stashSyncService } from "../../services/StashSyncService.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

// Isolated instance id — not a real synced Stash instance, so background sync
// and other tests never touch these rows.
const TEST_INSTANCE = "cleanup-it-instance";
const SCENE_IDS = Array.from({ length: 10 }, (_, i) => String(i + 1)); // "1".."10"

async function clearTestScenes(): Promise<void> {
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
}

async function seedTestScenes(): Promise<void> {
  await clearTestScenes();
  await prisma.stashScene.createMany({
    data: SCENE_IDS.map((id) => ({ id, stashInstanceId: TEST_INSTANCE })),
  });
}

/** Snapshot of which seeded scenes are alive vs soft-deleted. */
async function snapshot(): Promise<{ alive: string[]; deleted: string[] }> {
  const rows = await prisma.stashScene.findMany({
    where: { stashInstanceId: TEST_INSTANCE },
    select: { id: true, deletedAt: true },
  });
  return {
    alive: rows.filter((r) => r.deletedAt === null).map((r) => r.id),
    deleted: rows.filter((r) => r.deletedAt !== null).map((r) => r.id),
  };
}

describeWithDb("StashSyncService.cleanupDeletedEntities (integration)", () => {
  // The keep-set the stubbed Stash client reports for TEST_INSTANCE.
  let keepSet: string[] = [];

  beforeEach(async () => {
    await seedTestScenes();

    // Capture the real implementation (bound) before spying so calls for any
    // OTHER instance pass through untouched — only TEST_INSTANCE gets the stub.
    const realGetStashClient = (
      stashSyncService as unknown as {
        getStashClient: (id?: string) => unknown;
      }
    ).getStashClient.bind(stashSyncService);

    vi.spyOn(
      stashSyncService as unknown as {
        getStashClient: (id?: string) => unknown;
      },
      "getStashClient"
    ).mockImplementation((id?: string) => {
      if (id !== TEST_INSTANCE) return realGetStashClient(id);
      return {
        findSceneIDs: async () => ({
          findScenes: {
            scenes: keepSet.map((sceneId) => ({ id: sceneId })),
            count: keepSet.length,
          },
        }),
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await clearTestScenes();
  });

  it("soft-deletes exactly the scenes missing from Stash (real temp-table NOT IN)", async () => {
    // Stash still has scenes 1..7; 8, 9, 10 were deleted → 3/10 = 30% (under threshold).
    keepSet = ["1", "2", "3", "4", "5", "6", "7"];

    const deletedCount = await (
      stashSyncService as unknown as {
        cleanupDeletedEntities: (t: string, id: string) => Promise<number>;
      }
    ).cleanupDeletedEntities("scene", TEST_INSTANCE);

    expect(deletedCount).toBe(3);
    const { alive, deleted } = await snapshot();
    expect(new Set(deleted)).toEqual(new Set(["8", "9", "10"]));
    expect(new Set(alive)).toEqual(
      new Set(["1", "2", "3", "4", "5", "6", "7"])
    );
  });

  it("aborts and soft-deletes nothing when the keep-set looks truncated (#526 threshold)", async () => {
    // Stash returns only 2 of 10 → would delete 8/10 = 80% (over the 50% threshold).
    keepSet = ["1", "2"];

    const deletedCount = await (
      stashSyncService as unknown as {
        cleanupDeletedEntities: (t: string, id: string) => Promise<number>;
      }
    ).cleanupDeletedEntities("scene", TEST_INSTANCE);

    expect(deletedCount).toBe(0);
    const { alive, deleted } = await snapshot();
    expect(deleted).toHaveLength(0);
    expect(new Set(alive)).toEqual(new Set(SCENE_IDS));
  });
});
