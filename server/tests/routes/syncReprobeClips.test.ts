/**
 * Unit Tests for POST /api/sync/reprobe-clips
 *
 * Bug #423: Client sends POST with no body, causing
 * "Cannot destructure property 'instanceId' of 'req.body' as it is undefined"
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { Request, Response, NextFunction } from "express";

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

import { stashSyncService } from "../../services/StashSyncService.js";

const mockSyncService = vi.mocked(stashSyncService);

function createMockRequest(
  options: {
    params?: Record<string, string>;
    body?: Record<string, unknown> | undefined;
    user?: { id: number; username: string; role: string };
  } = {}
): Partial<Request> {
  return {
    params: options.params || {},
    body: options.body, // intentionally allow undefined
    user: options.user,
  } as Partial<Request>;
}

function createMockResponse() {
  const responseJson = vi.fn();
  const responseStatus = vi.fn(() => ({ json: responseJson }));
  return {
    json: responseJson,
    status: responseStatus,
    responseJson,
    responseStatus,
  };
}

async function getReprobeHandler() {
  const { default: router } = await import("../../routes/sync.js");
  const layer = (router as any).stack.find(
    (l: any) =>
      l.route?.path === "/reprobe-clips" && l.route?.methods?.post
  );
  // The route has [requireAdmin, authenticated(handler)] — handler is the last in the stack
  const routeStack = layer?.route?.stack;
  const handler = routeStack?.[routeStack.length - 1]?.handle;
  return handler;
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
    const mockReq = createMockRequest({
      body: undefined, // Simulates POST with no Content-Type / no body
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const { json, status } = createMockResponse();
    const mockRes = { json, status } as unknown as Response;

    await handler(mockReq, mockRes, () => {});

    // Should NOT return 500 — should default to first enabled instance
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        checked: 10,
        updated: 3,
      })
    );
  });

  it("succeeds when request body is empty object (no instanceId)", async () => {
    const handler = await getReprobeHandler();
    const mockReq = createMockRequest({
      body: {},
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const { json, status } = createMockResponse();
    const mockRes = { json, status } as unknown as Response;

    await handler(mockReq, mockRes, () => {});

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        checked: 10,
        updated: 3,
      })
    );
  });

  it("uses provided instanceId when given", async () => {
    const handler = await getReprobeHandler();
    const mockReq = createMockRequest({
      body: { instanceId: "custom-instance" },
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const { json, status } = createMockResponse();
    const mockRes = { json, status } as unknown as Response;

    await handler(mockReq, mockRes, () => {});

    expect(mockSyncService.reProbeUngeneratedClips).toHaveBeenCalledWith(
      "custom-instance"
    );
  });

  it("returns 409 when sync is in progress", async () => {
    mockSyncService.isSyncing.mockReturnValue(true);
    const handler = await getReprobeHandler();
    const mockReq = createMockRequest({
      body: undefined,
      user: { id: 1, username: "admin", role: "ADMIN" },
    });
    const { json, status, responseJson, responseStatus } =
      createMockResponse();
    const mockRes = { json, status } as unknown as Response;

    await handler(mockReq, mockRes, () => {});

    expect(responseStatus).toHaveBeenCalledWith(409);
    expect(responseJson).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Sync in progress" })
    );
  });
});
