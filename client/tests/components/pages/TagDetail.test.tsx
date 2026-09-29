/**
 * A tag page's Include sub-tags toggle: every tab's filter field (the tags
 * of a scene, gallery, image, performer, studio and collection) takes a
 * depth in the shared contract, so each tab sends depth -1 while it is on.
 */
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TagDetail from "@/components/pages/TagDetail";
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

function renderPage(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/tag/5?instance=inst-a&${search}`]}>
      <Routes>
        <Route path="/tag/:tagId" element={<TagDetail />} />
      </Routes>
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
