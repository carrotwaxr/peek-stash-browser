/**
 * Unit Tests for stashUrl utility
 *
 * Tests the Stash URL builder functions used to generate links to
 * Stash entities. Covers base URL retrieval, entity URL construction
 * for all entity types, and error/edge-case handling.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock function so it can be referenced in vi.mock factory
const { mockGetBaseUrl } = vi.hoisted(() => ({
  mockGetBaseUrl: vi.fn(),
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getBaseUrl: mockGetBaseUrl,
  },
}));

import { getStashBaseUrl, buildStashEntityUrl } from "../../utils/stashUrl.js";

describe("stashUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStashBaseUrl", () => {
    it("returns URL from stashInstanceManager", () => {
      mockGetBaseUrl.mockReturnValue("http://localhost:9999");

      const result = getStashBaseUrl();

      expect(result).toBe("http://localhost:9999");
      expect(mockGetBaseUrl).toHaveBeenCalledOnce();
    });

    it("returns null when stashInstanceManager throws", () => {
      mockGetBaseUrl.mockImplementation(() => {
        throw new Error("No instance configured");
      });

      const result = getStashBaseUrl();

      expect(result).toBeNull();
    });
  });

  describe("buildStashEntityUrl", () => {
    const BASE_URL = "http://localhost:9999";

    it.each([
      ["scene", "scenes"],
      ["performer", "performers"],
      ["studio", "studios"],
      ["tag", "tags"],
      ["group", "groups"],
      ["gallery", "galleries"],
      ["image", "images"],
    ] as const)(
      "returns correct URL for entity type %s -> %s",
      (entityType, expectedPath) => {
        mockGetBaseUrl.mockReturnValue(BASE_URL);

        const result = buildStashEntityUrl(entityType, "42");

        expect(result).toBe(`${BASE_URL}/${expectedPath}/42`);
      }
    );

    it("returns null when getStashBaseUrl returns null", () => {
      mockGetBaseUrl.mockImplementation(() => {
        throw new Error("No instance configured");
      });

      const result = buildStashEntityUrl("scene", "42");

      expect(result).toBeNull();
    });

    it("returns null for unknown entity type", () => {
      mockGetBaseUrl.mockReturnValue(BASE_URL);

      // Cast to bypass TypeScript type checking for the test
      const result = buildStashEntityUrl(
        "unknown" as unknown as "scene",
        "42"
      );

      expect(result).toBeNull();
    });

    it("works with string entityId", () => {
      mockGetBaseUrl.mockReturnValue(BASE_URL);

      const result = buildStashEntityUrl("scene", "123");

      expect(result).toBe(`${BASE_URL}/scenes/123`);
    });

    it("works with number entityId", () => {
      mockGetBaseUrl.mockReturnValue(BASE_URL);

      const result = buildStashEntityUrl("performer", 456);

      expect(result).toBe(`${BASE_URL}/performers/456`);
    });
  });
});
