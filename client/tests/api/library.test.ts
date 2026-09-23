/**
 * Unit tests for libraryApi.findGalleryImages: gallery images come from the
 * images search with an instance-aware galleries filter (item 11).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/api/client";
import { libraryApi } from "@/api/library";

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

const mockApiPost = vi.mocked(apiPost);

describe("libraryApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiPost.mockResolvedValue({});
  });

  describe("findGalleryImages", () => {
    it("posts the gallery as an instance-aware images filter", async () => {
      await libraryApi.findGalleryImages("44", "inst-b", {
        page: 2,
        perPage: 100,
      });

      expect(mockApiPost).toHaveBeenCalledWith("/library/images", {
        filter: { page: 2, per_page: 100, sort: "path", direction: "ASC" },
        image_filter: {
          galleries: { value: ["44:inst-b"], modifier: "INCLUDES" },
        },
      });
    });

    it("returns images and count from findImages", async () => {
      const image = { id: "1", instanceId: "inst-b" };
      mockApiPost.mockResolvedValueOnce({
        findImages: { images: [image], count: 7 },
      });

      await expect(
        libraryApi.findGalleryImages("44", "inst-b")
      ).resolves.toEqual({ images: [image], count: 7 });
    });

    it("sends a bare id when no instance is known", async () => {
      await libraryApi.findGalleryImages("44", null);

      expect(mockApiPost).toHaveBeenCalledWith("/library/images", {
        filter: { page: 1, per_page: 100, sort: "path", direction: "ASC" },
        image_filter: {
          galleries: { value: ["44"], modifier: "INCLUDES" },
        },
      });
    });
  });
});
