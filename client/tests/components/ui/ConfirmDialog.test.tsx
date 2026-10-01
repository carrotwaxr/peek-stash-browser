import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import ConfirmDialog from "../../../src/components/ui/ConfirmDialog";
import HideConfirmationDialog from "../../../src/components/ui/HideConfirmationDialog";

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

  it("renders through Modal: Escape cancels", () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ShortcutScopeProvider>
        <ConfirmDialog
          isOpen
          onClose={onClose}
          onConfirm={onConfirm}
          title="Delete it"
          message="Sure?"
        />
      </ShortcutScopeProvider>
    );

    // Modal's title id names the dialog (no fixed "dialog-title" id)
    expect(screen.getByRole("dialog", { name: "Delete it" })).toBeTruthy();
    expect(document.getElementById("dialog-title")).toBeNull();

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      (document.activeElement ?? document.body).dispatchEvent(event);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("opens with focus on Cancel, not on the close button", () => {
    render(
      <ConfirmDialog
        isOpen
        onClose={() => {}}
        onConfirm={() => {}}
        message="Sure?"
        confirmText="Delete"
      />
    );

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" })
    );
  });

  it("opens with focus on the HideConfirmationDialog's checkbox", () => {
    render(
      <HideConfirmationDialog
        isOpen
        onClose={() => {}}
        onConfirm={() => {}}
        entityType="tag"
        entityName="Outdoors"
      />
    );

    expect(document.activeElement).toBe(
      screen.getByRole("checkbox", { name: "Don't ask me again" })
    );
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
