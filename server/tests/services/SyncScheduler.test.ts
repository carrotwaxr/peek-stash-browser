/**
 * The startup sync reads only the stored sync state. A migration that needs
 * Peek to refetch a type clears that type's `SyncState` timestamps, and the
 * sync fetches it whole; the other types sync incrementally.
 *
 * Once a day the startup sync or the scheduled tick is a full sync instead:
 * when an enabled instance has had no full pass in 24 hours (the newest
 * `lastFullSyncActual` of its types).
 *
 * The scheduler starts once an instance exists (the setup wizard starts it),
 * and a new sync interval only re-arms the timer: it never starts a sync.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
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
    hasInstances: vi.fn(() => true),
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
const mockManager = vi.mocked(stashInstanceManager, true);
const mockLogger = vi.mocked(logger, true);

/** Every synced type, in sync order */
const TYPES = [
  "tag",
  "studio",
  "performer",
  "group",
  "gallery",
  "scene",
  "clip",
  "image",
];
/** The types the startup check lists as missing when a row is absent */
const SCHEDULER_TYPES = [
  "studio",
  "tag",
  "performer",
  "group",
  "gallery",
  "scene",
  "image",
];

const HOUR = 60 * 60_000;

/** The time `hours` hours before now (the fake clock's, under fake timers). */
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR);
}

type SyncStateRow = Awaited<
  ReturnType<typeof mockPrisma.syncState.findMany>
>[number];

/**
 * A `SyncState` row per type of `instance`, with the timestamps of `cleared`
 * set to null. Every type had its last full sync at `fullPassAt`, an hour
 * ago by default: a migration clears only the timestamps.
 */
function syncStates(
  cleared: readonly string[],
  instance = "default",
  types: readonly string[] = TYPES,
  fullPassAt: Date | null = hoursAgo(1)
): SyncStateRow[] {
  return types.map((entityType) => {
    const synced = !cleared.includes(entityType);
    return partialRow<SyncStateRow>({
      stashInstanceId: instance,
      entityType,
      lastFullSyncTimestamp: synced ? "2026-09-20T10:00:00-07:00" : null,
      lastIncrementalSyncTimestamp: synced ? "2026-09-24T10:00:00-07:00" : null,
      lastFullSyncActual: fullPassAt,
    });
  });
}

/** Both enabled instances synced every type, the full pass `hours` ago. */
function everyInstanceSynced(hours = 1): SyncStateRow[] {
  return [
    ...syncStates([], "default", TYPES, hoursAgo(hours)),
    ...syncStates([], "second", TYPES, hoursAgo(hours)),
  ];
}

