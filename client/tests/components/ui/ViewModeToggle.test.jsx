/**
 * ViewModeToggle Component Tests
 *
 * Tests for the configurable view mode dropdown:
 * - Default modes (grid/wall) for backward compatibility
 * - Custom modes support
 * - Click handlers and selection state
 * - Dropdown open/close behavior
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ViewModeToggle from "../../../src/components/ui/ViewModeToggle.jsx";

describe("ViewModeToggle", () => {
  it("renders trigger button with current mode icon", () => {
    render(<ViewModeToggle value="grid" onChange={() => {}} />);
    const trigger = screen.getByRole("button", { name: /view mode/i });
    expect(trigger).toBeInTheDocument();
  });

  it("opens dropdown on click and shows default grid/wall modes", () => {
    render(<ViewModeToggle value="grid" onChange={() => {}} />);

    // Click trigger to open dropdown
    const trigger = screen.getByRole("button", { name: /view mode/i });
    fireEvent.click(trigger);

    // Dropdown should show both modes
    expect(screen.getByRole("option", { name: /grid view/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /wall view/i })).toBeInTheDocument();
  });

  it("renders custom modes when modes prop provided", () => {
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="grid" onChange={() => {}} />);

    // Open dropdown
    fireEvent.click(screen.getByRole("button", { name: /view mode/i }));

    expect(screen.getByRole("option", { name: /grid view/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /hierarchy view/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /wall view/i })).not.toBeInTheDocument();
  });

  it("calls onChange with mode id when option selected", () => {
    const onChange = vi.fn();
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="grid" onChange={onChange} />);

    // Open dropdown and select hierarchy
    fireEvent.click(screen.getByRole("button", { name: /view mode/i }));
    fireEvent.click(screen.getByRole("option", { name: /hierarchy view/i }));

    expect(onChange).toHaveBeenCalledWith("hierarchy");
  });

  it("marks the selected mode with aria-selected", () => {
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="hierarchy" onChange={() => {}} />);

    // Open dropdown
    fireEvent.click(screen.getByRole("button", { name: /view mode/i }));

    const hierarchyOption = screen.getByRole("option", { name: /hierarchy view/i });
    expect(hierarchyOption).toHaveAttribute("aria-selected", "true");
  });

  it("closes dropdown after selection", () => {
    const onChange = vi.fn();
    render(<ViewModeToggle value="grid" onChange={onChange} />);

    // Open dropdown
    fireEvent.click(screen.getByRole("button", { name: /view mode/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Select wall mode
    fireEvent.click(screen.getByRole("option", { name: /wall view/i }));

    // Dropdown should close
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes dropdown on Escape key", () => {
    render(<ViewModeToggle value="grid" onChange={() => {}} />);

    // Open dropdown
    fireEvent.click(screen.getByRole("button", { name: /view mode/i }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(document, { key: "Escape" });

    // Dropdown should close
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
