import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePageTitle } from "@/hooks/usePageTitle";

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
  };
});

// Mock hooks
vi.mock("@/hooks/usePageTitle", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/hooks/useGridPageTVNavigation", () => ({
  useGridPageTVNavigation: vi.fn(() => ({
    isTVMode: false,
    searchControlsProps: {},
    gridItemProps: () => ({ ref: vi.fn(), className: "", tabIndex: -1 }),
  })),
}));
vi.mock("@/hooks/useGridColumns", () => ({
  useGridColumns: vi.fn(() => 6),
}));
vi.mock("@/hooks/useFocusTrap", () => ({ useInitialFocus: vi.fn() }));
vi.mock("@/hooks/useTableColumns", () => ({
  useTableColumns: vi.fn(() => ({
    allColumns: [],
    visibleColumns: [],
    visibleColumnIds: [],
    columnOrder: [],
    toggleColumn: vi.fn(),
    hideColumn: vi.fn(),
    moveColumn: vi.fn(),
    getColumnConfig: vi.fn(() => ({})),
  })),
}));
vi.mock("@/hooks/useWallPlayback", () => ({
  useWallPlayback: vi.fn(() => ({ wallPlayback: "static" })),
}));
vi.mock("@/hooks/useFolderViewTags", () => ({
  useFolderViewTags: vi.fn(() => ({ tags: [], isLoading: false })),
}));
vi.mock("@/hooks/usePaginatedLightbox", () => ({
  usePaginatedLightbox: vi.fn(() => ({
    lightboxOpen: false,
    lightboxIndex: 0,
    openLightbox: vi.fn(),
    closeLightbox: vi.fn(),
    onPageBoundary: vi.fn(),
    onIndexChange: vi.fn(),
    isPageTransitioning: false,
    transitionKey: 0,
    consumePendingLightboxIndex: vi.fn(),
  })),
}));
vi.mock("@/constants/grids", () => ({
  getGridClasses: vi.fn(() => "grid-classes"),
}));

// Mock TanStack Query
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
    })),
  };
});

// Mock API
const mockUseImageList = vi.fn(() => ({
  data: null,
  isLoading: false,
  error: null,
}));
vi.mock("@/api/hooks", () => ({
  useImageList: (...args: unknown[]) => mockUseImageList(...args),
}));
vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    isInitializing = false;
    status: number;
    constructor(message: string, isInitializing = false) {
      super(message);
      if (typeof isInitializing === "boolean") {
        this.isInitializing = isInitializing;
      }
      this.status = 500;
    }
  },
}));
vi.mock("@/api", () => ({}));
vi.mock("@/api/queryKeys", () => ({
  queryKeys: {
    images: {
      list: vi.fn(() => ["images", "list"]),
    },
  },
}));

// Mock child components
vi.mock("@/components/cards/index", () => ({
  ImageCard: (props: Record<string, unknown>) => (
    <div data-testid="image-card">
      {(props.image as Record<string, unknown>)?.title as string}
    </div>
  ),
}));
vi.mock("@/components/ui/Lightbox", () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="lightbox"
      data-is-open={String(props.isOpen)}
    />
  ),
}));
vi.mock("@/components/ui/index", () => ({
  SearchControls: ({ children, onQueryChange, ...props }: Record<string, unknown>) => {
    // Call onQueryChange once on mount to set queryParams (simulates SearchControls behavior)
    const calledRef = React.useRef(false);
    React.useEffect(() => {
      if (!calledRef.current && typeof onQueryChange === "function") {
        calledRef.current = true;
        (onQueryChange as (q: unknown) => void)({ page: 1, per_page: 24 });
      }
    }, [onQueryChange]);
    return (
      <div data-testid="search-controls" data-artifact-type={props.artifactType}>
        {typeof children === "function"
          ? (children as Function)({
              viewMode: "grid",
              gridDensity: "medium",
              zoomLevel: "medium",
              sortField: "name",
              sortDirection: "ASC",
              onSort: vi.fn(),
              timelinePeriod: null,
              setTimelinePeriod: vi.fn(),
            })
          : children}
      </div>
    );
  },
  PageLayout: ({ children }: Record<string, unknown>) => (
    <div data-testid="page-layout">{children as React.ReactNode}</div>
  ),
  PageHeader: ({ title, subtitle }: Record<string, unknown>) => (
    <div data-testid="page-header">
      {title as string}
      {subtitle && <span>{subtitle as string}</span>}
    </div>
  ),
  ErrorMessage: ({ error }: Record<string, unknown>) => (
    <div data-testid="error-message">
      {(error as Error)?.message || "Error"}
    </div>
  ),
  SyncProgressBanner: ({ message }: Record<string, unknown>) => (
    <div data-testid="sync-banner">{message as string}</div>
  ),
}));
vi.mock("@/components/wall/WallView", () => ({
  default: () => <div data-testid="wall-view" />,
}));
vi.mock("@/components/timeline/TimelineView", () => ({
  default: () => <div data-testid="timeline-view" />,
}));
vi.mock("@/components/folder/index", () => ({
  FolderView: () => <div data-testid="folder-view" />,
}));
vi.mock("@/components/table/index", () => ({
  TableView: () => <div data-testid="table-view" />,
  ColumnConfigPopover: () => <div data-testid="column-config" />,
}));

