import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import SceneSearch from "@/components/scene-search/SceneSearch";
import { useFolderViewTags } from "@/hooks/useFolderViewTags";

// The view the page is on (the URL's `view`, as the controls report it)
let mockView = "grid";

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
    useSearchParams: vi.fn(() => [
      new URLSearchParams(mockView === "grid" ? "" : `view=${mockView}`),
      vi.fn(),
    ]),
  };
});

// Mock hooks
vi.mock("@/hooks/useGridPageTVNavigation", () => ({
  useGridPageTVNavigation: vi.fn(() => ({
    isTVMode: false,
    searchControlsProps: {},
    gridItemProps: () => ({ ref: vi.fn(), className: "", tabIndex: -1 }),
    tvNavigation: { currentZone: "grid", isZoneActive: vi.fn() },
    gridNavigation: { setItemRef: vi.fn(), isFocused: vi.fn() },
  })),
}));
vi.mock("@/hooks/useGridColumns", () => ({
  useGridColumns: vi.fn(() => 6),
}));
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
  useWallPlayback: vi.fn(() => ({
    wallPlayback: "static",
    updateWallPlayback: vi.fn(),
  })),
}));
vi.mock("@/hooks/useFolderViewTags", () => ({
  useFolderViewTags: vi.fn(() => ({
    tags: [],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));
vi.mock("@/utils/entityLinks", () => ({
  getEntityPath: vi.fn(() => "/scene/1"),
}));

// Mock TanStack Query
const mockSetQueryData =
  vi.fn<(key: unknown, updater: (old: unknown) => unknown) => void>();
vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual("@tanstack/react-query");
  return {
    ...actual,
    useQueryClient: vi.fn(() => ({
      setQueryData: mockSetQueryData,
      invalidateQueries: vi.fn(),
    })),
  };
});

// Mock API
interface MockListResult {
  data: Record<string, unknown> | null;
  isLoading: boolean;
  error: Error | null;
  isPlaceholderData?: boolean;
}
const mockUseSceneList = vi.fn(
  (): MockListResult => ({ data: null, isLoading: false, error: null })
);
const mockSearchControlsProps =
  vi.fn<(props: Record<string, unknown>) => void>();
vi.mock("@/api/hooks", () => ({
  useSceneList: (..._args: unknown[]) => mockUseSceneList(),
}));
vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    isInitializing: boolean;
    status: number;
    constructor(
      message: string,
      status = 500,
      data: Record<string, unknown> = {}
    ) {
      super(message);
      this.status = status;
      this.isInitializing = status === 503 && data.ready === false;
    }
  },
}));
vi.mock("@/api", () => ({}));
vi.mock("@/api/queryKeys", () => ({
  queryKeys: { scenes: { list: vi.fn(() => ["scenes", "list"]) } },
}));

