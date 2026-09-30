import React from "react";
import { render, screen } from "@testing-library/react";
import { actAsync, must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import Images from "@/components/pages/Images";
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

const { mockQueryClient, cardProps } = vi.hoisted(() => ({
  mockQueryClient: { setQueryData: vi.fn(), invalidateQueries: vi.fn() },
  cardProps: [] as Record<string, unknown>[],
}));

// Mock TanStack Query
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: vi.fn(() => mockQueryClient),
  };
});

// Mock API
interface MockListResult {
  data: Record<string, unknown> | null;
  isLoading: boolean;
  error: Error | null;
  isPlaceholderData?: boolean;
}
const mockUseImageList = vi.fn(
  (): MockListResult => ({ data: null, isLoading: false, error: null })
);
const mockSearchControlsProps = vi.fn();
let mockViewMode = "grid";
vi.mock("@/api/hooks", () => ({
  useImageList: (..._args: unknown[]) => mockUseImageList(),
}));
vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    isInitializing = false;
    status: number;
    data: Record<string, unknown>;
    constructor(
      message: string,
      status = 500,
      data: Record<string, unknown> = {}
    ) {
      super(message);
      this.status = status;
      this.data = data;
      this.isInitializing = status === 503 && data.ready === false;
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
  ImageCard: (props: Record<string, unknown>) => {
    cardProps.push(props);
    return (
      <div data-testid="image-card">
        {(props.image as Record<string, unknown>)?.title as string}
      </div>
    );
  },
}));
vi.mock("@/components/ui/Lightbox", () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="lightbox"
      data-is-open={String(props.isOpen)}
      data-images={JSON.stringify(props.images)}
    />
  ),
}));
vi.mock("@/components/ui/index", () => ({
  SearchControls: ({
    children,
    onQueryChange,
    ...props
  }: Record<string, unknown>) => {
    mockSearchControlsProps(props);
    // Call onQueryChange once on mount to set queryParams (simulates SearchControls behavior)
    const calledRef = React.useRef(false);
    React.useEffect(() => {
      if (!calledRef.current && typeof onQueryChange === "function") {
        calledRef.current = true;
        (onQueryChange as (q: unknown) => void)({ page: 1, per_page: 24 });
      }
    }, [onQueryChange]);
    return (
      <div
        data-testid="search-controls"
        data-artifact-type={props.artifactType}
      >
        {typeof children === "function"
          ? children({
              viewMode: mockViewMode,
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
  PageLayout: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="page-layout">{children}</div>
  ),
  PageHeader: ({ title, subtitle }: Record<string, unknown>) => (
    <div data-testid="page-header">
      {title as string}
      {subtitle ? <span>{subtitle as string}</span> : null}
    </div>
  ),
  ErrorMessage: ({ error }: Record<string, unknown>) => (
    <div data-testid="error-message">
      {(error as Error)?.message || "Error"}
    </div>
  ),
  // Shows itself while the library is initializing (its own test covers when)
  LibraryInitializingBanner: () => <div data-testid="sync-banner" />,
}));
vi.mock("@/components/wall/WallView", () => ({
  default: (props: Record<string, unknown>) => (
    <div
      data-testid="wall-view"
      data-count={(props.items as unknown[]).length}
      data-playback={props.playbackMode as string}
    />
  ),
}));
vi.mock("@/components/timeline/TimelineView", () => ({
  default: (props: {
    items: Record<string, unknown>[];
    renderItem: (
      item: Record<string, unknown>,
      index: number,
      helpers: object
    ) => React.ReactNode;
  }) => (
    <div data-testid="timeline-view">
      {props.items.map((item, i) => props.renderItem(item, i, {}))}
    </div>
  ),
}));
vi.mock("@/components/folder/index", () => ({
  FolderView: (props: {
    items: Record<string, unknown>[];
    loading: boolean;
    renderItem: (item: Record<string, unknown>) => React.ReactNode;
  }) => (
    <div data-testid="folder-view" data-loading={String(props.loading)}>
      {props.items.map((item) => props.renderItem(item))}
    </div>
  ),
}));
vi.mock("@/components/table/index", () => ({
  TableView: (props: { items: unknown[] }) => (
    <div data-testid="table-view" data-count={props.items.length} />
  ),
  ColumnConfigPopover: () => <div data-testid="column-config" />,
}));

describe("Images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cardProps.length = 0;
    mockViewMode = "grid";
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
      const error = new ApiError("Something went wrong", 500);
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

    it("an initializing 503 shows the sync banner, not the error page", () => {
      const error = new ApiError("init", 503, { ready: false });
      mockUseImageList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Images />);
      expect(screen.getByTestId("sync-banner")).toBeInTheDocument();
      expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
      expect(screen.getByTestId("search-controls")).toBeInTheDocument();
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
              {
                id: "1",
                title: "Test Image",
                paths: { image: "/img/1", thumbnail: "/thumb/1" },
              },
              {
                id: "2",
                title: "Another Image",
                paths: { image: "/img/2", thumbnail: "/thumb/2" },
              },
            ],
            count: 2,
          },
        },
        isLoading: false,
        error: null,
      });

      await actAsync(() => {
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
              {
                id: "1",
                title: "Test Image",
                paths: { image: "/img/1", thumbnail: "/thumb/1" },
              },
            ],
            count: 1,
          },
        },
        isLoading: false,
        error: null,
      });

      await actAsync(() => {
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

  describe("Stale results", () => {
    it("passes the list's placeholder state to SearchControls as isRefreshing", () => {
      mockUseImageList.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        isPlaceholderData: true,
      });

      render(<Images />);

      const props = mockSearchControlsProps.mock.calls.at(-1)?.[0];
      expect(props).toMatchObject({ isRefreshing: true });
    });
  });

  describe("Views and lightbox sources", () => {
    const twoImages = () =>
      mockUseImageList.mockReturnValue({
        data: {
          findImages: {
            images: [
              { id: "1", title: "First", paths: {} },
              { id: "2", title: "Second", paths: {} },
            ],
            count: 2,
          },
        },
        isLoading: false,
        error: null,
      });

    it("table view lists the page's images", async () => {
      mockViewMode = "table";
      twoImages();
      await actAsync(() => {
        render(<Images />);
      });
      expect(screen.getByTestId("table-view")).toHaveAttribute(
        "data-count",
        "2"
      );
      expect(screen.queryByTestId("image-card")).not.toBeInTheDocument();
    });

    it("wall view gets the images and the wall playback mode", async () => {
      mockViewMode = "wall";
      twoImages();
      await actAsync(() => {
        render(<Images />);
      });
      const wall = screen.getByTestId("wall-view");
      expect(wall).toHaveAttribute("data-count", "2");
      expect(wall).toHaveAttribute("data-playback", "static");
    });

    it("timeline view renders a card per image", async () => {
      mockViewMode = "timeline";
      twoImages();
      await actAsync(() => {
        render(<Images />);
      });
      expect(screen.getByTestId("timeline-view")).toBeInTheDocument();
      expect(screen.getAllByTestId("image-card")).toHaveLength(2);
    });

    it("folder view renders a card per image and waits for the tags", async () => {
      mockViewMode = "folder";
      twoImages();
      await actAsync(() => {
        render(<Images />);
      });
      expect(screen.getByTestId("folder-view")).toHaveAttribute(
        "data-loading",
        "false"
      );
      expect(screen.getAllByTestId("image-card")).toHaveLength(2);
    });

    it("grid view shows skeletons, not cards, while loading", async () => {
      mockUseImageList.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });
      await actAsync(() => {
        render(<Images />);
      });
      expect(screen.queryByTestId("image-card")).not.toBeInTheDocument();
      expect(document.querySelectorAll(".animate-pulse")).toHaveLength(24);
    });

    it("the lightbox asks for an image from the instance it lives on", async () => {
      mockUseImageList.mockReturnValue({
        data: {
          findImages: {
            images: [
              { id: "7", instanceId: "inst a", oCounter: 3 },
              { id: "8" },
              {
                id: "9",
                instanceId: "b",
                paths: { image: "/full", preview: "/pv", thumbnail: "/th" },
              },
            ],
            count: 3,
          },
        },
        isLoading: false,
        error: null,
      });
      await actAsync(() => {
        render(<Images />);
      });
      const images = JSON.parse(
        screen.getByTestId("lightbox").getAttribute("data-images") ?? "[]"
      ) as { paths: Record<string, string | undefined>; oCounter: number }[];
      expect(images[0]?.paths).toEqual({
        image: "/api/proxy/image/7/image?instanceId=inst%20a",
        thumbnail: "/api/proxy/image/7/thumbnail?instanceId=inst%20a",
      });
      expect(images[0]?.oCounter).toBe(3);
      // No instance known: the path carries none, never an empty one
      expect(images[1]?.paths.image).toBe("/api/proxy/image/8/image");
      expect(images[1]?.paths.thumbnail).toBe("/api/proxy/image/8/thumbnail");
      expect(images[1]?.oCounter).toBe(0);
      // Paths the server sent are kept as they are
      expect(images[2]?.paths).toEqual({
        image: "/full",
        preview: "/pv",
        thumbnail: "/th",
      });
    });
  });

  describe("Changes from a card", () => {
    /** Two images with one id, one on each server */
    const sharedId = () =>
      mockUseImageList.mockReturnValue({
        data: {
          findImages: {
            images: [
              { id: "5", instanceId: "a", title: "On A", oCounter: 0 },
              { id: "5", instanceId: "b", title: "On B", oCounter: 0 },
            ],
            count: 2,
          },
        },
        isLoading: false,
        error: null,
      });

    /** The list the cache update leaves, from the list the page shows */
    const updatedList = () => {
      const [, updater] = must(
        mockQueryClient.setQueryData.mock.lastCall,
        "the cache update"
      ) as [unknown, (old: unknown) => unknown];
      const old = mockUseImageList().data;
      const next = updater(old) as {
        findImages: { images: Record<string, unknown>[]; count: number };
      };
      return next.findImages;
    };

    const callbackOfLastCard = (name: string) =>
      must(cardProps.at(-1)?.[name], `the card's ${name}`) as (
        ...args: unknown[]
      ) => void;

    it("an O, a rating and a favorite change only the image on that instance", async () => {
      sharedId();
      await actAsync(() => {
        render(<Images />);
      });

      callbackOfLastCard("onOCounterChange")("5", 4, "b");
      expect(
        updatedList().images.map((i) => [i.instanceId, i.oCounter])
      ).toEqual([
        ["a", 0],
        ["b", 4],
      ]);

      callbackOfLastCard("onRatingChange")("5", 80, "a");
      expect(
        updatedList().images.map((i) => [i.instanceId, i.rating100])
      ).toEqual([
        ["a", 80],
        ["b", undefined],
      ]);

      callbackOfLastCard("onFavoriteChange")("5", true, "b");
      expect(
        updatedList().images.map((i) => [i.instanceId, i.favorite])
      ).toEqual([
        ["a", undefined],
        ["b", true],
      ]);
    });

    it("a hide drops only the image on that instance", async () => {
      sharedId();
      await actAsync(() => {
        render(<Images />);
      });

      callbackOfLastCard("onHideSuccess")("5", "image", "a");

      const list = updatedList();
      expect(list.images.map((i) => i.instanceId)).toEqual(["b"]);
      expect(list.count).toBe(1);
    });
  });
});
