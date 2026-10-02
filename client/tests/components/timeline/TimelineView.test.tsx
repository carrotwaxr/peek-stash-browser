// client/tests/components/timeline/TimelineView.test.jsx
import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type TimelineControls from "../../../src/components/timeline/TimelineControls";
import type TimelineMobileSheet from "../../../src/components/timeline/TimelineMobileSheet";
import type TimelineStrip from "../../../src/components/timeline/TimelineStrip";
import TimelineView from "../../../src/components/timeline/TimelineView";

type TimelineViewProps = ComponentProps<typeof TimelineView>;
type RenderItem = TimelineViewProps["renderItem"];

// Mock the useTimelineState hook (each test sets the state it returns)
const mockUseTimelineState = vi.fn<(options: unknown) => unknown>();
vi.mock("../../../src/components/timeline/useTimelineState", () => ({
  useTimelineState: (options: unknown) => mockUseTimelineState(options),
}));

// Mock useMediaQuery - default to desktop (false = not mobile)
const mockUseMediaQuery = vi.fn((_query: string) => false);
vi.mock("../../../src/hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) => mockUseMediaQuery(query),
}));

// Mock TimelineMobileSheet with expand/collapse support
vi.mock("../../../src/components/timeline/TimelineMobileSheet", () => ({
  default: ({
    isOpen,
    selectedPeriod,
    itemCount,
    children,
  }: ComponentProps<typeof TimelineMobileSheet>) =>
    isOpen ? (
      <div data-testid="timeline-mobile-sheet">
        {selectedPeriod && (
          <span data-testid="mobile-sheet-period">{selectedPeriod.label}</span>
        )}
        <span data-testid="mobile-sheet-count">{itemCount}</span>
        <div data-testid="mobile-sheet-children">{children}</div>
      </div>
    ) : null,
}));

// Mock TimelineControls to simplify testing
vi.mock("../../../src/components/timeline/TimelineControls", () => ({
  default: ({
    zoomLevel,
    onZoomLevelChange,
  }: ComponentProps<typeof TimelineControls>) => (
    <div data-testid="timeline-controls">
      <span data-testid="current-zoom">{zoomLevel}</span>
      <button
        onClick={() => onZoomLevelChange("years")}
        data-testid="zoom-button"
      >
        Change Zoom
      </button>
    </div>
  ),
}));

// Mock TimelineStrip to simplify testing
vi.mock("../../../src/components/timeline/TimelineStrip", () => ({
  default: ({
    distribution,
    maxCount,
    selectedPeriod,
    onSelectPeriod,
  }: ComponentProps<typeof TimelineStrip>) => (
    <div data-testid="timeline-strip">
      <span data-testid="distribution-count">{distribution?.length ?? 0}</span>
      <span data-testid="max-count">{maxCount}</span>
      {selectedPeriod && (
        <span data-testid="selected-period">{selectedPeriod.period}</span>
      )}
      <button onClick={() => onSelectPeriod("2024-02")}>February</button>
    </div>
  ),
}));

