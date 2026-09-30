/**
 * A tag page's Include sub-tags toggle: every tab's filter field (the tags
 * of a scene, gallery, image, performer, studio and collection) takes a
 * depth in the shared contract, so each tab sends depth -1 while it is on.
 */
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as hooksModule from "@/api/hooks";
import TagDetail from "@/components/pages/TagDetail";
import type * as uiModule from "@/components/ui/index";

interface GridProps {
  lockedFilters?: Record<string, Record<string, unknown>>;
}
interface SceneSearchProps {
  permanentFilters?: Record<string, unknown>;
}

interface CountsQuery {
  data: { counts: Record<string, number> } | undefined;
  error?: Error | null;
  refetch?: () => void;
}

const { findImages, grids, relationCounts, sceneSearch } = vi.hoisted(() => ({
  findImages: vi.fn<(params: Record<string, unknown>) => Promise<unknown>>(),
  relationCounts:
    vi.fn<
      (
        type: string,
        id: string | undefined,
        instanceId: string | undefined,
        options?: Record<string, boolean>
      ) => CountsQuery
    >(),
  grids: {
    GalleryGrid: vi.fn<(props: GridProps) => null>(() => null),
    GroupGrid: vi.fn<(props: GridProps) => null>(() => null),
    PerformerGrid: vi.fn<(props: GridProps) => null>(() => null),
    StudioGrid: vi.fn<(props: GridProps) => null>(() => null),
  },
  sceneSearch: vi.fn<(props: SceneSearchProps) => null>(() => null),
}));

const tag = {
  id: "5",
  instanceId: "inst-a",
  name: "Parent Tag",
  scene_count: 3,
  gallery_count: 2,
  image_count: 4,
  performer_count: 2,
  studio_count: 2,
  group_count: 1,
  children: [{ id: "6", name: "Sub Tag", instanceId: "inst-a" }],
};

vi.mock("@/api", () => ({
  libraryApi: {
    findImages,
    findTagById: vi.fn(),
    updateRating: vi.fn(),
    updateFavorite: vi.fn(),
  },
}));
vi.mock("@/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof hooksModule>()),
  useRelationCounts: relationCounts,
}));
vi.mock("@/hooks/useEntityLookup", () => ({
  useEntityLookup: () => ({ status: "found", entity: tag, retry: vi.fn() }),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useNavigationState", () => ({
  useNavigationState: () => ({ goBack: vi.fn(), backButtonText: "Back" }),
}));
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: true }),
}));
vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({ getSettings: () => ({}) }),
}));
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));
vi.mock("@/components/grids/index", () => grids);
vi.mock("@/components/scene-search/SceneSearch", () => ({
  default: sceneSearch,
}));
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof uiModule>()),
  PaginatedImageGrid: () => null,
}));

const ALL_COUNTS = {
  scenes: 3,
  galleries: 2,
  images: 4,
  performers: 2,
  studios: 2,
  groups: 1,
};

function renderPage(search: string) {
  return renderAt(`/tag/5?instance=inst-a&${search}`);
}

const CurrentSearch = () => (
  <output data-testid="search">{useLocation().search}</output>
);

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/tag/:tagId" element={<TagDetail />} />
      </Routes>
      <CurrentSearch />
    </MemoryRouter>
  );
}

/** The tag criterion a tab sends: its grid's lock, the scene search's, or the image request's */
async function sentCriterion(tab: string): Promise<unknown> {
  const lock = (grid: keyof typeof grids, filterKey: string) =>
    must(grids[grid].mock.lastCall, `${grid}'s props`)[0].lockedFilters?.[
      filterKey
    ]?.tags;
  switch (tab) {
    case "scenes":
      return must(sceneSearch.mock.lastCall, "SceneSearch's props")[0]
        .permanentFilters?.tags;
    case "images":
      await waitFor(() => expect(findImages).toHaveBeenCalled());
      return (
        must(findImages.mock.lastCall, "the image request")[0]
          .image_filter as Record<string, unknown>
      ).tags;
    case "galleries":
      return lock("GalleryGrid", "gallery_filter");
    case "performers":
      return lock("PerformerGrid", "performer_filter");
    case "studios":
      return lock("StudioGrid", "studio_filter");
    case "groups":
      return lock("GroupGrid", "group_filter");
    default:
      throw new Error(`No tab ${tab}`);
  }
}

const toggle = () =>
  screen.queryByRole("checkbox", { name: /Include sub-tags/ });

const TABS = [
  "scenes",
  "galleries",
  "images",
  "performers",
  "studios",
  "groups",
];

describe("TagDetail: Include sub-tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findImages.mockResolvedValue({ findImages: { images: [], count: 0 } });
    relationCounts.mockReturnValue({ data: { counts: ALL_COUNTS } });
  });

  it.each(TABS)(
    "the %s tab shows the toggle and sends depth -1 when it is on",
    async (tab) => {
      renderPage(`tab=${tab}&includeSubTags=true`);

      expect(toggle()).toBeChecked();
      expect(await sentCriterion(tab)).toEqual({
        value: ["5:inst-a"],
        modifier: "INCLUDES",
        depth: -1,
      });
    }
  );

  it.each(TABS)(
    "the %s tab sends no depth when the toggle is off",
    async (tab) => {
      renderPage(`tab=${tab}`);

      expect(toggle()).not.toBeChecked();
      expect(await sentCriterion(tab)).toEqual({
        value: ["5:inst-a"],
        modifier: "INCLUDES",
      });
    }
  );

  it("ticking the toggle on the Performers tab sends depth -1", async () => {
    renderPage("tab=performers");

    fireEvent.click(must(toggle(), "the Include sub-tags toggle"));

    expect(await sentCriterion("performers")).toEqual({
      value: ["5:inst-a"],
      modifier: "INCLUDES",
      depth: -1,
    });
  });
});

