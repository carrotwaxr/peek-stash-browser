// client/tests/components/timeline/TimelineStrip.test.jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TimelineStrip from "../../../src/components/timeline/TimelineStrip.jsx";

describe("TimelineStrip", () => {
  const defaultDistribution = [
    { period: "2024-01", count: 10 },
    { period: "2024-02", count: 20 },
    { period: "2024-03", count: 15 },
  ];

  const defaultProps = {
    distribution: defaultDistribution,
    maxCount: 20,
    zoomLevel: "months",
    selectedPeriod: null,
    onSelectPeriod: vi.fn(),
    onKeyboardNavigate: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders with role listbox and aria-label", () => {
      render(<TimelineStrip {...defaultProps} />);

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveAttribute("aria-label", "Timeline");
    });

    it("renders a TimelineBar for each distribution item", () => {
      render(<TimelineStrip {...defaultProps} />);

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(3);
    });

    it("passes correct props to TimelineBar components", () => {
      render(<TimelineStrip {...defaultProps} />);

      // Check that each TimelineBar has the correct aria-label
      expect(
        screen.getByRole("option", { name: /Jan 2024: 10 items/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Feb 2024: 20 items/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: /Mar 2024: 15 items/i })
      ).toBeInTheDocument();
    });

    it("renders timeline line element", () => {
      render(<TimelineStrip {...defaultProps} />);

      // The timeline line is horizontal, connecting all points
      const timelineLine = screen.getByTestId("timeline-line");
      expect(timelineLine).toBeInTheDocument();
    });

    it("applies custom className", () => {
      const { container } = render(
        <TimelineStrip {...defaultProps} className="custom-class" />
      );

      // className is applied to the outer wrapper, which contains the listbox
      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass("custom-class");
    });

    it("makes container focusable with tabIndex 0", () => {
      render(<TimelineStrip {...defaultProps} />);

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveAttribute("tabindex", "0");
    });
  });

  describe("Empty State", () => {
    it('shows "No dated content available" when distribution is empty', () => {
      render(<TimelineStrip {...defaultProps} distribution={[]} />);

      expect(screen.getByText("No dated content available")).toBeInTheDocument();
    });

    it("does not render listbox when distribution is empty", () => {
      render(<TimelineStrip {...defaultProps} distribution={[]} />);

      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });
  });

  describe("Period Labels", () => {
    it('formats short labels for "years" zoom level', () => {
      const yearDistribution = [
        { period: "2022", count: 5 },
        { period: "2023", count: 10 },
        { period: "2024", count: 15 },
      ];

      render(
        <TimelineStrip
          {...defaultProps}
          distribution={yearDistribution}
          zoomLevel="years"
        />
      );

      expect(screen.getByText("2022")).toBeInTheDocument();
      expect(screen.getByText("2023")).toBeInTheDocument();
      expect(screen.getByText("2024")).toBeInTheDocument();
    });

    it('formats short labels for "months" zoom level (just month, no year)', () => {
      render(<TimelineStrip {...defaultProps} zoomLevel="months" />);

      // Short labels show just month abbreviation
      expect(screen.getByText("Jan")).toBeInTheDocument();
      expect(screen.getByText("Feb")).toBeInTheDocument();
      expect(screen.getByText("Mar")).toBeInTheDocument();
    });

    it('formats short labels for "weeks" zoom level', () => {
      const weekDistribution = [
        { period: "2024-W01", count: 5 },
        { period: "2024-W02", count: 10 },
        { period: "2024-W12", count: 15 },
      ];

      render(
        <TimelineStrip
          {...defaultProps}
          distribution={weekDistribution}
          zoomLevel="weeks"
        />
      );

      expect(screen.getByText("W01")).toBeInTheDocument();
      expect(screen.getByText("W02")).toBeInTheDocument();
      expect(screen.getByText("W12")).toBeInTheDocument();
    });

    it('formats short labels for "days" zoom level (just day number)', () => {
      const dayDistribution = [
        { period: "2024-01-15", count: 5 },
        { period: "2024-01-16", count: 10 },
        { period: "2024-01-17", count: 15 },
      ];

      render(
        <TimelineStrip
          {...defaultProps}
          distribution={dayDistribution}
          zoomLevel="days"
        />
      );

      // Short labels show just day number
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(screen.getByText("16")).toBeInTheDocument();
      expect(screen.getByText("17")).toBeInTheDocument();
    });

    it("falls back to months format for unknown zoom level", () => {
      render(<TimelineStrip {...defaultProps} zoomLevel="unknown" />);

      // Should still render with months short format
      expect(screen.getByText("Jan")).toBeInTheDocument();
    });
  });

  describe("Context Markers", () => {
    it("shows year markers when year changes in months zoom level", () => {
      const distribution = [
        { period: "2023-11", count: 5 },
        { period: "2023-12", count: 10 },
        { period: "2024-01", count: 15 },
        { period: "2024-02", count: 20 },
      ];

      render(
        <TimelineStrip
          {...defaultProps}
          distribution={distribution}
          zoomLevel="months"
        />
      );

      // Should show year markers at start of each year
      const markers = screen.getAllByTestId("context-marker");
      expect(markers).toHaveLength(2); // 2023 and 2024
      expect(screen.getByText("2023")).toBeInTheDocument();
      expect(screen.getByText("2024")).toBeInTheDocument();
    });

    it("shows month markers when month changes in days zoom level", () => {
      const distribution = [
        { period: "2024-01-30", count: 5 },
        { period: "2024-01-31", count: 10 },
        { period: "2024-02-01", count: 15 },
        { period: "2024-02-02", count: 20 },
      ];

      render(
        <TimelineStrip
          {...defaultProps}
          distribution={distribution}
          zoomLevel="days"
        />
      );

      // Should show month markers
      const markers = screen.getAllByTestId("context-marker");
      expect(markers).toHaveLength(2); // Jan 2024 and Feb 2024
      expect(screen.getByText("Jan 2024")).toBeInTheDocument();
      expect(screen.getByText("Feb 2024")).toBeInTheDocument();
    });

    it("does not show markers for years zoom level", () => {
      const yearDistribution = [
        { period: "2022", count: 5 },
        { period: "2023", count: 10 },
        { period: "2024", count: 15 },
      ];

      render(
        <TimelineStrip
          {...defaultProps}
          distribution={yearDistribution}
          zoomLevel="years"
        />
      );

      expect(screen.queryByTestId("context-marker")).not.toBeInTheDocument();
    });
  });

  describe("Selected Period Highlighting", () => {
    it("highlights the selected period bar", () => {
      render(
        <TimelineStrip
          {...defaultProps}
          selectedPeriod={{ period: "2024-02" }}
        />
      );

      const selectedOption = screen.getByRole("option", {
        name: /Feb 2024: 20 items/i,
      });
      expect(selectedOption).toHaveAttribute("aria-selected", "true");
    });

    it("does not highlight non-selected period bars", () => {
      render(
        <TimelineStrip
          {...defaultProps}
          selectedPeriod={{ period: "2024-02" }}
        />
      );

      const nonSelectedOption = screen.getByRole("option", {
        name: /Jan 2024: 10 items/i,
      });
      expect(nonSelectedOption).toHaveAttribute("aria-selected", "false");
    });

    it("applies bold font weight to selected period label", () => {
      const { container } = render(
        <TimelineStrip
          {...defaultProps}
          selectedPeriod={{ period: "2024-02" }}
        />
      );

      // Find the label div elements and check for selected styling via font-weight
      const labels = container.querySelectorAll("div.text-xs");
      const selectedLabel = Array.from(labels).find(
        (div) => div.style.fontWeight === "600"
      );
      expect(selectedLabel).toBeInTheDocument();
      // Short label is just "Feb" (no year)
      expect(selectedLabel).toHaveTextContent("Feb");
    });

    it("applies normal font weight to non-selected labels", () => {
      const { container } = render(
        <TimelineStrip {...defaultProps} selectedPeriod={null} />
      );

      // All labels should have normal font weight when nothing is selected
      const labels = container.querySelectorAll("div.text-xs");
      const boldLabel = Array.from(labels).find(
        (div) => div.style.fontWeight === "600"
      );
      expect(boldLabel).toBeUndefined();
    });
  });

  describe("Click Interactions", () => {
    it("calls onSelectPeriod when a bar is clicked", async () => {
      const user = userEvent.setup();
      const onSelectPeriod = vi.fn();

      render(
        <TimelineStrip {...defaultProps} onSelectPeriod={onSelectPeriod} />
      );

      const secondOption = screen.getByRole("option", {
        name: /Feb 2024: 20 items/i,
      });
      await user.click(secondOption);

      expect(onSelectPeriod).toHaveBeenCalledWith("2024-02");
    });
  });

  describe("Keyboard Navigation", () => {
    it("navigates right with ArrowRight key", async () => {
      const user = userEvent.setup();

      render(<TimelineStrip {...defaultProps} />);

      const listbox = screen.getByRole("listbox");
      await user.click(listbox); // Focus the container (sets initial focus to last)

      // After focus, focusedIndex should be at last item (index 2)
      // ArrowRight should wrap to first (index 0)
      await user.keyboard("{ArrowRight}");

      // First item should now be focused (focus ring is on the circle)
      const firstCircle = screen.getAllByTestId("timeline-circle")[0];
      expect(firstCircle).toHaveClass("ring-2");
    });

    it("navigates left with ArrowLeft key", async () => {
      const user = userEvent.setup();

      render(<TimelineStrip {...defaultProps} />);

      await user.tab(); // Tab to focus the container (keyboard users get focus ring)

      // After focus, focusedIndex should be at last item (index 2)
      // ArrowLeft should move to previous (index 1)
      await user.keyboard("{ArrowLeft}");

      // Second item should now be focused (focus ring is on the circle)
      const secondCircle = screen.getAllByTestId("timeline-circle")[1];
      expect(secondCircle).toHaveClass("ring-2");
    });

    it("navigates to first item with Home key", async () => {
      const user = userEvent.setup();

      render(<TimelineStrip {...defaultProps} />);

      const listbox = screen.getByRole("listbox");
      await user.click(listbox);
      await user.keyboard("{Home}");

      const firstCircle = screen.getAllByTestId("timeline-circle")[0];
      expect(firstCircle).toHaveClass("ring-2");
    });

    it("navigates to last item with End key", async () => {
      const user = userEvent.setup();

      render(<TimelineStrip {...defaultProps} />);

      const listbox = screen.getByRole("listbox");
      await user.click(listbox);
      await user.keyboard("{Home}"); // First go to first
      await user.keyboard("{End}"); // Then to last

      const lastCircle = screen.getAllByTestId("timeline-circle")[2];
      expect(lastCircle).toHaveClass("ring-2");
    });

    it("selects focused item with Enter key", async () => {
      const user = userEvent.setup();
      const onSelectPeriod = vi.fn();

      render(
        <TimelineStrip {...defaultProps} onSelectPeriod={onSelectPeriod} />
      );

      const listbox = screen.getByRole("listbox");
      await user.click(listbox);
      await user.keyboard("{Home}"); // Go to first item
      await user.keyboard("{Enter}");

      expect(onSelectPeriod).toHaveBeenCalledWith("2024-01");
    });

    it("selects focused item with Space key", async () => {
      const user = userEvent.setup();
      const onSelectPeriod = vi.fn();

      render(
        <TimelineStrip {...defaultProps} onSelectPeriod={onSelectPeriod} />
      );

      const listbox = screen.getByRole("listbox");
      await user.click(listbox);
      await user.keyboard("{Home}"); // Go to first item
      await user.keyboard(" ");

      expect(onSelectPeriod).toHaveBeenCalledWith("2024-01");
    });

    it("passes unhandled keys to onKeyboardNavigate", async () => {
      const user = userEvent.setup();
      const onKeyboardNavigate = vi.fn();

      render(
        <TimelineStrip
          {...defaultProps}
          onKeyboardNavigate={onKeyboardNavigate}
        />
      );

      const listbox = screen.getByRole("listbox");
      await user.click(listbox);
      await user.keyboard("+"); // Unhandled key

      expect(onKeyboardNavigate).toHaveBeenCalled();
    });

    it("wraps focus from last to first with ArrowRight", async () => {
      const user = userEvent.setup();

      render(<TimelineStrip {...defaultProps} />);

      const listbox = screen.getByRole("listbox");
      await user.click(listbox); // Focus initially at last (index 2)
      await user.keyboard("{ArrowRight}"); // Should wrap to first (index 0)

      const firstCircle = screen.getAllByTestId("timeline-circle")[0];
      expect(firstCircle).toHaveClass("ring-2");
    });

    it("wraps focus from first to last with ArrowLeft", async () => {
      const user = userEvent.setup();

      render(<TimelineStrip {...defaultProps} />);

      const listbox = screen.getByRole("listbox");
      await user.click(listbox);
      await user.keyboard("{Home}"); // Go to first
      await user.keyboard("{ArrowLeft}"); // Should wrap to last

      const lastCircle = screen.getAllByTestId("timeline-circle")[2];
      expect(lastCircle).toHaveClass("ring-2");
    });
  });

  describe("Focus Management", () => {
    it("sets initial focus to selected period when focused via keyboard", async () => {
      const user = userEvent.setup();

      render(
        <TimelineStrip
          {...defaultProps}
          selectedPeriod={{ period: "2024-02" }}
        />
      );

      await user.tab(); // Tab to focus the container (keyboard users get focus ring)

      // The second circle (index 1) should be focused
      const secondCircle = screen.getAllByTestId("timeline-circle")[1];
      expect(secondCircle).toHaveClass("ring-2");
    });

    it("sets initial focus to last (most recent) when no period is selected", async () => {
      const user = userEvent.setup();

      render(<TimelineStrip {...defaultProps} selectedPeriod={null} />);

      await user.tab(); // Tab to focus the container (keyboard users get focus ring)

      // The last circle should be focused
      const lastCircle = screen.getAllByTestId("timeline-circle")[2];
      expect(lastCircle).toHaveClass("ring-2");
    });

    it("does not reset focus if already focused", async () => {
      const user = userEvent.setup();

      render(<TimelineStrip {...defaultProps} selectedPeriod={null} />);

      const listbox = screen.getByRole("listbox");
      await user.click(listbox); // Initial focus at last
      await user.keyboard("{Home}"); // Move to first

      // Trigger another focus event - should NOT reset
      listbox.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

      // First circle should still be focused (not reset to last)
      const firstCircle = screen.getAllByTestId("timeline-circle")[0];
      expect(firstCircle).toHaveClass("ring-2");
    });
  });
});
