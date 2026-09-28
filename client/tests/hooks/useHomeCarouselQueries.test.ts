import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { libraryApi } from "@/api";
import { useHomeCarouselQueries } from "@/hooks/useHomeCarouselQueries";

const scenes = [{ id: "1:inst-a" }, { id: "1:inst-b" }];

describe("useHomeCarouselQueries", () => {
  let findScenes: MockInstance<typeof libraryApi.findScenes>;
  let findStudios: MockInstance<typeof libraryApi.findStudios>;
  let findTags: MockInstance<typeof libraryApi.findTags>;

  beforeEach(() => {
    findScenes = vi
      .spyOn(libraryApi, "findScenes")
      .mockResolvedValue({ findScenes: { scenes } });
    // A favorite studio or tag fetched first would carry a bare id that
    // matches the same id on every server; the scene filter needs none.
    findStudios = vi
      .spyOn(libraryApi, "findStudios")
      .mockResolvedValue({ findStudios: { studios: [{ id: "7" }] } });
    findTags = vi
      .spyOn(libraryApi, "findTags")
      .mockResolvedValue({ findTags: { tags: [{ id: "9" }] } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const carouselQueries = (perCarousel: number) =>
    renderHook(() => useHomeCarouselQueries(perCarousel)).result.current;

  it("favoriteStudioScenes requests scenes with studio_favorite true and no studio ids", async () => {
    const result = await carouselQueries(7).favoriteStudioScenes();

    expect(findStudios).not.toHaveBeenCalled();
    expect(findScenes).toHaveBeenCalledTimes(1);
    expect(findScenes).toHaveBeenCalledWith({
      filter: { page: 1, per_page: 7, sort: "random", direction: "ASC" },
      scene_filter: { studio_favorite: true },
    });
    expect(result).toEqual(scenes);
  });

  it("favoriteTagScenes requests scenes with tag_favorite true and no tag ids", async () => {
    const result = await carouselQueries(5).favoriteTagScenes();

    expect(findTags).not.toHaveBeenCalled();
    expect(findScenes).toHaveBeenCalledTimes(1);
    expect(findScenes).toHaveBeenCalledWith({
      filter: { page: 1, per_page: 5, sort: "random", direction: "ASC" },
      scene_filter: { tag_favorite: true },
    });
    expect(result).toEqual(scenes);
  });

  it("answers an empty list when the server returns no scenes", async () => {
    findScenes.mockResolvedValue({ findScenes: { scenes: [] } });
    const queries = carouselQueries(12);

    await expect(queries.favoriteStudioScenes()).resolves.toEqual([]);
    await expect(queries.favoriteTagScenes()).resolves.toEqual([]);
  });
});
