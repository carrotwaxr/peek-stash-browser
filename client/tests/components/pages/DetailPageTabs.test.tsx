/**
 * The five detail pages open the tab the counts and the URL name, say so when
 * there is nothing to show, and stand aside for a lookup that is loading,
 * not found or failed.
 */
import type { ComponentType } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createQueryWrapper, must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as hooksModule from "@/api/hooks";
import GalleryDetail from "@/components/pages/GalleryDetail";
import GroupDetail from "@/components/pages/GroupDetail";
import PerformerDetail from "@/components/pages/PerformerDetail";
import StudioDetail from "@/components/pages/StudioDetail";
import TagDetail from "@/components/pages/TagDetail";
import type * as uiModule from "@/components/ui/index";

interface CountsResult {
  data: { counts: Record<string, number> } | undefined;
  error?: Error | null;
  refetch?: () => void;
}

const { counts, lookup, refetch, settings } = vi.hoisted(() => ({
  counts: {
    current: { data: undefined } as {
      data: { counts: Record<string, number> } | undefined;
      error?: Error | null;
      refetch?: () => void;
    },
  },
  lookup: {
    current: {} as {
      status: string;
      entity?: Record<string, unknown>;
      matches?: unknown[];
      error?: unknown;
    },
  },
  refetch: vi.fn(),
  settings: {
    current: {} as Record<string, boolean>,
  },
}));

const entity = {
  id: "5",
  instanceId: "inst-b",
  name: "Thing",
  title: "Thing",
  details: "About the thing",
  description: "About the thing",
  synopsis: "About the thing",
  alias_list: ["Alias One", "Alias Two"],
  image_path: "/img.jpg",
  rating: 60,
  rating100: 60,
  favorite: true,
  o_counter: 4,
  gender: "FEMALE",
  urls: ["https://example.com/a"],
  tags: [{ id: "1", name: "A tag", instanceId: "inst-b" }],
  children: [],
  parents: [],
  performers: [],
  images: [],
  scene_count: 3,
  image_count: 2,
  gallery_count: 1,
};

vi.mock("@/api", () => ({
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Unknown error",
  apiGet: vi.fn(() => Promise.resolve({ availableInstances: [] })),
  libraryApi: {
    findImages: vi.fn(() => Promise.resolve({ images: [], count: 0 })),
    findGalleryImages: vi.fn(() => Promise.resolve({ images: [], count: 0 })),
    updateRating: vi.fn(),
    updateFavorite: vi.fn(),
  },
}));
vi.mock("@/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof hooksModule>()),
  useRelationCounts: () => counts.current,
}));
vi.mock("@/hooks/useEntityLookup", () => ({
  useEntityLookup: () => lookup.current,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/useNavigationState", () => ({
  useNavigationState: () => ({ goBack: vi.fn(), backButtonText: "Back" }),
}));
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/hooks/useImagesPagination", () => ({
  useImagesPagination: () => ({}),
}));
vi.mock("@/hooks/usePaginatedLightbox", () => ({
  usePaginatedLightbox: () => ({
    currentPage: 1,
    totalPages: 1,
    images: [],
    totalCount: 0,
    isOpen: false,
    setImages: vi.fn(),
    openLightbox: vi.fn(),
    closeLightbox: vi.fn(),
    consumePendingLightboxIndex: vi.fn(),
  }),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: true }),
}));
vi.mock("@/contexts/UnitPreferenceContext", () => ({
  useUnitPreference: () => ({ unitPreference: "metric" }),
}));
vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({ getSettings: () => settings.current }),
}));
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));
vi.mock("@/components/grids/index", () => {
  const grid = (name: string) => () => <div data-testid={name} />;
  return {
    GalleryGrid: grid("GalleryGrid"),
    GroupGrid: grid("GroupGrid"),
    PerformerGrid: grid("PerformerGrid"),
    StudioGrid: grid("StudioGrid"),
  };
});
vi.mock("@/components/scene-search/SceneSearch", () => ({
  default: () => <div data-testid="SceneSearch" />,
}));
vi.mock("@/components/wall/WallView", () => ({
  default: () => <div data-testid="WallView" />,
}));
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof uiModule>()),
  PaginatedImageGrid: () => <div data-testid="ImageGrid" />,
}));

interface PageSpec {
  type: string;
  param: string;
  Page: ComponentType;
  /** A tab, the count that opens it, and what it renders */
  tabs: [tab: string, testId: string][];
  emptyText: string;
}

