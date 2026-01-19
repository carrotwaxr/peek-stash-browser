// client/tests/components/timeline/TimelineBar.test.jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TimelineBar from "../../../src/components/timeline/TimelineBar.jsx";

describe("TimelineBar", () => {
  const defaultProps = {
    period: "2024-03",
    count: 10,
    maxCount: 20,
    isSelected: false,
    isFocused: false,
    onClick: vi.fn(),
    label: "March 2024",
    onKeyDown: vi.fn(),
    tabIndex: -1,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders with correct aria-label", () => {
      render(<TimelineBar {...defaultProps} />);

      const bar = screen.getByRole("option");
      expect(bar).toHaveAttribute("aria-label", "March 2024: 10 items");
    });

    it("renders with role option", () => {
      render(<TimelineBar {...defaultProps} />);

      expect(screen.getByRole("option")).toBeInTheDocument();
    });

    it("renders with aria-selected false when not selected", () => {
      render(<TimelineBar {...defaultProps} isSelected={false} />);

      const bar = screen.getByRole("option");
      expect(bar).toHaveAttribute("aria-selected", "false");
    });

    it("renders with aria-selected true when selected", () => {
      render(<TimelineBar {...defaultProps} isSelected={true} />);

      const bar = screen.getByRole("option");
      expect(bar).toHaveAttribute("aria-selected", "true");
    });

    it("uses default tabIndex of -1", () => {
      render(<TimelineBar {...defaultProps} tabIndex={undefined} />);

      const bar = screen.getByRole("option");
      expect(bar).toHaveAttribute("tabindex", "-1");
    });

    it("accepts custom tabIndex", () => {
      render(<TimelineBar {...defaultProps} tabIndex={0} />);

      const bar = screen.getByRole("option");
      expect(bar).toHaveAttribute("tabindex", "0");
    });
  });

  describe("Bar Height Calculation", () => {
    it("calculates bar height proportionally to count/maxCount", () => {
      // count=10, maxCount=20 means 50% of max height (48px) = 24px
      render(<TimelineBar {...defaultProps} count={10} maxCount={20} />);

      const bar = screen.getByTestId("timeline-bar");
      expect(bar).toHaveStyle({ height: "24px" });
    });

    it("enforces minimum height of 4px", () => {
      // count=1, maxCount=1000 would give 0.05px, but min is 4px
      render(<TimelineBar {...defaultProps} count={1} maxCount={1000} />);

      const bar = screen.getByTestId("timeline-bar");
      expect(bar).toHaveStyle({ height: "4px" });
    });

    it("calculates full height at maxCount", () => {
      // count=20, maxCount=20 means 100% of max height (48px) = 48px
      render(<TimelineBar {...defaultProps} count={20} maxCount={20} />);

      const bar = screen.getByTestId("timeline-bar");
      expect(bar).toHaveStyle({ height: "48px" });
    });

    it("handles maxCount of 0 gracefully", () => {
      render(<TimelineBar {...defaultProps} count={0} maxCount={0} />);

      const bar = screen.getByTestId("timeline-bar");
      // When maxCount is 0, heightPercent is 0, so barHeight = max(4, 0) = 4
      expect(bar).toHaveStyle({ height: "4px" });
    });

    it("handles count of 0", () => {
      render(<TimelineBar {...defaultProps} count={0} maxCount={20} />);

      const bar = screen.getByTestId("timeline-bar");
      // 0/20 = 0%, max(4, 0) = 4px
      expect(bar).toHaveStyle({ height: "4px" });
    });
  });

  describe("Tooltip", () => {
    it("shows tooltip on mouse enter", async () => {
      const user = userEvent.setup();
      render(<TimelineBar {...defaultProps} count={10} />);

      const container = screen.getByRole("option");
      await user.hover(container);

      expect(screen.getByText("10 items")).toBeInTheDocument();
    });

    it("hides tooltip on mouse leave", async () => {
      const user = userEvent.setup();
      render(<TimelineBar {...defaultProps} count={10} />);

      const container = screen.getByRole("option");
      await user.hover(container);
      expect(screen.getByText("10 items")).toBeInTheDocument();

      await user.unhover(container);
      expect(screen.queryByText("10 items")).not.toBeInTheDocument();
    });

    it("uses singular 'item' for count of 1", async () => {
      const user = userEvent.setup();
      render(<TimelineBar {...defaultProps} count={1} />);

      const container = screen.getByRole("option");
      await user.hover(container);

      expect(screen.getByText("1 item")).toBeInTheDocument();
      expect(screen.queryByText("1 items")).not.toBeInTheDocument();
    });

    it("uses plural 'items' for count greater than 1", async () => {
      const user = userEvent.setup();
      render(<TimelineBar {...defaultProps} count={5} />);

      const container = screen.getByRole("option");
      await user.hover(container);

      expect(screen.getByText("5 items")).toBeInTheDocument();
    });
  });

  describe("Click Interactions", () => {
    it("calls onClick with period when clicked", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(
        <TimelineBar {...defaultProps} period="2024-03" onClick={onClick} />
      );

      const container = screen.getByRole("option");
      await user.click(container);

      expect(onClick).toHaveBeenCalledTimes(1);
      expect(onClick).toHaveBeenCalledWith("2024-03");
    });

    it("calls onClick with correct period for different periods", async () => {
      const user = userEvent.setup();
      const onClick = vi.fn();

      render(
        <TimelineBar {...defaultProps} period="2023-12" onClick={onClick} />
      );

      await user.click(screen.getByRole("option"));

      expect(onClick).toHaveBeenCalledWith("2023-12");
    });
  });

  describe("Keyboard Interactions", () => {
    it("calls onKeyDown when key is pressed", async () => {
      const user = userEvent.setup();
      const onKeyDown = vi.fn();

      render(<TimelineBar {...defaultProps} onKeyDown={onKeyDown} />);

      const container = screen.getByRole("option");
      container.focus();
      await user.keyboard("{ArrowRight}");

      expect(onKeyDown).toHaveBeenCalled();
    });
  });

  describe("Selected State Styling", () => {
    it("applies accent color to bar when not selected", () => {
      render(<TimelineBar {...defaultProps} isSelected={false} />);

      const bar = screen.getByTestId("timeline-bar");
      expect(bar.style.backgroundColor).toBe("var(--accent-primary)");
    });

    it("applies success color to bar when selected", () => {
      render(<TimelineBar {...defaultProps} isSelected={true} />);

      const bar = screen.getByTestId("timeline-bar");
      expect(bar.style.backgroundColor).toBe("var(--status-success)");
    });

    it("fills circle with success color when selected", () => {
      render(<TimelineBar {...defaultProps} isSelected={true} />);

      const circle = screen.getByTestId("timeline-circle");
      expect(circle.style.backgroundColor).toBe("var(--status-success)");
    });

    it("does not fill circle when not selected", () => {
      render(<TimelineBar {...defaultProps} isSelected={false} />);

      const circle = screen.getByTestId("timeline-circle");
      expect(circle.style.backgroundColor).toBe("var(--bg-primary)");
    });
  });

  describe("Focused State Styling", () => {
    it("applies focus ring to circle when isFocused is true", () => {
      render(<TimelineBar {...defaultProps} isFocused={true} />);

      const circle = screen.getByTestId("timeline-circle");
      expect(circle).toHaveClass("ring-2");
    });

    it("does not apply focus ring to circle when isFocused is false", () => {
      render(<TimelineBar {...defaultProps} isFocused={false} />);

      const circle = screen.getByTestId("timeline-circle");
      expect(circle).not.toHaveClass("ring-2");
    });
  });

  describe("Aria Label Content", () => {
    it("includes label and count in aria-label", () => {
      render(
        <TimelineBar {...defaultProps} label="January 2024" count={15} />
      );

      const bar = screen.getByRole("option");
      expect(bar).toHaveAttribute("aria-label", "January 2024: 15 items");
    });

    it("handles zero count in aria-label", () => {
      render(<TimelineBar {...defaultProps} label="December 2023" count={0} />);

      const bar = screen.getByRole("option");
      expect(bar).toHaveAttribute("aria-label", "December 2023: 0 items");
    });
  });
});
