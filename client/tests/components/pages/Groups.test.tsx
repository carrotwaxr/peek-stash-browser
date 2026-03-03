import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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
vi.mock("@/hooks/useGridPageTVNavigation", () => ({
  useGridPageTVNavigation: vi.fn(() => ({
    isTVMode: false,
    searchControlsProps: {},
    gridItemProps: () => ({ ref: vi.fn(), className: "", tabIndex: -1 }),
    tvNavigation: { currentZone: "grid", isZoneActive: vi.fn() },
    gridNavigation: { setItemRef: vi.fn(), isFocused: vi.fn() },
    paginationHandlerRef: { current: null },
  })),
}));
vi.mock("@/hooks/useGridColumns", () => ({ useGridColumns: vi.fn(() => 6) }));
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
vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: vi.fn(() => ({ hasMultipleInstances: false })),
}));
vi.mock("@/constants/grids", () => ({
  getGridClasses: vi.fn(() => "grid-classes"),
}));
vi.mock("@/utils/entityLinks", () => ({
  getEntityPath: vi.fn(() => "/groups/1"),
}));

// Mock API
const mockUseGroupList = vi.fn(() => ({
  data: null,
  isLoading: false,
  error: null,
}));
vi.mock("@/api/hooks", () => ({
  useGroupList: (...args: unknown[]) => mockUseGroupList(...args),
}));
vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    isInitializing = false;
    constructor(message: string, isInitializing = false) {
      super(message);
      this.isInitializing = isInitializing;
    }
  },
}));
vi.mock("@/api", () => ({}));

// Mock child components
vi.mock("@/components/ui/index", () => ({
  SearchControls: (props: Record<string, unknown>) => {
    const { children, onQueryChange, ...rest } = props;
    const React = require("react");
    React.useEffect(() => {
      if (typeof onQueryChange === "function") {
        onQueryChange({ filter: {} });
      }
    }, [onQueryChange]);
    return (
      <div data-testid="search-controls" data-artifact-type={rest.artifactType}>
        {typeof children === "function"
          ? (children as Function)({
              viewMode: "grid",
              gridDensity: "medium",
              sortField: "name",
              sortDirection: "ASC",
              onSort: vi.fn(),
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
vi.mock("@/components/cards/index", () => ({
  GroupCard: (props: Record<string, unknown>) => (
    <div data-testid="group-card">
      {(props.group as Record<string, unknown>)?.name as string}
    </div>
  ),
}));
vi.mock("@/components/table/index", () => ({
  TableView: () => <div data-testid="table-view" />,
  ColumnConfigPopover: () => <div data-testid="column-config" />,
}));

import Groups from "@/components/pages/Groups";
import { ApiError } from "@/api/client";

describe("Groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseGroupList.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  describe("Rendering", () => {
    it("renders without crashing", () => {
      render(<Groups />);
      expect(screen.getByTestId("page-layout")).toBeInTheDocument();
    });

    it("sets page title to 'Collections'", () => {
      render(<Groups />);
      expect(usePageTitle).toHaveBeenCalledWith("Collections");
    });

    it("shows PageHeader with title 'Collections'", () => {
      render(<Groups />);
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent("Collections");
    });

    it("renders SearchControls with artifactType 'group'", () => {
      render(<Groups />);
      const controls = screen.getByTestId("search-controls");
      expect(controls).toHaveAttribute("data-artifact-type", "group");
    });
  });

  describe("Error State", () => {
    it("shows ErrorMessage when error is present and not initializing", () => {
      const error = new ApiError("Something went wrong");
      error.isInitializing = false;
      mockUseGroupList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Groups />);
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "Something went wrong"
      );
    });

    it("shows SyncProgressBanner when error is initializing", () => {
      const error = new ApiError("init", true);
      error.isInitializing = true;
      mockUseGroupList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Groups />);
      expect(screen.getByTestId("sync-banner")).toHaveTextContent(
        "Server is syncing library, please wait..."
      );
    });
  });

  describe("Loading State", () => {
    it("renders loading skeletons when loading", () => {
      mockUseGroupList.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      const { container } = render(<Groups />);
      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Data State", () => {
    it("renders GroupCard when data is present", () => {
      mockUseGroupList.mockReturnValue({
        data: {
          findGroups: {
            groups: [
              { id: "1", name: "Test Collection" },
              { id: "2", name: "Another Collection" },
            ],
            count: 2,
          },
        },
        isLoading: false,
        error: null,
      });

      render(<Groups />);
      const cards = screen.getAllByTestId("group-card");
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent("Test Collection");
    });
  });
});
