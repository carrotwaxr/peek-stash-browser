/**
 * Unit Tests for StashInstanceManager
 *
 * Tests the singleton service that manages Stash server instance connections.
 * Covers initialization, instance lookup, reload, and edge cases around
 * multi-instance configuration.
 */
import type { StashInstance } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stashInstanceRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock StashClient constructor
vi.mock("../../graphql/StashClient.js", () => ({
  StashClient: vi
    .fn()
    .mockImplementation((config: { url: string; apiKey: string }) => ({
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
  uiUrl: "https://stash-a.example.com",
  apiKey: "key-a",
  enabled: true,
  priority: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastFullPassAt: null,
};

const INSTANCE_B = {
  id: "bbb-222-bbb",
  name: "Secondary Stash",
  description: "Backup instance",
  url: "http://stash-b:9999/graphql",
  uiUrl: null,
  apiKey: "key-b",
  enabled: true,
  priority: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastFullPassAt: null,
};

describe("StashInstanceManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  /**
   * A new manager (vi.resetModules gives each test its own module graph)
   * whose database holds `configs`, enabled and in priority order, as
   * `findMany` returns them; `mockPrisma` is that graph's database mock.
   */
  async function importFresh(configs: StashInstance[]) {
    const { default: prisma } = await import("../../prisma/singleton.js");
    const mockPrisma = vi.mocked(prisma, true);
    mockPrisma.stashInstance.findMany.mockResolvedValue(configs);
    const mod = await import("../../services/StashInstanceManager.js");
    return { manager: mod.stashInstanceManager, mockPrisma };
  }

  describe("initialize", () => {
    it("initializes with no instances configured", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.hasInstances()).toBe(false);
      expect(manager.getInstanceCount()).toBe(0);
    });

    it("initializes with a single instance", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(manager.isInitialized()).toBe(true);
      expect(manager.hasInstances()).toBe(true);
      expect(manager.getInstanceCount()).toBe(1);
    });

    it("initializes with multiple instances in priority order", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      expect(manager.getInstanceCount()).toBe(2);

      // Default should be the highest priority (lowest number)
      const defaultConfig = manager.getDefaultConfig();
      expect(defaultConfig.id).toBe(INSTANCE_A.id);
    });

    it("is idempotent - second initialize is a no-op", async () => {
      const { logger } = await import("../../utils/logger.js");

      const { manager, mockPrisma } = await importFresh([INSTANCE_A]);
      await manager.initialize();
      await manager.initialize();

      expect(logger.warn).toHaveBeenCalledWith(
        "StashInstanceManager already initialized"
      );
      // findMany called only once (first init)
      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledTimes(1);
    });

    it("queries only enabled instances ordered by priority", async () => {
      const { manager, mockPrisma } = await importFresh([]);
      await manager.initialize();

      expect(mockPrisma.stashInstance.findMany).toHaveBeenCalledWith({
        where: { enabled: true },
        orderBy: { priority: "asc" },
      });
    });
  });

  describe("getDefault", () => {
    it("returns the highest priority instance", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      const client = manager.getDefault();
      expect(client).toBeDefined();
      expect(client).toHaveProperty("url", INSTANCE_A.url);
    });

    it("throws when no instances are configured", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();

      expect(() => manager.getDefault()).toThrow(
        "No Stash instance configured"
      );
    });
  });

  describe("getDefaultConfig", () => {
    it("returns the config object for the default instance", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      const config = manager.getDefaultConfig();
      expect(config.id).toBe(INSTANCE_A.id);
      expect(config.name).toBe("Primary Stash");
      expect(config.url).toBe("http://stash-a:9999/graphql");
    });

    it("throws when no instances are configured", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();

      expect(() => manager.getDefaultConfig()).toThrow(
        "No Stash instance configured"
      );
    });
  });

  describe("get", () => {
    it("returns client for a known instance ID", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      const client = manager.get(INSTANCE_B.id);
      expect(client).toBeDefined();
      expect(client).toHaveProperty("url", INSTANCE_B.url);
    });

    it("returns undefined for an unknown instance ID", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(manager.get("nonexistent-id")).toBeUndefined();
    });
  });

  describe("getForSync", () => {
    it("returns client for a known instance", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      const client = manager.getForSync(INSTANCE_A.id);
      expect(client).not.toBeNull();
    });

    it("returns null and warns for an unknown instance", async () => {
      const { logger } = await import("../../utils/logger.js");

      const { manager } = await importFresh([INSTANCE_A]);
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
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(() => manager.getRequired(INSTANCE_A.id)).not.toThrow();
    });

    it("throws for an unknown instance", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(() => manager.getRequired("nonexistent-id")).toThrow(
        "Stash instance not found: nonexistent-id"
      );
    });
  });

  describe("getAll", () => {
    it("returns array of [instanceId, client] tuples", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      const all = manager.getAll();
      expect(all).toHaveLength(2);
      expect(must(all[0])[0]).toBe(INSTANCE_A.id);
      expect(must(all[1])[0]).toBe(INSTANCE_B.id);
    });

    it("returns empty array when no instances", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();

      expect(manager.getAll()).toHaveLength(0);
    });
  });

  describe("getAllInstanceIds", () => {
    it("returns array of instance ID strings", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      const ids = manager.getAllInstanceIds();
      expect(ids).toEqual([INSTANCE_A.id, INSTANCE_B.id]);
    });
  });

  describe("getAllEnabled", () => {
    it("returns id and name for each enabled instance", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
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
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      const configs = manager.getAllConfigs();
      expect(configs).toHaveLength(2);
      expect(must(configs[0]).apiKey).toBe("key-a");
      expect(must(configs[1]).apiKey).toBe("key-b");
    });
  });

  describe("getBaseUrl", () => {
    it("strips /graphql suffix from instance URL", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(manager.getBaseUrl(INSTANCE_A.id)).toBe("http://stash-a:9999");
    });

    it("returns default instance URL when no instanceId provided", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      expect(manager.getBaseUrl()).toBe("http://stash-a:9999");
    });

    it("throws when no instances configured", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();

      expect(() => manager.getBaseUrl()).toThrow(
        "No Stash instance configured"
      );
    });
  });

  describe("getUiUrl", () => {
    it("returns uiUrl when configured", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(manager.getUiUrl(INSTANCE_A.id)).toBe(
        "https://stash-a.example.com"
      );
    });

    it("strips trailing slash from uiUrl", async () => {
      const instanceWithTrailingSlash = {
        ...INSTANCE_A,
        uiUrl: "https://stash-a.example.com/",
      };

      const { manager } = await importFresh([instanceWithTrailingSlash]);
      await manager.initialize();

      expect(manager.getUiUrl(INSTANCE_A.id)).toBe(
        "https://stash-a.example.com"
      );
    });

    it("falls back to url stripped of /graphql when uiUrl not set", async () => {
      const { manager } = await importFresh([INSTANCE_B]);
      await manager.initialize();

      expect(manager.getUiUrl(INSTANCE_B.id)).toBe("http://stash-b:9999");
    });

    it("returns default instance uiUrl when no instanceId provided", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      expect(manager.getUiUrl()).toBe("https://stash-a.example.com");
    });

    it("throws when no instances configured", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();

      expect(() => manager.getUiUrl()).toThrow("No Stash instance configured");
    });
  });

  describe("getApiKey", () => {
    it("returns API key for a specific instance", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      expect(manager.getApiKey(INSTANCE_B.id)).toBe("key-b");
    });

    it("returns default instance API key when no instanceId provided", async () => {
      const { manager } = await importFresh([INSTANCE_A, INSTANCE_B]);
      await manager.initialize();

      expect(manager.getApiKey()).toBe("key-a");
    });

    it("throws when no instances configured", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();

      expect(() => manager.getApiKey()).toThrow("No Stash instance configured");
    });
  });

  describe("reload", () => {
    it("clears state and reinitializes from database", async () => {
      // First init with one instance
      const { manager, mockPrisma } = await importFresh([INSTANCE_A]);
      await manager.initialize();
      expect(manager.getInstanceCount()).toBe(1);

      // Reload with two instances
      mockPrisma.stashInstance.findMany.mockResolvedValue([
        INSTANCE_A,
        INSTANCE_B,
      ]);
      await manager.reload();

      expect(manager.getInstanceCount()).toBe(2);
      expect(manager.isInitialized()).toBe(true);
    });

    it("handles reload to zero instances", async () => {
      const { manager, mockPrisma } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      mockPrisma.stashInstance.findMany.mockResolvedValue([]);
      await manager.reload();

      expect(manager.getInstanceCount()).toBe(0);
      expect(manager.hasInstances()).toBe(false);
    });
  });

  describe("initialize error handling", () => {
    it("throws when StashClient constructor fails", async () => {
      // Make StashClient constructor throw
      const { StashClient } = await import("../../graphql/StashClient.js");
      vi.mocked(StashClient).mockImplementationOnce(() => {
        throw new Error("Connection refused");
      });
      const { logger } = await import("../../utils/logger.js");

      const { manager } = await importFresh([INSTANCE_A]);

      await expect(manager.initialize()).rejects.toThrow("Connection refused");
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to initialize Stash instance: ${INSTANCE_A.name}`,
        expect.objectContaining({ error: "Connection refused" })
      );
    });
  });

  describe("getBaseUrl with unknown instanceId", () => {
    it("throws when specific instanceId is not found", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(() => manager.getBaseUrl("nonexistent-id")).toThrow(
        "No Stash instance configured"
      );
    });
  });

  describe("getApiKey with unknown instanceId", () => {
    it("throws when specific instanceId is not found", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(() => manager.getApiKey("nonexistent-id")).toThrow(
        "No Stash instance configured"
      );
    });
  });

  describe("getConfig", () => {
    it("returns config for a known instance", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      const config = manager.getConfig(INSTANCE_A.id);
      expect(config).toBeDefined();
      expect(must(config).name).toBe("Primary Stash");
    });

    it("returns undefined for an unknown instance", async () => {
      const { manager } = await importFresh([INSTANCE_A]);
      await manager.initialize();

      expect(manager.getConfig("unknown")).toBeUndefined();
    });
  });

  // The owner's instance id is literally "default": it names that instance,
  // not whichever instance has the top priority
  const DEFAULT_AT_5 = stashInstanceRow({
    id: "default",
    name: "Named default",
    url: "http://stash-default:9999/graphql",
    apiKey: "key-default",
    priority: 5,
  });
  const B_AT_0 = stashInstanceRow({
    id: "b",
    name: "Top priority",
    url: "http://stash-b:9999/graphql",
    apiKey: "key-b",
    priority: 0,
  });

  describe("getCredentials", () => {
    it("an instance whose id is `default` is served as itself at any priority", async () => {
      const { manager } = await importFresh([B_AT_0, DEFAULT_AT_5]);
      await manager.initialize();

      expect(manager.getCredentials("default")).toEqual({
        baseUrl: "http://stash-default:9999",
        apiKey: "key-default",
      });
      expect(manager.getCredentials("b")).toEqual({
        baseUrl: "http://stash-b:9999",
        apiKey: "key-b",
      });
    });

    it("no id means the highest-priority enabled instance", async () => {
      const { manager } = await importFresh([B_AT_0, DEFAULT_AT_5]);
      await manager.initialize();

      expect(manager.getCredentials()).toEqual({
        baseUrl: "http://stash-b:9999",
        apiKey: "key-b",
      });
    });

    it("a named instance that is not loaded (disabled or deleted) throws UnknownInstanceError", async () => {
      // findMany returns enabled instances only, so a disabled one is absent
      const { manager, mockPrisma } = await importFresh([B_AT_0, DEFAULT_AT_5]);
      await manager.initialize();
      const { UnknownInstanceError } =
        await import("../../services/StashInstanceManager.js");

      expect(() => manager.getCredentials("disabled-one")).toThrow(
        UnknownInstanceError
      );

      // Deleted: gone from the manager after the reload
      mockPrisma.stashInstance.findMany.mockResolvedValue([B_AT_0]);
      await manager.reload();
      expect(() => manager.getCredentials("default")).toThrow(
        UnknownInstanceError
      );
      expect(() => manager.getCredentials("default")).toThrow(
        "Stash instance not found: default"
      );
    });

    it("no id and no instance configured is a configuration error, not an unknown instance", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();
      const { UnknownInstanceError } =
        await import("../../services/StashInstanceManager.js");

      expect(() => manager.getCredentials()).toThrow(
        "No Stash instance configured"
      );
      expect(() => manager.getCredentials()).not.toThrow(UnknownInstanceError);
    });
  });

  describe("resolveInstanceId", () => {
    it("a named instance is itself, `default` included, and no id is the highest-priority instance", async () => {
      const { manager } = await importFresh([B_AT_0, DEFAULT_AT_5]);
      await manager.initialize();

      expect(manager.resolveInstanceId("default")).toBe("default");
      expect(manager.resolveInstanceId("b")).toBe("b");
      expect(manager.resolveInstanceId()).toBe("b");
    });

    it("throws when no id is given and no instance is configured", async () => {
      const { manager } = await importFresh([]);
      await manager.initialize();

      expect(() => manager.resolveInstanceId()).toThrow(
        "No Stash instance configured"
      );
    });
  });

  describe("the owner's setup: `default` as the only instance, at priority 0", () => {
    it("serves `default` whether a request names it or names no instance", async () => {
      const { manager } = await importFresh([{ ...DEFAULT_AT_5, priority: 0 }]);
      await manager.initialize();

      const served = {
        baseUrl: "http://stash-default:9999",
        apiKey: "key-default",
      };
      expect(manager.getCredentials("default")).toEqual(served);
      expect(manager.getCredentials()).toEqual(served);
      expect(manager.resolveInstanceId("default")).toBe("default");
      expect(manager.resolveInstanceId()).toBe("default");
      // The older per-field helpers agree
      expect(manager.getBaseUrl()).toBe(served.baseUrl);
      expect(manager.getApiKey()).toBe(served.apiKey);
      expect(manager.getDefaultConfig().id).toBe("default");
    });
  });
});
