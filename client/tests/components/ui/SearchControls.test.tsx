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

// The chips name their picks through the entity's /minimal endpoint
vi.mock("../../../src/api/library", () => ({
  libraryApi: {
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
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

    it("renders the controls and the results area at once while the presets load; no request goes out", async () => {
      vi.mocked(apiModule.apiGet).mockImplementation(
        () => new Promise(() => {})
      );
      const { onQueryChange } = renderSearchControls(
        { children: <div>result cards</div> },
        { presets: "pending" }
      );

      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
      expect(screen.queryByText("Loading filters...")).not.toBeInTheDocument();
      // The page's own skeleton shows here, so the children render
      expect(screen.getByText("result cards")).toBeInTheDocument();
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

  describe("Toggles and Cancel", () => {
    const filtersButton = () =>
      screen.getByRole("button", { name: /^Filters/ });

    it("a collapsed section is a button with aria-expanded inside its heading", async () => {
      const user = userEvent.setup();
      renderSearchControls();
      await user.click(filtersButton());

      const toggle = await screen.findByRole("button", {
        name: "Date Ranges",
        expanded: false,
      });
      expect(toggle.closest("h3")).not.toBeNull();

      toggle.focus();
      await user.keyboard("{Enter}");
      expect(
        screen.getByRole("button", { name: "Date Ranges", expanded: true })
      ).toBeInTheDocument();
    });

    it("the Search & Filter header is a button with aria-expanded", async () => {
      const user = userEvent.setup();
      renderSearchControls();

      const header = screen.getByRole("button", {
        name: "Search & Filter",
        expanded: true,
      });
      expect(header.closest("h3")).not.toBeNull();
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();

      header.focus();
      await user.keyboard("{Enter}");
      expect(
        screen.getByRole("button", { name: "Search & Filter", expanded: false })
      ).toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    });

    it("Cancel discards the edits: reopened, the panel shows the applied filters", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?favorite=true" });
      await firstQuery(list.onQueryChange);

      await user.click(filtersButton());
      const favorite = () =>
        document.getElementById("filter-favorite") as HTMLSelectElement;
      expect(favorite()).toHaveDisplayValue("Yes");
      await user.selectOptions(favorite(), "No");
      expect(favorite()).toHaveDisplayValue("No");

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText("Apply Filters")).not.toBeInTheDocument();
      await user.click(filtersButton());

      expect(favorite()).toHaveDisplayValue("Yes");
      expect(list.params().get("favorite")).toBe("true");
    });

    it("after Apply or Cancel, focus is on the Filters button", async () => {
      const user = userEvent.setup();
      renderSearchControls();

      await user.click(filtersButton());
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(filtersButton()).toHaveFocus();

      await user.click(filtersButton());
      await user.click(screen.getByRole("button", { name: "Apply Filters" }));
      expect(filtersButton()).toHaveFocus();
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

    const tagsControl = () =>
      must(
        screen.getByText("Tags", { selector: "label" }).parentElement,
        "the Tags control"
      );

    it("ticking Include sub-tags keeps the condition", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?tagIds=1:a" });
      await firstQuery(list.onQueryChange);

      await user.click(
        must(screen.getByText("Filters").closest("button"), "Filters button")
      );
      const modifier = must(
        within(tagsControl()).getAllByRole("combobox")[0],
        "the modifier"
      );
      await user.selectOptions(modifier, "EXCLUDES");
      await user.click(
        within(tagsControl()).getByRole("checkbox", {
          name: /Include sub-tags/,
        })
      );

      const after = within(tagsControl()).getAllByRole("combobox")[0];
      expect(after).toBeEnabled();
      expect(after).toHaveValue("EXCLUDES");
      expect(after).toHaveDisplayValue("Has NONE of these");

      await user.click(
        must(screen.getByText("Apply Filters").closest("button"))
      );
      await waitFor(() =>
        expect(list.lastQuery().scene_filter).toEqual({
          tags: { value: ["1:a"], modifier: "EXCLUDES", depth: -1 },
        })
      );
    });

    it("a URL with depth -1 and Has ALL shows Has ALL", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls(
        {},
        {
          url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES_ALL&tagIdsDepth=-1",
        }
      );
      expect((await firstQuery(list.onQueryChange)).scene_filter).toEqual({
        tags: { value: ["1:a"], modifier: "INCLUDES_ALL", depth: -1 },
      });

      await user.click(
        must(screen.getByText("Filters").closest("button"), "Filters button")
      );
      const modifier = within(tagsControl()).getAllByRole("combobox")[0];
      expect(modifier).toHaveValue("INCLUDES_ALL");
      expect(modifier).toHaveDisplayValue("Has ALL of these");
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
      // Three states: Yes, No and Any (Any is what an untouched panel holds)
      expect(within(favorite).getByRole("combobox")).toHaveDisplayValue("Any");
      await user.selectOptions(within(favorite).getByRole("combobox"), "Yes");
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

    it("favourite No sends false, and Any sends nothing and leaves the URL", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?favorite=true" });
      await firstQuery(list.onQueryChange);

      await user.click(must(screen.getByText("Filters").closest("button")));
      const favorite = screen.getByRole("combobox", {
        name: "Favorite Scenes",
      });
      await user.selectOptions(favorite, "No");
      await user.click(
        must(screen.getByText("Apply Filters").closest("button"))
      );
      await waitFor(() =>
        expect(list.lastQuery().scene_filter).toEqual({ favorite: false })
      );
      expect(list.params().get("favorite")).toBe("false");

      await user.click(must(screen.getByText("Filters").closest("button")));
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Favorite Scenes" }),
        "Any"
      );
      await user.click(
        must(screen.getByText("Apply Filters").closest("button"))
      );
      await waitFor(() => expect(list.lastQuery().scene_filter).toEqual({}));
      expect(list.params().has("favorite")).toBe(false);
    });

    it("Orientation is a box for each value, and several send a list", async () => {
      const user = userEvent.setup();
      // A link stored while Orientation took one value
      const list = renderSearchControls(
        {},
        { url: "/scenes?orientation=LANDSCAPE" }
      );
      await firstQuery(list.onQueryChange);

      await user.click(must(screen.getByText("Filters").closest("button")));
      await user.click(
        screen.getByRole("button", { name: "Video Properties" })
      );
      const group = screen.getByRole("group", { name: "Orientation" });
      expect(
        within(group).getByRole("checkbox", { name: /Landscape$/ })
      ).toBeChecked();
      await user.click(within(group).getByRole("checkbox", { name: "Square" }));
      await user.click(
        must(screen.getByText("Apply Filters").closest("button"))
      );

      await waitFor(() =>
        expect(list.lastQuery().scene_filter).toEqual({
          orientation: { value: ["LANDSCAPE", "SQUARE"] },
        })
      );
      expect(list.params().get("orientation")).toBe("LANDSCAPE,SQUARE");
    });

    it('the default Performers preset `{ gender: "FEMALE" }` shows Female checked and sends it as a list', async () => {
      const user = userEvent.setup();
      const list = renderSearchControls(
        { artifactType: "performer" },
        {
          url: "/performers",
          presets: {
            presets: {
              performer: [preset({ filters: { gender: "FEMALE" } })],
            },
            defaults: { performer: "p1" },
          },
        }
      );
      expect((await firstQuery(list.onQueryChange)).performer_filter).toEqual({
        gender: { value: ["FEMALE"], modifier: "INCLUDES" },
      });

      await user.click(must(screen.getByText("Filters").closest("button")));
      const group = screen.getByRole("group", { name: "Gender" });
      expect(
        within(group).getByRole("checkbox", { name: "Female" })
      ).toBeChecked();
      expect(
        within(group).getByRole("checkbox", { name: "Male" })
      ).not.toBeChecked();
      await user.click(within(group).getByRole("checkbox", { name: "Male" }));
      await user.selectOptions(
        screen.getByRole("combobox", { name: "Gender condition" }),
        "Is NONE of these"
      );
      await user.click(
        must(screen.getByText("Apply Filters").closest("button"))
      );

      await waitFor(() =>
        expect(list.lastQuery().performer_filter).toEqual({
          gender: { value: ["MALE", "FEMALE"], modifier: "EXCLUDES" },
        })
      );
    });

    it("choosing Not rated hides the bounds and sends IS_NULL", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?rating_min=40" });
      expect((await firstQuery(list.onQueryChange)).scene_filter).toEqual({
        rating100: { modifier: "BETWEEN", value: 40 },
      });

      await user.click(must(screen.getByText("Filters").closest("button")));
      const rating = must(
        screen.getByText("Rating (0-100)", { selector: "label" }).parentElement,
        "the Rating control"
      );
      expect(within(rating).getAllByRole("spinbutton")).toHaveLength(2);
      const condition = within(rating).getByRole("combobox", {
        name: "Rating (0-100) condition",
      });
      expect(condition).toHaveDisplayValue("Between");

      await user.selectOptions(condition, "Not rated");
      expect(within(rating).queryAllByRole("spinbutton")).toHaveLength(0);
      await user.selectOptions(condition, "Between");
      expect(within(rating).getAllByRole("spinbutton")).toHaveLength(2);
      await user.selectOptions(condition, "Not rated");
      await user.click(
        must(screen.getByText("Apply Filters").closest("button"))
      );

      await waitFor(() =>
        expect(list.lastQuery().scene_filter).toEqual({
          rating100: { modifier: "IS_NULL" },
        })
      );
      expect(list.params().get("ratingModifier")).toBe("IS_NULL");
      expect(list.params().has("rating_min")).toBe(false);
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

    it("the badge counts one per filter, as the chips do", async () => {
      const list = renderSearchControls(
        {},
        {
          url: "/scenes?tagIds=1:a,2:a&tagIdsModifier=INCLUDES_ALL&tagIdsDepth=-1&favorite=true",
        }
      );
      await firstQuery(list.onQueryChange);

      expect(
        screen.getAllByRole("button", { name: /^Remove filter:/ })
      ).toHaveLength(2);
      const filters = must(screen.getByText("Filters").closest("button"));
      expect(within(filters).getByText("2")).toBeInTheDocument();
    });

    it("excludes with no includes count 1 in the badge and draw one chip", async () => {
      const list = renderSearchControls(
        {},
        { url: "/scenes?tagIdsExclude=2:a" }
      );

      expect((await firstQuery(list.onQueryChange)).scene_filter).toEqual({
        tags: { value: [], excludes: ["2:a"], modifier: "INCLUDES_ALL" },
      });
      expect(
        screen.getAllByRole("button", { name: /^Remove filter:/ })
      ).toHaveLength(1);
      const filters = must(screen.getByText("Filters").closest("button"));
      expect(within(filters).getByText("1")).toBeInTheDocument();
    });

    it("Has none hides the picker, counts 1 and draws one chip", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls({}, { url: "/scenes?groupIds=1:a" });
      await firstQuery(list.onQueryChange);

      await user.click(must(screen.getByText("Filters").closest("button")));
      const collections = must(
        screen.getByText("Collections", { selector: "label" }).parentElement,
        "the Collections control"
      );
      expect(
        within(collections).getByRole("button", { name: /^Collections/ })
      ).toBeInTheDocument();
      const condition = within(collections).getByRole("combobox", {
        name: "Collections condition",
      });
      await user.selectOptions(condition, "In none");
      expect(
        within(collections).queryByRole("button", { name: /^Collections/ })
      ).toBeNull();
      await user.click(
        must(screen.getByText("Apply Filters").closest("button"))
      );

      await waitFor(() =>
        expect(list.lastQuery().scene_filter).toEqual({
          groups: { modifier: "IS_NULL" },
        })
      );
      expect(list.params().get("groupIdsModifier")).toBe("IS_NULL");
      expect(list.params().has("groupIds")).toBe(false);
      const chips = await screen.findAllByRole("button", {
        name: /^Remove filter:/,
      });
      expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
        "Remove filter: Collections: in none",
      ]);
      const filters = must(screen.getByText("Filters").closest("button"));
      expect(within(filters).getByText("1")).toBeInTheDocument();
    });

    it("activating a chip opens its field and moves focus to the field's first control", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls(
        {},
        { url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES&favorite=true" }
      );
      await firstQuery(list.onQueryChange);

      await user.click(
        screen.getByRole("button", { name: /^Edit filter: Fav/ })
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(
          document.getElementById("filter-favorite")
        )
      );
      expect(document.activeElement?.tagName).toBe("SELECT");

      await user.click(
        screen.getByRole("button", { name: /^Edit filter: Tags/ })
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(
          document.getElementById("filter-tagIds")
        )
      );
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

  describe("Preset table columns", () => {
    const COLUMNS = {
      visible: ["title", "rating"],
      order: ["rating", "title"],
    };
    const withColumns = {
      presets: { scene: [preset({ tableColumns: COLUMNS })] },
      defaults: { scene: "p1" },
    };

    it("a default preset with columns does not change the table's columns on a visit", async () => {
      const onPresetColumns = vi.fn();
      const list = renderSearchControls(
        { onPresetColumns },
        { presets: withColumns }
      );
      await firstQuery(list.onQueryChange);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onPresetColumns).not.toHaveBeenCalled();
    });

    it("loading that preset from the menu shows its columns", async () => {
      const user = userEvent.setup();
      const onPresetColumns = vi.fn();
      const list = renderSearchControls(
        { onPresetColumns },
        { presets: withColumns }
      );
      await firstQuery(list.onQueryChange);

      await user.click(screen.getByTitle("Load Preset"));
      await user.click(await screen.findByText("Default"));

      expect(onPresetColumns).toHaveBeenCalledTimes(1);
      expect(onPresetColumns).toHaveBeenCalledWith(COLUMNS);
    });
  });

  describe("Sort Controls", () => {
    it("the sort select and the direction button are named", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls();
      await firstQuery(list.onQueryChange);

      expect(screen.getByRole("combobox", { name: "Sort by" })).toBe(
        sortSelect()
      );
      const direction = screen.getByRole("button", {
        name: "Sort direction: descending",
      });

      await user.click(direction);

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Sort direction: ascending" })
        ).toBeInTheDocument()
      );
    });

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

    it("Clear All moves focus to the Filters button", async () => {
      const user = userEvent.setup();
      renderSearchControls({}, { url: "/scenes?favorite=true" });
      const filtersButton = () =>
        screen.getByRole("button", { name: /^Filters/ });

      await user.click(filtersButton());
      await user.click(
        must((await screen.findByText("Clear All")).closest("button"))
      );

      expect(screen.queryByText("Clear All")).not.toBeInTheDocument();
      expect(filtersButton()).toHaveFocus();
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

describe("SearchControls text condition (F22b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("the text condition select is named `<label> condition` and reaches the request", async () => {
    const user = userEvent.setup();
    const list = renderSearchControls({}, { url: "/scenes?path=/media" });
    expect((await firstQuery(list.onQueryChange)).scene_filter).toEqual({
      path: { value: "/media", modifier: "INCLUDES" },
    });

    await user.click(must(screen.getByText("Filters").closest("button")));
    await user.click(screen.getByRole("button", { name: "Other Filters" }));
    const path = must(
      screen.getByText("Path", { selector: "label" }).parentElement,
      "the Path control"
    );
    const condition = within(path).getByRole("combobox", {
      name: "Path condition",
    });
    expect(condition).toHaveDisplayValue("Contains");
    expect(
      [...condition.querySelectorAll("option")].map((each) => each.text)
    ).toEqual(["Contains", "Excludes", "Equals", "Starts with"]);
    await user.selectOptions(condition, "Starts with");
    await user.click(must(screen.getByText("Apply Filters").closest("button")));

    await waitFor(() =>
      expect(list.lastQuery().scene_filter).toEqual({
        path: { value: "/media", modifier: "STARTS_WITH" },
      })
    );
    expect(list.params().get("pathModifier")).toBe("STARTS_WITH");
    expect(
      await screen.findByRole("button", {
        name: "Remove filter: Path: starts with /media",
      })
    ).toBeInTheDocument();
  });
});
