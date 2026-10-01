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
  getStashInstance,
  testStashConnection,
  updateStashInstance,
} from "../../controllers/setup.js";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { syncScheduler } from "../../services/SyncScheduler.js";
import { getUsersSelecting } from "../../services/UserInstanceService.js";
import { logger } from "../../utils/logger.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../helpers/controllerTestUtils.js";
import { objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

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
  describeStashError: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    reload: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock StashSyncService; the controller maps SyncBusyError to 409 and
// LastEnabledInstanceError to 400
const { SyncBusyError, LastEnabledInstanceError } = vi.hoisted(() => ({
  SyncBusyError: class SyncBusyError extends Error {
    constructor(readonly job: "sync" | "instance-delete") {
      super("Sync already in progress");
      this.name = "SyncBusyError";
    }
  },
  LastEnabledInstanceError: class LastEnabledInstanceError extends Error {
    constructor() {
      super("The last enabled Stash instance");
      this.name = "LastEnabledInstanceError";
    }
  },
}));
vi.mock("../../services/StashSyncService.js", () => ({
  SyncBusyError,
  LastEnabledInstanceError,
  stashSyncService: {
    fullSync: vi.fn().mockResolvedValue(undefined),
    queueFullSync: vi.fn(),
    deleteInstance: vi.fn(),
  },
}));

// The wizard's first instance starts the scheduler, which runs its first
// sync and then keeps syncing on the interval
vi.mock("../../services/SyncScheduler.js", () => ({
  syncScheduler: {
    isRunning: vi.fn(() => false),
    start: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed-password"),
  },
}));

// Enabling or disabling an instance recomputes the users who select it
vi.mock("../../services/ExclusionComputationService.js", () => ({
  exclusionComputationService: {
    recomputeUsers: vi
      .fn()
      .mockResolvedValue({ success: 0, failed: 0, errors: [] }),
  },
}));
vi.mock("../../services/UserInstanceService.js", () => ({
  getUsersSelecting: vi.fn().mockResolvedValue([]),
}));

const mockPrisma = vi.mocked(prisma, true);
const mockSync = vi.mocked(stashSyncService, true);
const mockScheduler = vi.mocked(syncScheduler, true);
const mockManager = vi.mocked(stashInstanceManager, true);
const mockExclusions = vi.mocked(exclusionComputationService, true);
const mockUsersSelecting = vi.mocked(getUsersSelecting);

/** What a refused disable or delete of the last enabled instance says */
const LAST_ENABLED_MESSAGE =
  "Peek needs an enabled Stash instance. Add another instance first, or change this one's address under Edit.";

/** `enabled` instances are enabled; `all` exist, disabled ones included */
function instanceCounts({ enabled, all }: { enabled: number; all: number }) {
  mockPrisma.stashInstance.count.mockImplementation(
    prismaImpl((args) => (args?.where?.enabled === true ? enabled : all))
  );
}

/** The dates every stored instance row has; the responses send them as ISO strings */
const instanceDates = {
  createdAt: new Date("2026-01-02T03:04:05.000Z"),
  updatedAt: new Date("2026-01-02T03:04:05.000Z"),
  firstSyncedAt: null,
};

describe("Setup Controller", () => {
  describe("dates in responses", () => {
    const created = new Date("2026-01-02T03:04:05.000Z");
    const updated = new Date("2026-02-03T04:05:06.000Z");
    const synced = new Date("2026-03-04T05:06:07.000Z");

    const instanceRow = (overrides: Record<string, unknown> = {}) =>
      partialRow<StashInstance>({
        id: "inst-a",
        name: "Primary",
        description: null,
        url: "http://stash:9999/graphql",
        uiUrl: null,
        enabled: true,
        priority: 0,
        createdAt: created,
        updatedAt: updated,
        firstSyncedAt: synced,
        ...overrides,
      });

    it("createFirstAdmin answers createdAt as an ISO string", async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.create.mockResolvedValue(
        partialRow({
          id: 1,
          username: "admin",
          role: "ADMIN",
          createdAt: created,
        })
      );
      const res = resFor(createFirstAdmin);
      await createFirstAdmin(
        reqFor(createFirstAdmin, {
          body: { username: "admin", password: "securepass1" },
        }),
        res
      );
      expect(res._getOkBody().user.createdAt).toBe(created.toISOString());
    });

    it("createFirstStashInstance answers createdAt as an ISO string", async () => {
      mockPrisma.stashInstance.count.mockResolvedValue(0);
      mockPrisma.stashInstance.create.mockResolvedValue(
        instanceRow({ createdAt: created })
      );
      const res = resFor(createFirstStashInstance);
      await createFirstStashInstance(
        reqFor(createFirstStashInstance, {
          body: { url: "http://stash:9999/graphql", apiKey: "k" },
        }),
        res
      );
      expect(res._getOkBody().instance.createdAt).toBe(created.toISOString());
    });

    it("getStashInstance answers createdAt and updatedAt as ISO strings", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([instanceRow()]);
      const res = resFor(getStashInstance);
      await getStashInstance(reqFor(getStashInstance), res);
      const instance = must(res._getOkBody().instance);
      expect(instance.createdAt).toBe(created.toISOString());
      expect(instance.updatedAt).toBe(updated.toISOString());
    });

    it("getAllStashInstances answers every date as an ISO string, firstSyncedAt null while unsynced", async () => {
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        instanceRow(),
        instanceRow({ id: "inst-b", firstSyncedAt: null }),
      ]);
      const res = resFor(getAllStashInstances);
      await getAllStashInstances(reqFor(getAllStashInstances), res);
      const [a, b] = res._getOkBody().instances;
      expect(must(a).createdAt).toBe(created.toISOString());
      expect(must(a).updatedAt).toBe(updated.toISOString());
      expect(must(a).firstSyncedAt).toBe(synced.toISOString());
      expect(must(b).firstSyncedAt).toBeNull();
    });

    it("createStashInstance and updateStashInstance answer every date as an ISO string", async () => {
      mockSync.queueFullSync.mockReturnValue("started");
      mockPrisma.stashInstance.create.mockResolvedValue(instanceRow());
      const created201 = resFor(createStashInstance);
      await createStashInstance(
        reqFor(createStashInstance, {
          body: {
            name: "Primary",
            url: "http://stash:9999/graphql",
            apiKey: "k",
          },
        }),
        created201
      );
      expect(created201._getOkBody().instance.firstSyncedAt).toBe(
        synced.toISOString()
      );
      expect(created201._getOkBody().instance.createdAt).toBe(
        created.toISOString()
      );

      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          name: "Primary",
          url: "http://stash:9999/graphql",
          apiKey: "k",
          enabled: true,
        })
      );
      mockPrisma.stashInstance.update.mockResolvedValue(instanceRow());
      const updated200 = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { name: "Primary" },
          params: { id: "inst-a" },
        }),
        updated200
      );
      const sent = updated200._getOkBody().instance;
      expect(sent.createdAt).toBe(created.toISOString());
      expect(sent.updatedAt).toBe(updated.toISOString());
      expect(sent.firstSyncedAt).toBe(synced.toISOString());
    });
  });

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

    it("a database failure reaches the error handler", async () => {
      mockPrisma.user.count.mockRejectedValue(new Error("DB down"));

      const res = resFor(getSetupStatus);
      await expect(getSetupStatus(reqFor(getSetupStatus), res)).rejects.toThrow(
        "DB down"
      );

      expect(res.json).not.toHaveBeenCalled();
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

    it("setup status counts a disabled instance as configured", async () => {
      mockPrisma.user.count.mockResolvedValue(1);
      instanceCounts({ enabled: 0, all: 1 });

      const res = resFor(getSetupStatus);
      await getSetupStatus(reqFor(getSetupStatus), res);

      const body = res._getOkBody();
      expect(body.setupComplete).toBe(true);
      expect(body.hasStashInstance).toBe(true);
      // The multi-instance links read the enabled count
      expect(body.stashInstanceCount).toBe(0);
    });

    it("setup status carries no userCount", async () => {
      mockPrisma.user.count.mockResolvedValue(3);
      instanceCounts({ enabled: 1, all: 1 });

      const res = resFor(getSetupStatus);
      await getSetupStatus(reqFor(getSetupStatus), res);

      expect(res._getOkBody()).toEqual({
        setupComplete: true,
        hasUsers: true,
        hasStashInstance: true,
        stashInstanceCount: 1,
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

    it("returns 400 when the username is not text or over 255 characters", async () => {
      mockPrisma.user.count.mockResolvedValue(0);

      for (const username of ["a".repeat(256), 12345]) {
        const res = resFor(createFirstAdmin);
        await createFirstAdmin(
          reqFor(createFirstAdmin, {
            body: malformed({ username, password: "securepass1" }),
          }),
          res
        );
        expect(res.status).toHaveBeenCalledWith(400);
      }
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
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

    it("createFirstStashInstance starts the scheduler", async () => {
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
      // The startup sync runs in the background: the answer does not wait
      mockScheduler.start.mockReturnValueOnce(new Promise(() => undefined));

      const res = resFor(createFirstStashInstance);
      await createFirstStashInstance(
        reqFor(createFirstStashInstance, {
          body: { url: "http://stash:9999/graphql", apiKey: "test-key" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockScheduler.start).toHaveBeenCalledOnce();
      // After the manager has loaded the new instance
      expect(
        must(mockManager.reload.mock.invocationCallOrder[0], "reload")
      ).toBeLessThan(
        must(mockScheduler.start.mock.invocationCallOrder[0], "start")
      );
      // The scheduler's startup sync is the first sync, not one of its own
      expect(mockSync.fullSync).not.toHaveBeenCalled();
      expect(mockSync.queueFullSync).not.toHaveBeenCalled();
    });

    it("a scheduler still running for a deleted instance syncs the first new one through the queue", async () => {
      // The only instance was disabled, then deleted: the wizard runs again
      mockScheduler.isRunning.mockReturnValueOnce(true);
      mockPrisma.stashInstance.count.mockResolvedValue(0);
      mockPrisma.stashInstance.create.mockResolvedValue(
        partialRow({
          id: "inst-2",
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
          body: { url: "http://stash:9999/graphql", apiKey: "test-key" },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockSync.queueFullSync).toHaveBeenCalledWith("inst-2");
      expect(mockScheduler.start).not.toHaveBeenCalled();
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

    it("an empty description and uiUrl are stored as null", async () => {
      mockSync.queueFullSync.mockReturnValue("started");

      await createStashInstance(
        reqFor(createStashInstance, {
          body: { ...body, description: "", uiUrl: "" },
        }),
        resFor(createStashInstance)
      );

      expect(mockPrisma.stashInstance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: objectContaining({ description: null, uiUrl: null }),
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

    it("an instance Stash cannot be reached at reaches the error handler as a 400 with the reason", async () => {
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockImplementationOnce(() =>
        partialRow({
          configuration: vi
            .fn()
            .mockRejectedValue(
              new Error("Could not reach Stash (ECONNREFUSED)")
            ),
          version: vi.fn(),
        })
      );

      const res = resFor(createStashInstance);
      await expect(
        createStashInstance(reqFor(createStashInstance, { body }), res)
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Could not connect to Stash server",
        details: "Could not reach Stash (ECONNREFUSED)",
      });

      expect(res.json).not.toHaveBeenCalled();
      expect(mockPrisma.stashInstance.create).not.toHaveBeenCalled();
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
        partialRow({ ...instanceDates, id: "a", name: "Primary", priority: 0 }),
        partialRow({
          ...instanceDates,
          id: "b",
          name: "Secondary",
          priority: 1,
        }),
      ];
      mockPrisma.stashInstance.findMany.mockResolvedValue(instances);

      const res = resFor(getAllStashInstances);
      await getAllStashInstances(reqFor(getAllStashInstances), res);

      expect(res._getOkBody().instances.map((i) => i.id)).toEqual(["a", "b"]);
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
      await expect(
        deleteStashInstance(
          reqFor(deleteStashInstance, { params: { id: "inst-b" } }),
          res
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        message:
          "A sync is running. Wait for it to finish or abort it under Server Configuration → Sync status, then delete again.",
      });
      expect(res.json).not.toHaveBeenCalled();
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
      await expect(
        deleteStashInstance(
          reqFor(deleteStashInstance, { params: { id: "inst-b" } }),
          res
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        message:
          "Peek is still removing a deleted instance's cached library. Delete again once it has finished.",
      });
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

    it("deleting the last enabled instance answers 400 with the message: the service refuses it inside its unit", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({ id: "inst-a", name: "Primary" })
      );
      mockSync.deleteInstance.mockRejectedValue(new LastEnabledInstanceError());

      const res = resFor(deleteStashInstance);
      await expect(
        deleteStashInstance(
          reqFor(deleteStashInstance, { params: { id: "inst-a" } }),
          res
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        message: LAST_ENABLED_MESSAGE,
      });
      expect(res.json).not.toHaveBeenCalled();
      expect(mockSync.deleteInstance).toHaveBeenCalledExactlyOnceWith("inst-a");
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

    it("new credentials Stash refuses reach the error handler as a 400 with the reason", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          name: "Old Name",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: true,
        })
      );
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockImplementationOnce(() =>
        partialRow({
          configuration: vi
            .fn()
            .mockRejectedValue(new Error("Stash answered HTTP 401")),
          version: vi.fn(),
        })
      );

      const res = resFor(updateStashInstance);
      await expect(
        updateStashInstance(
          reqFor(updateStashInstance, {
            body: { apiKey: "wrong" },
            params: { id: "inst-a" },
          }),
          res
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        message: "Could not connect to Stash server with new credentials",
        details: "Stash answered HTTP 401",
      });

      expect(res.json).not.toHaveBeenCalled();
      expect(mockPrisma.stashInstance.update).not.toHaveBeenCalled();
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
          ...instanceDates,
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
        partialRow({
          ...instanceDates,
          id: "inst-a",
          name: "Renamed",
          enabled: true,
        })
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
      expect(mockExclusions.recomputeUsers).not.toHaveBeenCalled();
    });

    it("re-enabling an instance recomputes the users who can see it", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: false,
        })
      );
      mockPrisma.stashInstance.update.mockResolvedValue(
        partialRow({ ...instanceDates, id: "inst-a", enabled: true })
      );
      mockUsersSelecting.mockResolvedValue([1, 4]);

      const res = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { enabled: true },
          params: { id: "inst-a" },
        }),
        res
      );

      expect(res._getOkBody().success).toBe(true);
      expect(mockUsersSelecting).toHaveBeenCalledExactlyOnceWith("inst-a");
      expect(mockExclusions.recomputeUsers).toHaveBeenCalledOnce();
      expect(must(mockExclusions.recomputeUsers.mock.calls[0])[0]).toEqual([
        1, 4,
      ]);
      // After the instance manager knows the change, before the answer
      const [reloaded] =
        vi.mocked(stashInstanceManager).reload.mock.invocationCallOrder;
      const [recomputed] =
        mockExclusions.recomputeUsers.mock.invocationCallOrder;
      expect(must(reloaded)).toBeLessThan(must(recomputed));
    });

    it("disabling the only enabled instance answers 400 with the message, and nothing changes: no update, no recompute, no reload", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: true,
        })
      );
      // No other instance is enabled
      mockPrisma.stashInstance.count.mockResolvedValue(0);
      mockUsersSelecting.mockResolvedValue([2]);

      const res = resFor(updateStashInstance);
      await expect(
        updateStashInstance(
          reqFor(updateStashInstance, {
            body: { enabled: false },
            params: { id: "inst-a" },
          }),
          res
        )
      ).rejects.toMatchObject({
        statusCode: 400,
        message: LAST_ENABLED_MESSAGE,
      });

      expect(res.json).not.toHaveBeenCalled();
      expect(mockPrisma.stashInstance.update).not.toHaveBeenCalled();
      expect(mockExclusions.recomputeUsers).not.toHaveBeenCalled();
      expect(mockManager.reload).not.toHaveBeenCalled();
      expect(mockSync.queueFullSync).not.toHaveBeenCalled();
    });

    it("disabling one of two enabled instances updates it and recomputes its users", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: true,
        })
      );
      mockPrisma.stashInstance.count.mockResolvedValue(1);
      mockPrisma.stashInstance.update.mockResolvedValue(
        partialRow({ ...instanceDates, id: "inst-a", enabled: false })
      );
      mockUsersSelecting.mockResolvedValue([2, 3]);

      const res = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { enabled: false },
          params: { id: "inst-a" },
        }),
        res
      );

      expect(res._getOkBody().success).toBe(true);
      expect(must(mockPrisma.stashInstance.update.mock.calls[0])[0]).toEqual(
        objectContaining({
          where: { id: "inst-a" },
          data: { enabled: false },
        })
      );
      expect(must(mockExclusions.recomputeUsers.mock.calls[0])[0]).toEqual([
        2, 3,
      ]);
    });

    it("disabling an instance recomputes them too; the same state again does not", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: true,
        })
      );
      mockPrisma.stashInstance.update.mockResolvedValue(
        partialRow({ ...instanceDates, id: "inst-a", enabled: false })
      );
      // Another instance stays enabled
      mockPrisma.stashInstance.count.mockResolvedValue(1);
      mockUsersSelecting.mockResolvedValue([2]);

      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { enabled: false },
          params: { id: "inst-a" },
        }),
        resFor(updateStashInstance)
      );
      expect(mockExclusions.recomputeUsers).toHaveBeenCalledOnce();

      mockExclusions.recomputeUsers.mockClear();
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { enabled: true },
          params: { id: "inst-a" },
        }),
        resFor(updateStashInstance)
      );
      expect(mockExclusions.recomputeUsers).not.toHaveBeenCalled();
    });

    it("a new URL makes the instance new again: firstSyncedAt is cleared; a new API key or name alone keeps it", async () => {
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
          ...instanceDates,
          id: "inst-a",
          enabled: true,
          firstSyncedAt: null,
        })
      );
      mockSync.queueFullSync.mockReturnValue("started");
      const updateData = () => {
        const { calls } = mockPrisma.stashInstance.update.mock;
        return must(calls[calls.length - 1], "the last update")[0].data;
      };

      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { url: "http://moved:9999/graphql" },
          params: { id: "inst-a" },
        }),
        resFor(updateStashInstance)
      );
      expect(updateData()).toEqual({
        url: "http://moved:9999/graphql",
        firstSyncedAt: null,
      });
      expect(mockSync.queueFullSync).toHaveBeenCalledExactlyOnceWith("inst-a");

      // The same URL, a new key, a new name: still the same Stash
      for (const body of [
        { url: "http://stash:9999/graphql", apiKey: "new-key" },
        { name: "Renamed" },
      ]) {
        await updateStashInstance(
          reqFor(updateStashInstance, { body, params: { id: "inst-a" } }),
          resFor(updateStashInstance)
        );
        expect(updateData()).not.toHaveProperty("firstSyncedAt");
      }
    });

    it("enabling an instance whose first sync never finished queues that sync", async () => {
      mockPrisma.stashInstance.findUnique.mockResolvedValue(
        partialRow({
          id: "inst-a",
          url: "http://stash:9999/graphql",
          apiKey: "old-key",
          enabled: false,
        })
      );
      mockPrisma.stashInstance.update.mockResolvedValue(
        partialRow({
          ...instanceDates,
          id: "inst-a",
          enabled: true,
          firstSyncedAt: null,
        })
      );
      mockSync.queueFullSync.mockReturnValue("queued");

      const res = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { enabled: true },
          params: { id: "inst-a" },
        }),
        res
      );

      expect(res._getOkBody().sync).toBe("queued");
      expect(mockSync.queueFullSync).toHaveBeenCalledExactlyOnceWith("inst-a");

      // One that has synced before syncs on the schedule, as today
      mockSync.queueFullSync.mockClear();
      mockPrisma.stashInstance.update.mockResolvedValue(
        partialRow({
          ...instanceDates,
          id: "inst-a",
          enabled: true,
          firstSyncedAt: new Date("2026-09-20T08:00:00Z"),
        })
      );
      const again = resFor(updateStashInstance);
      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { enabled: true },
          params: { id: "inst-a" },
        }),
        again
      );
      expect(again._getOkBody().sync).toBe("none");
      expect(mockSync.queueFullSync).not.toHaveBeenCalled();
    });

    it("an update with url set and apiKey '' tests the connection with the stored key", async () => {
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
          url: "http://other:9999/graphql",
          enabled: true,
          priority: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockClear();

      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { url: "http://other:9999/graphql", apiKey: "" },
          params: { id: "inst-a" },
        }),
        resFor(updateStashInstance)
      );

      expect(StashClient).toHaveBeenCalledWith({
        url: "http://other:9999/graphql",
        apiKey: "old-key",
      });
    });

    it("an update with apiKey set and url '' tests the connection at the stored url", async () => {
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
          enabled: true,
          priority: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockClear();

      await updateStashInstance(
        reqFor(updateStashInstance, {
          body: { url: "", apiKey: "new-key" },
          params: { id: "inst-a" },
        }),
        resFor(updateStashInstance)
      );

      expect(StashClient).toHaveBeenCalledWith({
        url: "http://stash:9999/graphql",
        apiKey: "new-key",
      });
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
