/**
 * The list sources' request shapes: the clip list rebuilds its request from
 * the list's query (`clipRequestOf`), so every part a query carries must
 * reach it, the user's rows in `where` included (W10).
 */
import { describe, expect, it } from "vitest";
import { clipRequestOf } from "@/components/list/listSources";
import { buildListQuery } from "@/utils/listQuery";

const clipQuery = (filters: Record<string, unknown>, sort = "title") =>
  buildListQuery(
    "clip",
    {
      ready: true,
      filters,
      sort: { field: sort, direction: "ASC", seed: null },
      page: 2,
      perPage: 24,
      q: "kiss",
    },
    { scenes: { value: ["9:a"], modifier: "INCLUDES" } }
  );

describe("clipRequestOf", () => {
  it("a clip query's where reaches the clip request", () => {
    const query = clipQuery({ tagIds: ["1:a"], tagIdsModifier: "INCLUDES" });
    if (query === null) throw new Error("a ready state builds a query");

    expect(clipRequestOf(query)).toEqual({
      filter: {
        page: 2,
        per_page: 24,
        q: "kiss",
        sort: "title",
        direction: "ASC",
      },
      clip_filter: {
        is_generated: true,
        scenes: { value: ["9:a"], modifier: "INCLUDES" },
      },
      where: {
        match: "all",
        rules: [
          {
            field: "tags",
            criterion: { value: ["1:a"], modifier: "INCLUDES" },
          },
        ],
      },
    });
  });

  it("a query without rows sends no where, and an unchosen sort none", () => {
    const query = clipQuery({}, "");
    if (query === null) throw new Error("a ready state builds a query");

    const request = clipRequestOf(query);
    expect(request).not.toHaveProperty("where");
    expect(request.filter).not.toHaveProperty("sort");
  });
});
