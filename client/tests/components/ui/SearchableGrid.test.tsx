import { render, waitFor } from "@testing-library/react";
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
vi.mock("@/components/ui/SearchResults", () => ({ default: () => null }));
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
