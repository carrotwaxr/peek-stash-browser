/**
 * ViewModeToggle Component Tests
 *
 * Tests for the configurable view mode dropdown:
 * - Default modes (grid/wall) for backward compatibility
 * - Custom modes support
 * - Click handlers and selection state
 * - Dropdown open/close behavior
 * - The keyboard: Enter opens it on the current mode, the arrows move, Escape
 *   closes (the D-pad of TV mode)
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ViewModeToggle from "../../../src/components/ui/ViewModeToggle";

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
    expect(
      screen.getByRole("option", { name: /grid view/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /wall view/i })
    ).toBeInTheDocument();
  });

  it("renders custom modes when modes prop provided", () => {
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="grid" onChange={() => {}} />);

    // Open dropdown
    fireEvent.click(screen.getByRole("button", { name: /view mode/i }));

    expect(
      screen.getByRole("option", { name: /grid view/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /hierarchy view/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /wall view/i })
    ).not.toBeInTheDocument();
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
    render(
      <ViewModeToggle modes={modes} value="hierarchy" onChange={() => {}} />
    );

    // Open dropdown
    fireEvent.click(screen.getByRole("button", { name: /view mode/i }));

    const hierarchyOption = screen.getByRole("option", {
      name: /hierarchy view/i,
    });
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

    // Press Escape on the focused mode
    fireEvent.keyDown(screen.getByRole("option", { name: /grid view/i }), {
      key: "Escape",
    });

    // Dropdown should close
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("Enter opens the menu with focus on the current mode; ArrowDown then Enter picks the next; Escape closes and returns focus", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "wall", label: "Wall view" },
      { id: "table", label: "Table view" },
    ];
    render(<ViewModeToggle modes={modes} value="wall" onChange={onChange} />);
    const trigger = screen.getByRole("button", { name: /view mode/i });

    // Enter on the focused button (a remote's OK) opens the menu on "wall"
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("option", { name: /wall view/i })).toHaveFocus();

    // Escape closes it and focus is back on the button
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    // Open again: ArrowDown moves to the next mode, Enter picks it
    await user.keyboard("{Enter}");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: /table view/i })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(onChange).toHaveBeenCalledWith("table");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("ArrowUp wraps from the first mode to the last", async () => {
    const user = userEvent.setup();
    render(<ViewModeToggle value="grid" onChange={() => {}} />);
    screen.getByRole("button", { name: /view mode/i }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("option", { name: /grid view/i })).toHaveFocus();

    await user.keyboard("{ArrowUp}");

    expect(screen.getByRole("option", { name: /wall view/i })).toHaveFocus();
  });
});
