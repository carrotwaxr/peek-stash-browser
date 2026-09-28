/**
 * Unit Tests for stashUrl utility
 *
 * Tests the Stash URL builder functions used to generate links to
 * Stash entities. Covers the instance's UI address, entity URL construction
 * for all entity types, and error/edge-case handling.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildStashEntityUrl, getStashUiUrl } from "../../utils/stashUrl.js";
import { untrusted } from "../helpers/untrusted.js";

// Hoist mock function so it can be referenced in vi.mock factory
const { mockGetUiUrl } = vi.hoisted(() => ({
  mockGetUiUrl: vi.fn(),
}));

// Mock StashInstanceManager
vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getUiUrl: mockGetUiUrl,
  },
}));

describe("stashUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getStashUiUrl", () => {
    it("passes through the instanceId", () => {
      mockGetUiUrl.mockReturnValue("https://stash-b.example.com");

      const result = getStashUiUrl("instance-b");

      expect(result).toBe("https://stash-b.example.com");
      expect(mockGetUiUrl).toHaveBeenCalledWith("instance-b");
    });

    it("returns null when the instance is not loaded", () => {
      mockGetUiUrl.mockImplementation((id: string) => {
        throw new Error(`Stash instance not found: ${id}`);
      });

      expect(getStashUiUrl("instance-b")).toBeNull();
      expect(getStashUiUrl("")).toBeNull();
    });
  });

  describe("buildStashEntityUrl", () => {
    const BASE_URL = "http://localhost:9999";
    const ADMIN = { role: "ADMIN" };

    // Stash's address is internal: only admins get the View in Stash link
    it("returns null for a non-admin viewer", () => {
      mockGetUiUrl.mockReturnValue("http://stash.lan:9999");

      expect(
        buildStashEntityUrl("scene", "1", "inst", { role: "USER" })
      ).toBeNull();
      expect(mockGetUiUrl).not.toHaveBeenCalled();
    });

    it("returns null without a viewer", () => {
      mockGetUiUrl.mockReturnValue("http://stash.lan:9999");

      expect(buildStashEntityUrl("scene", "1", "inst", undefined)).toBeNull();
    });

    it("builds the Stash UI link for an admin", () => {
      mockGetUiUrl.mockReturnValue("http://stash.lan:9999");

      expect(buildStashEntityUrl("scene", "1", "inst", ADMIN)).toBe(
        "http://stash.lan:9999/scenes/1"
      );
      expect(mockGetUiUrl).toHaveBeenCalledWith("inst");
    });

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
        mockGetUiUrl.mockReturnValue(BASE_URL);

        const result = buildStashEntityUrl(entityType, "42", "inst", ADMIN);

        expect(result).toBe(`${BASE_URL}/${expectedPath}/42`);
      }
    );

    it("passes the instanceId through to getStashUiUrl", () => {
      mockGetUiUrl.mockReturnValue("https://stash-b.example.com");

      const result = buildStashEntityUrl("scene", "42", "instance-b", ADMIN);

      expect(result).toBe("https://stash-b.example.com/scenes/42");
      expect(mockGetUiUrl).toHaveBeenCalledWith("instance-b");
    });

    it("returns null when the entity's instance is not loaded", () => {
      mockGetUiUrl.mockImplementation((id: string) => {
        throw new Error(`Stash instance not found: ${id}`);
      });

      const result = buildStashEntityUrl("scene", "42", "inst", ADMIN);

      expect(result).toBeNull();
    });

    it("returns null for unknown entity type", () => {
      mockGetUiUrl.mockReturnValue(BASE_URL);

      const result = buildStashEntityUrl(
        untrusted("unknown"),
        "42",
        "inst",
        ADMIN
      );

      expect(result).toBeNull();
    });

    it("works with string entityId", () => {
      mockGetUiUrl.mockReturnValue(BASE_URL);

      const result = buildStashEntityUrl("scene", "123", "inst", ADMIN);

      expect(result).toBe(`${BASE_URL}/scenes/123`);
    });

    it("works with number entityId", () => {
      mockGetUiUrl.mockReturnValue(BASE_URL);

      const result = buildStashEntityUrl("performer", 456, "inst", ADMIN);

      expect(result).toBe(`${BASE_URL}/performers/456`);
    });
  });
});
