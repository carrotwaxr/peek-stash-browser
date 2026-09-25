/**
 * Unit Tests for Setup Controller
 *
 * Tests the setup wizard endpoints (first-time admin creation, instance creation,
 * connection testing) and multi-instance CRUD operations. Focuses on the
 * safety guards that protect public endpoints and destructive operations.
 */
import type { StashInstance } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONNECTION_TEST_FAILED,
  createFirstAdmin,
  createFirstStashInstance,
  createStashInstance,
  deleteStashInstance,
  getAllStashInstances,
  getSetupStatus,
  testStashConnection,
  updateStashInstance,
} from "../../controllers/setup.js";
import prisma from "../../prisma/singleton.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { logger } from "../../utils/logger.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../helpers/controllerTestUtils.js";
import { objectContaining } from "../helpers/matchers.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock StashClient
vi.mock("../../graphql/StashClient.js", () => ({
  StashClient: vi.fn().mockImplementation(() => ({
    configuration: vi.fn().mockResolvedValue({
      configuration: { general: {} },
    }),
    version: vi.fn().mockResolvedValue({
      version: { version: "0.27.0" },
    }),
  })),
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    reload: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock StashSyncService; the controller maps SyncBusyError to 409
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
  stashSyncService: {
    fullSync: vi.fn().mockResolvedValue(undefined),
    queueFullSync: vi.fn(),
    deleteInstance: vi.fn(),
  },
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
  },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockSync = vi.mocked(stashSyncService, true);

describe("Setup Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.count.mockResolvedValue(0);
    mockPrisma.stashInstance.count.mockResolvedValue(0);
    mockPrisma.stashInstance.findMany.mockResolvedValue([]);
    mockPrisma.stashInstance.aggregate.mockResolvedValue(
      partialRow({ _max: { priority: null } })
    );
  });

  describe("getSetupStatus", () => {
    it("returns setupComplete: true when users and instances exist", async () => {
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.stashInstance.count.mockResolvedValue(1);

      const req = reqFor(getSetupStatus);
      const res = resFor(getSetupStatus);
      await getSetupStatus(req, res);

      const body = res._getOkBody();
      expect(body.setupComplete).toBe(true);
      expect(body.hasUsers).toBe(true);
      expect(body.hasStashInstance).toBe(true);
    });

    it("returns setupComplete: false when no users exist", async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.stashInstance.count.mockResolvedValue(1);

      const res = resFor(getSetupStatus);
      await getSetupStatus(reqFor(getSetupStatus), res);

      expect(res._getOkBody().setupComplete).toBe(false);
      expect(res._getOkBody().hasUsers).toBe(false);
    });

    it("returns setupComplete: false when no instances exist", async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = resFor(getSetupStatus);
      await getSetupStatus(reqFor(getSetupStatus), res);

      expect(res._getOkBody().setupComplete).toBe(false);
      expect(res._getOkBody().hasStashInstance).toBe(false);
    });

    it("counts only enabled instances", async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = resFor(getSetupStatus);
      await getSetupStatus(reqFor(getSetupStatus), res);

      expect(mockPrisma.stashInstance.count).toHaveBeenCalledWith({
        where: { enabled: true },
      });
    });
  });

  describe("createFirstAdmin", () => {
    it("creates admin user when no users exist", async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.create.mockResolvedValue(
        partialRow({
          id: 1,
          username: "admin",
          role: "ADMIN",
          createdAt: new Date(),
        })
      );

      const res = resFor(createFirstAdmin);
      await createFirstAdmin(
        reqFor(createFirstAdmin, {
          body: { username: "admin", password: "securepass1" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            username: "admin",
            role: "ADMIN",
          }),
        })
      );
      expect(res.cookie).toHaveBeenCalledWith(
        "token",
        expect.any(String),
        expect.objectContaining({ httpOnly: true })
      );
    });

    it("returns 403 when users already exist", async () => {
      mockPrisma.user.count.mockResolvedValue(1);

      const res = resFor(createFirstAdmin);
      await createFirstAdmin(
        reqFor(createFirstAdmin, {
          body: { username: "admin", password: "securepass1" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._getErrorBody().error).toContain("Users already exist");
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it("returns 400 when username is missing", async () => {
      mockPrisma.user.count.mockResolvedValue(0);

      const res = resFor(createFirstAdmin);
      await createFirstAdmin(
        reqFor(createFirstAdmin, {
          body: malformed({ password: "securepass1" }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toContain("required");
    });

    it("returns 400 when password is too short", async () => {
      mockPrisma.user.count.mockResolvedValue(0);

      const res = resFor(createFirstAdmin);
      await createFirstAdmin(
        reqFor(createFirstAdmin, {
          body: { username: "admin", password: "short" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toContain("at least 6 characters");
    });
  });

  describe("testStashConnection", () => {
    it("returns success for a valid connection", async () => {
      const res = resFor(testStashConnection);
      await testStashConnection(
        reqFor(testStashConnection, {
          body: { url: "http://stash:9999/graphql", apiKey: "test-key" },
          user: testUser({ role: "ADMIN" }),
        }),
        res
      );

      expect(res._getOkBody().success).toBe(true);
      expect(res._getOkBody().version).toBe("0.27.0");
    });

    it("logs the key length, never any of its characters", async () => {
      const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sig";
      const res = resFor(testStashConnection);
      await testStashConnection(
        reqFor(testStashConnection, {
          body: { url: "http://stash:9999/graphql", apiKey },
          user: testUser({ role: "ADMIN" }),
        }),
        res
      );

      expect(res._getOkBody().success).toBe(true);
      const logged = JSON.stringify(
        (["error", "warn", "info", "debug"] as const).map(
          (level) => vi.mocked(logger[level]).mock.calls
        )
      );
      expect(logged).toContain(`"apiKeyLength":${apiKey.length}`);
      expect(logged).not.toContain("eyJhbGciOiJIUzI1NiIs");
    });

    it("returns 400 when URL is missing", async () => {
      const res = resFor(testStashConnection);
      await testStashConnection(
        reqFor(testStashConnection, {
          body: malformed({ apiKey: "test-key" }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 for invalid URL format", async () => {
      const res = resFor(testStashConnection);
      await testStashConnection(
        reqFor(testStashConnection, {
          body: { url: "not-a-url", apiKey: "test-key" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toContain("Invalid URL");
    });

    it("returns friendly message for connection refused", async () => {
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockImplementationOnce(() =>
        partialRow({
          configuration: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
          version: vi.fn(),
        })
      );

      const res = resFor(testStashConnection);
      await testStashConnection(
        reqFor(testStashConnection, {
          body: { url: "http://stash:9999/graphql", apiKey: "test-key" },
          user: testUser({ role: "ADMIN" }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toContain("Connection refused");
    });

    it("returns friendly message for host not found", async () => {
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockImplementationOnce(() =>
        partialRow({
          configuration: vi
            .fn()
            .mockRejectedValue(new Error("getaddrinfo ENOTFOUND badhost")),
          version: vi.fn(),
        })
      );

      const res = resFor(testStashConnection);
      await testStashConnection(
        reqFor(testStashConnection, {
          body: { url: "http://badhost:9999/graphql", apiKey: "test-key" },
          user: testUser({ role: "ADMIN" }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toContain("Host not found");
    });

    it("an anonymous caller gets the generic failure without details", async () => {
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockImplementationOnce(() =>
        partialRow({
          configuration: vi
            .fn()
            .mockRejectedValue(new Error("getaddrinfo ENOTFOUND badhost")),
          version: vi.fn(),
        })
      );

      const res = resFor(testStashConnection);
      await testStashConnection(
        reqFor(testStashConnection, {
          body: { url: "http://badhost:9999/graphql", apiKey: "test-key" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getBody()).toEqual({
        success: false,
        error: CONNECTION_TEST_FAILED,
      });
    });
  });

  describe("createFirstStashInstance", () => {
    it("creates instance when none exist", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(0);
      mockPrisma.stashInstance.create.mockResolvedValue(
        partialRow({
          id: "inst-1",
          name: "Default",
          url: "http://stash:9999/graphql",
          uiUrl: "https://stash.example.com",
          enabled: true,
          createdAt: new Date(),
        })
      );

      const res = resFor(createFirstStashInstance);
      await createFirstStashInstance(
        reqFor(createFirstStashInstance, {
          body: {
            name: "My Stash",
            url: "http://stash:9999/graphql",
            uiUrl: "https://stash.example.com",
            apiKey: "test-key",
          },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._getOkBody().success).toBe(true);
      expect(mockPrisma.stashInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({
            uiUrl: "https://stash.example.com",
          }),
        })
      );
    });

    it("returns 403 when instances already exist", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(1);

      const res = resFor(createFirstStashInstance);
      await createFirstStashInstance(
        reqFor(createFirstStashInstance, {
          body: {
            url: "http://stash:9999/graphql",
            apiKey: "test-key",
          },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._getErrorBody().error).toContain("already exists");
      expect(mockPrisma.stashInstance.create).not.toHaveBeenCalled();
    });

    it("returns 400 when URL is missing", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = resFor(createFirstStashInstance);
      await createFirstStashInstance(
        reqFor(createFirstStashInstance, {
          body: malformed({ apiKey: "test-key" }),
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("uses 'Default' name when none provided", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(0);
      mockPrisma.stashInstance.create.mockResolvedValue(
        partialRow({
          id: "inst-1",
          name: "Default",
          url: "http://stash:9999/graphql",
          uiUrl: null,
          enabled: true,
          createdAt: new Date(),
        })
      );

      const res = resFor(createFirstStashInstance);
      await createFirstStashInstance(
        reqFor(createFirstStashInstance, {
          body: {
            url: "http://stash:9999/graphql",
            apiKey: "test-key",
          },
        }),
        res
      );

      expect(mockPrisma.stashInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ name: "Default" }),
        })
      );
    });

    it("returns 400 for invalid uiUrl format", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = resFor(createFirstStashInstance);
      await createFirstStashInstance(
        reqFor(createFirstStashInstance, {
          body: {
            url: "http://stash:9999/graphql",
            uiUrl: "not-a-url",
            apiKey: "test-key",
          },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toContain("Invalid UI URL");
      expect(mockPrisma.stashInstance.create).not.toHaveBeenCalled();
    });
  });

  describe("createStashInstance", () => {
    const body = {
      name: "Archive",
      url: "http://archive:9999/graphql",
      apiKey: "archive-key",
    };

    beforeEach(() => {
      mockPrisma.stashInstance.create.mockResolvedValue(
        partialRow({
          id: "inst-new",
          name: "Archive",
          url: "http://archive:9999/graphql",
          enabled: true,
          priority: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
    });

    it("createStashInstance during a sync answers 201 with sync: queued", async () => {
      mockSync.queueFullSync.mockReturnValue("queued");

      const res = resFor(createStashInstance);
      await createStashInstance(reqFor(createStashInstance, { body }), res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._getOkBody()).toMatchObject({ success: true, sync: "queued" });
      expect(mockSync.queueFullSync).toHaveBeenCalledExactlyOnceWith(
        "inst-new"
      );
      expect(mockSync.fullSync).not.toHaveBeenCalled();
    });

    it("answers sync: started when no sync runs", async () => {
      mockSync.queueFullSync.mockReturnValue("started");

      const res = resFor(createStashInstance);
      await createStashInstance(reqFor(createStashInstance, { body }), res);

      expect(res._getOkBody().sync).toBe("started");
    });

    it("a disabled instance syncs nothing: sync: none", async () => {
      const res = resFor(createStashInstance);
      await createStashInstance(
        reqFor(createStashInstance, { body: { ...body, enabled: false } }),
        res
      );

      expect(res._getOkBody().sync).toBe("none");
      expect(mockSync.queueFullSync).not.toHaveBeenCalled();
    });
  });

  describe("getAllStashInstances", () => {
    it("returns instances ordered by priority", async () => {
      const instances: StashInstance[] = [
        partialRow({ id: "a", name: "Primary", priority: 0 }),
        partialRow({ id: "b", name: "Secondary", priority: 1 }),
      ];
      mockPrisma.stashInstance.findMany.mockResolvedValue(instances);

      const res = resFor(getAllStashInstances);
      await getAllStashInstances(reqFor(getAllStashInstances), res);

      expect(res._getOkBody().instances).toEqual(instances);
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { priority: "asc" },
        })
      );
    });
  });

  describe("deleteStashInstance", () => {
    it("deletes an instance that is not the last enabled", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-b",
          name: "Secondary",
        })
      );
      mockPrisma.stashInstance.count.mockResolvedValue(2);
      mockSync.deleteInstance.mockResolvedValue({ purged: Promise.resolve() });

      const res = resFor(deleteStashInstance);
      await deleteStashInstance(
        reqFor(deleteStashInstance, { params: { id: "inst-b" } }),
        res
      );

      expect(res._getOkBody()).toEqual({
        success: true,
        message:
          'Stash instance "Secondary" deleted; its cached library is being removed.',
      });
      expect(mockSync.deleteInstance).toHaveBeenCalledWith("inst-b");
    });

    it("deleteStashInstance answers 409 and deletes nothing while a sync runs", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({ id: "inst-b", name: "Secondary" })
      );
      mockPrisma.stashInstance.count.mockResolvedValue(2);
      mockSync.deleteInstance.mockRejectedValue(new SyncBusyError("sync"));

      const res = resFor(deleteStashInstance);
      await deleteStashInstance(
        reqFor(deleteStashInstance, { params: { id: "inst-b" } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res._getErrorBody().error).toBe(
        "A sync is running. Wait for it to finish or abort it under Server Configuration → Sync status, then delete again."
      );
      expect(mockPrisma.stashInstance.delete).not.toHaveBeenCalled();
      expect(vi.mocked(stashInstanceManager).reload).not.toHaveBeenCalled();
    });

    it("answers 409 while another deleted instance's library is being removed", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({ id: "inst-b", name: "Secondary" })
      );
      mockPrisma.stashInstance.count.mockResolvedValue(2);
      mockSync.deleteInstance.mockRejectedValue(
        new SyncBusyError("instance-delete")
      );

      const res = resFor(deleteStashInstance);
      await deleteStashInstance(
        reqFor(deleteStashInstance, { params: { id: "inst-b" } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res._getErrorBody().error).toBe(
        "Peek is still removing a deleted instance's cached library. Delete again once it has finished."
      );
    });

    it("returns 404 when instance does not exist", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(null);

      const res = resFor(deleteStashInstance);
      await deleteStashInstance(
        reqFor(deleteStashInstance, { params: { id: "nonexistent" } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 400 when trying to delete the last enabled instance", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          name: "Primary",
        })
      );
      mockPrisma.stashInstance.count.mockResolvedValue(1);
      mockPrisma.stashInstance.findFirst.mockResolvedValue(
        partialRow({
          id: "inst-a",
        })
      );

      const res = resFor(deleteStashInstance);
      await deleteStashInstance(
        reqFor(deleteStashInstance, { params: { id: "inst-a" } }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getErrorBody().error).toContain("last enabled");
      expect(mockPrisma.stashInstance.delete).not.toHaveBeenCalled();
    });
  });

  describe("updateStashInstance", () => {
    it("updates instance fields", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          name: "Old Name",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: true,
        })
      );
      mockPrisma.stashInstance.update.mockResolvedValue(
        partialRow({
          id: "inst-a",
          name: "New Name",
          url: "http://stash:9999/graphql",
          enabled: true,
          priority: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

      const res = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { name: "New Name" },
          params: { id: "inst-a" },
        }),
        res
      );

      expect(res._getOkBody().success).toBe(true);
    });

    it("re-pointing an instance during a sync answers sync: queued", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: true,
        })
      );
      mockPrisma.stashInstance.update.mockResolvedValue(
        partialRow({
          id: "inst-a",
          url: "http://moved:9999/graphql",
          enabled: true,
        })
      );
      mockSync.queueFullSync.mockReturnValue("queued");

      const res = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { url: "http://moved:9999/graphql" },
          params: { id: "inst-a" },
        }),
        res
      );

      expect(res._getOkBody()).toMatchObject({ success: true, sync: "queued" });
      expect(mockSync.queueFullSync).toHaveBeenCalledExactlyOnceWith("inst-a");
      expect(mockSync.fullSync).not.toHaveBeenCalled();
    });

    it("a rename syncs nothing: sync: none", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: true,
        })
      );
      mockPrisma.stashInstance.update.mockResolvedValue(
        partialRow({ id: "inst-a", name: "Renamed", enabled: true })
      );

      const res = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { name: "Renamed" },
          params: { id: "inst-a" },
        }),
        res
      );

      expect(res._getOkBody().sync).toBe("none");
      expect(mockSync.queueFullSync).not.toHaveBeenCalled();
    });

    it("returns 404 when instance not found", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(null);

      const res = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { name: "New" },
          params: { id: "nonexistent" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
