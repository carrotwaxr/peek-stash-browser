/**
 * The sync routes after the plugin webhook's removal (item 22): no
 * `POST /notify`, and `PUT /settings` passes the scheduler only the settings
 * that still exist.
 */
import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stashSyncService } from "../../services/StashSyncService.js";
import { syncScheduler } from "../../services/SyncScheduler.js";
import {
  findHandler,
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../helpers/controllerTestUtils.js";

vi.mock("../../middleware/auth.js", () => ({
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
  requireAdmin: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
}));

vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    getSyncStatus: vi.fn(),
  },
}));

vi.mock("../../services/SyncScheduler.js", () => ({
  syncScheduler: {
    updateSettings: vi.fn(),
  },
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {},
}));

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSyncService = vi.mocked(stashSyncService, true);
const mockScheduler = vi.mocked(syncScheduler, true);

async function syncRouter() {
  const { default: router } = await import("../../routes/sync.js");
  return router;
}

describe("sync routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScheduler.updateSettings.mockResolvedValue(undefined);
    mockSyncService.getSyncStatus.mockResolvedValue({
      inProgress: false,
      activeJob: null,
      settings: { syncIntervalMinutes: 120, enableScanSubscription: true },
      instances: [],
    });
  });

  it("has no POST /notify route", async () => {
    const router = await syncRouter();

    expect(() => findHandler(router, "post", "/notify")).toThrow(
      "No POST /notify route"
    );
  });

  it("PUT /settings passes only the interval and scan flag to the scheduler", async () => {
    const handler = findHandler(await syncRouter(), "put", "/settings");
    const req = reqFor(handler, {
      body: malformed({ syncIntervalMinutes: 120, enablePluginWebhook: true }),
      user: testUser({ role: "ADMIN" }),
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    expect(mockScheduler.updateSettings.mock.calls).toStrictEqual([
      [{ syncIntervalMinutes: 120 }],
    ]);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      settings: { syncIntervalMinutes: 120, enableScanSubscription: true },
    });
  });
});
