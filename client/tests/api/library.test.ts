/**
 * Unit tests for libraryApi.findGalleryImages: gallery images come from the
 * images search with an instance-aware galleries filter (item 11); and
 * getRelationCounts, a detail page's tab counts (B19).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost } from "@/api/client";
import { libraryApi } from "@/api/library";

vi.mock("@/api/client", () => ({
  apiFetch: vi.fn(),
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

const mockApiPost = vi.mocked(apiPost);
const mockApiGet = vi.mocked(apiGet);

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
  });

  describe("getRelationCounts", () => {
    it("asks the page's entity on its instance, with the toggle only when on", async () => {
      mockApiGet.mockResolvedValue({ counts: {} });

      await libraryApi.getRelationCounts("tag", "5", "inst b");
      await libraryApi.getRelationCounts("tag", "5", "inst-a", {
        includeSubTags: true,
      });
      await libraryApi.getRelationCounts("studio", "7", "inst-a", {
        includeSubStudios: true,
      });
      await libraryApi.getRelationCounts("gallery", "9", "inst-a");

      expect(mockApiGet.mock.calls.map(([path]) => path)).toEqual([
        "/library/tags/5/counts?instanceId=inst+b",
        "/library/tags/5/counts?instanceId=inst-a&includeSubTags=true",
        "/library/studios/7/counts?instanceId=inst-a&includeSubStudios=true",
        "/library/galleries/9/counts?instanceId=inst-a",
      ]);
    });
  });
});
