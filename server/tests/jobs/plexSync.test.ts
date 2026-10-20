import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { schedulePlexSync, stopPlexSync } from "../../jobs/plexSync.js";
import { plexConfig } from "../../services/PlexHttp.js";
import {
  plexConnectionStatus,
  syncPlexUsers,
} from "../../services/PlexServerService.js";

vi.mock("../../services/PlexServerService.js", () => ({
  PLEX_SYNC_INTERVAL_MS: 1800000,
  plexConnectionStatus: vi.fn(),
  syncPlexUsers: vi.fn(),
  stopPlexRequests: vi.fn(),
}));
vi.mock("../../services/PlexHttp.js", () => ({ plexConfig: vi.fn() }));
vi.mock("../../utils/logger.js", () => ({ logger: { warn: vi.fn() } }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(plexConfig).mockReturnValue({ clientId: "test", product: "Peek" });
  vi.mocked(plexConnectionStatus).mockResolvedValue({
    connected: true,
    ownerName: "owner",
    serverId: "server",
    serverName: "Server",
    lastSyncedAt: null,
    lastError: null,
    syncIntervalMinutes: 30,
  });
  vi.mocked(syncPlexUsers)
    .mockReset()
    .mockResolvedValue({ imported: 0, members: 1 });
});
afterEach(async () => {
  await stopPlexSync();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("Plex sync schedule", () => {
  it("syncs at startup and every 30 minutes and stops on shutdown", async () => {
    schedulePlexSync();
    schedulePlexSync();
    await vi.advanceTimersByTimeAsync(0);
    expect(syncPlexUsers).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1800000);
    expect(syncPlexUsers).toHaveBeenCalledTimes(2);
    await stopPlexSync();
    await vi.advanceTimersByTimeAsync(1800000);
    expect(syncPlexUsers).toHaveBeenCalledTimes(2);
  });
  it("does no network work when the feature is disabled", async () => {
    vi.mocked(plexConfig).mockReturnValue(null);
    schedulePlexSync();
    await vi.advanceTimersByTimeAsync(1800000);
    expect(syncPlexUsers).not.toHaveBeenCalled();
  });
  it("recovers from a failed automatic sync on the next interval", async () => {
    vi.mocked(syncPlexUsers).mockRejectedValueOnce(new Error("unavailable"));
    schedulePlexSync();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1800000);
    expect(syncPlexUsers).toHaveBeenCalledTimes(2);
  });
});
