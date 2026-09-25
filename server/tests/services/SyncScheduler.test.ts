/**
 * The startup sync reads only the stored sync state. A migration that needs
 * Peek to refetch a type clears that type's `SyncState` timestamps, and the
 * sync fetches it whole; the other types sync incrementally.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { syncScheduler } from "../../services/SyncScheduler.js";
import { logger } from "../../utils/logger.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// A boot that applied migrations, which once meant a full sync of everything
vi.mock("../../initializers/database.js", () => ({
  wereMigrationsApplied: () => true,
}));

vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    fullSync: vi.fn(),
    smartIncrementalSync: vi.fn(),
    incrementalSync: vi.fn(),
    isSyncing: vi.fn(() => false),
  },
}));

// Two enabled instances; the manager loads only enabled ones
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getAllEnabled: () => [
      { id: "default", name: "Main" },
      { id: "second", name: "Second" },
    ],
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockSync = vi.mocked(stashSyncService, true);
const mockLogger = vi.mocked(logger, true);

const TYPES = ["studio", "tag", "performer", "group", "gallery", "scene"];
/** The types the startup check lists as missing when a row is absent */
const SCHEDULER_TYPES = [...TYPES, "image"];

type SyncStateRow = Awaited<
  ReturnType<typeof mockPrisma.syncState.findMany>
>[number];

/**
 * A `SyncState` row per type of `instance`, with the timestamps of `cleared`
 * set to null.
 */
function syncStates(
  cleared: readonly string[],
  instance = "default",
  types: readonly string[] = TYPES
): SyncStateRow[] {
  return types.map((entityType) => {
    const synced = !cleared.includes(entityType);
    return partialRow<SyncStateRow>({
      stashInstanceId: instance,
      entityType,
      lastFullSyncTimestamp: synced ? "2026-09-20T10:00:00-07:00" : null,
      lastIncrementalSyncTimestamp: synced ? "2026-09-24T10:00:00-07:00" : null,
    });
  });
}

/** SyncState holds `rows`; the mock answers the query's instance filter. */
function storeSyncStates(rows: SyncStateRow[]): void {
  mockPrisma.syncState.findMany.mockImplementation(
    prismaImpl((args) => {
      const filter = args?.where?.stashInstanceId;
      const ids = typeof filter === "object" ? filter.in : undefined;
      return ids
        ? rows.filter((row) => ids.includes(row.stashInstanceId))
        : rows;
    })
  );
}

describe("performStartupSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a type whose sync timestamps are cleared is fetched whole by the startup sync while the others sync incrementally", async () => {
    storeSyncStates(syncStates(["group"]));

    await syncScheduler["performStartupSync"]();

    // smartIncrementalSync fetches a type with no timestamp whole
    expect(mockSync.smartIncrementalSync).toHaveBeenCalledOnce();
    expect(mockSync.fullSync).not.toHaveBeenCalled();
  });

  it("runs a full sync when no type has a sync timestamp", async () => {
    storeSyncStates(syncStates(TYPES));

    await syncScheduler["performStartupSync"]();

    expect(mockSync.fullSync).toHaveBeenCalledOnce();
    expect(mockSync.smartIncrementalSync).not.toHaveBeenCalled();
  });

  it("reads each enabled instance's own sync state: another instance's synced rows do not count", async () => {
    // A deleted or disabled instance synced everything; neither enabled
    // instance has synced anything
    storeSyncStates(syncStates([], "gone", SCHEDULER_TYPES));

    await syncScheduler["performStartupSync"]();

    expect(mockPrisma.syncState.findMany).toHaveBeenCalledWith({
      where: { stashInstanceId: { in: ["default", "second"] } },
    });
    expect(mockSync.fullSync).toHaveBeenCalledOnce();
    expect(mockSync.smartIncrementalSync).not.toHaveBeenCalled();
  });

  it("logs each instance's completed and missing types: an instance never synced beside a synced one is fetched whole by the smart sync", async () => {
    storeSyncStates(syncStates([], "default", SCHEDULER_TYPES));

    await syncScheduler["performStartupSync"]();

    expect(mockLogger.info).toHaveBeenCalledWith("Startup sync state check", {
      instances: [
        {
          instanceId: "default",
          completedTypes: SCHEDULER_TYPES,
          missingTypes: [],
        },
        {
          instanceId: "second",
          completedTypes: [],
          missingTypes: SCHEDULER_TYPES,
        },
      ],
      totalSyncStates: SCHEDULER_TYPES.length,
    });
    expect(mockSync.smartIncrementalSync).toHaveBeenCalledOnce();
    expect(mockSync.fullSync).not.toHaveBeenCalled();
  });
});

describe("an admin's abort is not a failure", () => {
  const aborted = () => Promise.reject(new Error("Sync aborted"));

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    syncScheduler.stop();
    vi.useRealTimers();
  });

  it.each([
    {
      caller: "the startup full sync",
      run: async () => {
        storeSyncStates(syncStates(TYPES));
        mockSync.fullSync.mockImplementationOnce(aborted);
        await syncScheduler["performStartupSync"]();
      },
    },
    {
      caller: "the startup smart sync",
      run: async () => {
        storeSyncStates(syncStates([]));
        mockSync.smartIncrementalSync.mockImplementationOnce(aborted);
        await syncScheduler["performStartupSync"]();
      },
    },
    {
      caller: "a manual full sync",
      run: async () => {
        mockSync.fullSync.mockImplementationOnce(aborted);
        await syncScheduler.triggerFullSync();
      },
    },
    {
      caller: "a manual incremental sync",
      run: async () => {
        mockSync.incrementalSync.mockImplementationOnce(aborted);
        await syncScheduler.triggerIncrementalSync();
      },
    },
    {
      caller: "a scheduled sync",
      run: async () => {
        vi.useFakeTimers();
        mockSync.incrementalSync.mockImplementationOnce(aborted);
        syncScheduler["startPollingInterval"](1);
        await vi.advanceTimersByTimeAsync(60_000);
      },
    },
  ])("$caller logs Sync aborted at info", async ({ run }) => {
    // A manual sync rethrows the abort to the route, which ignores it
    await run().catch(() => undefined);

    await vi.waitFor(() => {
      expect(mockLogger.info).toHaveBeenCalledWith("Sync aborted", {});
    });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("a manual full sync still rethrows the abort to its caller", async () => {
    mockSync.fullSync.mockImplementationOnce(aborted);

    await expect(syncScheduler.triggerFullSync()).rejects.toThrow(
      "Sync aborted"
    );
  });

  it("a sync that fails is still logged at error level", async () => {
    storeSyncStates(syncStates([]));
    mockSync.smartIncrementalSync.mockRejectedValueOnce(
      new Error("Stash is down")
    );

    await syncScheduler["performStartupSync"]();

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Startup smart incremental sync failed",
      { error: "Stash is down" }
    );
  });
});
