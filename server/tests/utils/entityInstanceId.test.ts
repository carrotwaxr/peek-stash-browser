/**
 * Unit Tests for entityInstanceId utility: name disambiguation for filter
 * dropdowns in multi-instance setups.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { disambiguateEntityNames } from "../../utils/entityInstanceId.js";
import { must } from "../helpers/must.js";

// Hoist mock function so it can be referenced in vi.mock factory
const { mockGetAllConfigs } = vi.hoisted(() => ({
  mockGetAllConfigs: vi.fn(),
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getAllConfigs: mockGetAllConfigs,
  },
}));

const INSTANCE_A = {
  id: "aaa-111",
  name: "Primary Stash",
  url: "http://stash-a/graphql",
  apiKey: "key-a",
  enabled: true,
  priority: 0,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const INSTANCE_B = {
  id: "bbb-222",
  name: "Secondary Stash",
  url: "http://stash-b/graphql",
  apiKey: "key-b",
  enabled: true,
  priority: 1,
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("entityInstanceId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllConfigs.mockReturnValue([INSTANCE_A, INSTANCE_B]);
  });

  describe("disambiguateEntityNames", () => {
    it("returns names unchanged with single instance", () => {
      mockGetAllConfigs.mockReturnValue([INSTANCE_A]);

      const result = disambiguateEntityNames([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "John Smith", instanceId: "aaa-111" },
      ]);

      expect(result).toEqual([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "John Smith", instanceId: "aaa-111" },
      ]);
    });

    it("returns names unchanged when no duplicates across instances", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "John Smith", instanceId: "bbb-222" },
      ]);

      expect(result).toEqual([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "John Smith", instanceId: "bbb-222" },
      ]);
    });

    it("adds instance name suffix for duplicate names from non-default instance", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "Jane Doe", instanceId: "bbb-222" },
      ]);

      // Default instance (lowest priority) keeps plain name
      expect(result[0]).toEqual({
        id: "1",
        name: "Jane Doe",
        instanceId: "aaa-111",
      });
      // Non-default instance gets suffix
      expect(result[1]).toEqual({
        id: "2",
        name: "Jane Doe (Secondary Stash)",
        instanceId: "bbb-222",
      });
    });

    it("disambiguates case-insensitively", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "jane doe", instanceId: "aaa-111" },
        { id: "2", name: "Jane Doe", instanceId: "bbb-222" },
      ]);

      expect(result[0]).toEqual({
        id: "1",
        name: "jane doe",
        instanceId: "aaa-111",
      });
      expect(result[1]).toEqual({
        id: "2",
        name: "Jane Doe (Secondary Stash)",
        instanceId: "bbb-222",
      });
    });

    it("does not suffix default instance even with duplicates", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "Shared Name", instanceId: "aaa-111" }, // default (priority 0)
        { id: "2", name: "Shared Name", instanceId: "bbb-222" }, // non-default (priority 1)
      ]);

      // Default instance never gets suffix
      expect(must(result[0]).name).toBe("Shared Name");
      // Non-default gets suffix
      expect(must(result[1]).name).toBe("Shared Name (Secondary Stash)");
    });

    it("handles empty entity list", () => {
      const result = disambiguateEntityNames([]);
      expect(result).toEqual([]);
    });

    it("handles entities with empty/null names", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "", instanceId: "aaa-111" },
        { id: "2", name: "", instanceId: "bbb-222" },
      ]);

      // Both empty names = duplicates, non-default gets suffix
      expect(result[0]).toEqual({ id: "1", name: "", instanceId: "aaa-111" });
      expect(result[1]).toEqual({
        id: "2",
        name: " (Secondary Stash)",
        instanceId: "bbb-222",
      });
    });

    it("handles no instances configured", () => {
      mockGetAllConfigs.mockReturnValue([]);

      const result = disambiguateEntityNames([
        { id: "1", name: "Test", instanceId: "aaa-111" },
      ]);

      // With 0 instances, no disambiguation needed
      expect(result).toEqual([
        { id: "1", name: "Test", instanceId: "aaa-111" },
      ]);
    });

    it("handles multiple duplicated names correctly", () => {
      const result = disambiguateEntityNames([
        { id: "1", name: "Jane Doe", instanceId: "aaa-111" },
        { id: "2", name: "Jane Doe", instanceId: "bbb-222" },
        { id: "3", name: "Unique Name", instanceId: "aaa-111" },
        { id: "4", name: "Unique Name 2", instanceId: "bbb-222" },
        { id: "5", name: "Another Dup", instanceId: "aaa-111" },
        { id: "6", name: "Another Dup", instanceId: "bbb-222" },
      ]);

      expect(must(result[0]).name).toBe("Jane Doe");
      expect(must(result[1]).name).toBe("Jane Doe (Secondary Stash)");
      expect(must(result[2]).name).toBe("Unique Name"); // No dup, no suffix
      expect(must(result[3]).name).toBe("Unique Name 2"); // No dup, no suffix
      expect(must(result[4]).name).toBe("Another Dup");
      expect(must(result[5]).name).toBe("Another Dup (Secondary Stash)");
    });
  });
});
