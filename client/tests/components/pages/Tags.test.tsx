import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import Tags from "@/components/pages/Tags";
import { usePageTitle } from "@/hooks/usePageTitle";

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
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));
vi.mock("@/constants/grids", () => ({
  getGridClasses: vi.fn(() => "grid-classes"),
}));
vi.mock("@/utils/entityLinks", () => ({
  getEntityPath: vi.fn(() => "/tags/1"),
}));

// Mock API
interface MockListResult {
  data: Record<string, unknown> | null;
  isLoading: boolean;
  error: Error | null;
  isPlaceholderData?: boolean;
}
const mockUseTagList = vi.fn(
  (): MockListResult => ({ data: null, isLoading: false, error: null })
);
const mockRefetchTree = vi.fn();
const mockUseTagTree = vi.fn(
  (
    _scope: unknown,
    _enabled: boolean
  ): {
    data: unknown;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  } => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: mockRefetchTree,
  })
);
let mockViewMode = "grid";
const mockSearchControlsProps = vi.fn();
vi.mock("@/api/hooks", () => ({
  useTagList: (..._args: unknown[]) => mockUseTagList(),
  useTagTree: (scope: unknown, enabled: boolean) =>
    mockUseTagTree(scope, enabled),
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

// Mock child components
vi.mock("@/components/ui/index", () => ({
  SearchControls: (props: Record<string, unknown>) => {
    mockSearchControlsProps(props);
    const { children, onQueryChange, ...rest } = props;
    React.useEffect(() => {
      if (typeof onQueryChange === "function") {
        onQueryChange({ filter: {} });
      }
    }, [onQueryChange]);
    return (
      <div data-testid="search-controls" data-artifact-type={rest.artifactType}>
        {typeof children === "function"
          ? children({
              viewMode: mockViewMode,
              gridDensity: "medium",
              sortField: "name",
              sortDirection: "ASC",
              onSort: vi.fn(),
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
  // Shows itself while the library is initializing (its own test covers when)
  LibraryInitializingBanner: () => <div data-testid="sync-banner" />,
}));
vi.mock("@/components/cards/index", () => ({
  TagCard: (props: Record<string, unknown>) => (
    <div data-testid="tag-card">
      {(props.tag as Record<string, unknown>)?.name as string}
    </div>
  ),
}));
vi.mock("@/components/tags/index", () => ({
  TagHierarchyView: () => <div data-testid="hierarchy-view" />,
}));
vi.mock("@/components/table/index", () => ({
  TableView: () => <div data-testid="table-view" />,
  ColumnConfigPopover: () => <div data-testid="column-config" />,
}));

describe("Tags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockViewMode = "grid";
    mockUseTagList.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  describe("Rendering", () => {
    it("renders without crashing", () => {
      render(<Tags />);
      expect(screen.getByTestId("page-layout")).toBeInTheDocument();
    });

    it("sets page title to 'Tags'", () => {
      render(<Tags />);
      expect(usePageTitle).toHaveBeenCalledWith("Tags");
    });

    it("shows PageHeader with title 'Tags'", () => {
      render(<Tags />);
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent("Tags");
    });

    it("renders SearchControls with artifactType 'tag'", () => {
      render(<Tags />);
      const controls = screen.getByTestId("search-controls");
      expect(controls).toHaveAttribute("data-artifact-type", "tag");
    });
  });

  describe("Hierarchy view", () => {
    beforeEach(() => {
      mockViewMode = "hierarchy";
    });

    it("a failed tag-tree request shows the error with Retry, not a spinner", () => {
      mockUseTagTree.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new ApiError("Tree failed", 500),
        refetch: mockRefetchTree,
      });

      render(<Tags />);

      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "Tree failed"
      );
      expect(screen.queryByTestId("hierarchy-view")).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(mockRefetchTree).toHaveBeenCalled();
    });

    it("an initializing 503 on the tree keeps the loading view, not the error", () => {
      mockUseTagTree.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new ApiError("init", 503, { ready: false }),
        refetch: mockRefetchTree,
      });

      render(<Tags />);

      expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
      expect(screen.getByTestId("hierarchy-view")).toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("shows ErrorMessage when error is present and not initializing", () => {
      const error = new ApiError("Something went wrong", 500);
      mockUseTagList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Tags />);
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "Something went wrong"
      );
    });

    it("an initializing 503 shows the sync banner, not the error page", () => {
      const error = new ApiError("init", 503, { ready: false });
      mockUseTagList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Tags />);
      expect(screen.getByTestId("sync-banner")).toBeInTheDocument();
      expect(screen.queryByTestId("error-message")).not.toBeInTheDocument();
      expect(screen.getByTestId("search-controls")).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("renders loading skeletons when loading in grid mode", () => {
      mockUseTagList.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      const { container } = render(<Tags />);
      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Data State", () => {
    it("renders TagCard when data is present", () => {
      mockUseTagList.mockReturnValue({
        data: {
          findTags: {
            tags: [
              { id: "1", name: "Action" },
              { id: "2", name: "Comedy" },
            ],
            count: 2,
          },
        },
        isLoading: false,
        error: null,
      });

      render(<Tags />);
      const cards = screen.getAllByTestId("tag-card");
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent("Action");
    });
  });

  describe("Hierarchy view", () => {
    it("reads the compact tag tree only while the hierarchy view is open", () => {
      render(<Tags />);

      // The grid view is open: the tree is not fetched
      expect(mockUseTagTree).toHaveBeenLastCalledWith(undefined, false);
    });
  });

  describe("Stale results", () => {
    it("passes the list's placeholder state to SearchControls as isRefreshing", () => {
      mockUseTagList.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        isPlaceholderData: true,
      });

      render(<Tags />);

      const props = mockSearchControlsProps.mock.calls.at(-1)?.[0];
      expect(props).toMatchObject({ isRefreshing: true });
    });
  });
});