describe("TimelineView", () => {
  const defaultHookReturn = {
    zoomLevel: "months",
    setZoomLevel: vi.fn(),
    selectedPeriod: null,
    selectPeriod: vi.fn(),
    distribution: [
      { period: "2024-01", count: 10 },
      { period: "2024-02", count: 20 },
    ],
    maxCount: 20,
    isLoading: false,
    ZOOM_LEVELS: ["years", "months", "weeks", "days"],
  };

  const defaultProps: TimelineViewProps = {
    entityType: "scene",
    items: [],
    renderItem: vi.fn<RenderItem>((item) => (
      <div key={String(item.id)}>{String(item.title)}</div>
    )),
    onItemClick: vi.fn(),
    period: null,
    onPeriodChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTimelineState.mockReturnValue(defaultHookReturn);
    mockUseMediaQuery.mockReturnValue(false); // Default to desktop
  });

  describe("The bars' request", () => {
    it("hands the list's request to the timeline state, which posts it", () => {
      const request = {
        filter: { q: "beach" },
        scene_filter: { rating100: { value: 60, modifier: "GREATER_THAN" } },
      };

      render(<TimelineView {...defaultProps} request={request} />);

      expect(mockUseTimelineState).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: "scene", request })
      );
    });
  });

  describe("Rendering", () => {
    it("renders TimelineControls component", () => {
      render(<TimelineView {...defaultProps} />);

      expect(screen.getByTestId("timeline-controls")).toBeInTheDocument();
    });

    it("renders TimelineStrip component", () => {
      render(<TimelineView {...defaultProps} />);

      expect(screen.getByTestId("timeline-strip")).toBeInTheDocument();
    });

    it("passes correct props to TimelineControls", () => {
      render(<TimelineView {...defaultProps} />);

      expect(screen.getByTestId("current-zoom")).toHaveTextContent("months");
    });

    it("passes distribution and maxCount to TimelineStrip", () => {
      render(<TimelineView {...defaultProps} />);

      expect(screen.getByTestId("distribution-count")).toHaveTextContent("2");
      expect(screen.getByTestId("max-count")).toHaveTextContent("20");
    });

    it("applies custom className", () => {
      const { container } = render(
        <TimelineView {...defaultProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });

  describe("Hook Integration", () => {
    it("hands the hook the owner's period and its callback", () => {
      render(<TimelineView {...defaultProps} entityType="gallery" />);

      expect(mockUseTimelineState).toHaveBeenCalledWith({
        entityType: "gallery",
        autoSelectRecent: true,
        request: undefined,
        period: null,
        onPeriodChange: defaultProps.onPeriodChange,
      });
    });

    it("a period from the URL chooses no latest period", () => {
      render(
        <TimelineView {...defaultProps} entityType="scene" period="2024-03" />
      );

      expect(mockUseTimelineState).toHaveBeenCalledWith({
        entityType: "scene",
        autoSelectRecent: false,
        request: undefined,
        period: "2024-03",
        onPeriodChange: defaultProps.onPeriodChange,
      });
    });

    it("the latest-period choice is read once: the chosen period does not change it", () => {
      const { rerender } = render(<TimelineView {...defaultProps} />);

      rerender(<TimelineView {...defaultProps} period="2024-02" />);

      const options = must(mockUseTimelineState.mock.lastCall)[0] as {
        autoSelectRecent: boolean;
        period: string | null;
      };
      expect(options.autoSelectRecent).toBe(true);
      expect(options.period).toBe("2024-02");
    });
  });

  describe("Loading State", () => {
    it("shows loading spinner when distributionLoading is true", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        isLoading: true,
      });

      render(<TimelineView {...defaultProps} />);

      // LoadingSpinner has sr-only text "Loading..."
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("shows loading spinner when loading prop is true", () => {
      render(<TimelineView {...defaultProps} loading={true} />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("shows loading spinner when both loading states are true", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        isLoading: true,
      });

      render(<TimelineView {...defaultProps} loading={true} />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  describe("Empty States", () => {
    it('shows "Select a time period" when no period is selected', () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: null,
      });

      render(<TimelineView {...defaultProps} />);

      expect(
        screen.getByText("Select a time period on the timeline above")
      ).toBeInTheDocument();
    });

    it("shows default empty message when items array is empty and period selected", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(<TimelineView {...defaultProps} items={[]} />);

      expect(screen.getByText("No items found")).toBeInTheDocument();
    });

    it("shows custom empty message when provided", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(
        <TimelineView
          {...defaultProps}
          items={[]}
          emptyMessage="No scenes in this period"
        />
      );

      expect(screen.getByText("No scenes in this period")).toBeInTheDocument();
    });
  });

  describe("Results Grid", () => {
    const mockItems = [
      { id: "1", title: "Scene 1" },
      { id: "2", title: "Scene 2" },
      { id: "3", title: "Scene 3" },
    ];

    it("renders items using renderItem function", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(<TimelineView {...defaultProps} items={mockItems} />);

      expect(screen.getByText("Scene 1")).toBeInTheDocument();
      expect(screen.getByText("Scene 2")).toBeInTheDocument();
      expect(screen.getByText("Scene 3")).toBeInTheDocument();
    });

    it("calls renderItem with item, index, and context", () => {
      const renderItem = vi.fn<RenderItem>((item, index) => (
        <div key={String(item.id)} data-testid={`item-${index}`}>
          {String(item.title)}
        </div>
      ));

      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(
        <TimelineView
          {...defaultProps}
          items={mockItems}
          renderItem={renderItem}
        />
      );

      expect(renderItem).toHaveBeenCalledTimes(3);

      // First call
      expect(renderItem).toHaveBeenNthCalledWith(
        1,
        mockItems[0],
        0,
        expect.objectContaining({
          onItemClick: defaultProps.onItemClick,
          dateFilter: expect.any(Object) as unknown,
        })
      );
    });

    it("passes dateFilter to renderItem context", () => {
      const renderItem = vi.fn<RenderItem>((item, _index, context) => (
        <div key={String(item.id)}>
          <span data-testid="date-filter">
            {JSON.stringify(context.dateFilter)}
          </span>
        </div>
      ));

      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(
        <TimelineView
          {...defaultProps}
          items={[{ id: "1", title: "Test" }]}
          renderItem={renderItem}
        />
      );

      expect(renderItem).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Number),
        expect.objectContaining({
          dateFilter: {
            date: {
              value: "2024-01-01",
              value2: "2024-01-31",
              modifier: "BETWEEN",
            },
          },
        })
      );
    });
  });

  describe("Selected Period Display", () => {
    it("shows selected period label in header", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(<TimelineView {...defaultProps} />);

      // New format shows "Selected: January 2024"
      expect(screen.getByText(/Selected:/)).toBeInTheDocument();
      expect(screen.getByText(/January 2024/)).toBeInTheDocument();
    });

    it("does not show item count in header (pagination controls handle counts)", () => {
      const mockItems = [
        { id: "1", title: "Scene 1" },
        { id: "2", title: "Scene 2" },
      ];

      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(<TimelineView {...defaultProps} items={mockItems} />);

      // Item count is no longer shown in header - pagination controls show counts
      expect(screen.getByText(/Selected:/)).toBeInTheDocument();
      expect(screen.queryByText(/\(2\)/)).not.toBeInTheDocument();
    });

    it("does not show item count when items array is empty", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(<TimelineView {...defaultProps} items={[]} />);

      expect(screen.queryByText(/items\)/)).not.toBeInTheDocument();
    });

    it("does not show period info when no period selected", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: null,
      });

      render(<TimelineView {...defaultProps} />);

      expect(screen.queryByText("January 2024")).not.toBeInTheDocument();
    });
  });

  describe("Grid Density", () => {
    it("uses medium density by default", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      const mockItems = [{ id: "1", title: "Test" }];
      const { container } = render(
        <TimelineView {...defaultProps} items={mockItems} />
      );

      // Check for medium density grid classes
      const gridContainer = container.querySelector(".card-grid-responsive");
      expect(gridContainer).toBeInTheDocument();
    });

    it("applies different grid density when specified", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      const mockItems = [{ id: "1", title: "Test" }];
      const { container } = render(
        <TimelineView {...defaultProps} items={mockItems} gridDensity="small" />
      );

      const gridContainer = container.querySelector(".card-grid-responsive");
      expect(gridContainer).toBeInTheDocument();
    });
  });

  describe("Sticky Header", () => {
    it("header has sticky positioning classes", () => {
      const { container } = render(<TimelineView {...defaultProps} />);

      const stickyHeader = container.querySelector(".sticky.top-0.z-10");
      expect(stickyHeader).toBeInTheDocument();
    });
  });

  describe("Mobile Layout", () => {
    beforeEach(() => {
      mockUseMediaQuery.mockReturnValue(true); // Mobile view
    });

    it("renders TimelineMobileSheet on mobile", () => {
      render(<TimelineView {...defaultProps} />);

      expect(screen.getByTestId("timeline-mobile-sheet")).toBeInTheDocument();
    });

    it("does not render TimelineMobileSheet on desktop", () => {
      mockUseMediaQuery.mockReturnValue(false);
      render(<TimelineView {...defaultProps} />);

      expect(
        screen.queryByTestId("timeline-mobile-sheet")
      ).not.toBeInTheDocument();
    });

    it("renders timeline controls inside mobile sheet", () => {
      render(<TimelineView {...defaultProps} />);

      const sheetChildren = screen.getByTestId("mobile-sheet-children");
      expect(sheetChildren).toContainElement(
        screen.getByTestId("timeline-controls")
      );
    });

    it("renders timeline strip inside mobile sheet", () => {
      render(<TimelineView {...defaultProps} />);

      const sheetChildren = screen.getByTestId("mobile-sheet-children");
      expect(sheetChildren).toContainElement(
        screen.getByTestId("timeline-strip")
      );
    });

    it("shows mobile-friendly empty message when no period selected", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: null,
      });

      render(<TimelineView {...defaultProps} />);

      expect(
        screen.getByText("Tap the timeline below to select a period")
      ).toBeInTheDocument();
    });

    it("does not show 'Selected:' label on mobile (space-saving)", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(<TimelineView {...defaultProps} />);

      // Mobile layout doesn't show the "Selected:" prefix to save space
      expect(screen.queryByText("Selected:")).not.toBeInTheDocument();
    });

    it("calls useMediaQuery with correct breakpoint", () => {
      render(<TimelineView {...defaultProps} />);

      expect(mockUseMediaQuery).toHaveBeenCalledWith("(max-width: 768px)");
    });
  });

  describe("Choosing a period", () => {
    it("a click on the strip goes to the hook, which reports it to the owner", () => {
      render(<TimelineView {...defaultProps} />);

      fireEvent.click(screen.getByRole("button", { name: "February" }));

      expect(defaultHookReturn.selectPeriod).toHaveBeenCalledWith("2024-02");
    });

    it("the view reports no period of its own when it shows one", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      render(<TimelineView {...defaultProps} period="2024-01" />);

      expect(defaultProps.onPeriodChange).not.toHaveBeenCalled();
    });
  });
});