const PAGES: PageSpec[] = [
  {
    type: "performer",
    param: "performerId",
    Page: PerformerDetail,
    tabs: [
      ["scenes", "SceneSearch"],
      ["galleries", "GalleryGrid"],
      ["images", "ImageGrid"],
      ["groups", "GroupGrid"],
    ],
    emptyText: "This performer has no content in Peek",
  },
  {
    type: "studio",
    param: "studioId",
    Page: StudioDetail,
    tabs: [
      ["scenes", "SceneSearch"],
      ["galleries", "GalleryGrid"],
      ["images", "ImageGrid"],
      ["performers", "PerformerGrid"],
      ["groups", "GroupGrid"],
    ],
    emptyText: "This studio has no content in Peek",
  },
  {
    type: "tag",
    param: "tagId",
    Page: TagDetail,
    tabs: [
      ["scenes", "SceneSearch"],
      ["galleries", "GalleryGrid"],
      ["images", "ImageGrid"],
      ["performers", "PerformerGrid"],
      ["studios", "StudioGrid"],
      ["groups", "GroupGrid"],
    ],
    emptyText: "This tag has no content in Peek",
  },
  {
    type: "group",
    param: "groupId",
    Page: GroupDetail,
    tabs: [
      ["scenes", "SceneSearch"],
      ["performers", "PerformerGrid"],
    ],
    emptyText: "This collection has no content in Peek",
  },
  {
    type: "gallery",
    param: "galleryId",
    Page: GalleryDetail,
    tabs: [
      ["images", "WallView"],
      ["scenes", "SceneSearch"],
    ],
    emptyText: "This gallery has no content in Peek",
  },
];

const ALL_COUNTS = {
  scenes: 3,
  galleries: 2,
  images: 4,
  performers: 2,
  studios: 2,
  groups: 1,
};

describe.each(PAGES)(
  "$type page tabs",
  ({ type, param, Page, tabs, emptyText }) => {
    function renderPage(search = "") {
      const QueryWrapper = createQueryWrapper();
      return render(
        <QueryWrapper>
          <MemoryRouter initialEntries={[`/${type}/5${search}`]}>
            <Routes>
              <Route path={`/${type}/:${param}`} element={<Page />} />
            </Routes>
          </MemoryRouter>
        </QueryWrapper>
      );
    }

    beforeEach(() => {
      vi.clearAllMocks();
      lookup.current = { status: "found", entity, matches: [] };
      settings.current = {
        showFavorite: true,
        showRating: true,
        showDescriptionOnDetail: true,
      };
      counts.current = { data: { counts: ALL_COUNTS } };
    });

    it.each(tabs)("opens the %s tab the URL names", (tab, testId) => {
      renderPage(`?tab=${tab}`);

      expect(screen.getAllByTestId(testId).length).toBeGreaterThan(0);
    });

    it("opens the first tab with content when the URL names none", () => {
      const [lastTab, lastTestId] = must(tabs.at(-1), "the last tab");
      counts.current = {
        data: {
          counts: {
            scenes: 0,
            galleries: 0,
            images: 0,
            performers: 0,
            studios: 0,
            groups: 0,
            [lastTab]: 2,
          },
        },
      };
      renderPage();

      expect(screen.getAllByTestId(lastTestId).length).toBeGreaterThan(0);
      expect(screen.queryByText(emptyText)).toBeNull();
    });

    it("says so when the entity has nothing to show", () => {
      counts.current = {
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
      };
      renderPage();

      expect(screen.getByText(emptyText)).toBeVisible();
    });

    it("shows the rating slider only while the viewer keeps ratings on", () => {
      renderPage();
      const withRating = screen.queryAllByRole("slider").length;
      cleanup();

      settings.current = {};
      renderPage();

      expect(withRating).toBeGreaterThan(0);
      expect(screen.queryAllByRole("slider")).toHaveLength(0);
    });

    it("shows nothing but a spinner while the lookup loads", () => {
      lookup.current = { status: "loading" };
      renderPage();

      expect(screen.queryByText(emptyText)).toBeNull();
    });

    it("says so when the entity is not found", () => {
      lookup.current = { status: "notFound" };
      renderPage();

      expect(screen.getByRole("heading")).toHaveTextContent(/not found/);
    });

    it("shows the lookup's error with a Retry", () => {
      const retry = vi.fn();
      lookup.current = {
        status: "error",
        error: new Error("Down"),
        retry,
      } as never;
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(retry).toHaveBeenCalledOnce();
    });

    it("shows the counts error under the tabs", () => {
      const result: CountsResult = {
        data: undefined,
        error: new Error("Counts are down"),
        refetch,
      };
      counts.current = result;
      renderPage();

      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(refetch).toHaveBeenCalledOnce();
    });
  }
);