// Mock child components
vi.mock("@/components/ui/index", () => ({
  SearchControls: ({
    children,
    onQueryChange,
    ...props
  }: {
    // SceneSearch passes a render function as its children
    children?:
      | React.ReactNode
      | ((state: Record<string, unknown>) => React.ReactNode);
    onQueryChange?: (query: unknown) => void;
    [key: string]: unknown;
  }) => {
    mockSearchControlsProps(props);
    // Call onQueryChange once on mount to set queryParams (simulates SearchControls behavior)
    const calledRef = React.useRef(false);
    React.useEffect(() => {
      if (!calledRef.current && typeof onQueryChange === "function") {
        calledRef.current = true;
        onQueryChange({ page: 1, per_page: 24 });
      }
    }, [onQueryChange]);
    return (
      <div
        data-testid="search-controls"
        data-artifact-type={props.artifactType}
      >
        {typeof children === "function"
          ? children({
              viewMode: mockView,
              gridDensity: "medium",
              zoomLevel: "medium",
              sortField: "o_counter",
              sortDirection: "DESC",
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
  PageHeader: ({ title }: Record<string, unknown>) => (
    <div data-testid="page-header">{title as string}</div>
  ),
  ErrorMessage: ({
    error,
    onRetry,
  }: {
    error?: Error;
    onRetry?: () => void;
  }) => (
    <div data-testid="error-message">
      {error?.message ?? "Error"}
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
  LibraryInitializingBanner: () => <div data-testid="sync-banner" />,
  SceneCard: () => <div data-testid="scene-card" />,
}));
const mockSceneGridProps = vi.fn<(props: Record<string, unknown>) => void>();
vi.mock("@/components/scene-search/SceneGrid", () => ({
  default: (props: Record<string, unknown>) => {
    mockSceneGridProps(props);
    return <div data-testid="scene-grid" />;
  },
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

describe("SceneSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSceneList.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it("renders SearchControls with artifactType 'scene'", () => {
    render(<SceneSearch title="Scenes" />);
    expect(screen.getByTestId("search-controls")).toHaveAttribute(
      "data-artifact-type",
      "scene"
    );
    expect(screen.getByTestId("scene-grid")).toBeInTheDocument();
  });

  describe("Hiding a scene", () => {
    it("hiding A:12 removes only A:12's card when B:12 is on the page", () => {
      render(<SceneSearch title="Scenes" />);
      const gridProps = must(mockSceneGridProps.mock.calls.at(-1))[0];
      const onHideSuccess = gridProps.onHideSuccess as (
        sceneId: string,
        entityType: string,
        instanceId?: string
      ) => void;

      onHideSuccess("12", "scene", "A");

      const updater = must(mockSetQueryData.mock.calls.at(-1))[1];
      const page = {
        findScenes: {
          count: 2,
          scenes: [
            { id: "12", instanceId: "A" },
            { id: "12", instanceId: "B" },
          ],
        },
      };
      expect(updater(page)).toEqual({
        findScenes: { count: 1, scenes: [{ id: "12", instanceId: "B" }] },
      });
    });
  });

  describe("Stale results", () => {
    it("passes the list's placeholder state to SearchControls as isRefreshing", () => {
      mockUseSceneList.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        isPlaceholderData: true,
      });

      render(<SceneSearch title="Scenes" />);

      const props = mockSearchControlsProps.mock.calls.at(-1)?.[0];
      expect(props).toMatchObject({ isRefreshing: true });
    });
  });

  describe("Folder view", () => {
    beforeEach(() => {
      mockView = "folder";
    });
    afterEach(() => {
      mockView = "grid";
    });

    it("a failed tag-tree load shows the error with Retry, not untagged items", () => {
      const refetch = vi.fn();
      vi.mocked(useFolderViewTags).mockReturnValue({
        tags: [],
        isLoading: false,
        error: new ApiError("Tree failed", 500),
        refetch,
      });

      render(<SceneSearch title="Scenes" />);

      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "Tree failed"
      );
      expect(screen.queryByTestId("folder-view")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(refetch).toHaveBeenCalled();
    });

    it("an initializing 503 on the tree keeps the folder view loading", () => {
      vi.mocked(useFolderViewTags).mockReturnValue({
        tags: [],
        isLoading: false,
        error: new ApiError("init", 503, { ready: false }),
        refetch: vi.fn(),
      });

      render(<SceneSearch title="Scenes" />);

      expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
      expect(screen.getByTestId("folder-view")).toBeInTheDocument();
    });
  });

  describe("Library initializing", () => {
    it("a 503 ready:false on Scenes shows the sync banner, not an error page", () => {
      mockUseSceneList.mockReturnValue({
        data: null,
        isLoading: false,
        error: new ApiError("Server is initializing", 503, { ready: false }),
      });

      render(<SceneSearch title="Scenes" />);

      expect(screen.getByTestId("sync-banner")).toBeInTheDocument();
      expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
      // The controls stay, and the grid waits for the library
      expect(screen.getByTestId("search-controls")).toBeInTheDocument();
      const [gridProps] = must(
        mockSceneGridProps.mock.calls.at(-1),
        "the grid's props"
      );
      expect(gridProps).toMatchObject({ loading: true });
      expect(gridProps.error).toBeUndefined();
    });

    it("any other error shows the error page", () => {
      mockUseSceneList.mockReturnValue({
        data: null,
        isLoading: false,
        error: new ApiError("Something went wrong", 500),
      });

      render(<SceneSearch title="Scenes" />);

      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "Something went wrong"
      );
      expect(screen.queryByTestId("search-controls")).not.toBeInTheDocument();
    });
  });
});
