/**
 * Unit Tests for Setup Controller
 *
 * Tests the setup wizard endpoints (first-time admin creation, instance creation,
 * connection testing, reset) and multi-instance CRUD operations. Focuses on
 * the safety guards that protect public endpoints and destructive operations.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    user: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({}),
    },
    stashInstance: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({}),
      aggregate: vi.fn().mockResolvedValue({ _max: { priority: null } }),
    },
  },
}));

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

// Mock StashSyncService
vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    fullSync: vi.fn().mockResolvedValue(undefined),
    clearInstanceData: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
  },
}));

import prisma from "../../prisma/singleton.js";
import {
  getSetupStatus,
  createFirstAdmin,
  testStashConnection,
  createFirstStashInstance,
  resetSetup,
  getAllStashInstances,
  createStashInstance,
  updateStashInstance,
  deleteStashInstance,
} from "../../controllers/setup.js";

const mockPrisma = vi.mocked(prisma);

/** Create a mock Express request */
function mockReq(body: Record<string, unknown> = {}, params: Record<string, string> = {}) {
  return { body, params } as any;
}

/** Create a mock Express response with chaining */
function mockRes() {
  const res: any = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    _getStatus: () => res.status.mock.calls[0]?.[0] ?? 200,
    _getBody: () => {
      // Get the last json call's argument
      const jsonCalls = res.json.mock.calls;
      return jsonCalls[jsonCalls.length - 1]?.[0];
    },
  };
  return res;
}

