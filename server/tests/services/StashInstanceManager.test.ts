/**
 * Unit Tests for StashInstanceManager
 *
 * Tests the singleton service that manages Stash server instance connections.
 * Covers initialization, instance lookup, reload, and edge cases around
 * multi-instance configuration.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Mock PrismaClient constructor
const mockFindMany = vi.fn();
vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    stashInstance: {
      findMany: mockFindMany,
    },
  })),
}));

// Mock StashClient constructor
vi.mock("../../graphql/StashClient.js", () => ({
  StashClient: vi.fn().mockImplementation((config: { url: string; apiKey: string }) => ({
    url: config.url,
    apiKey: config.apiKey,
    _isStashClient: true,
  })),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

// Sample instance configs matching Prisma StashInstance shape
const INSTANCE_A = {
  id: "aaa-111-aaa",
  name: "Primary Stash",
  description: null,
  url: "http://stash-a:9999/graphql",
  apiKey: "key-a",
  enabled: true,
  priority: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const INSTANCE_B = {
  id: "bbb-222-bbb",
  name: "Secondary Stash",
  description: "Backup instance",
  url: "http://stash-b:9999/graphql",
  apiKey: "key-b",
  enabled: true,
  priority: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("StashInstanceManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function importFresh() {
    const mod = await import("../../services/StashInstanceManager.js");
    return mod.stashInstanceManager;
  }

  describe("initialize", () => {
    it("initializes with no instances configured", async () => {
      mockFindMany.mockResolvedValue([]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.hasInstances()).toBe(false);
      expect(manager.getInstanceCount()).toBe(0);
    });

    it("initializes with a single instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.hasInstances()).toBe(true);
      expect(manager.getInstanceCount()).toBe(1);
    });

    it("initializes with multiple instances in priority order", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.getInstanceCount()).toBe(2);

      // Default should be the highest priority (lowest number)
      const defaultConfig = manager.getDefaultConfig();
      expect(defaultConfig.id).toBe(INSTANCE_A.id);
    });

    it("is idempotent - second initialize is a no-op", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);
      const { logger } = await import("../../utils/logger.js");

      const manager = await importFresh();
      await manager.initialize();
      await manager.initialize();

      expect(logger.warn).toHaveBeenCalledWith(
        "StashInstanceManager already initialized"
      );
      // findMany called only once (first init)
      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });

    it("queries only enabled instances ordered by priority", async () => {
      mockFindMany.mockResolvedValue([]);

      const manager = await importFresh();
      await manager.initialize();

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { enabled: true },
        orderBy: { priority: "asc" },
      });
    });
  });

  describe("getDefault", () => {
    it("returns the highest priority instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      const client = manager.getDefault();
      expect(client).toBeDefined();
      expect((client as any).url).toBe(INSTANCE_A.url);
    });

    it("throws when no instances are configured", async () => {
      mockFindMany.mockResolvedValue([]);

      const manager = await importFresh();
      await manager.initialize();

      expect(() => manager.getDefault()).toThrow(
        "No Stash instance configured"
      );
    });
  });

  describe("getDefaultConfig", () => {
    it("returns the config object for the default instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      const config = manager.getDefaultConfig();
      expect(config.id).toBe(INSTANCE_A.id);
      expect(config.name).toBe("Primary Stash");
      expect(config.url).toBe("http://stash-a:9999/graphql");
    });

    it("throws when no instances are configured", async () => {
      mockFindMany.mockResolvedValue([]);

      const manager = await importFresh();
      await manager.initialize();

      expect(() => manager.getDefaultConfig()).toThrow(
        "No Stash instance configured"
      );
    });
  });

  describe("get", () => {
    it("returns client for a known instance ID", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      const client = manager.get(INSTANCE_B.id);
      expect(client).toBeDefined();
      expect((client as any).url).toBe(INSTANCE_B.url);
    });

    it("returns undefined for an unknown instance ID", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.get("nonexistent-id")).toBeUndefined();
    });
  });

  describe("getForSync", () => {
    it("returns client for a known instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);

      const manager = await importFresh();
      await manager.initialize();

      const client = manager.getForSync(INSTANCE_A.id);
      expect(client).not.toBeNull();
    });

    it("returns null and warns for an unknown instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);
      const { logger } = await import("../../utils/logger.js");

      const manager = await importFresh();
      await manager.initialize();

      const client = manager.getForSync("nonexistent-id");
      expect(client).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        "Stash instance not found for sync, skipping",
        { instanceId: "nonexistent-id" }
      );
    });
  });

  describe("getRequired", () => {
    it("returns client for a known instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);

      const manager = await importFresh();
      await manager.initialize();

      expect(() => manager.getRequired(INSTANCE_A.id)).not.toThrow();
    });

    it("throws for an unknown instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);

      const manager = await importFresh();
      await manager.initialize();

      expect(() => manager.getRequired("nonexistent-id")).toThrow(
        "Stash instance not found: nonexistent-id"
      );
    });
  });

  describe("getAll", () => {
    it("returns array of [instanceId, client] tuples", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      const all = manager.getAll();
      expect(all).toHaveLength(2);
      expect(all[0][0]).toBe(INSTANCE_A.id);
      expect(all[1][0]).toBe(INSTANCE_B.id);
    });

    it("returns empty array when no instances", async () => {
      mockFindMany.mockResolvedValue([]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.getAll()).toHaveLength(0);
    });
  });

  describe("getAllInstanceIds", () => {
    it("returns array of instance ID strings", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      const ids = manager.getAllInstanceIds();
      expect(ids).toEqual([INSTANCE_A.id, INSTANCE_B.id]);
    });
  });

  describe("getAllEnabled", () => {
    it("returns id and name for each enabled instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      const enabled = manager.getAllEnabled();
      expect(enabled).toEqual([
        { id: INSTANCE_A.id, name: "Primary Stash" },
        { id: INSTANCE_B.id, name: "Secondary Stash" },
      ]);
    });
  });

  describe("getAllConfigs", () => {
    it("returns full config objects for all instances", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      const configs = manager.getAllConfigs();
      expect(configs).toHaveLength(2);
      expect(configs[0].apiKey).toBe("key-a");
      expect(configs[1].apiKey).toBe("key-b");
    });
  });

  describe("getBaseUrl", () => {
    it("strips /graphql suffix from instance URL", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.getBaseUrl(INSTANCE_A.id)).toBe("http://stash-a:9999");
    });

    it("returns default instance URL when no instanceId provided", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.getBaseUrl()).toBe("http://stash-a:9999");
    });

    it("throws when no instances configured", async () => {
      mockFindMany.mockResolvedValue([]);

      const manager = await importFresh();
      await manager.initialize();

      expect(() => manager.getBaseUrl()).toThrow("No Stash instance configured");
    });
  });

  describe("getApiKey", () => {
    it("returns API key for a specific instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.getApiKey(INSTANCE_B.id)).toBe("key-b");
    });

    it("returns default instance API key when no instanceId provided", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.getApiKey()).toBe("key-a");
    });

    it("throws when no instances configured", async () => {
      mockFindMany.mockResolvedValue([]);

      const manager = await importFresh();
      await manager.initialize();

      expect(() => manager.getApiKey()).toThrow("No Stash instance configured");
    });
  });

  describe("reload", () => {
    it("clears state and reinitializes from database", async () => {
      // First init with one instance
      mockFindMany.mockResolvedValue([INSTANCE_A]);
      const manager = await importFresh();
      await manager.initialize();
      expect(manager.getInstanceCount()).toBe(1);

      // Reload with two instances
      mockFindMany.mockResolvedValue([INSTANCE_A, INSTANCE_B]);
      await manager.reload();

      expect(manager.getInstanceCount()).toBe(2);
      expect(manager.isInitialized()).toBe(true);
    });

    it("handles reload to zero instances", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);
      const manager = await importFresh();
      await manager.initialize();

      mockFindMany.mockResolvedValue([]);
      await manager.reload();

      expect(manager.getInstanceCount()).toBe(0);
      expect(manager.hasInstances()).toBe(false);
    });
  });

  describe("getConfig", () => {
    it("returns config for a known instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);

      const manager = await importFresh();
      await manager.initialize();

      const config = manager.getConfig(INSTANCE_A.id);
      expect(config).toBeDefined();
      expect(config!.name).toBe("Primary Stash");
    });

    it("returns undefined for an unknown instance", async () => {
      mockFindMany.mockResolvedValue([INSTANCE_A]);

      const manager = await importFresh();
      await manager.initialize();

      expect(manager.getConfig("unknown")).toBeUndefined();
    });
  });
});
