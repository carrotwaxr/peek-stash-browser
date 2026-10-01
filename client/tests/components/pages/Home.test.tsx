import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { actAsync } from "@tests/testUtils";
import type * as lucideModule from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { createQueryClient } from "@/api/queryClient";
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
vi.mock("@/utils/filterConfig", () => ({
  carouselRulesToFilterState: vi.fn(() => ({})),
  SCENE_FILTER_OPTIONS: [],
}));
vi.mock("@/utils/urlParams", () => ({
  buildSearchParams: vi.fn(() => new URLSearchParams()),
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
  SceneCarousel: ({ title, scenes, loading }: Record<string, unknown>) => (
    <div data-testid="scene-carousel" data-loading={String(loading)}>
      {title as string} ({(scenes as unknown[]).length} scenes)
    </div>
  ),
}));

// Mock shared-types
vi.mock("@peek/shared-types", () => ({}));

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
      expect(mockGetCarousels).toHaveBeenCalledTimes(1);

      // Another visit: the router gives the location a new key
      vi.mocked(useLocation).mockReturnValue({
        key: "second",
      } as ReturnType<typeof useLocation>);
      await actAsync(() => rerender(<Home />));
      await letQueriesAnswer();

      // The custom carousels refresh; the settings come from the cache
      expect(mockGetCarousels).toHaveBeenCalledTimes(2);
      expect(settingsRequests()).toBe(1);
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
