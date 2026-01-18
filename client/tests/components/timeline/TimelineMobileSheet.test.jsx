// client/tests/components/timeline/TimelineMobileSheet.test.jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TimelineMobileSheet from "../../../src/components/timeline/TimelineMobileSheet.jsx";

describe("TimelineMobileSheet", () => {
  const defaultProps = {
    isOpen: true,
    onDismiss: vi.fn(),
    selectedPeriod: { period: "2024-03", label: "March 2024" },
    itemCount: 42,
    children: <div data-testid="timeline-content">Timeline Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders when isOpen is true", () => {
      render(<TimelineMobileSheet {...defaultProps} isOpen={true} />);

      expect(screen.getByTestId("timeline-mobile-sheet")).toBeInTheDocument();
    });

    it("does not render when isOpen is false", () => {
      render(<TimelineMobileSheet {...defaultProps} isOpen={false} />);

      expect(
        screen.queryByTestId("timeline-mobile-sheet")
      ).not.toBeInTheDocument();
    });

    it("renders drag handle", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
    });
  });

  describe("Selected Period Display", () => {
    it("shows selected period label", () => {
      render(
        <TimelineMobileSheet
          {...defaultProps}
          selectedPeriod={{ period: "2024-03", label: "March 2024" }}
        />
      );

      expect(screen.getByText("March 2024")).toBeInTheDocument();
    });

    it("shows different period labels correctly", () => {
      render(
        <TimelineMobileSheet
          {...defaultProps}
          selectedPeriod={{ period: "2023-12", label: "December 2023" }}
        />
      );

      expect(screen.getByText("December 2023")).toBeInTheDocument();
    });

    it("handles null selectedPeriod gracefully", () => {
      render(
        <TimelineMobileSheet {...defaultProps} selectedPeriod={null} />
      );

      expect(screen.getByTestId("timeline-mobile-sheet")).toBeInTheDocument();
    });
  });

  describe("Item Count Display", () => {
    it("shows item count", () => {
      render(<TimelineMobileSheet {...defaultProps} itemCount={42} />);

      expect(screen.getByText(/42/)).toBeInTheDocument();
    });

    it("shows different item counts correctly", () => {
      render(<TimelineMobileSheet {...defaultProps} itemCount={100} />);

      expect(screen.getByText(/100/)).toBeInTheDocument();
    });

    it("handles zero item count", () => {
      render(<TimelineMobileSheet {...defaultProps} itemCount={0} />);

      expect(screen.getByText("0 items")).toBeInTheDocument();
    });

    it("uses singular 'item' for count of 1", () => {
      render(<TimelineMobileSheet {...defaultProps} itemCount={1} />);

      expect(screen.getByText("1 item")).toBeInTheDocument();
    });

    it("uses plural 'items' for count greater than 1", () => {
      render(<TimelineMobileSheet {...defaultProps} itemCount={5} />);

      expect(screen.getByText("5 items")).toBeInTheDocument();
    });
  });

  describe("Children Content", () => {
    it("renders children content", () => {
      render(
        <TimelineMobileSheet {...defaultProps}>
          <div data-testid="child-content">Child Content</div>
        </TimelineMobileSheet>
      );

      expect(screen.getByTestId("child-content")).toBeInTheDocument();
    });

    it("renders multiple children", () => {
      render(
        <TimelineMobileSheet {...defaultProps}>
          <div data-testid="child-1">First</div>
          <div data-testid="child-2">Second</div>
        </TimelineMobileSheet>
      );

      expect(screen.getByTestId("child-1")).toBeInTheDocument();
      expect(screen.getByTestId("child-2")).toBeInTheDocument();
    });
  });

  describe("Expanded State Toggle", () => {
    it("starts in minimized state by default", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const sheet = screen.getByTestId("timeline-mobile-sheet");
      // Minimized height is 48px
      expect(sheet).toHaveStyle({ height: "48px" });
    });

    it("toggles to expanded state on click", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const header = screen.getByTestId("sheet-header");
      await user.click(header);

      const sheet = screen.getByTestId("timeline-mobile-sheet");
      // Expanded height is 200px
      expect(sheet).toHaveStyle({ height: "200px" });
    });

    it("toggles back to minimized state on second click", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const header = screen.getByTestId("sheet-header");

      // First click - expand
      await user.click(header);
      expect(screen.getByTestId("timeline-mobile-sheet")).toHaveStyle({
        height: "200px",
      });

      // Second click - minimize
      await user.click(header);
      expect(screen.getByTestId("timeline-mobile-sheet")).toHaveStyle({
        height: "48px",
      });
    });
  });

  describe("Chevron Icon", () => {
    it("renders chevron icon", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      expect(screen.getByTestId("chevron-icon")).toBeInTheDocument();
    });

    it("chevron points up when minimized", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const chevron = screen.getByTestId("chevron-icon");
      // When minimized, chevron should not be rotated
      expect(chevron).not.toHaveClass("rotate-180");
    });

    it("chevron rotates when expanded", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const header = screen.getByTestId("sheet-header");
      await user.click(header);

      const chevron = screen.getByTestId("chevron-icon");
      expect(chevron).toHaveClass("rotate-180");
    });
  });

  describe("Accessibility", () => {
    it("has accessible button role on header", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("has aria-expanded attribute", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("updates aria-expanded when expanded", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const button = screen.getByRole("button");
      await user.click(button);

      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("has appropriate aria-label", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute(
        "aria-label",
        expect.stringContaining("timeline")
      );
    });
  });
});
