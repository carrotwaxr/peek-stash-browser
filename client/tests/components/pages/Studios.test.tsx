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
  getEntityPath: vi.fn(() => "/studios/1"),
}));

// Mock API
const mockUseStudioList = vi.fn(() => ({
  data: null as Record<string, unknown> | null,
  isLoading: false,
  error: null as Error | null,
}));
vi.mock("@/api/hooks", () => ({
  useStudioList: (..._args: unknown[]) => mockUseStudioList(),
}));
vi.mock("@/api/client", () => ({
  ApiError: class ApiError extends Error {
    isInitializing = false;
    status: number;
    data: Record<string, unknown>;
    constructor(message: string, status = 500, data: Record<string, unknown> = {}) {
      super(message);
      this.status = status;
      this.data = data;
      this.isInitializing = status === 503 && data.ready === false;
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
  SyncProgressBanner: ({ message }: Record<string, unknown>) => (
    <div data-testid="sync-banner">{message as string}</div>
  ),
}));
vi.mock("@/components/cards/index", () => ({
  StudioCard: (props: Record<string, unknown>) => (
    <div data-testid="studio-card">
      {(props.studio as Record<string, unknown>)?.name as string}
    </div>
  ),
}));
vi.mock("@/components/table/index", () => ({
  TableView: () => <div data-testid="table-view" />,
  ColumnConfigPopover: () => <div data-testid="column-config" />,
}));

import Studios from "@/components/pages/Studios";
import { ApiError } from "@/api/client";

describe("Studios", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStudioList.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  describe("Rendering", () => {
    it("renders without crashing", () => {
      render(<Studios />);
      expect(screen.getByTestId("page-layout")).toBeInTheDocument();
    });

    it("sets page title to 'Studios'", () => {
      render(<Studios />);
      expect(usePageTitle).toHaveBeenCalledWith("Studios");
    });

    it("shows PageHeader with title 'Studios'", () => {
      render(<Studios />);
      const header = screen.getByTestId("page-header");
      expect(header).toHaveTextContent("Studios");
    });

    it("renders SearchControls with artifactType 'studio'", () => {
      render(<Studios />);
      const controls = screen.getByTestId("search-controls");
      expect(controls).toHaveAttribute("data-artifact-type", "studio");
    });
  });

  describe("Error State", () => {
    it("shows ErrorMessage when error is present and not initializing", () => {
      const error = new ApiError("Something went wrong", 500);
      mockUseStudioList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Studios />);
      expect(screen.getByTestId("error-message")).toHaveTextContent(
        "Something went wrong"
      );
    });

    it("shows SyncProgressBanner when error is initializing", () => {
      const error = new ApiError("init", 503, { ready: false });
      mockUseStudioList.mockReturnValue({
        data: null,
        isLoading: false,
        error,
      });

      render(<Studios />);
      expect(screen.getByTestId("sync-banner")).toHaveTextContent(
        "Server is syncing library, please wait..."
      );
    });
  });

  describe("Loading State", () => {
    it("renders loading skeletons when loading", () => {
      mockUseStudioList.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      const { container } = render(<Studios />);
      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("Data State", () => {
    it("renders StudioCard when data is present", () => {
      mockUseStudioList.mockReturnValue({
        data: {
          findStudios: {
            studios: [
              { id: "1", name: "Test Studio" },
              { id: "2", name: "Another Studio" },
            ],
            count: 2,
          },
        },
        isLoading: false,
        error: null,
      });

      render(<Studios />);
      const cards = screen.getAllByTestId("studio-card");
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveTextContent("Test Studio");
    });
  });
});