/** `rows` with one type's last full sync of one instance set to `at`. */
function withFullPassAt(
  rows: SyncStateRow[],
  instance: string,
  entityType: string,
  at: Date | null
): SyncStateRow[] {
  return rows.map((row) =>
    row.stashInstanceId === instance && row.entityType === entityType
      ? { ...row, lastFullSyncActual: at }
      : row
  );
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
    storeSyncStates([...syncStates(["group"]), ...syncStates([], "second")]);

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

  it("logs each instance's completed and missing types: an instance never synced beside a synced one makes the startup sync a full pass", async () => {
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
    // The second instance has had no full sync
    expect(mockSync.fullSync).toHaveBeenCalledOnce();
    expect(mockSync.smartIncrementalSync).not.toHaveBeenCalled();
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
        storeSyncStates(everyInstanceSynced());
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
        storeSyncStates(everyInstanceSynced());
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
    storeSyncStates(everyInstanceSynced());
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

describe("start and the sync interval", () => {
  const MINUTE = 60_000;

  /** What `SyncSettings` holds after an update saving `minutes`. */
  function savedSettings(minutes: number) {
    mockPrisma.syncSettings.upsert.mockResolvedValue(
      partialRow({
        id: 1,
        syncIntervalMinutes: minutes,
        enableScanSubscription: true,
      })
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockManager.hasInstances.mockReturnValue(true);
    mockPrisma.syncSettings.findFirst.mockResolvedValue(
      partialRow({
        id: 1,
        syncIntervalMinutes: 60,
        enableScanSubscription: true,
      })
    );
    // Every type synced before: the startup sync is the smart one
    storeSyncStates(everyInstanceSynced());
  });

  afterEach(() => {
    syncScheduler.stop();
    vi.useRealTimers();
  });

  it("start with no instance does not mark the scheduler started, and a later start runs the startup sync and schedules the interval", async () => {
    // A server that boots before the setup wizard has saved an instance
    mockManager.hasInstances.mockReturnValue(false);
    await syncScheduler.start();

    expect(syncScheduler.isRunning()).toBe(false);
    expect(mockSync.fullSync).not.toHaveBeenCalled();
    expect(mockSync.smartIncrementalSync).not.toHaveBeenCalled();

    // The wizard saved the first instance, which has never synced
    mockManager.hasInstances.mockReturnValue(true);
    storeSyncStates([]);
    await syncScheduler.start();

    expect(syncScheduler.isRunning()).toBe(true);
    expect(mockSync.fullSync).toHaveBeenCalledOnce();
    // The startup full sync stored every type's state
    storeSyncStates(everyInstanceSynced(0));
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(mockSync.incrementalSync).toHaveBeenCalledOnce();
  });

  it("updateSettings with a new interval starts no sync and fires the next scheduled sync after the new interval", async () => {
    await syncScheduler.start();
    expect(mockSync.smartIncrementalSync).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30 * MINUTE);

    savedSettings(15);
    await syncScheduler.updateSettings({ syncIntervalMinutes: 15 });

    // Only the startup sync so far
    expect(mockSync.smartIncrementalSync).toHaveBeenCalledOnce();
    expect(mockSync.fullSync).not.toHaveBeenCalled();
    expect(mockSync.incrementalSync).not.toHaveBeenCalled();
    expect(mockPrisma.syncSettings.upsert).toHaveBeenCalledOnce();
    expect(syncScheduler.getSettings()).toEqual({
      syncIntervalMinutes: 15,
      enableScanSubscription: true,
    });

    // The timer counts from the change, 15 minutes
    await vi.advanceTimersByTimeAsync(15 * MINUTE - 1);
    expect(mockSync.incrementalSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mockSync.incrementalSync).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    expect(mockSync.incrementalSync).toHaveBeenCalledTimes(2);
  });

  it("a stop while the settings load (a shutdown during boot) arms no timer and runs no startup sync", async () => {
    const starting = syncScheduler.start();
    syncScheduler.stop();
    await starting;

    expect(syncScheduler.isRunning()).toBe(false);
    expect(mockSync.smartIncrementalSync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(mockSync.incrementalSync).not.toHaveBeenCalled();
  });

  it("a start that cannot read the settings stays stopped, so a later start runs", async () => {
    mockPrisma.syncSettings.findFirst.mockRejectedValueOnce(
      new Error("database is locked")
    );

    await expect(syncScheduler.start()).rejects.toThrow("database is locked");
    expect(syncScheduler.isRunning()).toBe(false);

    await syncScheduler.start();
    expect(syncScheduler.isRunning()).toBe(true);
    expect(mockSync.smartIncrementalSync).toHaveBeenCalledOnce();
  });

  it("updateSettings with the same interval changes nothing", async () => {
    await syncScheduler.start();
    await vi.advanceTimersByTimeAsync(30 * MINUTE);

    savedSettings(60);
    await syncScheduler.updateSettings({ syncIntervalMinutes: 60 });

    expect(mockSync.smartIncrementalSync).toHaveBeenCalledOnce();
    expect(mockSync.fullSync).not.toHaveBeenCalled();
    expect(mockSync.incrementalSync).not.toHaveBeenCalled();

    // The timer keeps counting from start: the next sync is 60 minutes
    // after it, 30 after the update
    await vi.advanceTimersByTimeAsync(30 * MINUTE);
    expect(mockSync.incrementalSync).toHaveBeenCalledOnce();
  });
});

describe("the daily full pass", () => {
  const MINUTE = 60_000;

  /**
   * The state at the check, and whether a full pass is due. The ages are
   * taken when the rows are stored, right before the check.
   */
  const cases: Array<{
    name: string;
    rows: () => SyncStateRow[];
    full: boolean;
  }> = [
    {
      name: "every type of both instances had its last full sync 23 hours ago",
      rows: () => everyInstanceSynced(23),
      full: false,
    },
    {
      name: "every type of the second instance had its last 24 hours and a minute ago",
      rows: () => [
        ...syncStates([], "default", TYPES, hoursAgo(23)),
        ...syncStates(
          [],
          "second",
          TYPES,
          new Date(Date.now() - 24 * HOUR - MINUTE)
        ),
      ],
      full: true,
    },
    {
      name: "the second instance's newest full sync is 24 hours and a minute old, its others older",
      rows: () =>
        withFullPassAt(
          [
            ...syncStates([], "default", TYPES, hoursAgo(23)),
            ...syncStates([], "second", TYPES, hoursAgo(30)),
          ],
          "second",
          "clip",
          new Date(Date.now() - 24 * HOUR - MINUTE)
        ),
      full: true,
    },
    {
      name: "no type of the second instance recorded one",
      rows: () => [
        ...syncStates([], "default", TYPES, hoursAgo(23)),
        ...syncStates([], "second", TYPES, null),
      ],
      full: true,
    },
    {
      name: "the second instance has no rows",
      rows: () => syncStates([], "default", TYPES, hoursAgo(23)),
      full: true,
    },
    {
      name: "one type of the second instance had its last 30 hours ago, the others 23",
      rows: () =>
        withFullPassAt(everyInstanceSynced(23), "second", "clip", hoursAgo(30)),
      full: false,
    },
    {
      name: "the default instance has no image row",
      rows: () =>
        everyInstanceSynced(23).filter(
          (row) =>
            !(row.stashInstanceId === "default" && row.entityType === "image")
        ),
      full: false,
    },
    {
      name: "only an instance that is not enabled had its last three days ago",
      rows: () => [
        ...everyInstanceSynced(23),
        ...syncStates([], "disabled", TYPES, hoursAgo(72)),
      ],
      full: false,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    syncScheduler.stop();
    vi.useRealTimers();
    mockSync.isSyncing.mockReturnValue(false);
  });

  it.each(cases)(
    "a scheduled tick runs a full sync when an enabled instance's newest lastFullSyncActual is older than 24 hours or missing, else an incremental one: $name",
    async ({ rows, full }) => {
      vi.useFakeTimers();
      syncScheduler["startPollingInterval"](60);
      await vi.advanceTimersByTimeAsync(60 * MINUTE - 1);
      storeSyncStates(rows());

      await vi.advanceTimersByTimeAsync(1);

      await vi.waitFor(() => {
        expect(
          mockSync.fullSync.mock.calls.length +
            mockSync.incrementalSync.mock.calls.length
        ).toBe(1);
      });
      expect(mockSync.fullSync).toHaveBeenCalledTimes(full ? 1 : 0);
      expect(mockSync.incrementalSync).toHaveBeenCalledTimes(full ? 0 : 1);
      expect(mockSync.smartIncrementalSync).not.toHaveBeenCalled();
    }
  );

  it.each(cases)(
    "the startup sync does the same: $name",
    async ({ rows, full }) => {
      storeSyncStates(rows());

      await syncScheduler["performStartupSync"]();

      expect(mockSync.fullSync).toHaveBeenCalledTimes(full ? 1 : 0);
      expect(mockSync.smartIncrementalSync).toHaveBeenCalledTimes(full ? 0 : 1);
    }
  );

  it("an instance whose studio type fails every pass still runs incremental syncs between daily passes", async () => {
    vi.useFakeTimers();
    // The last pass fetched every other type an hour ago; studios failed
    // there and on every pass before, so they never recorded one
    storeSyncStates(
      withFullPassAt(everyInstanceSynced(1), "default", "studio", null)
    );
    syncScheduler["startPollingInterval"](60);

    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    await vi.waitFor(() => {
      expect(
        mockSync.fullSync.mock.calls.length +
          mockSync.incrementalSync.mock.calls.length
      ).toBe(1);
    });
    expect(mockSync.incrementalSync).toHaveBeenCalledOnce();
    expect(mockSync.fullSync).not.toHaveBeenCalled();
  });

  it("a tick while a sync runs starts nothing", async () => {
    vi.useFakeTimers();
    storeSyncStates(everyInstanceSynced(30));
    mockSync.isSyncing.mockReturnValue(true);
    syncScheduler["startPollingInterval"](60);

    await vi.advanceTimersByTimeAsync(60 * MINUTE);

    await vi.waitFor(() => {
      expect(mockLogger.debug).toHaveBeenCalledWith(
        "Scheduled sync skipped - sync already in progress"
      );
    });
    expect(mockSync.fullSync).not.toHaveBeenCalled();
    expect(mockSync.incrementalSync).not.toHaveBeenCalled();
  });
});
