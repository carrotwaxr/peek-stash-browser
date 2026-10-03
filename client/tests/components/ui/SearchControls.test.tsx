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
  cleanup,
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
import { pinsAnswer } from "@tests/helpers/filterPins";
import { matchMediaQueries } from "@tests/helpers/matchMedia";
import { sentFilter } from "@tests/helpers/sentFilter";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiModule from "../../../src/api";
import {
  defaultPresetsQueryOptions,
  presetsQueryOptions,
} from "../../../src/api/hooks/usePresets";
import { queryKeys } from "../../../src/api/queryKeys";
import { SHEET_QUERY } from "../../../src/hooks/useFilterSurface";
import type { ListView } from "../../../src/hooks/useListUrlState";
import {
  WALL_VIEW_SETTINGS,
  useWallPlayback,
} from "../../../src/hooks/useWallPlayback";

let tvMode = false;
vi.mock("../../../src/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: tvMode }),
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
  queryClient.setQueryData(queryKeys.user.filterPins(), pinsAnswer());
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
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return {
    container,
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

const addFilter = () => screen.getByRole("button", { name: "Add filter" });

/** The open chip editor */
const editor = () => screen.getByRole("dialog", { name: / filter$/ });

/** Opens the editor of the chip whose text starts with `text` */
async function openChip(text: string) {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: new RegExp(`^Edit filter: ${text}`),
    })
  );
  return { user, editor: editor() };
}

/** Opens + Filter and picks the field named `label` */
async function addField(label: string) {
  const user = userEvent.setup();
  await user.click(addFilter());
  await user.click(
    within(screen.getByRole("listbox")).getByRole("option", { name: label })
  );
  return { user, editor: editor() };
}

