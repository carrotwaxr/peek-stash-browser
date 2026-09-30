/**
 * SearchControls on the URL state: every control writes the URL through
 * `useListUrlState`, and the page's query is derived from it, so Back and
 * Forward step through the list. The controls render as a list page holds
 * them (`ListControls`), seeded by URL, with the presets in the query cache;
 * each test asserts what the page is asked for and the URL.
 */
import { type ComponentType, useState } from "react";
import {
  MemoryRouter as PlainMemoryRouter,
  RouterProvider,
  createMemoryRouter,
} from "react-router-dom";
import type { FilterPreset } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ListControls,
  type ListControlsProps,
} from "@tests/helpers/ListControls";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../../../src/api";
import {
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "../../../src/api/hooks/usePresets";
import {
  WALL_VIEW_SETTINGS,
  useWallPlayback,
} from "../../../src/hooks/useWallPlayback";

vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));

vi.mock("../../../src/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "metric" }),
}));

vi.mock("../../../src/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({
      showCodeOnCard: true,
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    }),
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("../../../src/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn().mockResolvedValue({}),
  apiPut: vi.fn().mockResolvedValue({ success: true }),
  libraryApi: {
    findPerformers: vi
      .fn()
      .mockResolvedValue({ findPerformers: { count: 0, performers: [] } }),
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudios: vi
      .fn()
      .mockResolvedValue({ findStudios: { count: 0, studios: [] } }),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findTags: vi.fn().mockResolvedValue({ findTags: { count: 0, tags: [] } }),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findGroups: vi
      .fn()
      .mockResolvedValue({ findGroups: { count: 0, groups: [] } }),
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
    findGalleries: vi
      .fn()
      .mockResolvedValue({ findGalleries: { count: 0, galleries: [] } }),
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
}));

/** What the page is asked for: paging, sort and search, and the entity's filter */
interface SentQuery {
  filter: {
    page: number;
    per_page: number;
    q: string;
    sort: string;
    direction: string;
  };
  [filterKey: string]: unknown;
}

type OnQueryChange = (query: Record<string, unknown>) => void;

type Props = Partial<ListControlsProps>;

/** A default preset for a context, or "pending" for presets still loading */
type Presets =
  | {
      presets: Record<string, FilterPreset[]>;
      defaults: Record<string, string>;
    }
  | "pending";

const NO_PRESETS: Presets = { presets: {}, defaults: {} };

const preset = (fields: Partial<FilterPreset> = {}): FilterPreset => ({
  id: "p1",
  name: "Default",
  filters: {},
  sort: "rating",
  direction: "ASC",
  ...fields,
});

/**
 * Renders the list's controls (or `element(props)`, a page around them) at
 * `url`, recording each navigation's history action
 */
