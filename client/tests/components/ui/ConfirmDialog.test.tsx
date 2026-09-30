import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConfirmDialog from "../../../src/components/ui/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("the dialog is a child of document.body, not of its parent", () => {
    const { container } = render(
      <div data-testid="parent">
        <ConfirmDialog
          isOpen
          onClose={() => {}}
          onConfirm={() => {}}
          message="Sure?"
        />
      </div>
    );

    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    expect(screen.getByTestId("parent").contains(dialog)).toBe(false);
    expect(dialog.closest("body")).toBe(document.body);
  });

  it("a backdrop click closes it and calls no ancestor onClick or onMouseDown", () => {
    const onClose = vi.fn();
    const onParentClick = vi.fn();
    const onParentMouseDown = vi.fn();
    render(
      <div onClick={onParentClick} onMouseDown={onParentMouseDown}>
        <ConfirmDialog
          isOpen
          onClose={onClose}
          onConfirm={() => {}}
          message="Sure?"
        />
      </div>
    );

    // The dialog's parent is the backdrop
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
    expect(onParentMouseDown).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    render(
      <ConfirmDialog
        isOpen={false}
        onClose={() => {}}
        onConfirm={() => {}}
        message="Sure?"
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