/** Whether + Filter offers the field named `label` (the menu is open) */
const offers = (label: string) =>
  within(screen.getByRole("listbox")).queryByRole("option", {
    name: label,
  }) !== null;

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
    it("renders search input, sort control, and + Filter", () => {
      renderSearchControls();

      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
      expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
      expect(addFilter()).toBeInTheDocument();
    });

    it("no Filters button, no panel and no Search & Filter header on desktop", async () => {
      const list = renderSearchControls({}, { url: "/scenes?favorite=true" });
      await firstQuery(list.onQueryChange);

      expect(
        screen.queryByRole("button", { name: /^Filters/ })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Search & Filter" })
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Search & Filter")).not.toBeInTheDocument();
      expect(screen.queryByText("Apply Filters")).not.toBeInTheDocument();
      expect(screen.queryByText("Common Filters")).not.toBeInTheDocument();
      // The filters show as chips, and + Filter adds one
      expect(
        screen.getByRole("button", {
          name: "Edit filter: Favorite Scenes: Yes",
        })
      ).toBeInTheDocument();
      expect(addFilter()).toBeInTheDocument();
    });

    it("the sort, direction and search keep their `data-tv-search-item` names", () => {
      const { container } = renderSearchControls({
        viewModes: [
          { id: "grid", label: "Grid view" },
          { id: "wall", label: "Wall view" },
        ],
      });
      const item = (name: string) =>
        container.querySelector(`[data-tv-search-item="${name}"]`);

      expect(item("search-input")).toContainElement(
        screen.getByPlaceholderText(/search/i)
      );
      expect(item("sort-control")).toContainElement(
        screen.getByRole("combobox", { name: "Sort by" })
      );
      expect(item("sort-direction")).toContainElement(
        screen.getByRole("button", { name: /^Sort direction/ })
      );
      expect(item("add-filter")).toContainElement(addFilter());
      expect(item("view-mode")).not.toBeNull();
      expect(item("context-settings")).not.toBeNull();
      expect(item("filters-button")).toBeNull();
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

  describe("Chip editor conditions", () => {
    it("an untouched Performers modifier reads Has ANY, the modifier the request carries", async () => {
      const { onQueryChange } = renderSearchControls(
        {},
        { url: "/scenes?performerIds=7:server-a" }
      );

      expect(
        sentFilter(await firstQuery(onQueryChange), "scene_filter")
      ).toEqual({
        performers: { value: ["7:server-a"], modifier: "INCLUDES" },
      });

      const { editor } = await openChip("Performers");
      const modifier = within(editor).getByRole("combobox", {
        name: "Performers condition",
      });
      expect(modifier).toHaveValue("INCLUDES");
      expect(modifier).toHaveDisplayValue("Has ANY of these");
    });

    const tagsCondition = () =>
      within(editor()).getByRole("combobox", { name: "Tags condition" });

    it("Include sub-tags keeps the condition", async () => {
      const list = renderSearchControls({}, { url: "/scenes?tagIds=1:a" });
      await firstQuery(list.onQueryChange);

      const { user } = await openChip("Tags");
      await user.selectOptions(tagsCondition(), "EXCLUDES");
      await user.click(
        within(editor()).getByRole("checkbox", { name: /Include sub-tags/ })
      );

      expect(tagsCondition()).toBeEnabled();
      expect(tagsCondition()).toHaveValue("EXCLUDES");
      expect(tagsCondition()).toHaveDisplayValue("Has NONE of these");
      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
          tags: { value: ["1:a"], modifier: "EXCLUDES", depth: -1 },
        })
      );
    });

    it("a URL with depth -1 and Has ALL shows Has ALL", async () => {
      const list = renderSearchControls(
        {},
        {
          url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES_ALL&tagIdsDepth=-1",
        }
      );
      expect(
        sentFilter(await firstQuery(list.onQueryChange), "scene_filter")
      ).toEqual({
        tags: { value: ["1:a"], modifier: "INCLUDES_ALL", depth: -1 },
      });

      await openChip("Tags");
      expect(tagsCondition()).toHaveValue("INCLUDES_ALL");
      expect(tagsCondition()).toHaveDisplayValue("Has ALL of these");
    });
  });

  describe("Fields the page fixes", () => {
    const openMenu = async () => {
      const user = userEvent.setup();
      await user.click(addFilter());
    };

    const PERFORMER = { value: ["1:abc"], modifier: "INCLUDES" };
    const TAG = { value: ["5:abc"], modifier: "INCLUDES", depth: 0 };
    const PERIOD = { start: "2024-01-01", end: "2024-01-31" };
    /** The timeline's period as `date`, the open folder as `tags`: the view's own */
    const viewFilters = ({ viewMode, folderPath }: ListView) =>
      viewMode === "timeline"
        ? { date: PERIOD }
        : viewMode === "folder" && folderPath.length > 0
          ? { tags: { ...TAG, value: folderPath.slice(-1) } }
          : {};
    const VIEWS = [
      { id: "grid", label: "Grid view" },
      { id: "timeline", label: "Timeline view" },
      { id: "folder", label: "Folder view" },
    ];

    it("on a performer's Scenes tab + Filter offers Performers too (FILTERS-12)", async () => {
      const list = renderSearchControls(
        {
          context: "scene_performer",
          permanentFilters: { performers: PERFORMER },
        },
        { url: "/performer/1" }
      );
      await firstQuery(list.onQueryChange);

      await openMenu();

      expect(offers("Performers")).toBe(true);
      expect(offers("Tags")).toBe(true);
    });

    it("a performerIds param in that URL goes in where, the page's performer in the filter object", async () => {
      const list = renderSearchControls(
        {
          context: "scene_performer",
          permanentFilters: { performers: PERFORMER },
        },
        {
          url: "/performer/1?performerIds=9:abc&performerIdsModifier=EXCLUDES",
        }
      );

      const query = await firstQuery(list.onQueryChange);
      expect(query.scene_filter).toEqual({ performers: PERFORMER });
      expect(query.where).toEqual({
        match: "all",
        rules: [
          {
            field: "performers",
            criterion: { value: ["9:abc"], modifier: "EXCLUDES" },
          },
        ],
      });
    });

    it("on a tag's Performers tab + Filter offers Tags too", async () => {
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

      await openMenu();

      expect(offers("Tags")).toBe(true);
      expect(offers("Gender")).toBe(true);
    });

    it("a tag page's Scenes tab offers Tags; the timeline view does not offer Date", async () => {
      const list = renderSearchControls(
        {
          context: "scene_tag",
          permanentFilters: { tags: TAG },
          viewFilters,
          viewModes: VIEWS,
        },
        { url: "/tag/5?view=timeline" }
      );
      const query = await firstQuery(list.onQueryChange);
      expect(query.scene_filter).toMatchObject({ tags: TAG });

      await openMenu();
      expect(offers("Tags")).toBe(true);
      expect(offers("Created Date")).toBe(true);
      expect(offers("Scene Date")).toBe(false);
    });

    it("inside a folder + Filter offers no Tags picker", async () => {
      const list = renderSearchControls(
        { viewFilters, viewModes: VIEWS },
        { url: "/scenes?view=folder&folderPath=5:abc" }
      );
      expect((await firstQuery(list.onQueryChange)).scene_filter).toEqual({
        tags: TAG,
      });

      await openMenu();

      expect(offers("Tags")).toBe(false);
      expect(offers("Performers")).toBe(true);
    });
  });

  describe("Filter Application", () => {
    it("a chip edit resets the page to 1, with one history entry", async () => {
      const list = renderSearchControls(
        {},
        { url: "/scenes?page=3&favorite=true" }
      );
      expect((await firstQuery(list.onQueryChange)).filter.page).toBe(3);

      const { user, editor } = await openChip("Favorite Scenes");
      await user.selectOptions(
        within(editor).getByRole("combobox", { name: "Favorite Scenes" }),
        "No"
      );

      await waitFor(() => expect(list.lastQuery().filter.page).toBe(1));
      expect(list.actions).toEqual(["PUSH"]);
    });

    it("a filter added from + Filter reaches the request at once, with one history entry", async () => {
      const list = renderSearchControls();
      await firstQuery(list.onQueryChange);

      const { user, editor } = await addField("Favorite Scenes");
      const favorite = within(editor).getByRole("combobox", {
        name: "Favorite Scenes",
      });
      // Three states: Yes, No and Any (Any is what an unset field holds)
      expect(favorite).toHaveDisplayValue("Any");
      expect(list.onQueryChange).toHaveBeenCalledTimes(1);
      await user.selectOptions(favorite, "Yes");

      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
          favorite: true,
        })
      );
      expect(list.params().get("favorite")).toBe("true");
      expect(list.actions).toEqual(["PUSH"]);
    });

    it("favorite No sends false, and Any sends nothing and leaves the URL", async () => {
      const list = renderSearchControls({}, { url: "/scenes?favorite=true" });
      await firstQuery(list.onQueryChange);

      const { user, editor } = await openChip("Favorite Scenes");
      const favorite = () =>
        within(editor).getByRole("combobox", { name: "Favorite Scenes" });
      await user.selectOptions(favorite(), "No");
      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
          favorite: false,
        })
      );
      expect(list.params().get("favorite")).toBe("false");

      await user.selectOptions(favorite(), "Any");
      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({})
      );
      expect(list.params().has("favorite")).toBe(false);
    });

    it("Orientation is a box for each value, and several send a list", async () => {
      // A link stored while Orientation took one value
      const list = renderSearchControls(
        {},
        { url: "/scenes?orientation=LANDSCAPE" }
      );
      await firstQuery(list.onQueryChange);

      const { user, editor } = await openChip("Orientation");
      const group = within(editor).getByRole("group", { name: "Orientation" });
      expect(
        within(group).getByRole("checkbox", { name: /Landscape$/ })
      ).toBeChecked();
      await user.click(within(group).getByRole("checkbox", { name: "Square" }));

      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
          orientation: { value: ["LANDSCAPE", "SQUARE"] },
        })
      );
      expect(list.params().get("orientation")).toBe("LANDSCAPE,SQUARE");
    });

    it('the default Performers preset `{ gender: "FEMALE" }` shows Female checked and sends it as a list', async () => {
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
      expect(
        sentFilter(await firstQuery(list.onQueryChange), "performer_filter")
      ).toEqual({
        gender: { value: ["FEMALE"], modifier: "INCLUDES" },
      });

      const { user, editor } = await openChip("Gender");
      const group = within(editor).getByRole("group", { name: "Gender" });
      expect(
        within(group).getByRole("checkbox", { name: "Female" })
      ).toBeChecked();
      expect(
        within(group).getByRole("checkbox", { name: "Male" })
      ).not.toBeChecked();
      await user.click(within(group).getByRole("checkbox", { name: "Male" }));
      await user.selectOptions(
        within(editor).getByRole("combobox", { name: "Gender condition" }),
        "Is NONE of these"
      );

      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "performer_filter")).toEqual({
          gender: { value: ["MALE", "FEMALE"], modifier: "EXCLUDES" },
        })
      );
    });

    it("choosing Not rated hides the bounds and sends IS_NULL", async () => {
      const list = renderSearchControls({}, { url: "/scenes?rating_min=40" });
      expect(
        sentFilter(await firstQuery(list.onQueryChange), "scene_filter")
      ).toEqual({
        rating100: { modifier: "BETWEEN", value: 40 },
      });

      const { user, editor } = await openChip("Rating");
      expect(within(editor).getAllByRole("spinbutton")).toHaveLength(2);
      const condition = within(editor).getByRole("combobox", {
        name: "Rating (0-100) condition",
      });
      expect(condition).toHaveDisplayValue("Between");

      await user.selectOptions(condition, "Not rated");
      expect(within(editor).queryAllByRole("spinbutton")).toHaveLength(0);
      await user.selectOptions(condition, "Between");
      expect(within(editor).getAllByRole("spinbutton")).toHaveLength(2);
      await user.selectOptions(condition, "Not rated");

      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
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

      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({})
      );
      expect(list.params().has("favorite")).toBe(false);
    });

    it("removing a chip moves focus to the next chip, else the previous, else + Filter", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls(
        {},
        { url: "/scenes?favorite=true&organized=true&rating_min=60" }
      );
      await firstQuery(list.onQueryChange);
      const removeButtons = () =>
        screen.getAllByRole("button", { name: /^Remove filter:/ });
      const [first, second, third] = removeButtons();

      // The first chip's removal lands on the chip after it
      await user.click(must(first, "the first chip"));
      await waitFor(() => expect(removeButtons()).toHaveLength(2));
      expect(second).toHaveFocus();

      // The last chip's removal lands on the chip before it
      await user.click(must(third, "the last chip"));
      await waitFor(() => expect(removeButtons()).toHaveLength(1));
      expect(second).toHaveFocus();

      // The only chip's removal lands on + Filter
      await user.click(must(second, "the only chip"));
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: /^Remove filter:/ })
        ).not.toBeInTheDocument()
      );
      expect(addFilter()).toHaveFocus();
    });

    it("excludes with no includes draw one chip", async () => {
      const list = renderSearchControls(
        {},
        { url: "/scenes?tagIdsExclude=2:a" }
      );

      expect(
        sentFilter(await firstQuery(list.onQueryChange), "scene_filter")
      ).toEqual({
        tags: { value: [], excludes: ["2:a"], modifier: "INCLUDES_ALL" },
      });
      expect(
        screen.getAllByRole("button", { name: /^Remove filter:/ })
      ).toHaveLength(1);
    });

    it("Has none hides the picker and draws one chip", async () => {
      const list = renderSearchControls({}, { url: "/scenes?groupIds=1:a" });
      await firstQuery(list.onQueryChange);

      const { user, editor } = await openChip("Collections");
      expect(
        within(editor).getByRole("button", { name: /^Collections/ })
      ).toBeInTheDocument();
      const condition = within(editor).getByRole("combobox", {
        name: "Collections condition",
      });
      await user.selectOptions(condition, "In none");
      expect(
        within(editor).queryByRole("button", { name: /^Collections/ })
      ).toBeNull();

      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
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
    });

    it("activating a chip opens its editor under it, focus on the field's first control; another chip's closes it", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls(
        {},
        { url: "/scenes?tagIds=1:a&tagIdsModifier=INCLUDES&favorite=true" }
      );
      await firstQuery(list.onQueryChange);

      await user.click(
        screen.getByRole("button", { name: /^Edit filter: Fav/ })
      );
      const favorite = screen.getByRole("dialog", {
        name: "Favorite Scenes filter",
      });
      expect(document.activeElement?.tagName).toBe("SELECT");
      expect(favorite).toContainElement(document.activeElement as HTMLElement);

      await user.click(
        screen.getByRole("button", { name: /^Edit filter: Tags/ })
      );
      expect(
        screen.queryByRole("dialog", { name: "Favorite Scenes filter" })
      ).not.toBeInTheDocument();
      const tags = screen.getByRole("dialog", { name: "Tags filter" });
      // A picker opens its list at once, focus in its search box
      await waitFor(() =>
        expect(
          within(tags).getByPlaceholderText("Type to search...")
        ).toHaveFocus()
      );
    });

    it("a filter added inside a folder keeps the folder's permanent tag", async () => {
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

      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Open folder" }));
      const { user, editor } = await addField("Favorite Scenes");
      await user.selectOptions(
        within(editor).getByRole("combobox", { name: "Favorite Scenes" }),
        "Yes"
      );

      await waitFor(() => expect(list.lastQuery().filter.page).toBe(1));
      expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
        tags: FOLDER_TAG,
        favorite: true,
      });
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
      expect(sentFilter(first, "scene_filter")).toEqual({
        performers: { value: ["1:abc"], modifier: "INCLUDES" },
      });

      await user.click(
        must(screen.getAllByRole("button", { name: "Next Page" }).at(-1))
      );

      await waitFor(() => expect(list.lastQuery().filter.page).toBe(2));
      expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
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

    it("loading that preset from the Views menu shows its columns", async () => {
      const user = userEvent.setup();
      const onPresetColumns = vi.fn();
      const list = renderSearchControls(
        { onPresetColumns },
        { presets: withColumns }
      );
      await firstQuery(list.onQueryChange);

      await user.click(screen.getByRole("button", { name: /^Views/ }));
      await user.click(
        await screen.findByRole("menuitemradio", { name: /^Default/ })
      );

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

      it("is offered beside a collection filter set in the chip bar", async () => {
        vi.mocked(apiModule.libraryApi.findGroupsMinimal).mockResolvedValue([
          { id: "7", instanceId: "inst", name: "Series" },
        ]);
        const list = renderSearchControls();
        await firstQuery(list.onQueryChange);
        expect(sortValues()).not.toContain("scene_index");

        const { user, editor } = await addField("Collections");
        await user.click(
          await within(editor).findByRole("button", { name: /^Series/ })
        );

        await waitFor(() => expect(sortValues()).toContain("scene_index"));
        expect(list.params().get("groupIds")).toBe("7:inst");
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

  describe("Clear all", () => {
    it("shows in the chip bar only while filters are set", async () => {
      const list = renderSearchControls({}, { url: "/scenes?favorite=true" });
      await firstQuery(list.onQueryChange);
      expect(
        screen.getByRole("button", { name: "Clear all" })
      ).toBeInTheDocument();

      await userEvent
        .setup()
        .click(
          screen.getByRole("button", { name: /^Remove filter: Favorite/ })
        );

      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Clear all" })
        ).not.toBeInTheDocument()
      );
    });

    it("Clear all asks for the unfiltered list and moves focus to + Filter", async () => {
      const user = userEvent.setup();
      const list = renderSearchControls(
        {},
        { url: "/scenes?favorite=true&tagIds=1:a&2.tagIds=2:a" }
      );
      expect(
        sentFilter(await firstQuery(list.onQueryChange), "scene_filter")
      ).toMatchObject({
        favorite: true,
      });

      await user.click(screen.getByRole("button", { name: "Clear all" }));

      await waitFor(() =>
        expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({})
      );
      expect(list.params().has("favorite")).toBe(false);
      expect(list.params().has("2.tagIds")).toBe(false);
      expect(list.actions).toEqual(["PUSH"]);
      expect(addFilter()).toHaveFocus();
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
            : path === "/user/filter-pins"
              ? pinsAnswer()
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
    expect(
      sentFilter(await firstQuery(list.onQueryChange), "scene_filter")
    ).toEqual({
      path: { value: "/media", modifier: "INCLUDES" },
    });

    await user.click(
      screen.getByRole("button", { name: /^Edit filter: Path/ })
    );
    const condition = within(editor()).getByRole("combobox", {
      name: "Path condition",
    });
    expect(condition).toHaveDisplayValue("Contains");
    expect(
      [...condition.querySelectorAll("option")].map((each) => each.text)
    ).toEqual(["Contains", "Excludes", "Equals", "Starts with"]);
    await user.selectOptions(condition, "Starts with");

    await waitFor(() =>
      expect(sentFilter(list.lastQuery(), "scene_filter")).toEqual({
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

describe("keys", () => {
  const searchBox = () => screen.getByPlaceholderText("Search...");
  const findFilter = () =>
    screen.queryByRole("combobox", { name: "Find a filter" });
  let restore: (() => void) | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiModule.apiGet).mockImplementation(() =>
      Promise.resolve({ presets: {}, defaults: {} })
    );
  });

  afterEach(() => {
    tvMode = false;
    restore?.();
    restore = null;
  });

  /** The list's controls beside another text field, as on a page */
  const WithField = (props: ListControlsProps) => (
    <>
      <input type="text" aria-label="Another field" />
      <ListControls {...props} />
    </>
  );

  it("`/` focuses the search box from the list (not while typing in a field)", async () => {
    const user = userEvent.setup();
    const list = renderSearchControls({}, { element: WithField });
    await firstQuery(list.onQueryChange);

    // From the sort direction button: focus moves, nothing is typed
    screen.getByRole("button", { name: /^Sort direction/ }).focus();
    await user.keyboard("/");
    expect(searchBox()).toHaveFocus();
    expect(searchBox()).toHaveValue("");

    // In a text field the key is the field's
    const field = screen.getByRole("textbox", { name: "Another field" });
    await user.click(field);
    await user.keyboard("a/b");
    expect(field).toHaveFocus();
    expect(field).toHaveValue("a/b");
  });

  it("`/` also answers where it takes Shift (a German keyboard's Shift+7)", async () => {
    const list = renderSearchControls();
    await firstQuery(list.onQueryChange);
    const from = screen.getByRole("button", { name: /^Sort direction/ });
    from.focus();

    fireEvent.keyDown(from, { key: "/", code: "Digit7", shiftKey: true });

    expect(searchBox()).toHaveFocus();
  });

  it("on a desktop a focused select keeps its letters (typeahead): `f` and `/` do nothing there", async () => {
    const user = userEvent.setup();
    const WithSelect = (props: ListControlsProps) => (
      <>
        <select aria-label="A select">
          <option>First</option>
          <option>Fourth</option>
        </select>
        <ListControls {...props} />
      </>
    );
    const list = renderSearchControls({}, { element: WithSelect });
    await firstQuery(list.onQueryChange);

    screen.getByRole("combobox", { name: "A select" }).focus();
    await user.keyboard("f");
    await user.keyboard("/");
    expect(findFilter()).not.toBeInTheDocument();
    expect(searchBox()).not.toHaveFocus();
    expect(screen.getByRole("combobox", { name: "A select" })).toHaveFocus();
  });

  it("`f` opens + Filter on desktop and the sheet on phone and TV", async () => {
    const user = userEvent.setup();
    const pressF = async () => {
      const list = renderSearchControls();
      await firstQuery(list.onQueryChange);
      screen.getByRole("button", { name: /^Sort direction/ }).focus();
      await user.keyboard("f");
    };

    // A desktop: the bar's + Filter menu, focus in its search box
    await pressF();
    expect(findFilter()).toHaveFocus();
    expect(
      screen.queryByRole("dialog", { name: "Filters" })
    ).not.toBeInTheDocument();
    cleanup();

    // A phone: the sheet at its field list
    restore = matchMediaQueries([SHEET_QUERY]);
    await pressF();
    let sheet = await screen.findByRole("dialog", { name: "Filters" });
    await waitFor(() =>
      expect(
        within(sheet).getByRole("combobox", { name: "Find a filter" })
      ).toHaveFocus()
    );
    cleanup();
    restore();
    restore = null;

    // TV mode: the sheet at its + Filter button
    tvMode = true;
    await pressF();
    sheet = await screen.findByRole("dialog", { name: "Filters" });
    await waitFor(() =>
      expect(
        within(sheet).getByRole("button", { name: "Add filter" })
      ).toHaveFocus()
    );
  });

  it("neither runs inside a dialog (overlay scope) or the player", async () => {
    const user = userEvent.setup();
    const WithPlayer = (props: ListControlsProps) => (
      <>
        <div className="video-js">
          <button type="button">Play</button>
        </div>
        <ListControls {...props} />
      </>
    );
    const list = renderSearchControls({}, { element: WithPlayer });
    await firstQuery(list.onQueryChange);

    // The player: its keys, not the list's
    screen.getByRole("button", { name: "Play" }).focus();
    await user.keyboard("/");
    await user.keyboard("f");
    expect(searchBox()).not.toHaveFocus();
    expect(findFilter()).not.toBeInTheDocument();

    // A dialog (the Advanced view, a Modal): no page key runs
    await user.click(screen.getByRole("button", { name: "Advanced" }));
    const dialog = await screen.findByRole("dialog");
    within(dialog).getAllByRole("button")[0]?.focus();
    await user.keyboard("/");
    await user.keyboard("f");
    expect(searchBox()).not.toHaveFocus();
    expect(findFilter()).not.toBeInTheDocument();
  });

  it("neither runs inside the View settings dropdown (a dialog that takes focus, as TV focus reads it) or an open menu", async () => {
    const user = userEvent.setup();
    const WithMenu = (props: ListControlsProps) => (
      <>
        <div role="menu" aria-label="A menu">
          <button type="button" role="menuitem">
            Item
          </button>
        </div>
        <ListControls {...props} />
      </>
    );
    // Signed in: the dropdown reads the user's settings
    vi.mocked(apiModule.apiGet).mockImplementation((path: string) =>
      Promise.resolve(
        path === "/user/settings"
          ? userSettingsResponse({})
          : path === "/user/filter-pins"
            ? pinsAnswer()
            : { presets: {}, defaults: {} }
      )
    );
    render(
      <SignedInWithQuery>
        <PlainMemoryRouter initialEntries={["/scenes"]}>
          <WithMenu artifactType="scene" totalPages={1} totalCount={1}>
            {null}
          </WithMenu>
        </PlainMemoryRouter>
      </SignedInWithQuery>
    );

    await user.click(
      await screen.findByRole("button", { name: "View settings" })
    );
    const settings = screen.getByRole("dialog", { name: "View settings" });
    const box = within(settings).getAllByRole("checkbox")[0];
    box?.focus();
    expect(settings).toContainElement(box ?? null);
    await user.keyboard("f");
    await user.keyboard("/");
    expect(findFilter()).not.toBeInTheDocument();
    expect(searchBox()).not.toHaveFocus();
    expect(settings).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("dialog", { name: "View settings" })
    ).not.toBeInTheDocument();

    screen.getByRole("menuitem", { name: "Item" }).focus();
    await user.keyboard("f");
    await user.keyboard("/");
    expect(findFilter()).not.toBeInTheDocument();
    expect(searchBox()).not.toHaveFocus();
  });

  it("`f` does nothing while the list is not filterable (the Tags hierarchy)", async () => {
    const user = userEvent.setup();
    const list = renderSearchControls(
      { artifactType: "tag", filterable: false },
      { url: "/tags" }
    );
    await firstQuery(list.onQueryChange);
    screen.getByRole("button", { name: /^Sort direction/ }).focus();
    await user.keyboard("f");
    expect(findFilter()).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Sort direction/ })
    ).toHaveFocus();
  });
});
