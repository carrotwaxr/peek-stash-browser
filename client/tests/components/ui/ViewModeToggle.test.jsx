/**
 * ViewModeToggle Component Tests
 *
 * Tests for the configurable view mode toggle:
 * - Default modes (grid/wall) for backward compatibility
 * - Custom modes support
 * - Click handlers and active state
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ViewModeToggle from "../../../src/components/ui/ViewModeToggle.jsx";

describe("ViewModeToggle", () => {
  it("renders default grid/wall modes when no modes prop", () => {
    render(<ViewModeToggle value="grid" onChange={() => {}} />);
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    expect(screen.getByLabelText("Wall view")).toBeInTheDocument();
  });

  it("renders custom modes when modes prop provided", () => {
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="grid" onChange={() => {}} />);
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    expect(screen.getByLabelText("Hierarchy view")).toBeInTheDocument();
    expect(screen.queryByLabelText("Wall view")).not.toBeInTheDocument();
  });

  it("calls onChange with mode id when clicked", () => {
    const onChange = vi.fn();
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="grid" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Hierarchy view"));
    expect(onChange).toHaveBeenCalledWith("hierarchy");
  });

  it("highlights the active mode", () => {
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="hierarchy" onChange={() => {}} />);
    const hierarchyBtn = screen.getByLabelText("Hierarchy view");
    expect(hierarchyBtn).toHaveAttribute("aria-pressed", "true");
  });

  describe("rapid click stability", () => {
    it("shows exactly one active button after rapid clicks", async () => {
      const onChange = vi.fn();
      const { rerender } = render(
        <ViewModeToggle
          modes={[
            { id: "grid", label: "Grid view" },
            { id: "wall", label: "Wall view" },
            { id: "table", label: "Table view" },
          ]}
          value="grid"
          onChange={onChange}
        />
      );

      const wallBtn = screen.getByLabelText("Wall view");
      const tableBtn = screen.getByLabelText("Table view");
      const gridBtn = screen.getByLabelText("Grid view");

      // Rapid clicks
      fireEvent.click(wallBtn);
      fireEvent.click(tableBtn);
      fireEvent.click(gridBtn);
      fireEvent.click(wallBtn);

      // Simulate parent updating value to last clicked
      rerender(
        <ViewModeToggle
          modes={[
            { id: "grid", label: "Grid view" },
            { id: "wall", label: "Wall view" },
            { id: "table", label: "Table view" },
          ]}
          value="wall"
          onChange={onChange}
        />
      );

      // Verify exactly one button is active
      const buttons = screen.getAllByRole("button");
      const activeButtons = buttons.filter(
        (btn) => btn.getAttribute("aria-pressed") === "true"
      );
      expect(activeButtons).toHaveLength(1);
      expect(activeButtons[0]).toBe(screen.getByLabelText("Wall view"));
    });

    it("immediately shows clicked button as active (optimistic)", () => {
      const onChange = vi.fn();
      render(
        <ViewModeToggle
          modes={[
            { id: "grid", label: "Grid view" },
            { id: "wall", label: "Wall view" },
          ]}
          value="grid"
          onChange={onChange}
        />
      );

      const wallBtn = screen.getByLabelText("Wall view");
      fireEvent.click(wallBtn);

      // Should immediately show as active (optimistic update)
      expect(wallBtn.getAttribute("aria-pressed")).toBe("true");
    });
  });
});
