/**
 * The startup sync reads only the stored sync state. A migration that needs
 * Peek to refetch a type clears that type's `SyncState` timestamps, and the
 * sync fetches it whole; the other types sync incrementally.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { syncScheduler } from "../../services/SyncScheduler.js";
import { partialRow } from "../helpers/prismaMock.js";

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
  },
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {},
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockSync = vi.mocked(stashSyncService, true);

const TYPES = ["studio", "tag", "performer", "group", "gallery", "scene"];

/** A `SyncState` row per type, with the timestamps of `cleared` set to null. */
function syncStates(cleared: readonly string[]) {
  return TYPES.map((entityType) => {
    const synced = !cleared.includes(entityType);
    return partialRow<
      Awaited<ReturnType<typeof mockPrisma.syncState.findMany>>[number]
    >({
      stashInstanceId: "default",
      entityType,
      lastFullSyncTimestamp: synced ? "2026-09-20T10:00:00-07:00" : null,
      lastIncrementalSyncTimestamp: synced ? "2026-09-24T10:00:00-07:00" : null,
    });
  });
}

describe("performStartupSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a type whose sync timestamps are cleared is fetched whole by the startup sync while the others sync incrementally", async () => {
    mockPrisma.syncState.findMany.mockResolvedValue(syncStates(["group"]));

    await syncScheduler["performStartupSync"]();

    // smartIncrementalSync fetches a type with no timestamp whole
    expect(mockSync.smartIncrementalSync).toHaveBeenCalledOnce();
    expect(mockSync.fullSync).not.toHaveBeenCalled();
  });

  it("runs a full sync when no type has a sync timestamp", async () => {
    mockPrisma.syncState.findMany.mockResolvedValue(syncStates(TYPES));

    await syncScheduler["performStartupSync"]();

    expect(mockSync.fullSync).toHaveBeenCalledOnce();
    expect(mockSync.smartIncrementalSync).not.toHaveBeenCalled();
  });
});
