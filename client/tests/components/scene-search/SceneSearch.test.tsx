import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SceneSearch from "@/components/scene-search/SceneSearch";

// Mock react-router-dom
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: vi.fn(() => vi.fn()),
    useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
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
  useFolderViewTags: vi.fn(() => ({ tags: [], isLoading: false })),
}));
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));
vi.mock("@/utils/entityLinks", () => ({
  getEntityPath: vi.fn(() => "/scene/1"),
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
    isInitializing = false;
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
              viewMode: "grid",
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
  ErrorMessage: ({ error }: Record<string, unknown>) => (
    <div data-testid="error-message">
      {(error as Error)?.message || "Error"}
    </div>
  ),
  SyncProgressBanner: ({ message }: Record<string, unknown>) => (
    <div data-testid="sync-banner">{message as string}</div>
  ),
  SceneCard: () => <div data-testid="scene-card" />,
}));
vi.mock("@/components/scene-search/SceneGrid", () => ({
  default: () => <div data-testid="scene-grid" />,
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
});
