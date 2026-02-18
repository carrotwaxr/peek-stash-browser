// client/tests/components/timeline/TimelineView.test.jsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the useTimelineState hook
const mockUseTimelineState = vi.fn();
vi.mock("../../../src/components/timeline/useTimelineState.js", () => ({
  useTimelineState: (...args) => mockUseTimelineState(...args),
}));

// Mock useMediaQuery - default to desktop (false = not mobile)
const mockUseMediaQuery = vi.fn(() => false);
vi.mock("../../../src/hooks/useMediaQuery.js", () => ({
  useMediaQuery: (...args) => mockUseMediaQuery(...args),
}));

// Mock TimelineMobileSheet with expand/collapse support
vi.mock("../../../src/components/timeline/TimelineMobileSheet.jsx", () => ({
  default: ({ isOpen, selectedPeriod, itemCount, children }) => (
    isOpen ? (
      <div data-testid="timeline-mobile-sheet">
        {selectedPeriod && (
          <span data-testid="mobile-sheet-period">{selectedPeriod.label}</span>
        )}
        <span data-testid="mobile-sheet-count">{itemCount}</span>
        <div data-testid="mobile-sheet-children">{children}</div>
      </div>
    ) : null
  ),
}));

// Mock TimelineControls to simplify testing
vi.mock("../../../src/components/timeline/TimelineControls.jsx", () => ({
  default: ({ zoomLevel, onZoomLevelChange }) => (
    <div data-testid="timeline-controls">
      <span data-testid="current-zoom">{zoomLevel}</span>
      <button onClick={() => onZoomLevelChange("years")} data-testid="zoom-button">
        Change Zoom
      </button>
    </div>
  ),
}));

// Mock TimelineStrip to simplify testing
vi.mock("../../../src/components/timeline/TimelineStrip.jsx", () => ({
  default: ({ distribution, maxCount, selectedPeriod }) => (
    <div data-testid="timeline-strip">
      <span data-testid="distribution-count">{distribution?.length ?? 0}</span>
      <span data-testid="max-count">{maxCount}</span>
      {selectedPeriod && (
        <span data-testid="selected-period">{selectedPeriod.period}</span>
      )}
    </div>
  ),
}));

