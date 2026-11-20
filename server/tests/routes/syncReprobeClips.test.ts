/**
 * Unit Tests for POST /api/sync/reprobe-clips
 *
 * Bug #423: Client sends POST with no body, causing
 * "Cannot destructure property 'instanceId' of 'req.body' as it is undefined"
 */
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as stashInstanceManagerModule from "../../services/StashInstanceManager.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
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
vi.mock("../../services/StashInstanceManager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof stashInstanceManagerModule>();
  return {
    UnknownInstanceError: actual.UnknownInstanceError,
    stashInstanceManager: {
      getAllEnabled: vi.fn(() => [{ id: "instance-1", name: "Test Instance" }]),
      get: vi.fn((id: string) =>
        id === "custom-instance" ? { id } : undefined
      ),
    },
  };
});

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockSyncService = vi.mocked(stashSyncService);
const mockInstances = vi.mocked(stashInstanceManager);

const NO_MISSES = {
  placeholder: 0,
  notFound: 0,
  tooSmall: 0,
  fetchError: 0,
  noPreviewPath: 0,
};

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
      misses: { ...NO_MISSES, placeholder: 7 },
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

    // Should NOT return 500: no body means every enabled instance
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

  it("a named instance that is not loaded reaches the error handler as a 404", async () => {
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: { instanceId: "gone" },
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await expect(handler(req, res, () => {})).rejects.toMatchObject({
      statusCode: 404,
    });

    expect(mockSyncService.reProbeUngeneratedClips).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it("re-probes every enabled instance in turn and sums the results", async () => {
    mockInstances.getAllEnabled.mockReturnValue([
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
      { id: "c", name: "Gamma" },
    ]);
    mockSyncService.reProbeUngeneratedClips
      .mockResolvedValueOnce({
        checked: 10,
        updated: 2,
        misses: { ...NO_MISSES, placeholder: 5, noPreviewPath: 1, notFound: 2 },
      })
      .mockResolvedValueOnce({
        checked: 4,
        updated: 0,
        misses: { ...NO_MISSES, fetchError: 4 },
        firstError: "Stash answered HTTP 401",
      })
      .mockResolvedValueOnce({
        checked: 3,
        updated: 1,
        misses: { ...NO_MISSES, tooSmall: 1, fetchError: 1 },
        firstError: "Timed out after 5000 ms",
      });
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: {},
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    expect(
      mockSyncService.reProbeUngeneratedClips.mock.calls.map(([id]) => id)
    ).toEqual(["a", "b", "c"]);
    expect(res._getOkBody()).toEqual({
      ok: true,
      checked: 17,
      updated: 3,
      misses: {
        placeholder: 5,
        notFound: 2,
        tooSmall: 1,
        fetchError: 5,
        noPreviewPath: 1,
      },
      // The first error seen, named by the instance it came from
      firstError: "Beta: Stash answered HTTP 401",
      message: "Re-probed 17 clips, 3 now have previews",
    });
  });

  it("answers without firstError when no instance had a fetch error", async () => {
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: {},
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    expect(res._getOkBody()).not.toHaveProperty("firstError");
  });

  it("re-probes only the named instance", async () => {
    mockInstances.getAllEnabled.mockReturnValue([
      { id: "custom-instance", name: "Custom" },
      { id: "other", name: "Other" },
    ]);
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: { instanceId: "custom-instance" },
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    expect(mockSyncService.reProbeUngeneratedClips).toHaveBeenCalledTimes(1);
    expect(mockSyncService.reProbeUngeneratedClips).toHaveBeenCalledWith(
      "custom-instance"
    );
    expect(res._getOkBody()).toMatchObject({
      checked: 10,
      updated: 3,
      misses: { ...NO_MISSES, placeholder: 7 },
    });
  });

  it("answers 400 when no instance is enabled", async () => {
    mockInstances.getAllEnabled.mockReturnValue([]);
    const handler = await getReprobeHandler();
    const req = reqFor(handler, {
      body: {},
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const res = resFor(handler);

    await handler(req, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockSyncService.reProbeUngeneratedClips).not.toHaveBeenCalled();
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
