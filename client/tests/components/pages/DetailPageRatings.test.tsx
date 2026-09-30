/**
 * A detail page rates and favorites on the loaded entity's own instance, not
 * on the URL's `instance` parameter: a bare-id link carries none.
 */
import type { ComponentType } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { act, render } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GalleryDetail from "@/components/pages/GalleryDetail";
import GroupDetail from "@/components/pages/GroupDetail";
import PerformerDetail from "@/components/pages/PerformerDetail";
import StudioDetail from "@/components/pages/StudioDetail";
import TagDetail from "@/components/pages/TagDetail";
import type * as uiModule from "@/components/ui/index";

interface HotkeyOptions {
  enabled?: boolean;
  setRating: (rating: number | null) => void;
  toggleFavorite: () => void;
}

const { entity, hotkeys, updateRating, updateFavorite } = vi.hoisted(() => ({
  entity: { current: {} as Record<string, unknown> },
  hotkeys: vi.fn<(options: HotkeyOptions) => void>(),
  updateRating: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  updateFavorite: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));

vi.mock("@/api", () => ({
  libraryApi: {
    findImages: vi.fn(() => Promise.resolve({ images: [], count: 0 })),
    findGalleryImages: vi.fn(() => Promise.resolve({ images: [], count: 0 })),
    updateRating,
    updateFavorite,
  },
}));
vi.mock("@/hooks/useEntityLookup", () => ({
  useEntityLookup: () => ({
    status: "found",
    entity: entity.current,
    retry: vi.fn(),
  }),
}));
vi.mock("@/hooks/useRatingHotkeys", () => ({ useRatingHotkeys: hotkeys }));
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
  useCardDisplaySettings: () => ({ getSettings: () => ({}) }),
}));
vi.mock("@/themes/useTheme", () => ({
  useTheme: () => ({ theme: undefined }),
}));
vi.mock("@/components/grids/index", () => ({
  GalleryGrid: () => null,
  GroupGrid: () => null,
  PerformerGrid: () => null,
  StudioGrid: () => null,
  TagGrid: () => null,
  ImageGrid: () => null,
}));
vi.mock("@/components/scene-search/SceneSearch", () => ({
  default: () => null,
}));
vi.mock("@/components/wall/WallView", () => ({ default: () => null }));
vi.mock("@/components/ui/index", async (importOriginal) => ({
  ...(await importOriginal<typeof uiModule>()),
  PaginatedImageGrid: () => null,
}));

const PAGES: [string, string, string, ComponentType][] = [
  ["performer", "performers", "performerId", PerformerDetail],
  ["studio", "studios", "studioId", StudioDetail],
  ["tag", "tags", "tagId", TagDetail],
  ["group", "groups", "groupId", GroupDetail],
  ["gallery", "galleries", "galleryId", GalleryDetail],
];

describe.each(PAGES)("%s page rating", (type, _plural, param, Page) => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateRating.mockResolvedValue({});
    updateFavorite.mockResolvedValue({});
    entity.current = {
      id: "5",
      instanceId: "inst-b",
      name: "Thing",
      title: "Thing",
      images: [],
    };
  });

  function renderPage(search: string) {
    render(
      <MemoryRouter initialEntries={[`/${type}/5${search}`]}>
        <Routes>
          <Route path={`/${type}/:${param}`} element={<Page />} />
        </Routes>
      </MemoryRouter>
    );
  }

  // The page's own hotkeys are the enabled ones (a gallery's closed lightbox registers a disabled set)
  const latestHotkeys = () =>
    must(
      hotkeys.mock.calls.filter(([options]) => options.enabled).at(-1),
      "the page's rating hotkeys"
    )[0];

  it.each([
    ["a bare-id link", ""],
    ["a link naming another server", "?instance=inst-a"],
  ])("rates and favorites on the entity's own server from %s", (_n, s) => {
    renderPage(s);

    act(() => {
      latestHotkeys().setRating(80);
    });
    expect(updateRating).toHaveBeenCalledWith(type, "5", 80, "inst-b");

    act(() => {
      latestHotkeys().toggleFavorite();
    });
    expect(updateFavorite).toHaveBeenCalledWith(type, "5", true, "inst-b");
  });
});