import TimelineView from "../../../src/components/timeline/TimelineView.jsx";

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

  const defaultProps = {
    entityType: "scene",
    items: [],
    renderItem: vi.fn((item) => <div key={item.id}>{item.title}</div>),
    onItemClick: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseTimelineState.mockReturnValue(defaultHookReturn);
    mockUseMediaQuery.mockReturnValue(false); // Default to desktop
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
    it("calls useTimelineState with correct entityType", () => {
      render(<TimelineView {...defaultProps} entityType="gallery" />);

      expect(mockUseTimelineState).toHaveBeenCalledWith({
        entityType: "gallery",
        autoSelectRecent: true,
        initialPeriod: null,
        filters: null,
      });
    });

    it("passes initialPeriod to useTimelineState when provided", () => {
      render(
        <TimelineView {...defaultProps} entityType="scene" initialPeriod="2024-03" />
      );

      expect(mockUseTimelineState).toHaveBeenCalledWith({
        entityType: "scene",
        autoSelectRecent: false,
        initialPeriod: "2024-03",
        filters: null,
      });
    });

    it("sets autoSelectRecent to false when initialPeriod is provided", () => {
      render(
        <TimelineView {...defaultProps} entityType="image" initialPeriod="2024-W15" />
      );

      expect(mockUseTimelineState).toHaveBeenCalledWith(
        expect.objectContaining({
          autoSelectRecent: false,
          initialPeriod: "2024-W15",
        })
      );
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
      const renderItem = vi.fn((item, index) => (
        <div key={item.id} data-testid={`item-${index}`}>
          {item.title}
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
        <TimelineView {...defaultProps} items={mockItems} renderItem={renderItem} />
      );

      expect(renderItem).toHaveBeenCalledTimes(3);

      // First call
      expect(renderItem).toHaveBeenNthCalledWith(
        1,
        mockItems[0],
        0,
        expect.objectContaining({
          onItemClick: defaultProps.onItemClick,
          dateFilter: expect.any(Object),
        })
      );
    });

    it("passes dateFilter to renderItem context", () => {
      const renderItem = vi.fn((item, index, context) => (
        <div key={item.id}>
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

      expect(screen.queryByTestId("timeline-mobile-sheet")).not.toBeInTheDocument();
    });

    it("renders timeline controls inside mobile sheet", () => {
      render(<TimelineView {...defaultProps} />);

      const sheetChildren = screen.getByTestId("mobile-sheet-children");
      expect(sheetChildren).toContainElement(screen.getByTestId("timeline-controls"));
    });

    it("renders timeline strip inside mobile sheet", () => {
      render(<TimelineView {...defaultProps} />);

      const sheetChildren = screen.getByTestId("mobile-sheet-children");
      expect(sheetChildren).toContainElement(screen.getByTestId("timeline-strip"));
    });

    it('shows mobile-friendly empty message when no period selected', () => {
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

  describe("onDateFilterChange Callback", () => {
    it("calls onDateFilterChange with date filter when selectedPeriod changes", () => {
      const onDateFilterChange = vi.fn();

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
        <TimelineView {...defaultProps} onDateFilterChange={onDateFilterChange} />
      );

      expect(onDateFilterChange).toHaveBeenCalledWith({
        start: "2024-01-01",
        end: "2024-01-31",
      });
    });

    it("does not call onDateFilterChange when selectedPeriod is null on mount", () => {
      const onDateFilterChange = vi.fn();

      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: null,
      });

      render(
        <TimelineView {...defaultProps} onDateFilterChange={onDateFilterChange} />
      );

      // No notification needed for null state - parent already knows no filter is active
      expect(onDateFilterChange).not.toHaveBeenCalled();
    });

    it("does not crash when onDateFilterChange is not provided", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      // Should not throw
      expect(() => render(<TimelineView {...defaultProps} />)).not.toThrow();
    });

    it("calls onDateFilterChange on each render when selectedPeriod changes", () => {
      // This test verifies that when the component re-renders with a different
      // selectedPeriod from the hook, the callback is called with the new values.
      // We test this by rendering twice with different mock returns.

      const onDateFilterChange1 = vi.fn();
      const onDateFilterChange2 = vi.fn();

      // First render with January
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      const { unmount } = render(
        <TimelineView {...defaultProps} onDateFilterChange={onDateFilterChange1} />
      );

      expect(onDateFilterChange1).toHaveBeenCalledWith({
        start: "2024-01-01",
        end: "2024-01-31",
      });

      unmount();

      // Second render with February (simulates what happens when user clicks different bar)
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-02",
          start: "2024-02-01",
          end: "2024-02-29",
          label: "February 2024",
        },
      });

      render(
        <TimelineView {...defaultProps} onDateFilterChange={onDateFilterChange2} />
      );

      expect(onDateFilterChange2).toHaveBeenCalledWith({
        start: "2024-02-01",
        end: "2024-02-29",
      });
    });
  });

  describe("onPeriodChange Callback", () => {
    it("calls onPeriodChange with period string when selectedPeriod changes", () => {
      const onPeriodChange = vi.fn();

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
        <TimelineView {...defaultProps} onPeriodChange={onPeriodChange} />
      );

      expect(onPeriodChange).toHaveBeenCalledWith("2024-01");
    });

    it("does not call onPeriodChange when initialPeriod matches selected period", () => {
      const onPeriodChange = vi.fn();

      // Selected period matches initialPeriod - no change needed
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
          initialPeriod="2024-01"
          onPeriodChange={onPeriodChange}
        />
      );

      // Should NOT be called since period already matches URL state
      expect(onPeriodChange).not.toHaveBeenCalled();
    });

    it("does not call onPeriodChange when selectedPeriod is already null on mount", () => {
      const onPeriodChange = vi.fn();

      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: null,
      });

      render(
        <TimelineView {...defaultProps} onPeriodChange={onPeriodChange} />
      );

      // Should not call since there's no change from initial state
      expect(onPeriodChange).not.toHaveBeenCalled();
    });

    it("does not crash when onPeriodChange is not provided", () => {
      mockUseTimelineState.mockReturnValue({
        ...defaultHookReturn,
        selectedPeriod: {
          period: "2024-01",
          start: "2024-01-01",
          end: "2024-01-31",
          label: "January 2024",
        },
      });

      expect(() => render(<TimelineView {...defaultProps} />)).not.toThrow();
    });
  });
});
