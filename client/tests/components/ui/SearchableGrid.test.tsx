import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouterWithQuery as MemoryRouter } from "@tests/helpers/MemoryRouterWithQuery";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchableGrid from "../../../src/components/ui/SearchableGrid";

type Find = (params: Record<string, unknown>) => Promise<unknown>;

const { api } = vi.hoisted(() => ({
  api: {
    findPerformers: vi.fn<Find>(),
    findGalleries: vi.fn<Find>(),
    findStudios: vi.fn<Find>(),
    findGroups: vi.fn<Find>(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));
vi.mock("@/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "metric" }),
}));
vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: () => ({}),
    updateSettings: vi.fn(),
    isLoading: false,
  }),
}));
// The list hooks read the library module; the pickers and presets the barrel
vi.mock("@/api/library", () => ({ libraryApi: api }));
vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({ presets: {}, defaults: {} }),
  apiPost: vi.fn().mockResolvedValue({}),
  libraryApi: {
    ...api,
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
    findStudiosMinimal: vi.fn().mockResolvedValue([]),
    findTagsMinimal: vi.fn().mockResolvedValue([]),
    findGroupsMinimal: vi.fn().mockResolvedValue([]),
    findGalleriesMinimal: vi.fn().mockResolvedValue([]),
  },
}));

describe("SearchableGrid", () => {
  it("is defined as a component", () => {
    expect(SearchableGrid).toBeDefined();
    expect(typeof SearchableGrid).toBe("function");
  });

  it("has correct display name", () => {
    expect(SearchableGrid.name).toBe("SearchableGrid");
  });
});

/** A detail page's tab lock: the page's studio or tag, with its sub-items */
const LOCK = { value: ["7:inst-a"], modifier: "INCLUDES", depth: -1 };

/** A detail tab of each grid kind: its lock and a filter set in its panel (in the URL) */
const TABS = [
  {
    tab: "a tag's Performers tab",
    entityType: "performer",
    find: "findPerformers",
    filterKey: "performer_filter",
    panel: "?gender=FEMALE",
    fromPanel: { gender: { value: "FEMALE", modifier: "EQUALS" } },
    locked: { tags: LOCK },
  },
  {
    tab: "a studio's Galleries tab",
    entityType: "gallery",
    find: "findGalleries",
    filterKey: "gallery_filter",
    panel: "?favorite=true",
    fromPanel: { favorite: true },
    locked: { studios: LOCK },
  },
  {
    tab: "a tag's Studios tab",
    entityType: "studio",
    find: "findStudios",
    filterKey: "studio_filter",
    panel: "?favorite=true",
    fromPanel: { favorite: true },
    locked: { tags: LOCK },
  },
  {
    tab: "a studio's Collections tab",
    entityType: "group",
    find: "findGroups",
    filterKey: "group_filter",
    panel: "?name=Summer",
    fromPanel: { name: { value: "Summer", modifier: "INCLUDES" } },
    locked: { studios: LOCK },
  },
] as const;

describe("SearchableGrid lockedFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.findPerformers.mockResolvedValue({
      findPerformers: { count: 0, performers: [] },
    });
    api.findGalleries.mockResolvedValue({
      findGalleries: { count: 0, galleries: [] },
    });
    api.findStudios.mockResolvedValue({
      findStudios: { count: 0, studios: [] },
    });
    api.findGroups.mockResolvedValue({ findGroups: { count: 0, groups: [] } });
  });

  /** The filter the grid's list request carried */
  async function sentFilter(
    find: keyof typeof api,
    filterKey: string
  ): Promise<unknown> {
    await waitFor(() => expect(api[find]).toHaveBeenCalled());
    return must(api[find].mock.lastCall, `the ${find} request`)[0][filterKey];
  }

  it.each(TABS)(
    "$tab: a panel filter and the lock both reach the request",
    async ({ entityType, find, filterKey, panel, fromPanel, locked }) => {
      render(
        <MemoryRouter initialEntries={[`/tab${panel}`]}>
          <SearchableGrid
            entityType={entityType}
            lockedFilters={{ [filterKey]: locked }}
            hideLockedFilters
            renderItem={() => null}
          />
        </MemoryRouter>
      );

      expect(await sentFilter(find, filterKey)).toEqual({
        ...fromPanel,
        ...locked,
      });
    }
  );

  it("the lock wins over the panel's criterion of the same field", async () => {
    render(
      <MemoryRouter initialEntries={["/tab?tagIds=9:inst-b"]}>
        <SearchableGrid
          entityType="performer"
          lockedFilters={{ performer_filter: { tags: LOCK } }}
          hideLockedFilters
          renderItem={() => null}
        />
      </MemoryRouter>
    );

    expect(await sentFilter("findPerformers", "performer_filter")).toEqual({
      tags: LOCK,
    });
  });
});

