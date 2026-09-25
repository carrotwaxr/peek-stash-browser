/**
 * The Stash instance record (its address) and the sync status (with the sync
 * settings) are for the admin-only Server settings tab: a regular user gets
 * 403 from both.
 */
import type { NextFunction, Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type * as authModule from "../../middleware/auth.js";
import type { SyncStatusResponse } from "../../types/api/sync.js";
import { startTestApp } from "../helpers/httpTestApp.js";

vi.mock("../../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof authModule>();
  return {
    ...actual,
    requireAdmin: actual.requireAdmin,
    authenticate: (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { user: unknown }).user = {
        id: 2,
        username: "u",
        role: req.header("x-test-role"),
      };
      next();
    },
  };
});

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    stashInstance: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

/** What the admin sees: every instance's states, no instance address */
const SYNC_STATUS: SyncStatusResponse = {
  inProgress: false,
  activeJob: null,
  settings: { syncIntervalMinutes: 60, enableScanSubscription: true },
  instances: [
    {
      instanceId: "inst-a",
      name: "Main",
      enabled: true,
      firstSyncedAt: "2026-09-25T10:00:00.000Z",
      states: [],
    },
  ],
};

vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    getSyncStatus: vi.fn(() => Promise.resolve(SYNC_STATUS)),
  },
}));

vi.mock("../../services/SyncScheduler.js", () => ({
  syncScheduler: {},
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {},
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

describe("admin-only server information", () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const { default: setupRoutes } = await import("../../routes/setup.js");
    const { default: syncRoutes } = await import("../../routes/sync.js");
    ({ baseUrl, close } = await startTestApp((app) => {
      app.use("/api/setup", setupRoutes);
      app.use("/api/sync", syncRoutes);
    }));
  });

  afterAll(async () => {
    await close();
  });

  const get = (path: string, role: string) =>
    fetch(`${baseUrl}${path}`, { headers: { "x-test-role": role } });

  it("GET /api/setup/stash-instance answers 403 to a regular user", async () => {
    const res = await get("/api/setup/stash-instance", "USER");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin access required." });
  });

  it("GET /api/sync/status answers 403 to a regular user", async () => {
    const res = await get("/api/sync/status", "USER");
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin access required." });
  });

  it("both answer 200 to an admin", async () => {
    const instance = await get("/api/setup/stash-instance", "ADMIN");
    expect(instance.status).toBe(200);
    expect(await instance.json()).toEqual({ instance: null, instanceCount: 0 });

    const status = await get("/api/sync/status", "ADMIN");
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual(SYNC_STATUS);
  });
});
