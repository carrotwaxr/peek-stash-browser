import { DEFAULT_SORT } from "@peek/shared-types";
import { QueryClient } from "@tanstack/react-query";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateInstanceQueries } from "@/api/hooks/useLibraryReady";
import { invalidateExclusionDependents } from "@/api/invalidateExclusionDependents";
import { queryKeys } from "@/api/queryKeys";
import { SCENE_FILTER_OPTIONS, buildSceneFilter } from "@/utils/filterConfig";
import {
  type ListQueryState,
  buildListQuery,
  clipListTotal,
  fetchListPage,
  libraryListTotal,
  listKeyOf,
  listKeyWithoutPageOf,
  lockedFieldsOf,
  sortOptionsFor,
  withoutLockedFilters,
  withoutLockedOptions,
} from "@/utils/listQuery";

const state = (overrides: Partial<ListQueryState> = {}): ListQueryState => ({
  ready: true,
  filters: {},
  sort: { field: "date", direction: "DESC", seed: null },
  page: 1,
  perPage: 24,
  q: "",
  ...overrides,
});

const TIMELINE = { date: { start: "2024-03-01", end: "2024-03-31" } };

describe("buildListQuery", () => {
  it("a permanent filter wins over a preset naming the same field", () => {
    const query = buildListQuery(
      "scene",
      state({ filters: { date: { start: "2001-01-01" }, favorite: true } }),
      TIMELINE
    );
    const expected = buildSceneFilter({ ...TIMELINE, favorite: true });
    expect(query).toEqual({
      filter: { page: 1, per_page: 24, q: "", sort: "date", direction: "DESC" },
      scene_filter: expected,
    });
  });

  it("a timeline period's date survives a sort change", () => {
    const byDate = buildListQuery("scene", state(), TIMELINE);
    const byTitle = buildListQuery(
      "scene",
      state({ sort: { field: "title", direction: "ASC", seed: null } }),
      TIMELINE
    );
    const expected = buildSceneFilter(TIMELINE).date;
    expect(byDate?.filter.sort).toBe("date");
    expect(byTitle?.filter.sort).toBe("title");
    expect(
      byDate && "scene_filter" in byDate && byDate.scene_filter?.date
    ).toEqual(expected);
    expect(
      byTitle && "scene_filter" in byTitle && byTitle.scene_filter?.date
    ).toEqual(expected);
  });

  it("no query until presets resolve", () => {
    expect(buildListQuery("scene", state({ ready: false }), {})).toBeNull();
  });

  it("random with a seed sends random_<seed>", () => {
    const query = buildListQuery(
      "performer",
      state({ sort: { field: "random", direction: "ASC", seed: 12345678 } }),
      {}
    );
    expect(query?.filter.sort).toBe("random_12345678");
  });

  it("Scene Number without an including collection sends the scene default", () => {
    const sort = {
      field: "scene_index",
      direction: "ASC" as const,
      seed: null,
    };
    const bare = buildListQuery("scene", state({ sort }), {});
    const inGroup = buildListQuery("scene", state({ sort }), {
      groups: { value: ["3:abc"], modifier: "INCLUDES" },
    });
    expect(bare?.filter.sort).toBe(DEFAULT_SORT.scene.field);
    expect(inGroup?.filter.sort).toBe("scene_index");
  });

  it("listKey includes the page and listKeyWithoutPage does not", () => {
    const one = buildListQuery("scene", state({ page: 1 }), {});
    const two = buildListQuery("scene", state({ page: 2 }), {});
    expect(listKeyOf(one)).not.toBe(listKeyOf(two));
    expect(listKeyWithoutPageOf(one)).toBe(listKeyWithoutPageOf(two));
    expect(listKeyOf(null)).toBe("");
  });
});

const valuesOf = (kind: string, filters: Record<string, unknown> = {}) =>
  sortOptionsFor(kind, filters).map((option) => option.value);

