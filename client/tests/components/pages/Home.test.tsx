import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { actAsync } from "@tests/testUtils";
import type * as lucideModule from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { libraryApi } from "@/api";
import { ApiError } from "@/api/client";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import Home from "@/components/pages/Home";
import type * as bannerModule from "@/components/ui/LibraryInitializingBanner";
import { usePageTitle } from "@/hooks/usePageTitle";
import { jsonResponse, requestsTo, stubApi } from "../../helpers/stubApi";

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
    useLocation: vi.fn(() => ({ key: "default" })),
  };
});

// Mock hooks
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    user: { username: "testuser" },
  })),
}));
/** The fetch function of each hardcoded carousel, by fetchKey */
let mockCarouselQueries: Record<string, () => Promise<unknown>> = {};
vi.mock("@/hooks/useHomeCarouselQueries", () => ({
  useHomeCarouselQueries: vi.fn(() => mockCarouselQueries),
}));
vi.mock("@/hooks/useHideBulkAction", () => ({
  useHideBulkAction: vi.fn(() => ({
    hideDialogOpen: false,
    isHiding: false,
    handleHideClick: vi.fn(),
    handleHideConfirm: vi.fn(),
    closeHideDialog: vi.fn(),
  })),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));

// Mock API
const mockApiGet = vi.fn().mockResolvedValue({
  settings: { carouselPreferences: [] },
});
const mockGetCarousels = vi.fn().mockResolvedValue({ carousels: [] });
vi.mock("@/api", () => ({
  apiGet: (endpoint: string) => mockApiGet(endpoint),
  libraryApi: {
    getCarousels: () => mockGetCarousels(),
    executeCarousel: vi.fn(),
  },
}));

// Mock constants
const mockMigrateCarouselPreferences = vi.fn((prefs: unknown) => prefs || []);
vi.mock("@/constants/carousels", () => ({
  CAROUSEL_DEFINITIONS: [],
  migrateCarouselPreferences: (prefs: unknown) =>
    mockMigrateCarouselPreferences(prefs),
}));

vi.mock("@/utils/entityLinks", () => ({
  getEntityPath: vi.fn(() => "/scene/1"),
}));

// Mock lucide-react: Home's own icons; the rest (the navigation's) are real
vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof lucideModule>()),
  LucideEyeOff: (props: Record<string, unknown>) => (
    <span data-testid="icon-eye-off" {...props} />
  ),
  LucidePlus: (props: Record<string, unknown>) => (
    <span data-testid="icon-plus" {...props} />
  ),
  Film: (props: Record<string, unknown>) => (
    <span data-testid="icon-film" {...props} />
  ),
}));

// Mock UI components; the initializing notice is the real one
vi.mock("@/components/ui/index", async () => ({
  LibraryInitializingBanner: (
    await vi.importActual<typeof bannerModule>(
      "@/components/ui/LibraryInitializingBanner"
    )
  ).default,
  AddToPlaylistButton: () => <div data-testid="add-to-playlist" />,
  BulkActionBar: ({ selectedScenes }: Record<string, unknown>) => (
    <div data-testid="bulk-action-bar">
      {(selectedScenes as unknown[])?.length} selected
    </div>
  ),
  Button: ({ children, onClick }: Record<string, unknown>) => (
    <button onClick={onClick as () => void}>
      {children as React.ReactNode}
    </button>
  ),
  ContinueWatchingCarousel: () => <div data-testid="continue-watching" />,
  HideConfirmationDialog: () => <div data-testid="hide-dialog" />,
  LoadingSpinner: () => <div data-testid="loading-spinner" />,
  PageHeader: ({ title, subtitle }: Record<string, unknown>) => (
    <div data-testid="page-header">
      <h1>{title as string}</h1>
      {subtitle ? <p>{subtitle as string}</p> : null}
    </div>
  ),
  PageLayout: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="page-layout">{children}</div>
  ),
  SceneCarousel: ({
    title,
    scenes,
    loading,
    seeMoreUrl,
  }: Record<string, unknown>) => (
    <div
      data-testid="scene-carousel"
      data-loading={String(loading)}
      data-see-more={seeMoreUrl as string | undefined}
    >
      {title as string} ({(scenes as unknown[]).length} scenes)
    </div>
  ),
}));

let client: QueryClient;

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

