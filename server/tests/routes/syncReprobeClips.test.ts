/**
 * Unit Tests for POST /api/sync/reprobe-clips
 *
 * Bug #423: Client sends POST with no body, causing
 * "Cannot destructure property 'instanceId' of 'req.body' as it is undefined"
 */
import { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stashSyncService } from "../../services/StashSyncService.js";
import { findHandler, reqFor, resFor } from "../helpers/controllerTestUtils.js";

// Mock auth middleware
vi.mock("../../middleware/auth.js", () => ({
  authenticate: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
  requireAdmin: vi.fn((_req: Request, _res: Response, next: NextFunction) =>
    next()
  ),
}));

// Mock StashSyncService
vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    isSyncing: vi.fn(),
    reProbeUngeneratedClips: vi.fn(),
  },
}));

// Mock SyncScheduler
vi.mock("../../services/SyncScheduler.js", () => ({
  syncScheduler: {
    getStatus: vi.fn(),
    triggerSync: vi.fn(),
  },
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getAllEnabled: vi.fn(() => [{ id: "instance-1", name: "Test Instance" }]),
  },
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSyncService = vi.mocked(stashSyncService);

async function getReprobeHandler() {
  const { default: router } = await import("../../routes/sync.js");
  return findHandler(router, "post", "/reprobe-clips");
}

describe("POST /api/sync/reprobe-clips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncService.isSyncing.mockReturnValue(false);
    mockSyncService.reProbeUngeneratedClips.mockResolvedValue({
      checked: 10,
      updated: 3,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("succeeds when request body is undefined (no body sent)", async () => {
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: undefined, // Simulates POST with no Content-Type / no body
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    // Should NOT return 500 — should default to first enabled instance
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        checked: 10,
        updated: 3,
      })
    );
  });

  it("succeeds when request body is empty object (no instanceId)", async () => {
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: {},
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        checked: 10,
        updated: 3,
      })
    );
  });

  it("uses provided instanceId when given", async () => {
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: { instanceId: "custom-instance" },
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    expect(mockSyncService.reProbeUngeneratedClips).toHaveBeenCalledWith(
      "custom-instance"
    );
  });

  it("returns 409 when sync is in progress", async () => {
    mockSyncService.isSyncing.mockReturnValue(true);
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: undefined,
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Sync in progress" })
    );
  });
});