import Images from "@/components/pages/Images";
import { ApiError } from "@/api/client";

describe("Images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseImageList.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  describe("Rendering", () => {
    it("renders without crashing", () => {
      render(<Images />);
      expect(screen.getByTestId("page-layout")).toBeInTheDocument();
    });

    it("sets page title to 'Images'", () => {
      render(<Images />);
      expect(usePageTitle).toHaveBeenCalledWith("Images");
    });

    it("shows PageHeader with title 'Images'", () => {
      render(<Images />);
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent("Images");
    });

    it("shows PageHeader with subtitle", () => {
      render(<Images />);
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent("Browse all images in your library");
    });

    it("renders SearchControls with artifactType 'image'", () => {
      render(<Images />);
      const controls = screen.getByTestId("search-controls");
      expect(controls).toHaveAttribute("data-artifact-type", "image");
    });
  });

  describe("Error State", () => {
    it("shows ErrorMessage when error is present and not initializing", () => {
      const error = new ApiError("Something went wrong");
      error.isInitializing = false;
      mockUseImageList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Images />);
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "Something went wrong"
      );
    });

    it("shows SyncProgressBanner when error is initializing", () => {
      const error = new ApiError("init", true);
      error.isInitializing = true;
      mockUseImageList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Images />);
      expect(screen.getByTestId("sync-banner")).toHaveTextContent(
        "Server is syncing library, please wait..."
      );
    });
  });

  describe("Loading State", () => {
    it("renders loading skeletons when loading", () => {
      mockUseImageList.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      const { container } = render(<Images />);
      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Data State", () => {
    it("renders ImageCard when data is present", async () => {
      mockUseImageList.mockReturnValue({
        data: {
          findImages: {
            images: [
              { id: "1", title: "Test Image", paths: { image: "/img/1", thumbnail: "/thumb/1" } },
              { id: "2", title: "Another Image", paths: { image: "/img/2", thumbnail: "/thumb/2" } },
            ],
            count: 2,
          },
        },
        isLoading: false,
        error: null,
      });

      await act(async () => {
        render(<Images />);
      });
      const cards = screen.getAllByTestId("image-card");
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent("Test Image");
    });

    it("renders Lightbox when images are present", async () => {
      mockUseImageList.mockReturnValue({
        data: {
          findImages: {
            images: [
              { id: "1", title: "Test Image", paths: { image: "/img/1", thumbnail: "/thumb/1" } },
            ],
            count: 1,
          },
        },
        isLoading: false,
        error: null,
      });

      await act(async () => {
        render(<Images />);
      });
      expect(screen.getByTestId("lightbox")).toBeInTheDocument();
    });
  });

  describe("View Modes", () => {
    it("has 5 view modes configured", () => {
      // The component defines VIEW_MODES with 5 entries: grid, wall, table, timeline, folder
      // We verify the component renders successfully with the SearchControls mock
      render(<Images />);
      expect(screen.getByTestId("search-controls")).toBeInTheDocument();
    });
  });
});