type Row = { id: string; instanceId: string; name: string };

/** A performer list response: these rows, and the list's total */
const performers = (rows: readonly Row[], count: number) => ({
  findPerformers: { count, performers: rows },
});

/** Rows named `<prefix>-<n>` on inst-a */
const rowsOf = (prefix: string, n = 2): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    instanceId: "inst-a",
    name: `${prefix}-${i}`,
  }));

/** A response the test answers when it chooses */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** The page each findPerformers call asked for */
const requestedPages = () =>
  api.findPerformers.mock.calls.map(
    (call) => (call[0].filter as { page: number }).page
  );

/** A tag's Performers tab whose cards show their name and a Hide button */
function renderTab() {
  return render(
    <MemoryRouter initialEntries={["/tab"]}>
      <SearchableGrid
        entityType="performer"
        lockedFilters={{ performer_filter: { tags: LOCK } }}
        hideLockedFilters
        renderItem={(item, _index, { onHideSuccess }) => {
          const row = item as Row;
          return (
            <div key={`${row.id}:${row.instanceId}`}>
              <span>{row.name}</span>
              <button
                type="button"
                onClick={() =>
                  onHideSuccess(row.id, "performer", row.instanceId)
                }
              >
                Hide {row.name}
              </button>
            </div>
          );
        }}
      />
    </MemoryRouter>
  );
}

const nextButtons = () => screen.getAllByRole("button", { name: "Next Page" });

describe("SearchableGrid results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.findPerformers.mockReset();
  });

  it("a slower first response never replaces a later one", async () => {
    const page2 = deferred<unknown>();
    const page3 = deferred<unknown>();
    api.findPerformers
      .mockResolvedValueOnce(performers(rowsOf("p1"), 75))
      .mockImplementationOnce(() => page2.promise)
      .mockImplementationOnce(() => page3.promise);
    renderTab();
    await screen.findByText("p1-0");

    fireEvent.click(must(nextButtons()[0], "the top Next button"));
    await waitFor(() => expect(requestedPages()).toEqual([1, 2]));
    fireEvent.click(must(nextButtons()[0], "the top Next button"));
    await waitFor(() => expect(requestedPages()).toEqual([1, 2, 3]));

    // Page 3 answers first, then the slower page 2
    await act(async () => {
      page3.resolve(performers(rowsOf("p3"), 75));
      await page3.promise;
    });
    await screen.findByText("p3-0");
    await act(async () => {
      page2.resolve(performers(rowsOf("p2"), 75));
      await page2.promise;
    });

    expect(screen.getByText("p3-0")).toBeInTheDocument();
    expect(screen.queryByText("p2-0")).not.toBeInTheDocument();
  });

  it("renders one pagination bar above and one below the grid, both working", async () => {
    api.findPerformers.mockImplementation((params) =>
      Promise.resolve(
        performers(rowsOf(`p${(params.filter as { page: number }).page}`), 75)
      )
    );
    renderTab();
    await screen.findByText("p1-0");

    expect(nextButtons()).toHaveLength(2);

    // The bar below the grid
    fireEvent.click(must(nextButtons()[1], "the bottom Next button"));
    await screen.findByText("p2-0");
    // The bar above it
    fireEvent.click(must(nextButtons()[0], "the top Next button"));
    await screen.findByText("p3-0");
    expect(requestedPages()).toEqual([1, 2, 3]);
    expect(nextButtons()).toHaveLength(2);
  });

  it("a failed page shows the error with Retry, and Retry refetches", async () => {
    api.findPerformers
      .mockRejectedValueOnce(new Error("The library did not answer"))
      .mockResolvedValue(performers(rowsOf("p1"), 2));
    renderTab();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The library did not answer"
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByText("p1-0");
    expect(api.findPerformers).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("hiding a card removes it from the list and lowers the count", async () => {
    // The same id on two servers: only the hidden one's row goes
    api.findPerformers.mockResolvedValue(
      performers(
        [
          { id: "1", instanceId: "inst-a", name: "Ada" },
          { id: "1", instanceId: "inst-b", name: "Bea" },
          { id: "2", instanceId: "inst-a", name: "Cy" },
        ],
        3
      )
    );
    renderTab();
    await screen.findByText("Ada");
    // Both bars show the count
    expect(screen.getAllByText("Showing 1-3 of 3 records")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Hide Ada" }));

    await waitFor(() =>
      expect(screen.queryByText("Ada")).not.toBeInTheDocument()
    );
    expect(screen.getByText("Bea")).toBeInTheDocument();
    expect(screen.getByText("Cy")).toBeInTheDocument();
    expect(screen.getAllByText("Showing 1-2 of 2 records")).toHaveLength(2);
  });
});
