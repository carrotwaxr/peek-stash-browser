/**
 * POST /api/sync/cleanup: the sync status's "Apply deletions". It runs one
 * type's cleanup on one instance with the ratio guard off, after a cleanup
 * refused a mass deletion. Admin only, and 409 while a sync or an instance
 * deletion holds the service's lock.
 */
import type { NextFunction, Request, Response } from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import type * as authModule from "../../middleware/auth.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { logger } from "../../utils/logger.js";
import { startTestApp } from "../helpers/httpTestApp.js";
import { partialRow } from "../helpers/prismaMock.js";

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

// The route maps SyncBusyError to 409
const { SyncBusyError } = vi.hoisted(() => ({
  SyncBusyError: class SyncBusyError extends Error {
    constructor(readonly job: "sync" | "instance-delete") {
      super("Sync already in progress");
      this.name = "SyncBusyError";
    }
  },
}));

vi.mock("../../services/StashSyncService.js", () => ({
  SyncBusyError,
  SYNC_ORDER: [
    "tag",
    "studio",
    "performer",
    "group",
    "gallery",
    "scene",
    "clip",
    "image",
  ],
  stashSyncService: {
    runCleanup: vi.fn(),
  },
}));

vi.mock("../../services/SyncScheduler.js", () => ({
  syncScheduler: {},
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: { get: vi.fn() },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockSyncService = vi.mocked(stashSyncService, true);
const mockManager = vi.mocked(stashInstanceManager, true);

describe("POST /api/sync/cleanup", () => {
  let baseUrl: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const { default: syncRoutes } = await import("../../routes/sync.js");
    ({ baseUrl, close } = await startTestApp((app) => {
      app.use("/api/sync", syncRoutes);
    }));
  });

  afterAll(async () => {
    await close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Only enabled instances have a client
    mockManager.get.mockImplementation((id) =>
      id === "inst-a" ? partialRow<StashClient>({}) : undefined
    );
    mockSyncService.runCleanup.mockResolvedValue({
      deleted: 80,
      deletedIds: [],
    });
  });

  const post = (body: unknown, role = "ADMIN") =>
    fetch(`${baseUrl}/api/sync/cleanup`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-role": role },
      body: JSON.stringify(body),
    });

  it("answers 403 to a regular user and runs nothing", async () => {
    const res = await post(
      { instanceId: "inst-a", entityType: "scene" },
      "USER"
    );

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Admin access required." });
    expect(mockSyncService.runCleanup).not.toHaveBeenCalled();
  });

  it("runs the type's cleanup with the ratio guard off, in the background", async () => {
    let finish: () => void = () => {};
    mockSyncService.runCleanup.mockReturnValue(
      new Promise((resolve) => {
        finish = () => resolve({ deleted: 80, deletedIds: [] });
      })
    );

    // Answered before the cleanup ends
    const res = await post({ instanceId: "inst-a", entityType: "scene" });

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({
      ok: true,
      message: "Applying the deletions of scenes",
    });
    expect(mockSyncService.runCleanup.mock.calls).toEqual([
      ["scene", "inst-a", { ignoreRatioGuard: true }],
    ]);
    finish();
  });

  it.each([
    { job: "sync" as const, error: "A sync is already running" },
    {
      job: "instance-delete" as const,
      error:
        "Peek is removing a deleted instance's cached library. Try again once it has finished.",
    },
  ])("answers 409 while a $job holds the lock", async ({ job, error }) => {
    mockSyncService.runCleanup.mockImplementation(() => {
      throw new SyncBusyError(job);
    });

    const res = await post({ instanceId: "inst-a", entityType: "scene" });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error });
  });

  it.each([
    {
      what: "an unknown type",
      body: { instanceId: "inst-a", entityType: "tags" },
    },
    { what: "no type", body: { instanceId: "inst-a" } },
    { what: "no instance", body: { entityType: "scene" } },
  ])("answers 400 for $what", async ({ body }) => {
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(mockSyncService.runCleanup).not.toHaveBeenCalled();
  });

  it("answers 404 for an instance that is not an enabled one", async () => {
    const res = await post({ instanceId: "gone", entityType: "scene" });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "No enabled Stash instance with that id",
    });
    expect(mockSyncService.runCleanup).not.toHaveBeenCalled();
  });

  it("logs a cleanup that fails in the background", async () => {
    mockSyncService.runCleanup.mockRejectedValue(
      new Error("database is locked")
    );

    const res = await post({ instanceId: "inst-a", entityType: "image" });

    expect(res.status).toBe(202);
    await vi.waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith("Applying deletions failed", {
        instanceId: "inst-a",
        entityType: "image",
        error: "database is locked",
      });
    });
  });
});