/**
 * Lets the settings query answer: TanStack Query tells React about a change
 * on a timer a millisecond later (a fake clock is moved on instead).
 */
const letQueriesAnswer = () =>
  vi.isFakeTimers()
    ? advance(50)
    : act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });

const renderHome = async () => {
  let view!: ReturnType<typeof render>;
  await actAsync(() => {
    view = render(<Home />, { wrapper });
  });
  await letQueriesAnswer();
  return view;
};

const settingsRequests = () =>
  mockApiGet.mock.calls.filter(([path]) => path === "/user/settings").length;

/** Moves the clock on, running the timers and promises due by then. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/**
 * Lets what is due now finish: TanStack Query tells React about a change
 * on a timer a millisecond later.
 */
const settle = () => advance(50);

/** Enables one hardcoded carousel, with the definition Home looks up. */
async function enableCarousel(
  fetchKey: string,
  title: string,
  fetchScenes: () => Promise<unknown>
) {
  const { CAROUSEL_DEFINITIONS } = await import("@/constants/carousels");
  (CAROUSEL_DEFINITIONS as unknown as Array<Record<string, unknown>>).push({
    fetchKey,
    title,
    iconComponent: () => <span />,
    iconProps: {},
  });
  mockMigrateCarouselPreferences.mockReturnValue([
    { id: fetchKey, enabled: true, order: 0 },
  ]);
  mockCarouselQueries = { [fetchKey]: fetchScenes };
}

