import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePageTitle } from "@/hooks/usePageTitle";

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
  useAuth: vi.fn(() => ({ user: { username: "testuser" } })),
}));
vi.mock("@/hooks/useHomeCarouselQueries", () => ({
  useHomeCarouselQueries: vi.fn(() => ({})),
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
vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    isInitializing = false;
    status: number;
    constructor(msg: string, status = 500) {
      super(msg);
      this.status = status;
    }
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

// Mock TanStack Query
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: [], isLoading: false, error: null })),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  };
});

// Mock lucide-react
vi.mock("lucide-react", () => ({
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

// Mock UI components
vi.mock("@/components/ui/index", () => ({
  AddToPlaylistButton: () => <div data-testid="add-to-playlist" />,
  BulkActionBar: ({ selectedScenes }: Record<string, unknown>) => (
    <div data-testid="bulk-action-bar">
      {(selectedScenes as unknown[])?.length} selected
    </div>
  ),
  Button: ({ children, onClick }: Record<string, unknown>) => (
    <button onClick={onClick as () => void}>{children as React.ReactNode}</button>
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
  SceneCarousel: ({ title }: Record<string, unknown>) => (
    <div data-testid="scene-carousel">{title as string}</div>
  ),
}));

// Mock shared-types
vi.mock("@peek/shared-types", () => ({}));

import Home from "@/components/pages/Home";

describe("Home", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      await act(async () => {
        render(<Home />);
      });
      expect(screen.getByTestId("page-layout")).toBeInTheDocument();
    });

    it("sets page title to 'Home'", async () => {
      await act(async () => {
        render(<Home />);
      });
      expect(usePageTitle).toHaveBeenCalledWith("Home");
    });

    it("shows welcome message with username", async () => {
      await act(async () => {
        render(<Home />);
      });
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent("Welcome, testuser");
    });

    it("shows PageHeader with subtitle", async () => {
      await act(async () => {
        render(<Home />);
      });
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent(
        "Discover your favorite content and explore new scenes"
      );
    });

    it("shows PageLayout wrapper", async () => {
      await act(async () => {
        render(<Home />);
      });
      expect(screen.getByTestId("page-layout")).toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("renders no carousels when preferences are empty", async () => {
      await act(async () => {
        render(<Home />);
      });
      expect(screen.queryByTestId("scene-carousel")).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("continue-watching")
      ).not.toBeInTheDocument();
    });
  });

  describe("Carousel Rendering", () => {
    it("renders hardcoded carousels when preferences match definitions", async () => {
      const { CAROUSEL_DEFINITIONS } = await import("@/constants/carousels");
      // Temporarily push a definition into the mocked empty array
      const defs = CAROUSEL_DEFINITIONS as unknown as Array<Record<string, unknown>>;
      defs.push({
        fetchKey: "recentlyAddedScenes",
        title: "Recently Added",
        iconComponent: () => <span />,
        iconProps: {},
      });

      mockMigrateCarouselPreferences.mockReturnValue([
        { id: "recentlyAddedScenes", enabled: true, order: 0 },
      ]);

      await act(async () => {
        render(<Home />);
      });

      expect(screen.getByTestId("scene-carousel")).toHaveTextContent(
        "Recently Added"
      );

      // Clean up
      defs.length = 0;
    });

    it("renders ContinueWatchingCarousel for special carousel", async () => {
      const { CAROUSEL_DEFINITIONS } = await import("@/constants/carousels");
      const defs = CAROUSEL_DEFINITIONS as unknown as Array<Record<string, unknown>>;
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

      await act(async () => {
        render(<Home />);
      });

      expect(screen.getByTestId("continue-watching")).toBeInTheDocument();

      // Clean up
      defs.length = 0;
    });
  });

  describe("API Loading", () => {
    it("calls apiGet for user settings on mount", async () => {
      await act(async () => {
        render(<Home />);
      });
      expect(mockApiGet).toHaveBeenCalledWith("/user/settings");
    });

    it("calls libraryApi.getCarousels on mount", async () => {
      await act(async () => {
        render(<Home />);
      });
      expect(mockGetCarousels).toHaveBeenCalled();
    });

    it("falls back to migrated empty prefs on API error", async () => {
      mockApiGet.mockRejectedValue(new Error("Network error"));

      await act(async () => {
        render(<Home />);
      });

      // Should fall back to migrateCarouselPreferences([])
      expect(mockMigrateCarouselPreferences).toHaveBeenCalledWith([]);
    });
  });
});