describe("sortOptionsFor: sorts that read a filter", () => {
  it("Playlist order appears only with one playlist chosen", () => {
    const include = (value: unknown[], modifier = "INCLUDES") => ({
      playlists: { value, modifier },
    });
    expect(valuesOf("scene")).not.toContain("playlist_position");
    expect(valuesOf("scene", include([1]))).toContain("playlist_position");
    expect(valuesOf("scene", include([1], "INCLUDES_ALL"))).toContain(
      "playlist_position"
    );
    expect(valuesOf("scene", include([1, 2]))).not.toContain(
      "playlist_position"
    );
    expect(valuesOf("scene", include([1], "EXCLUDES"))).not.toContain(
      "playlist_position"
    );
    expect(valuesOf("scene", include([]))).not.toContain("playlist_position");
    // Another list never offers it
    expect(valuesOf("group", include([1]))).not.toContain("playlist_position");
  });

  it.each(["IS_NULL", "NOT_NULL"])(
    "the presence choice %s never offers a sort that reads picks",
    (modifier) => {
      // A preset or hand-made link can hold picks beside a presence choice:
      // the request carries only the presence, so the server has no
      // collection or playlist to order by
      expect(
        valuesOf("scene", { groupIds: ["3:abc"], groupIdsModifier: modifier })
      ).not.toContain("scene_index");
      expect(
        valuesOf("scene", { groups: { value: ["3:abc"], modifier } })
      ).not.toContain("scene_index");
      expect(
        valuesOf("scene", { playlists: { value: [1], modifier } })
      ).not.toContain("playlist_position");
      expect(
        valuesOf("group", { groupIds: ["3:abc"], groupIdsModifier: modifier })
      ).not.toContain("sub_group_order");
      const query = buildListQuery(
        "scene",
        state({
          sort: { field: "scene_index", direction: "ASC", seed: null },
          filters: { groupIds: ["3:abc"], groupIdsModifier: modifier },
        }),
        {}
      );
      expect(query?.filter.sort).toBe(DEFAULT_SORT.scene.field);
    }
  );

  it("Scene Number appears with an included collection", () => {
    expect(
      valuesOf("scene", { groupIds: ["3:abc"], groupIdsModifier: "INCLUDES" })
    ).toContain("scene_index");
    expect(valuesOf("scene", { groupIds: ["3:abc"] })).toContain("scene_index");
    expect(
      valuesOf("scene", { groups: { value: ["3:abc"], modifier: "INCLUDES" } })
    ).toContain("scene_index");
    expect(
      valuesOf("scene", { groupIds: ["3:abc"], groupIdsModifier: "EXCLUDES" })
    ).not.toContain("scene_index");
  });

  it("Playlist order is not sent without one playlist", () => {
    const sort = {
      field: "playlist_position",
      direction: "ASC" as const,
      seed: null,
    };
    const bare = buildListQuery("scene", state({ sort }), {});
    const two = buildListQuery("scene", state({ sort }), {
      playlists: { value: [1, 2], modifier: "INCLUDES" },
    });
    const one = buildListQuery("scene", state({ sort }), {
      playlists: { value: [1], modifier: "INCLUDES" },
    });
    expect(bare?.filter.sort).toBe(DEFAULT_SORT.scene.field);
    expect(two?.filter.sort).toBe(DEFAULT_SORT.scene.field);
    expect(one?.filter.sort).toBe("playlist_position");
  });

  it("Collection order only with one parent collection", () => {
    expect(valuesOf("group")).not.toContain("sub_group_order");
    expect(
      valuesOf("group", {
        groupIds: ["3:abc"],
        groupIdsModifier: "INCLUDES",
      })
    ).toContain("sub_group_order");
    expect(valuesOf("group", { groupIds: ["3:abc"] })).toContain(
      "sub_group_order"
    );
    expect(
      valuesOf("group", {
        containing_groups: { value: ["3:abc"], modifier: "INCLUDES" },
      })
    ).toContain("sub_group_order");
    expect(
      valuesOf("group", {
        groupIds: ["3:abc"],
        groupIdsModifier: "EXCLUDES",
      })
    ).not.toContain("sub_group_order");
    expect(valuesOf("group", { groupIds: [] })).not.toContain(
      "sub_group_order"
    );
    // The scene list's Scene Number reads `groups`, not the parent collection
    expect(
      valuesOf("scene", { groupIds: ["3:abc"], groupIdsModifier: "INCLUDES" })
    ).not.toContain("sub_group_order");
  });

  it("Collection order is not sent without a parent collection", () => {
    const sort = {
      field: "sub_group_order",
      direction: "ASC" as const,
      seed: null,
    };
    const bare = buildListQuery("group", state({ sort }), {});
    const inParent = buildListQuery("group", state({ sort }), {
      containing_groups: { value: ["3:abc"], modifier: "INCLUDES" },
    });
    expect(bare?.filter.sort).toBe(DEFAULT_SORT.group.field);
    expect(inParent?.filter.sort).toBe("sub_group_order");
  });

  const OFFERED: Record<string, string[]> = {
    scene: [
      "resolution",
      "studio",
      "code",
      "performer_age",
      "organized",
      "resume_time",
    ],
    image: ["resolution", "tag_count", "performer_count"],
    gallery: ["tag_count", "performer_count"],
    studio: [
      "child_count",
      "tag_count",
      "image_count",
      "gallery_count",
      "performer_count",
      "group_count",
    ],
    tag: [
      "child_count",
      "parent_count",
      "image_count",
      "gallery_count",
      "performer_count",
      "studio_count",
      "group_count",
    ],
    group: ["tag_count", "o_counter", "performer_count"],
    performer: [
      "tag_count",
      "marker_count",
      "image_count",
      "gallery_count",
      "group_count",
    ],
  };

  it.each(Object.keys(OFFERED))("the %s list offers its keys", (kind) => {
    const values = valuesOf(kind);
    expect(OFFERED[kind]?.filter((key) => !values.includes(key))).toEqual([]);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("locked fields", () => {
  it("lockedFieldsOf reads the top level keys and the entity's own filter", () => {
    expect(
      lockedFieldsOf("scene", { tags: {}, date: {}, sceneId: "3" })
    ).toEqual(["date", "sceneId", "tags"]);
    expect(
      lockedFieldsOf("performer", { performer_filter: { tags: {} } })
    ).toEqual(["performer_filter", "tags"]);
    expect(lockedFieldsOf("scene", {})).toEqual([]);
  });

  it("withoutLockedFilters drops a locked field's keys with their companions", () => {
    const filters = {
      tagIds: ["1:a"],
      tagIdsModifier: "EXCLUDES",
      tagIdsDepth: -1,
      favorite: true,
    };
    expect(withoutLockedFilters("scene", filters, ["tags"])).toEqual({
      favorite: true,
    });
    expect(withoutLockedFilters("scene", filters, [])).toBe(filters);
    expect(withoutLockedFilters("scene", filters, ["performers"])).toBe(
      filters
    );
  });

  it("a locked `tags` field drops `tagIdsExclude` too", () => {
    // A tag page's Scenes tab never keeps a URL's or a preset's exclusion
    // beside its lock
    const filters = {
      tagIds: ["1:a"],
      tagIdsExclude: ["2:a"],
      tagIdsModifier: "INCLUDES",
      favorite: true,
    };
    expect(withoutLockedFilters("scene", filters, ["tags"])).toEqual({
      favorite: true,
    });
    expect(
      withoutLockedFilters("scene", { tagIdsExclude: ["2:a"] }, ["tags"])
    ).toEqual({});
  });

  it("withoutLockedOptions drops the option, and a section left empty", () => {
    const options = withoutLockedOptions("scene", SCENE_FILTER_OPTIONS, [
      "date",
    ]);
    expect(options.some((option) => option.key === "date")).toBe(false);
    expect(options.some((option) => option.key === "createdAt")).toBe(true);
    const headers = options.filter(
      (option) => option.type === "section-header"
    );
    for (const header of headers) {
      const next = options[options.indexOf(header) + 1];
      expect(next && next.type !== "section-header").toBe(true);
    }
  });
});

describe("a page change reuses its list's count (fetchListPage)", () => {
  const FIVE_MINUTES = 5 * 60 * 1000;
  type Request = {
    filter: Record<string, unknown>;
    performer_filter: Record<string, unknown>;
  };
  const request = (
    page: number,
    filter: Record<string, unknown> = {},
    performerFilter: Record<string, unknown> = {}
  ): Request => ({
    filter: {
      page,
      per_page: 24,
      q: "",
      sort: "name",
      direction: "ASC",
      ...filter,
    },
    performer_filter: performerFilter,
  });

  let sent: Request[];
  let total: number;
  /** The server: counts unless asked not to */
  const server = (sentRequest: Request) => {
    sent.push(sentRequest);
    return Promise.resolve({
      findPerformers: {
        count: sentRequest.filter.count === false ? null : total,
        performers: [],
      },
    });
  };
  const newClient = () =>
    new QueryClient({
      defaultOptions: { queries: { staleTime: FIVE_MINUTES, retry: false } },
    });
  type Page = { findPerformers: { count: number } };
  const load = async (
    client: QueryClient,
    listRequest: Request
  ): Promise<Page> => {
    const data = await client.fetchQuery({
      queryKey: queryKeys.performers.list(undefined, listRequest),
      queryFn: (context) =>
        fetchListPage(
          context,
          listRequest,
          libraryListTotal("findPerformers"),
          server
        ),
    });
    return data as Page;
  };
  const countAsked = (index: number) =>
    must(sent[index]).filter.count !== false;

  let client: QueryClient;
  beforeEach(() => {
    sent = [];
    total = 60;
    client = newClient();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("page 2 of the same list sends count false and shows page 1's total", async () => {
    await load(client, request(1));
    total = 59;
    const page2 = await load(client, request(2));

    expect(countAsked(0)).toBe(true);
    expect(must(sent[1]).filter).toEqual({
      ...request(2).filter,
      count: false,
    });
    expect(page2.findPerformers.count).toBe(60);
    // Page 3 reuses the count page 1's request took, too
    expect((await load(client, request(3))).findPerformers.count).toBe(60);
    expect(countAsked(2)).toBe(false);
  });

  it.each([
    ["a filter change", request(2, {}, { favorite: { value: true } })],
    ["a search", request(2, { q: "anna" })],
    ["a sort change", request(2, { sort: "scenes_count" })],
    ["a direction change", request(2, { direction: "DESC" })],
    ["a per page change", request(2, { per_page: 48 })],
  ])("%s asks for the count again", async (_change, changed) => {
    await load(client, request(1));
    total = 12;
    const next = await load(client, changed);

    expect(countAsked(1)).toBe(true);
    expect(next.findPerformers.count).toBe(12);
  });

  it.each([
    ["a hide, a restore or Restore All", invalidateExclusionDependents],
    ["an instance change", invalidateInstanceQueries],
  ])("after %s, the next page asks for the count", async (_what, change) => {
    await load(client, request(1));
    await change(client);
    total = 59;
    const page2 = await load(client, request(2));

    expect(countAsked(1)).toBe(true);
    expect(page2.findPerformers.count).toBe(59);
    // The fresh count is the one the next page reuses
    expect((await load(client, request(3))).findPerformers.count).toBe(59);
    expect(countAsked(2)).toBe(false);
  });

  it("a reload on page 3 asks for the count", async () => {
    await load(client, request(1));
    const reloaded = newClient();
    await load(reloaded, request(3));

    expect(countAsked(1)).toBe(true);
  });

  it("a count older than the cache's stale time is asked for again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await load(client, request(1));
    vi.setSystemTime(Date.now() + FIVE_MINUTES + 1);
    total = 70;
    const page2 = await load(client, request(2));

    expect(countAsked(1)).toBe(true);
    expect(page2.findPerformers.count).toBe(70);
  });

  it("a clip page change sends filter.count false and fills total and totalPages", async () => {
    const clipSent: Record<string, unknown>[] = [];
    const filterOf = (clipRequest: Record<string, unknown>) =>
      clipRequest.filter as Record<string, unknown>;
    const clipServer = (clipRequest: Record<string, unknown>) => {
      clipSent.push(clipRequest);
      const counted = filterOf(clipRequest).count !== false;
      return Promise.resolve({
        clips: [],
        total: counted ? 50 : null,
        page: filterOf(clipRequest).page,
        perPage: 24,
        totalPages: counted ? 3 : null,
      });
    };
    const loadClips = (page: number) => {
      const clipRequest = {
        filter: { page, per_page: 24, sort: "title" },
        clip_filter: { is_generated: true },
      };
      return client.fetchQuery({
        queryKey: queryKeys.clips.list(clipRequest),
        queryFn: (context) =>
          fetchListPage(context, clipRequest, clipListTotal, clipServer),
      });
    };

    await loadClips(1);
    const page2 = await loadClips(2);

    expect(filterOf(must(clipSent[0])).count).toBeUndefined();
    expect(filterOf(must(clipSent[1])).count).toBe(false);
    expect(page2).toMatchObject({ total: 50, totalPages: 3, page: 2 });
  });
});
