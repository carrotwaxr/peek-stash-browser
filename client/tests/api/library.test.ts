/**
 * Unit tests for libraryApi.getRelationCounts, a detail page's tab counts
 * (B19), and findEntityById, a detail page's lookup.
 */
import type { NormalizedPerformer, WithStashUrl } from "@peek/shared-types";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { apiGet, apiPost } from "@/api/client";
import { findEntityById, libraryApi } from "@/api/library";

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

  describe("findScenesMinimal", () => {
    it("asks `/library/scenes/minimal` and returns its scenes", async () => {
      const scenes = [{ id: "5", instanceId: "a", name: "Beach day" }];
      mockApiPost.mockResolvedValue({ scenes });
      const signal = new AbortController().signal;

      await expect(
        libraryApi.findScenesMinimal({ filter: { q: "beach" } }, signal)
      ).resolves.toEqual(scenes);
      expect(mockApiPost).toHaveBeenCalledWith(
        "/library/scenes/minimal",
        { filter: { q: "beach" } },
        signal
      );
    });
  });

  describe("findEntityById", () => {
    it("sends ids and the instance filter, and answers the typed row or null", async () => {
      const row = { id: "9", instanceId: "inst-a", stashUrl: null };
      mockApiPost.mockResolvedValueOnce({
        findPerformers: { performers: [row], count: 1 },
      });

      const found = await findEntityById("performer", "9", "inst-a");
      expectTypeOf(
        found
      ).toEqualTypeOf<WithStashUrl<NormalizedPerformer> | null>();
      expect(found).toEqual(row);
      expect(mockApiPost).toHaveBeenLastCalledWith(
        "/library/performers",
        { ids: ["9"], performer_filter: { instance_id: "inst-a" } },
        undefined
      );

      // A bare link sends no instance; no match answers null
      const controller = new AbortController();
      mockApiPost.mockResolvedValueOnce({
        findTags: { tags: [], count: 0 },
      });
      await expect(
        findEntityById("tag", "5", null, controller.signal)
      ).resolves.toBeNull();
      expect(mockApiPost).toHaveBeenLastCalledWith(
        "/library/tags",
        { ids: ["5"] },
        controller.signal
      );
    });
  });
});
