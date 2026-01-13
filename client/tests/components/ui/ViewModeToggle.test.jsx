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
});
