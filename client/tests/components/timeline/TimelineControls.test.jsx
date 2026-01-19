// client/tests/components/timeline/TimelineControls.test.jsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import TimelineControls from "../../../src/components/timeline/TimelineControls.jsx";

describe("TimelineControls", () => {
  const defaultProps = {
    zoomLevel: "months",
    onZoomLevelChange: vi.fn(),
    zoomLevels: ["years", "months", "weeks", "days"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders all zoom level buttons", () => {
      render(<TimelineControls {...defaultProps} />);

      expect(screen.getByText("Years")).toBeInTheDocument();
      expect(screen.getByText("Months")).toBeInTheDocument();
      expect(screen.getByText("Weeks")).toBeInTheDocument();
      expect(screen.getByText("Days")).toBeInTheDocument();
    });

    it("marks the active zoom level with aria-pressed", () => {
      render(<TimelineControls {...defaultProps} />);

      const monthsButton = screen.getByText("Months").closest("button");
      const yearsButton = screen.getByText("Years").closest("button");

      expect(monthsButton).toHaveAttribute("aria-pressed", "true");
      expect(yearsButton).toHaveAttribute("aria-pressed", "false");
    });

    it("renders with role group and aria-label", () => {
      render(<TimelineControls {...defaultProps} />);

      expect(screen.getByRole("group")).toHaveAttribute(
        "aria-label",
        "Timeline zoom level"
      );
    });
  });

  describe("Click Interactions", () => {
    it("calls onZoomLevelChange with correct level when button clicked", async () => {
      const user = userEvent.setup();
      const onZoomLevelChange = vi.fn();

      render(
        <TimelineControls
          {...defaultProps}
          onZoomLevelChange={onZoomLevelChange}
        />
      );

      const daysButton = screen.getByText("Days").closest("button");
      await user.click(daysButton);

      expect(onZoomLevelChange).toHaveBeenCalledWith("days");
    });

    it("calls onZoomLevelChange for each zoom level", async () => {
      const user = userEvent.setup();
      const onZoomLevelChange = vi.fn();

      render(
        <TimelineControls
          {...defaultProps}
          onZoomLevelChange={onZoomLevelChange}
        />
      );

      await user.click(screen.getByText("Years").closest("button"));
      expect(onZoomLevelChange).toHaveBeenCalledWith("years");

      await user.click(screen.getByText("Weeks").closest("button"));
      expect(onZoomLevelChange).toHaveBeenCalledWith("weeks");
    });
  });

  describe("Custom Props", () => {
    it("applies custom className", () => {
      render(
        <TimelineControls {...defaultProps} className="custom-class" />
      );

      const group = screen.getByRole("group");
      expect(group).toHaveClass("custom-class");
    });

    it("renders subset of zoom levels when provided", () => {
      render(
        <TimelineControls
          {...defaultProps}
          zoomLevels={["years", "months"]}
        />
      );

      expect(screen.getByText("Years")).toBeInTheDocument();
      expect(screen.getByText("Months")).toBeInTheDocument();
      expect(screen.queryByText("Weeks")).not.toBeInTheDocument();
      expect(screen.queryByText("Days")).not.toBeInTheDocument();
    });
  });
});