describe("Setup Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getSetupStatus", () => {
    it("returns setupComplete: true when users and instances exist", async () => {
      mockPrisma.user.count.mockResolvedValue(2);
      mockPrisma.stashInstance.count.mockResolvedValue(1);

      const req = mockReq();
      const res = mockRes();
      await getSetupStatus(req, res);

      const body = res._getBody();
      expect(body.setupComplete).toBe(true);
      expect(body.hasUsers).toBe(true);
      expect(body.hasStashInstance).toBe(true);
    });

    it("returns setupComplete: false when no users exist", async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.stashInstance.count.mockResolvedValue(1);

      const res = mockRes();
      await getSetupStatus(mockReq(), res);

      expect(res._getBody().setupComplete).toBe(false);
      expect(res._getBody().hasUsers).toBe(false);
    });

    it("returns setupComplete: false when no instances exist", async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = mockRes();
      await getSetupStatus(mockReq(), res);

      expect(res._getBody().setupComplete).toBe(false);
      expect(res._getBody().hasStashInstance).toBe(false);
    });

    it("counts only enabled instances", async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = mockRes();
      await getSetupStatus(mockReq(), res);

      expect(mockPrisma.stashInstance.count).toHaveBeenCalledWith({
        where: { enabled: true },
      });
    });
  });

  describe("createFirstAdmin", () => {
    it("creates admin user when no users exist", async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.create.mockResolvedValue({
        id: 1,
        username: "admin",
        role: "ADMIN",
        createdAt: new Date(),
      } as any);

      const res = mockRes();
      await createFirstAdmin(
        mockReq({ username: "admin", password: "securepass1" }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            username: "admin",
            role: "ADMIN",
          }),
        })
      );
    });

    it("returns 403 when users already exist", async () => {
      mockPrisma.user.count.mockResolvedValue(1);

      const res = mockRes();
      await createFirstAdmin(
        mockReq({ username: "admin", password: "securepass1" }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._getBody().error).toContain("Users already exist");
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it("returns 400 when username is missing", async () => {
      mockPrisma.user.count.mockResolvedValue(0);

      const res = mockRes();
      await createFirstAdmin(mockReq({ password: "securepass1" }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getBody().error).toContain("required");
    });

    it("returns 400 when password is too short", async () => {
      mockPrisma.user.count.mockResolvedValue(0);

      const res = mockRes();
      await createFirstAdmin(
        mockReq({ username: "admin", password: "short" }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getBody().error).toContain("at least 6 characters");
    });
  });

  describe("testStashConnection", () => {
    it("returns success for a valid connection", async () => {
      const res = mockRes();
      await testStashConnection(
        mockReq({ url: "http://stash:9999/graphql", apiKey: "test-key" }),
        res
      );

      expect(res._getBody().success).toBe(true);
      expect(res._getBody().version).toBe("0.27.0");
    });

    it("returns 400 when URL is missing", async () => {
      const res = mockRes();
      await testStashConnection(mockReq({ apiKey: "test-key" }), res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 for invalid URL format", async () => {
      const res = mockRes();
      await testStashConnection(
        mockReq({ url: "not-a-url", apiKey: "test-key" }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getBody().error).toContain("Invalid URL");
    });

    it("returns friendly message for connection refused", async () => {
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockImplementationOnce(() => ({
        configuration: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
        version: vi.fn(),
      } as any));

      const res = mockRes();
      await testStashConnection(
        mockReq({ url: "http://stash:9999/graphql", apiKey: "test-key" }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getBody().error).toContain("Connection refused");
    });

    it("returns friendly message for host not found", async () => {
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockImplementationOnce(() => ({
        configuration: vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND badhost")),
        version: vi.fn(),
      } as any));

      const res = mockRes();
      await testStashConnection(
        mockReq({ url: "http://badhost:9999/graphql", apiKey: "test-key" }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getBody().error).toContain("Host not found");
    });
  });

  describe("createFirstStashInstance", () => {
    it("creates instance when none exist", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(0);
      mockPrisma.stashInstance.create.mockResolvedValue({
        id: "inst-1",
        name: "Default",
        url: "http://stash:9999/graphql",
        enabled: true,
        createdAt: new Date(),
      } as any);

      const res = mockRes();
      await createFirstStashInstance(
        mockReq({
          name: "My Stash",
          url: "http://stash:9999/graphql",
          apiKey: "test-key",
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res._getBody().success).toBe(true);
    });

    it("returns 403 when instances already exist", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(1);

      const res = mockRes();
      await createFirstStashInstance(
        mockReq({
          url: "http://stash:9999/graphql",
          apiKey: "test-key",
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._getBody().error).toContain("already exists");
      expect(mockPrisma.stashInstance.create).not.toHaveBeenCalled();
    });

    it("returns 400 when URL is missing", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = mockRes();
      await createFirstStashInstance(
        mockReq({ apiKey: "test-key" }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("uses 'Default' name when none provided", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(0);
      mockPrisma.stashInstance.create.mockResolvedValue({
        id: "inst-1",
        name: "Default",
        url: "http://stash:9999/graphql",
        enabled: true,
        createdAt: new Date(),
      } as any);

      const res = mockRes();
      await createFirstStashInstance(
        mockReq({
          url: "http://stash:9999/graphql",
          apiKey: "test-key",
        }),
        res
      );

      expect(mockPrisma.stashInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "Default" }),
        })
      );
    });
  });

  describe("resetSetup", () => {
    it("resets when confirmation is correct, userCount ≤ 1, and setup is incomplete", async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = mockRes();
      await resetSetup(mockReq({ confirm: "RESET_SETUP" }), res);

      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.user.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.stashInstance.deleteMany).toHaveBeenCalled();
    });

    it("returns 400 without correct confirmation", async () => {
      const res = mockRes();
      await resetSetup(mockReq({ confirm: "wrong" }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockPrisma.user.deleteMany).not.toHaveBeenCalled();
    });

    it("returns 403 when multiple users exist", async () => {
      mockPrisma.user.count.mockResolvedValue(3);
      mockPrisma.stashInstance.count.mockResolvedValue(0);

      const res = mockRes();
      await resetSetup(mockReq({ confirm: "RESET_SETUP" }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._getBody().error).toContain("multiple users");
    });

    it("returns 403 when setup is already complete", async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      mockPrisma.stashInstance.count.mockResolvedValue(1);

      const res = mockRes();
      await resetSetup(mockReq({ confirm: "RESET_SETUP" }), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res._getBody().error).toContain("fully configured");
    });
  });

  describe("getAllStashInstances", () => {
    it("returns instances ordered by priority", async () => {
      const instances = [
        { id: "a", name: "Primary", priority: 0 },
        { id: "b", name: "Secondary", priority: 1 },
      ];
      mockPrisma.stashInstance.findMany.mockResolvedValue(instances as any);

      const res = mockRes();
      await getAllStashInstances(mockReq(), res);

      expect(res._getBody().instances).toEqual(instances);
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { priority: "asc" },
        })
      );
    });
  });

  describe("deleteStashInstance", () => {
    it("deletes an instance that is not the last enabled", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue({
        id: "inst-b",
        name: "Secondary",
      } as any);
      mockPrisma.stashInstance.count.mockResolvedValue(2);

      const res = mockRes();
      await deleteStashInstance(mockReq({}, { id: "inst-b" }), res);

      expect(res._getBody().success).toBe(true);
      expect(mockPrisma.stashInstance.delete).toHaveBeenCalledWith({
        where: { id: "inst-b" },
      });
    });

    it("returns 404 when instance does not exist", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(null);

      const res = mockRes();
      await deleteStashInstance(mockReq({}, { id: "nonexistent" }), res);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it("returns 400 when trying to delete the last enabled instance", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue({
        id: "inst-a",
        name: "Primary",
      } as any);
      mockPrisma.stashInstance.count.mockResolvedValue(1);
      mockPrisma.stashInstance.findFirst.mockResolvedValue({
        id: "inst-a",
      } as any);

      const res = mockRes();
      await deleteStashInstance(mockReq({}, { id: "inst-a" }), res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res._getBody().error).toContain("last enabled");
      expect(mockPrisma.stashInstance.delete).not.toHaveBeenCalled();
    });
  });

  describe("updateStashInstance", () => {
    it("updates instance fields", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue({
        id: "inst-a",
        name: "Old Name",
        url: "http://stash:9999/graphql",
        apiKey: "old-key",
        enabled: true,
      } as any);
      mockPrisma.stashInstance.update.mockResolvedValue({
        id: "inst-a",
        name: "New Name",
        url: "http://stash:9999/graphql",
        enabled: true,
        priority: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      const res = mockRes();
      await updateStashInstance(
        mockReq({ name: "New Name" }, { id: "inst-a" }),
        res
      );

      expect(res._getBody().success).toBe(true);
    });

    it("returns 404 when instance not found", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(null);

      const res = mockRes();
      await updateStashInstance(
        mockReq({ name: "New" }, { id: "nonexistent" }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });
});
