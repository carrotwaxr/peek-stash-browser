/**
 * A studio page's Include sub-studios toggle: every tab whose filter field
 * takes a depth in the shared contract (a scene's, gallery's, image's and
 * collection's studio) sends depth -1 while it is on; the Performers tab's
 * field takes none, so the toggle is hidden there.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudioDetail from "@/components/pages/StudioDetail";
import type * as uiModule from "@/components/ui/index";

interface GridProps {
  lockedFilters?: Record<string, Record<string, unknown>>;
}
interface SceneSearchProps {
  permanentFilters?: Record<string, unknown>;
}

const { findImages, grids, sceneSearch } = vi.hoisted(() => ({
  findImages: vi.fn<(params: Record<string, unknown>) => Promise<unknown>>(),
  grids: {
    GalleryGrid: vi.fn<(props: GridProps) => null>(() => null),
    GroupGrid: vi.fn<(props: GridProps) => null>(() => null),
    PerformerGrid: vi.fn<(props: GridProps) => null>(() => null),
    StudioGrid: vi.fn<(props: GridProps) => null>(() => null),
    TagGrid: vi.fn<(props: GridProps) => null>(() => null),
    ImageGrid: vi.fn<(props: GridProps) => null>(() => null),
  },
  sceneSearch: vi.fn<(props: SceneSearchProps) => null>(() => null),
}));

const studio = {
  id: "5",
  instanceId: "inst-a",
  name: "Parent Studio",
  scene_count: 3,
  gallery_count: 2,
  image_count: 4,
  performer_count: 2,
  group_count: 1,
  child_studios: [{ id: "6", name: "Sub Studio", instanceId: "inst-a" }],
};

vi.mock("@/api", () => ({
  libraryApi: {
    findImages,
    findStudioById: vi.fn(),
    updateRating: vi.fn(),
    updateFavorite: vi.fn(),
  },
}));
vi.mock("@/hooks/useEntityLookup", () => ({
  useEntityLookup: () => ({ status: "found", entity: studio, retry: vi.fn() }),
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

function renderPage(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/studio/5?instance=inst-a&${search}`]}>
      <Routes>
        <Route path="/studio/:studioId" element={<StudioDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

/** The studio criterion a tab sends: its grid's lock, the scene search's, or the image request's */
async function sentCriterion(tab: string): Promise<unknown> {
  switch (tab) {
    case "scenes":
      return must(sceneSearch.mock.lastCall, "SceneSearch's props")[0]
        .permanentFilters?.studios;
    case "images":
      await waitFor(() => expect(findImages).toHaveBeenCalled());
      return (
        must(findImages.mock.lastCall, "the image request")[0]
          .image_filter as Record<string, unknown>
      ).studios;
    case "galleries":
      return must(grids.GalleryGrid.mock.lastCall, "GalleryGrid's props")[0]
        .lockedFilters?.gallery_filter?.studios;
    case "groups":
      return must(grids.GroupGrid.mock.lastCall, "GroupGrid's props")[0]
        .lockedFilters?.group_filter?.studios;
    case "performers":
      return must(grids.PerformerGrid.mock.lastCall, "PerformerGrid's props")[0]
        .lockedFilters?.performer_filter?.studios;
    default:
      throw new Error(`No tab ${tab}`);
  }
}

const toggle = () =>
  screen.queryByRole("checkbox", { name: /Include sub-studios/ });

describe("StudioDetail: Include sub-studios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findImages.mockResolvedValue({ findImages: { images: [], count: 0 } });
  });

  it.each(["scenes", "galleries", "images", "groups"])(
    "the %s tab sends depth -1 when the toggle is on",
    async (tab) => {
      renderPage(`tab=${tab}&includeSubStudios=true`);

      expect(toggle()).toBeChecked();
      expect(await sentCriterion(tab)).toEqual({
        value: ["5:inst-a"],
        modifier: "INCLUDES",
        depth: -1,
      });
    }
  );

  it.each(["scenes", "galleries", "images", "groups"])(
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

  it("ticking the toggle on the Collections tab sends depth -1", async () => {
    renderPage("tab=groups");

    fireEvent.click(must(toggle(), "the Include sub-studios toggle"));

    expect(await sentCriterion("groups")).toEqual({
      value: ["5:inst-a"],
      modifier: "INCLUDES",
      depth: -1,
    });
  });

  it("the Performers tab hides the toggle and sends no depth: a performer's studios take none", async () => {
    renderPage("tab=performers&includeSubStudios=true");

    expect(toggle()).not.toBeInTheDocument();
    expect(await sentCriterion("performers")).toEqual({
      value: ["5:inst-a"],
      modifier: "INCLUDES",
    });
  });
});