function renderSearchControls(
  props: Props = {},
  {
    url = "/scenes",
    presets = NO_PRESETS,
    element: Element,
  }: {
    url?: string;
    presets?: Presets;
    element?: ComponentType<ListControlsProps>;
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (presets !== "pending") {
    queryClient.setQueryData(presetsQueryOptions.queryKey, {
      presets: presets.presets,
    });
    queryClient.setQueryData(defaultPresetsQueryOptions.queryKey, {
      defaults: presets.defaults,
    });
  }
  const onQueryChange = vi.fn<OnQueryChange>();
  const merged: ListControlsProps = {
    artifactType: "scene",
    totalPages: 10,
    totalCount: 240,
    children: null,
    ...props,
    onQueryChange,
  };
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: Element ? (
          <Element {...merged} />
        ) : (
          <ListControls {...merged} />
        ),
      },
    ],
    { initialEntries: [url] }
  );
  const actions: string[] = [];
  let last = router.state.location;
  router.subscribe((next) => {
    if (next.location === last) return;
    last = next.location;
    actions.push(next.historyAction);
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return {
    onQueryChange,
    router,
    actions,
    params: () => new URLSearchParams(router.state.location.search),
    /** The last query the page was asked for */
    lastQuery: () =>
      must(
        onQueryChange.mock.lastCall,
        "a query sent to the page"
      )[0] as SentQuery,
  };
}

/** Waits for the page's first query */
async function firstQuery(
  onQueryChange: ReturnType<typeof vi.fn<OnQueryChange>>
): Promise<SentQuery> {
  await waitFor(() => expect(onQueryChange).toHaveBeenCalled());
  return must(onQueryChange.mock.calls[0], "the first query")[0] as SentQuery;
}

const sortSelect = () => must(screen.getAllByRole("combobox")[0], "sort");

const perPageSelect = () =>
  must(
    screen
      .getAllByRole("combobox")
      .filter((box) => box.id === "perPage")
      .at(-1),
    "per page"
  );

describe("SearchControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.apiGet).mockImplementation(() =>
      Promise.resolve({ presets: {}, defaults: {} })
    );
  });

  describe("Initial Rendering", () => {
    it("renders search input, sort control, and filters button", () => {
      renderSearchControls();

      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
      expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Filters")).toBeInTheDocument();
    });

    it("triggers initial query on mount", async () => {
      const { onQueryChange } = renderSearchControls();

      expect((await firstQuery(onQueryChange)).filter).toMatchObject({
        page: 1,
        per_page: 24,
        direction: "DESC",
      });
    });

    it("uses correct filter type for artifact type", async () => {
      const { onQueryChange } = renderSearchControls({
        artifactType: "performer",
      });

      const query = await firstQuery(onQueryChange);
      expect(query).toHaveProperty("performer_filter");
      expect(query).not.toHaveProperty("scene_filter");
    });

    it("renders the controls at once while the presets load; the results wait", async () => {
      vi.mocked(apiModule.apiGet).mockImplementation(
        () => new Promise(() => {})
      );
      const { onQueryChange } = renderSearchControls(
        { children: <div>result cards</div> },
        { presets: "pending" }
      );

      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
      expect(screen.queryByText("Loading filters...")).not.toBeInTheDocument();
      expect(screen.queryByText("result cards")).not.toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(onQueryChange).not.toHaveBeenCalled();
    });
  });

  describe("Back and Forward", () => {
    it("Back after Next reports page 1 to onQueryChange", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls();
      expect((await firstQuery(list.onQueryChange)).filter.page).toBe(1);

      await user.click(
        must(screen.getAllByRole("button", { name: "Next Page" }).at(-1))
      );
      await waitFor(() => expect(list.lastQuery().filter.page).toBe(2));
      expect(list.params().get("page")).toBe("2");

      await act(() => list.router.navigate(-1));
      await waitFor(() => expect(list.lastQuery().filter.page).toBe(1));
    });
  });

  describe("Filter Panel", () => {
    it("opens filter panel when Filters button is clicked", async () => {
      const user = userEvent.setup();
      renderSearchControls();

      await user.click(must(screen.getByText("Filters").closest("button")));

      expect(await screen.findByText("Apply Filters")).toBeInTheDocument();
    });

    it("closes filter panel when Apply Filters is clicked", async () => {
      const user = userEvent.setup();
      renderSearchControls();

      await user.click(must(screen.getByText("Filters").closest("button")));
      await user.click(
        must((await screen.findByText("Apply Filters")).closest("button"))
      );

      await waitFor(() => {
        expect(screen.queryByText("Apply Filters")).not.toBeInTheDocument();
      });
    });
  });

  describe("Modifier dropdowns", () => {
    it("an untouched Performers modifier reads Has ANY, the modifier the request carries", async () => {
      const user = userEvent.setup();
      const { onQueryChange } = renderSearchControls(
        {},
        { url: "/scenes?performerIds=7:server-a" }
      );

      expect((await firstQuery(onQueryChange)).scene_filter).toEqual({
        performers: { value: ["7:server-a"], modifier: "INCLUDES" },
      });

      await user.click(
        must(screen.getByText("Filters").closest("button"), "Filters button")
      );
      const performers = must(
        screen.getByText("Performers", { selector: "label" }).parentElement,
        "the Performers control"
      );
      const modifier = within(performers).getAllByRole("combobox")[0];
      expect(modifier).toHaveValue("INCLUDES");
      expect(modifier).toHaveDisplayValue("Has ANY of these");
    });
  });

  describe("Fields the page fixes", () => {
    const openPanel = async () => {
      const user = userEvent.setup();
      await user.click(
        must(screen.getByText("Filters").closest("button"), "Filters button")
      );
    };
    const offers = (label: string) =>
      screen.queryByText(label, { selector: "label" }) !== null;

    it("on a performer's Scenes tab the panel offers no Performers picker", async () => {
      const list = renderSearchControls(
        {
          context: "scene_performer",
          permanentFilters: {
            performers: { value: ["1:abc"], modifier: "INCLUDES" },
          },
        },
        { url: "/performer/1" }
      );
      await firstQuery(list.onQueryChange);

      await openPanel();

      expect(offers("Performers")).toBe(false);
      expect(offers("Tags")).toBe(true);
    });

    it("a performerIds param in that URL does not reach the request", async () => {
      const list = renderSearchControls(
        {
          context: "scene_performer",
          permanentFilters: {
            performers: { value: ["1:abc"], modifier: "INCLUDES" },
          },
        },
        {
          url: "/performer/1?performerIds=9:abc&performerIdsModifier=EXCLUDES",
        }
      );

      expect((await firstQuery(list.onQueryChange)).scene_filter).toEqual({
        performers: { value: ["1:abc"], modifier: "INCLUDES" },
      });
    });

    it("on a tag's Performers tab the panel offers no Tags picker", async () => {
      // SearchableGrid hands its locked filters over as they are: the
      // entity's own filter holds the fixed fields
      const list = renderSearchControls(
        {
          artifactType: "performer",
          context: "performer_tag",
          permanentFilters: {
            performer_filter: {
              tags: { value: ["5:abc"], modifier: "INCLUDES" },
            },
          },
        },
        { url: "/tag/5?tab=performers" }
      );
      await firstQuery(list.onQueryChange);

      await openPanel();

      expect(offers("Tags")).toBe(false);
      expect(offers("Gender")).toBe(true);
    });

    it("in the timeline view the panel offers no Date filter", async () => {
      const list = renderSearchControls(
        {
          permanentFilters: {
            date: { start: "2024-01-01", end: "2024-01-31" },
          },
        },
        { url: "/scenes?view=timeline" }
      );
      await firstQuery(list.onQueryChange);

      await openPanel();
      // The date filters sit in a collapsed section
      await userEvent.click(screen.getByText("Date Ranges"));

      expect(offers("Created Date")).toBe(true);
      expect(offers("Scene Date")).toBe(false);
    });

    it("inside a folder the panel offers no Tags picker", async () => {
      const list = renderSearchControls(
        {
          permanentFilters: {
            tags: { value: ["5:abc"], modifier: "INCLUDES", depth: 0 },
          },
        },
        { url: "/scenes?view=folder" }
      );
      await firstQuery(list.onQueryChange);

      await openPanel();

      expect(offers("Tags")).toBe(false);
      expect(offers("Performers")).toBe(true);
    });
  });

  describe("Filter Application", () => {
    it("Apply resets the page to 1", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?page=3" });
      expect((await firstQuery(list.onQueryChange)).filter.page).toBe(3);

      await user.click(must(screen.getByText("Filters").closest("button")));
      await user.click(
        must((await screen.findByText("Apply Filters")).closest("button"))
      );

      await waitFor(() => expect(list.lastQuery().filter.page).toBe(1));
      expect(list.actions).toEqual(["PUSH"]);
    });

    it("a filter set in the panel reaches the request on Apply, with one history entry", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls();
      await firstQuery(list.onQueryChange);

      await user.click(must(screen.getByText("Filters").closest("button")));
      const favorite = must(
        screen.getByText("Favorite Scenes", { selector: "label" })
          .parentElement,
        "the Favorite control"
      );
      await user.click(within(favorite).getByRole("checkbox"));
      expect(list.onQueryChange).toHaveBeenCalledTimes(1);
      await user.click(
        must(screen.getByText("Apply Filters").closest("button"))
      );

      await waitFor(() =>
        expect(list.lastQuery().scene_filter).toEqual({ favorite: true })
      );
      expect(list.params().get("favorite")).toBe("true");
      expect(list.actions).toEqual(["PUSH"]);
    });

    it("removing a chip asks for the list without its filter", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?favorite=true" });
      await firstQuery(list.onQueryChange);

      await user.click(
        screen.getByRole("button", { name: /^Remove filter: Favorite/ })
      );

      await waitFor(() => expect(list.lastQuery().scene_filter).toEqual({}));
      expect(list.params().has("favorite")).toBe(false);
    });

    it("Apply keeps a folder's permanent tag", async () => {
      const user = userEvent.setup();
      const FOLDER_TAG = { value: ["5:abc"], modifier: "INCLUDES", depth: 0 };
      /** A folder page: the folder opens after the list mounted */
      function FolderPage(props: ListControlsProps) {
        const [permanent, setPermanent] = useState<Record<string, unknown>>({});
        return (
          <>
            <button onClick={() => setPermanent({ tags: FOLDER_TAG })}>
              Open folder
            </button>
            <ListControls {...props} permanentFilters={permanent} />
          </>
        );
      }
      const list = renderSearchControls(
        {},
        { url: "/scenes?view=folder&page=2", element: FolderPage }
      );
      await firstQuery(list.onQueryChange);

      await user.click(screen.getByRole("button", { name: "Open folder" }));
      await user.click(must(screen.getByText("Filters").closest("button")));
      await user.click(
        must((await screen.findByText("Apply Filters")).closest("button"))
      );

      await waitFor(() => expect(list.lastQuery().filter.page).toBe(1));
      expect(list.lastQuery().scene_filter).toEqual({ tags: FOLDER_TAG });
    });
  });

  describe("Presets", () => {
    it("a preset naming performers does not replace the page's permanent performer", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls(
        {
          context: "scene_performer",
          permanentFilters: {
            performers: { value: ["1:abc"], modifier: "INCLUDES" },
          },
        },
        {
          url: "/performer/1",
          presets: {
            presets: {
              scene: [
                preset({
                  filters: {
                    performers: { value: ["9:abc"], modifier: "INCLUDES" },
                  },
                }),
              ],
            },
            defaults: { scene_performer: "p1" },
          },
        }
      );
      const first = await firstQuery(list.onQueryChange);
      expect(first.scene_filter).toEqual({
        performers: { value: ["1:abc"], modifier: "INCLUDES" },
      });

      await user.click(
        must(screen.getAllByRole("button", { name: "Next Page" }).at(-1))
      );

      await waitFor(() => expect(list.lastQuery().filter.page).toBe(2));
      expect(list.lastQuery().scene_filter).toEqual({
        performers: { value: ["1:abc"], modifier: "INCLUDES" },
      });
    });
  });

  describe("Sort Controls", () => {
    it("changes sort field when dropdown selection changes", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls();
      await firstQuery(list.onQueryChange);

      await user.selectOptions(sortSelect(), "rating");

      await waitFor(() => expect(list.lastQuery().filter.sort).toBe("rating"));
      expect(list.params().get("sort")).toBe("rating");
    });

    it("a sort change on /performer/1?tab=galleries&includeSubTags=true keeps both params", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls(
        { artifactType: "gallery", initialSort: "title" },
        { url: "/performer/1?tab=galleries&includeSubTags=true" }
      );
      await firstQuery(list.onQueryChange);

      await user.selectOptions(sortSelect(), "rating");

      await waitFor(() => expect(list.lastQuery().filter.sort).toBe("rating"));
      const params = list.params();
      expect(params.get("tab")).toBe("galleries");
      expect(params.get("includeSubTags")).toBe("true");
      expect(params.get("sort")).toBe("rating");
    });

    it("a sort change keeps the timeline period and its date filter", async () => {
      const user = userEvent.setup();
      const MARCH = { start: "2024-03-01", end: "2024-03-31" };
      /** A timeline page: the period's date filter arrives after the list mounted */
      function TimelinePage(props: ListControlsProps) {
        const [permanent, setPermanent] = useState<Record<string, unknown>>({});
        return (
          <>
            <button onClick={() => setPermanent({ date: MARCH })}>
              Pick March
            </button>
            <ListControls {...props} permanentFilters={permanent} />
          </>
        );
      }
      const list = renderSearchControls(
        {},
        {
          url: "/scenes?view=timeline&timeline_period=2024-03",
          element: TimelinePage,
        }
      );

      await firstQuery(list.onQueryChange);
      await user.click(screen.getByRole("button", { name: "Pick March" }));
      await waitFor(() =>
        expect(list.lastQuery()).toHaveProperty("scene_filter.date")
      );

      await user.selectOptions(sortSelect(), "rating");

      await waitFor(() => expect(list.lastQuery().filter.sort).toBe("rating"));
      expect(list.lastQuery()).toHaveProperty("scene_filter.date");
      expect(list.params().get("timeline_period")).toBe("2024-03");
    });

    describe("Scene Number", () => {
      const sortValues = () =>
        Array.from(sortSelect().querySelectorAll("option")).map(
          (option) => option.value
        );

      it("is not offered without a collection filter", () => {
        renderSearchControls();
        expect(sortValues()).not.toContain("scene_index");
      });

      it("is offered on the collection page, whose permanent filter is { value, modifier }", () => {
        renderSearchControls({
          permanentFilters: {
            groups: { value: ["7:inst"], modifier: "INCLUDES" },
          },
        });
        expect(sortValues()).toContain("scene_index");
      });

      it("is offered when the panel's collection filter includes", () => {
        renderSearchControls(
          {},
          { url: "/scenes?groupIds=7:inst&groupIdsModifier=INCLUDES" }
        );
        expect(sortValues()).toContain("scene_index");
      });

      it("is not offered when the collection filter excludes or is empty", () => {
        renderSearchControls(
          {},
          { url: "/scenes?groupIds=7:inst&groupIdsModifier=EXCLUDES" }
        );
        expect(sortValues()).not.toContain("scene_index");
      });
    });

    describe("a sort the list no longer offers", () => {
      it("Scene Number without a collection filter is reset to the default, and the query does not carry it", async () => {
        const { onQueryChange } = renderSearchControls(
          { initialSort: "created_at" },
          { url: "/scenes?sort=scene_index&dir=ASC" }
        );

        const query = await firstQuery(onQueryChange);
        expect(query.filter.sort).toBe("created_at");
        expect(query.filter.direction).toBe("ASC");
        expect(sortSelect()).toHaveValue("created_at");
      });

      it("Scene Number beside an including collection filter is kept", async () => {
        const { onQueryChange } = renderSearchControls(
          { initialSort: "created_at" },
          {
            url: "/scenes?sort=scene_index&dir=ASC&groupIds=7:inst&groupIdsModifier=INCLUDES",
          }
        );

        expect((await firstQuery(onQueryChange)).filter.sort).toBe(
          "scene_index"
        );
      });
    });

    it("generates random seed for random sort", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls();
      await firstQuery(list.onQueryChange);

      await user.selectOptions(sortSelect(), "random");

      await waitFor(() =>
        expect(list.lastQuery().filter.sort).toMatch(/^random_\d+$/)
      );
      expect(list.params().get("sort")).toBe(list.lastQuery().filter.sort);
    });
  });

  describe("Search Text", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("typing a search writes q once, 300 ms after the last key", async () => {
      vi.useFakeTimers();
      const list = renderSearchControls({}, { url: "/scenes?page=2" });
      const input = screen.getByPlaceholderText(/search/i);

      for (const text of ["t", "te", "test"]) {
        fireEvent.change(input, { target: { value: text } });
        await act(() => vi.advanceTimersByTimeAsync(100));
      }
      await act(() => vi.advanceTimersByTimeAsync(199));
      expect(list.params().has("q")).toBe(false);

      await act(() => vi.advanceTimersByTimeAsync(1));
      expect(list.params().get("q")).toBe("test");
      expect(list.params().has("page")).toBe(false);
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(list.actions).toEqual(["REPLACE"]);
      expect(list.lastQuery().filter).toMatchObject({ q: "test", page: 1 });
    });
  });

  describe("Pagination", () => {
    it("renders pagination controls when totalPages > 0", () => {
      renderSearchControls({ totalPages: 10, totalCount: 240 });

      expect(screen.getAllByText(/of 240/).length).toBeGreaterThanOrEqual(1);
    });

    it("changing per page adds no history entry", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?page=2" });
      await firstQuery(list.onQueryChange);

      await user.selectOptions(perPageSelect(), "48");

      await waitFor(() => expect(list.lastQuery().filter.per_page).toBe(48));
      expect(list.lastQuery().filter.page).toBe(1);
      expect(list.params().get("per_page")).toBe("48");
      expect(list.actions).toEqual(["REPLACE"]);
    });
  });

  describe("Different Artifact Types", () => {
    it("shows performer sort options for performer artifact type", () => {
      renderSearchControls({ artifactType: "performer" });

      const options = Array.from(sortSelect().querySelectorAll("option")).map(
        (option) => option.textContent
      );
      expect(options).toContain("Height");
    });

    it.each([
      { artifactType: "scene", expectedKey: "scene_filter" },
      { artifactType: "performer", expectedKey: "performer_filter" },
      { artifactType: "studio", expectedKey: "studio_filter" },
      { artifactType: "tag", expectedKey: "tag_filter" },
      { artifactType: "group", expectedKey: "group_filter" },
      { artifactType: "gallery", expectedKey: "gallery_filter" },
      { artifactType: "image", expectedKey: "image_filter" },
    ])(
      "builds $expectedKey for $artifactType",
      async ({ artifactType, expectedKey }) => {
        const { onQueryChange } = renderSearchControls({
          artifactType,
          totalPages: 1,
          totalCount: 10,
        });

        expect(await firstQuery(onQueryChange)).toHaveProperty(expectedKey);
      }
    );
  });

  describe("Clear Filters", () => {
    it("shows Clear All button when filters are active", async () => {
      const user = userEvent.setup();
      renderSearchControls({}, { url: "/scenes?favorite=true" });

      await user.click(must(screen.getByText("Filters").closest("button")));

      expect(await screen.findByText("Clear All")).toBeInTheDocument();
    });

    it("Clear All asks for the unfiltered list", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?favorite=true" });
      expect((await firstQuery(list.onQueryChange)).scene_filter).toEqual({
        favorite: true,
      });

      await user.click(must(screen.getByText("Filters").closest("button")));
      await user.click(
        must((await screen.findByText("Clear All")).closest("button"))
      );

      await waitFor(() => expect(list.lastQuery().scene_filter).toEqual({}));
      expect(list.params().has("favorite")).toBe(false);
    });
  });

  describe("Stale results", () => {
    it("dims the results and marks them busy while isRefreshing", () => {
      renderSearchControls({
        isRefreshing: true,
        children: <div>result cards</div>,
      });

      const results = screen.getByTestId("search-results");
      expect(results).toHaveTextContent("result cards");
      expect(results).toHaveAttribute("aria-busy", "true");
      expect(results.style.opacity).toBe("0.6");
    });

    it("shows the results at full opacity, not busy, otherwise", () => {
      renderSearchControls({ children: <div>result cards</div> });

      const results = screen.getByTestId("search-results");
      expect(results).not.toHaveAttribute("aria-busy");
      expect(results.style.opacity).toBe("1");
    });
  });

  describe("Wall playback", () => {
    /** What a list page hands its WallView: the user's wall playback. */
    function WallPlaybackProbe() {
      const { wallPlayback } = useWallPlayback();
      return <p data-testid="wall-playback">{wallPlayback}</p>;
    }

    it("the Preview Behavior saved in the wall cog reaches the page's WallView", async () => {
      vi.mocked(apiModule.apiGet).mockImplementation((path: string) =>
        Promise.resolve(
          path === "/user/settings"
            ? userSettingsResponse({ wallPlayback: "static" })
            : { presets: {}, defaults: {} }
        )
      );
      render(
        <SignedInWithQuery>
          <PlainMemoryRouter initialEntries={["/scenes?view=wall"]}>
            <ListControls
              artifactType="scene"
              totalPages={1}
              totalCount={1}
              viewModes={[
                { id: "grid", label: "Grid view" },
                { id: "wall", label: "Wall view" },
              ]}
              contextSettings={WALL_VIEW_SETTINGS}
            >
              <WallPlaybackProbe />
            </ListControls>
          </PlainMemoryRouter>
        </SignedInWithQuery>
      );
      await waitFor(() =>
        expect(screen.getByTestId("wall-playback")).toHaveTextContent("static")
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "View settings" }));
      const select = await screen.findByLabelText("Preview Behavior");
      expect(select).toHaveValue("static");
      await user.selectOptions(select, "hover");

      await waitFor(() =>
        expect(screen.getByTestId("wall-playback")).toHaveTextContent("hover")
      );
      expect(apiModule.apiPut).toHaveBeenCalledWith("/user/settings", {
        wallPlayback: "hover",
      });
    });
  });
});