describe("TagDetail: counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findImages.mockResolvedValue({ findImages: { images: [], count: 0 } });
  });

  const tabButton = (label: string) =>
    screen.queryByRole("button", { name: new RegExp(`^${label}\\b`) });

  it("tab badges and the default tab follow the counts", () => {
    relationCounts.mockReturnValue({
      data: {
        counts: {
          scenes: 0,
          galleries: 3,
          images: 0,
          performers: 2,
          studios: 0,
          groups: 1,
        },
      },
    });
    renderPage("");

    expect(relationCounts).toHaveBeenLastCalledWith("tag", "5", "inst-a", {
      includeSubTags: false,
    });
    // The first tab with content opens; empty tabs are hidden
    expect(tabButton("Galleries")).toHaveTextContent("Galleries3");
    expect(tabButton("Galleries")).toHaveAttribute("aria-current", "page");
    expect(tabButton("Performers")).toHaveTextContent("Performers2");
    expect(tabButton("Collections")).toHaveTextContent("Collections1");
    expect(tabButton("Scenes")).toBeNull();
    expect(tabButton("Images")).toBeNull();
    expect(grids.GalleryGrid).toHaveBeenCalled();
    expect(sceneSearch).not.toHaveBeenCalled();
    // The statistics show the same numbers
    const stats = must(
      screen.getByText("Statistics").parentElement,
      "the statistics card"
    );
    expect(stats).toHaveTextContent("Galleries:3");
    expect(stats).toHaveTextContent("Performers:2");
  });

  it("while the counts load, every tab shows without a badge and none opens", () => {
    relationCounts.mockReturnValue({ data: undefined });
    renderPage("");

    expect(tabButton("Scenes")).toHaveTextContent(/^Scenes$/);
    expect(tabButton("Galleries")).toHaveTextContent(/^Galleries$/);
    expect(sceneSearch).not.toHaveBeenCalled();
    expect(grids.GalleryGrid).not.toHaveBeenCalled();
    expect(screen.queryByText("This tag has no content in Peek")).toBeNull();
  });

  it("when the counts fail, the tabs stay with the error and a Retry that asks again", () => {
    const refetch = vi.fn();
    relationCounts.mockReturnValue({
      data: undefined,
      error: new Error("Counts are down"),
      refetch,
    });
    renderPage("");

    expect(screen.getByRole("alert")).toHaveTextContent("Counts are down");
    expect(tabButton("Scenes")).toHaveTextContent(/^Scenes$/);
    expect(sceneSearch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("a counts failure after the counts were shown leaves the page as it is", () => {
    relationCounts.mockReturnValue({
      data: { counts: ALL_COUNTS },
      error: new Error("Refresh failed"),
    });
    renderPage("");

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a tag with nothing to show says so once the counts answer", () => {
    relationCounts.mockReturnValue({
      data: {
        counts: {
          scenes: 0,
          galleries: 0,
          images: 0,
          performers: 0,
          studios: 0,
          groups: 0,
        },
      },
    });
    renderPage("");

    expect(screen.getByText("This tag has no content in Peek")).toBeVisible();
  });

  it("a bare-id link counts and filters on the tag's own server", () => {
    relationCounts.mockReturnValue({ data: { counts: ALL_COUNTS } });
    renderAt("/tag/5?includeSubTags=true");

    expect(relationCounts).toHaveBeenLastCalledWith("tag", "5", "inst-a", {
      includeSubTags: true,
    });
    expect(
      must(sceneSearch.mock.lastCall, "SceneSearch's props")[0].permanentFilters
        ?.tags
    ).toEqual({ value: ["5:inst-a"], modifier: "INCLUDES", depth: -1 });
  });
});

describe("TagDetail: a statistic starts its tab clean", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findImages.mockResolvedValue({ findImages: { images: [], count: 0 } });
    relationCounts.mockReturnValue({ data: { counts: ALL_COUNTS } });
  });

  const search = () =>
    Object.fromEntries(
      new URLSearchParams(screen.getByTestId("search").textContent ?? "")
    );

  /** The button of a statistic in the Statistics card */
  const stat = (label: string) =>
    must(
      screen.getByText(label).parentElement?.querySelector("button"),
      `the ${label} statistic`
    );

  it("the Images statistic opens the Images tab at page 1 when the scenes list was on page 7", () => {
    renderPage("page=7&sort=title&favorite=true&includeSubTags=true");

    fireEvent.click(stat("Images:"));

    expect(search()).toEqual({
      instance: "inst-a",
      includeSubTags: "true",
      tab: "images",
    });
  });

  it("ticking Include sub-tags on page 5 shows page 1", () => {
    renderPage("tab=performers&page=5");

    fireEvent.click(must(toggle(), "the Include sub-tags toggle"));

    expect(search()).toEqual({
      instance: "inst-a",
      tab: "performers",
      includeSubTags: "true",
    });
  });

  it("with no scenes, the Scenes statistic's default tab is the first tab with content", () => {
    relationCounts.mockReturnValue({
      data: { counts: { ...ALL_COUNTS, scenes: 0 } },
    });
    renderPage("tab=images&page=2");

    // Galleries is the first tab with content: switching to it drops `tab`
    fireEvent.click(stat("Galleries:"));

    expect(search().tab).toBeUndefined();
  });
});