describe("Home", () => {
  afterEach(async () => {
    client.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    const { CAROUSEL_DEFINITIONS } = await import("@/constants/carousels");
    (CAROUSEL_DEFINITIONS as unknown[]).length = 0;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useLocation).mockReturnValue({
      key: "default",
    } as ReturnType<typeof useLocation>);
    client = createQueryClient();
    mockCarouselQueries = {};
    mockApiGet.mockResolvedValue({
      settings: { carouselPreferences: [] },
    });
    mockGetCarousels.mockResolvedValue({ carousels: [] });
    mockMigrateCarouselPreferences.mockImplementation(
      (prefs: unknown) => prefs || []
    );
  });

  describe("Rendering", () => {
    it("renders without crashing", async () => {
      await renderHome();
      expect(screen.getByTestId("page-layout")).toBeInTheDocument();
    });

    it("sets page title to 'Home'", async () => {
      await renderHome();
      expect(usePageTitle).toHaveBeenCalledWith("Home");
    });

    it("shows welcome message with username", async () => {
      await renderHome();
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent("Welcome, testuser");
    });

    it("shows PageHeader with subtitle", async () => {
      await renderHome();
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent(
        "Discover your favorite content and explore new scenes"
      );
    });

    it("shows PageLayout wrapper", async () => {
      await renderHome();
      expect(screen.getByTestId("page-layout")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("renders no carousels when preferences are empty", async () => {
      await renderHome();
      expect(screen.queryByTestId("scene-carousel")).not.toBeInTheDocument();
      expect(screen.queryByTestId("continue-watching")).not.toBeInTheDocument();
    });
  });

  describe("Carousel Rendering", () => {
    it("renders hardcoded carousels when preferences match definitions", async () => {
      await enableCarousel(
        "recentlyAddedScenes",
        "Recently Added",
        vi.fn().mockResolvedValue([])
      );

      await renderHome();

      expect(screen.getByTestId("scene-carousel")).toHaveTextContent(
        "Recently Added"
      );
    });

    it("renders ContinueWatchingCarousel for special carousel", async () => {
      const { CAROUSEL_DEFINITIONS } = await import("@/constants/carousels");
      const defs = CAROUSEL_DEFINITIONS as unknown as Array<
        Record<string, unknown>
      >;
      defs.push({
        fetchKey: "continueWatching",
        title: "Continue Watching",
        iconComponent: () => <span />,
        iconProps: {},
        isSpecial: true,
      });

      mockMigrateCarouselPreferences.mockReturnValue([
        { id: "continueWatching", enabled: true, order: 0 },
      ]);

      await renderHome();

      expect(screen.getByTestId("continue-watching")).toBeInTheDocument();
    });
  });

  describe("API Loading", () => {
    it("calls apiGet for user settings on mount", async () => {
      await renderHome();
      expect(mockApiGet).toHaveBeenCalledWith("/user/settings");
    });

    it("calls libraryApi.getCarousels on mount", async () => {
      await renderHome();
      expect(mockGetCarousels).toHaveBeenCalled();
    });

    it("falls back to migrated empty prefs on API error", async () => {
      mockApiGet.mockRejectedValue(new ApiError("Database busy", 500));

      await renderHome();

      // Should fall back to migrateCarouselPreferences([])
      await waitFor(() => {
        expect(mockMigrateCarouselPreferences).toHaveBeenCalledWith([]);
      });
    });

    it("returning to Home sends no /user/settings request", async () => {
      const { rerender } = await renderHome();
      expect(settingsRequests()).toBe(1);

      // Another visit: the router gives the location a new key
      vi.mocked(useLocation).mockReturnValue({
        key: "second",
      } as ReturnType<typeof useLocation>);
      await actAsync(() => rerender(<Home />));
      await letQueriesAnswer();

      expect(settingsRequests()).toBe(1);
    });

    it("returning to Home sends no /carousels request", async () => {
      const { rerender, unmount } = await renderHome();
      expect(mockGetCarousels).toHaveBeenCalledTimes(1);

      // Another visit: the router gives the location a new key
      vi.mocked(useLocation).mockReturnValue({
        key: "second",
      } as ReturnType<typeof useLocation>);
      await actAsync(() => rerender(<Home />));
      await letQueriesAnswer();
      expect(mockGetCarousels).toHaveBeenCalledTimes(1);

      // Leaving and coming back: the answer is still in the cache
      unmount();
      await renderHome();
      expect(mockGetCarousels).toHaveBeenCalledTimes(1);
    });

    it("an edited carousel makes Home ask for its scenes again", async () => {
      const executeCarousel = vi.mocked(libraryApi.executeCarousel);
      executeCarousel.mockResolvedValue({
        carousel: { id: "c1", title: "Mine", icon: "Film" },
        scenes: [{ id: "1" }],
      } as never);
      mockGetCarousels.mockResolvedValue({
        carousels: [{ id: "c1", title: "Mine", icon: "Film", rules: {} }],
      });
      mockMigrateCarouselPreferences.mockReturnValue([
        { id: "custom-c1", enabled: true, order: 0 },
      ]);

      await renderHome();
      expect(await screen.findByText("Mine (1 scenes)")).toBeInTheDocument();
      expect(executeCarousel).toHaveBeenCalledTimes(1);

      // The builder's save marks the carousels stale
      executeCarousel.mockResolvedValue({
        carousel: { id: "c1", title: "Mine", icon: "Film" },
        scenes: [{ id: "1" }, { id: "2" }],
      } as never);
      await act(async () => {
        await client.invalidateQueries({ queryKey: queryKeys.carousels.all() });
      });
      await letQueriesAnswer();

      expect(await screen.findByText("Mine (2 scenes)")).toBeInTheDocument();
      expect(executeCarousel).toHaveBeenCalledTimes(2);
    });
  });

  describe("See More of a custom carousel", () => {
    /** Home showing one custom carousel with these rules; resolves to its See More */
    async function seeMoreOf(rules: unknown, rulesLocked = false) {
      vi.mocked(libraryApi.executeCarousel).mockResolvedValue({
        carousel: { id: "c1", title: "Mine", icon: "Film" },
        scenes: [{ id: "1" }],
      } as never);
      mockGetCarousels.mockResolvedValue({
        carousels: [
          {
            id: "c1",
            title: "Mine",
            icon: "Film",
            rules,
            sort: "random",
            direction: "DESC",
            rulesLocked,
          },
        ],
      });
      mockMigrateCarouselPreferences.mockReturnValue([
        { id: "custom-c1", enabled: true, order: 0 },
      ]);
      const view = await renderHome();
      await screen.findByText("Mine (1 scenes)");
      const url = screen
        .getByTestId("scene-carousel")
        .getAttribute("data-see-more");
      view.unmount();
      client.clear();
      return url;
    }
    const leaf = (field: string, criterion: unknown) => ({ field, criterion });

    it("See More of a grouped carousel opens /scenes with the group in the URL", async () => {
      const url = await seeMoreOf({
        match: "all",
        rules: [
          leaf("watched", false),
          {
            match: "any",
            rules: [
              leaf("tag_favorite", true),
              leaf("performer_favorite", true),
            ],
          },
        ],
      });

      expect(url).toBe(
        "/scenes?g1=any&g1.performerFavorite=true&g1.tagFavorite=true&watched=false&sort=random&dir=DESC"
      );
    });

    it("the Goddesses See More is unchanged, from its flat stored shape and from its tree", async () => {
      const tags = { value: ["284"], modifier: "INCLUDES_ALL" };
      const goddesses =
        "/scenes?tagIds=284&tagIdsModifier=INCLUDES_ALL&sort=random&dir=DESC";

      expect(await seeMoreOf({ tags })).toBe(goddesses);
      expect(
        await seeMoreOf({ match: "all", rules: [leaf("tags", tags)] })
      ).toBe(goddesses);
    });
  });

  describe("See More of a carousel of fixed scenes", () => {
    it("a locked carousel has no See More: it would list more scenes than the carousel shows", async () => {
      vi.mocked(libraryApi.executeCarousel).mockResolvedValue({
        carousel: { id: "c1", title: "Mine", icon: "Film" },
        scenes: [{ id: "1" }],
      } as never);
      mockGetCarousels.mockResolvedValue({
        carousels: [
          {
            id: "c1",
            title: "Mine",
            icon: "Film",
            rules: { ids: ["1:a"], tags: { value: ["284"] } },
            sort: "random",
            direction: "DESC",
            rulesLocked: true,
          },
        ],
      });
      mockMigrateCarouselPreferences.mockReturnValue([
        { id: "custom-c1", enabled: true, order: 0 },
      ]);

      await renderHome();
      await screen.findByText("Mine (1 scenes)");

      expect(screen.getByTestId("scene-carousel")).not.toHaveAttribute(
        "data-see-more"
      );
    });
  });

  describe("Library initializing", () => {
    it("Home carousels load once ready with no retry loop", async () => {
      vi.useFakeTimers();
      const fetchMock = stubApi({
        "/library/ready": () => jsonResponse(200, { ready: true }),
      });
      const recentlyAdded = vi
        .fn()
        .mockRejectedValueOnce(
          new ApiError("Server is initializing", 503, { ready: false })
        )
        .mockResolvedValue([{ id: "1", title: "Scene One" }]);
      await enableCarousel(
        "recentlyAddedScenes",
        "Recently Added",
        recentlyAdded
      );

      await renderHome();
      await settle();

      // One request, answered "initializing": the notice, the carousel waiting
      expect(recentlyAdded).toHaveBeenCalledOnce();
      expect(
        screen.getByText("Server is syncing library, please wait...")
      ).toBeInTheDocument();
      expect(screen.getByTestId("scene-carousel")).toHaveAttribute(
        "data-loading",
        "true"
      );

      await advance(4_800);
      expect(recentlyAdded).toHaveBeenCalledOnce();
      expect(requestsTo(fetchMock, "/library/ready")).toHaveLength(0);

      // The re-check says ready: the carousel loads, once
      await advance(300);
      expect(requestsTo(fetchMock, "/library/ready")).toHaveLength(1);
      expect(recentlyAdded).toHaveBeenCalledTimes(2);
      expect(
        screen.queryByText("Server is syncing library, please wait...")
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("scene-carousel")).toHaveTextContent(
        "Recently Added (1 scenes)"
      );
      expect(screen.getByTestId("scene-carousel")).toHaveAttribute(
        "data-loading",
        "false"
      );

      await advance(60_000);
      expect(recentlyAdded).toHaveBeenCalledTimes(2);
      expect(requestsTo(fetchMock, "/library/ready")).toHaveLength(1);
    });

    it("a carousel that fails for another reason is left out, without a notice", async () => {
      const failing = vi.fn().mockRejectedValue(new ApiError("Boom", 500));
      await enableCarousel("recentlyAddedScenes", "Recently Added", failing);
      vi.spyOn(console, "error").mockImplementation(() => {});

      await renderHome();

      await waitFor(() => {
        expect(failing).toHaveBeenCalledOnce();
      });
      await waitFor(() => {
        expect(screen.queryByTestId("scene-carousel")).not.toBeInTheDocument();
      });
      expect(
        screen.queryByText("Server is syncing library, please wait...")
      ).not.toBeInTheDocument();
    });
  });
});
