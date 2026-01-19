// client/tests/components/timeline/TimelineMobileSheet.test.jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TimelineMobileSheet from "../../../src/components/timeline/TimelineMobileSheet.jsx";

describe("TimelineMobileSheet", () => {
  const defaultProps = {
    isOpen: true,
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

    it("is positioned fixed at the bottom", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const sheet = screen.getByTestId("timeline-mobile-sheet");
      expect(sheet).toHaveClass("fixed", "bottom-0", "left-0", "right-0");
    });

    it("has correct z-index for overlay", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const sheet = screen.getByTestId("timeline-mobile-sheet");
      expect(sheet).toHaveClass("z-50");
    });

    it("renders chevron icon", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      expect(screen.getByTestId("chevron-icon")).toBeInTheDocument();
    });
  });

  describe("Children Content", () => {
    it("renders children content when expanded (default)", () => {
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

    it("starts expanded by default", () => {
      render(
        <TimelineMobileSheet {...defaultProps}>
          <div data-testid="timeline-controls">Controls</div>
        </TimelineMobileSheet>
      );

      // Children should be immediately visible
      expect(screen.getByTestId("timeline-controls")).toBeVisible();
    });
  });

  describe("Expand/Collapse Toggle", () => {
    it("collapses when header is clicked", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const header = screen.getByTestId("sheet-header");
      await user.click(header);

      // After collapse, children should not be visible
      expect(screen.queryByTestId("timeline-content")).not.toBeInTheDocument();
    });

    it("expands when header is clicked while collapsed", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const header = screen.getByTestId("sheet-header");
      // First click - collapse
      await user.click(header);
      expect(screen.queryByTestId("timeline-content")).not.toBeInTheDocument();

      // Second click - expand
      await user.click(header);
      expect(screen.getByTestId("timeline-content")).toBeInTheDocument();
    });

    it("shows selection info when minimized", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const header = screen.getByTestId("sheet-header");
      await user.click(header); // Collapse

      expect(screen.getByText("March 2024")).toBeInTheDocument();
      expect(screen.getByText("42 items")).toBeInTheDocument();
    });

    it("hides selection info when expanded", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      // When expanded, selection info should not be visible
      expect(screen.queryByText("March 2024")).not.toBeInTheDocument();
      expect(screen.queryByText("42 items")).not.toBeInTheDocument();
    });

    it("uses singular 'item' for count of 1", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} itemCount={1} />);

      const header = screen.getByTestId("sheet-header");
      await user.click(header); // Collapse

      expect(screen.getByText("1 item")).toBeInTheDocument();
    });

    it("chevron rotates when expanded", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const chevron = screen.getByTestId("chevron-icon");
      // Expanded by default - chevron should point down (rotate-180)
      expect(chevron).toHaveClass("rotate-180");
    });

    it("chevron points up when collapsed", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const header = screen.getByTestId("sheet-header");
      await user.click(header); // Collapse

      const chevron = screen.getByTestId("chevron-icon");
      expect(chevron).not.toHaveClass("rotate-180");
    });
  });

  describe("Accessibility", () => {
    it("has accessible button role on header", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      expect(screen.getByRole("button")).toBeInTheDocument();
    });

    it("has aria-expanded attribute when expanded", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("updates aria-expanded when collapsed", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const button = screen.getByRole("button");
      await user.click(button);

      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("has appropriate aria-label when expanded", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-label", "Minimize timeline");
    });

    it("has appropriate aria-label when collapsed", async () => {
      const user = userEvent.setup();
      render(<TimelineMobileSheet {...defaultProps} />);

      const button = screen.getByRole("button");
      await user.click(button);

      expect(button).toHaveAttribute("aria-label", "Expand timeline");
    });
  });

  describe("Styling", () => {
    it("has style attribute with background color", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const sheet = screen.getByTestId("timeline-mobile-sheet");
      expect(sheet).toHaveAttribute("style", expect.stringContaining("background-color"));
    });

    it("has style attribute with border top", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const sheet = screen.getByTestId("timeline-mobile-sheet");
      expect(sheet).toHaveAttribute("style", expect.stringContaining("border-top"));
    });

    it("drag handle has correct styling", () => {
      render(<TimelineMobileSheet {...defaultProps} />);

      const dragHandle = screen.getByTestId("drag-handle");
      expect(dragHandle).toHaveClass("w-10", "h-1", "rounded-full");
    });
  });
});
