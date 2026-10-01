import { type ReactNode, useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Modal from "@/components/ui/Modal";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import { useShortcutScope } from "@/hooks/useShortcutScope";

/** Dispatches a keydown on the focused element (the body if none). */
function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}

function withScopes(ui: ReactNode) {
  return render(<ShortcutScopeProvider>{ui}</ShortcutScopeProvider>);
}

/** The backdrop: the element holding the dialog. */
function backdropOf(dialog: HTMLElement): HTMLElement {
  const backdrop = dialog.parentElement;
  if (!backdrop) throw new Error("the dialog has no backdrop");
  return backdrop;
}

afterEach(() => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
});

describe("Modal", () => {
  it("renders in a portal on document.body with role dialog, aria-modal and aria-labelledby naming its title", () => {
    withScopes(
      <div data-testid="transformed" style={{ transform: "scale(1.05)" }}>
        <Modal isOpen onClose={() => {}} title="Edit things">
          <p>Body</p>
        </Modal>
      </div>
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    expect(document.getElementById(labelId ?? "")?.textContent).toBe(
      "Edit things"
    );
    expect(screen.getByRole("dialog", { name: "Edit things" })).toBe(dialog);

    const backdrop = backdropOf(dialog);
    expect(backdrop.parentElement).toBe(document.body);
    expect(screen.getByTestId("transformed").contains(backdrop)).toBe(false);
  });

  it("renders nothing while closed", () => {
    withScopes(
      <Modal isOpen={false} onClose={() => {}} title="Closed">
        <p>Body</p>
      </Modal>
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape calls onClose; with dismissible false it does not", () => {
    const onClose = vi.fn();
    const { unmount } = withScopes(
      <Modal isOpen onClose={onClose} title="One">
        <button>Inside</button>
      </Modal>
    );
    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    const onCloseLocked = vi.fn();
    withScopes(
      <Modal isOpen onClose={onCloseLocked} title="Two" dismissible={false}>
        <button>Inside</button>
      </Modal>
    );
    press("Escape");
    expect(onCloseLocked).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("Tab from the last focusable wraps to the first, and Shift+Tab from the first to the last", () => {
    withScopes(
      <Modal
        isOpen
        onClose={() => {}}
        title="Trap"
        footer={<button>Last</button>}
      >
        <button>Middle</button>
      </Modal>
    );

    const first = screen.getByRole("button", { name: "Close" });
    const last = screen.getByRole("button", { name: "Last" });

    act(() => last.focus());
    press("Tab");
    expect(document.activeElement).toBe(first);

    press("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("focus moves to the first focusable on open (or initialFocusRef) and returns to the opener on close", () => {
    function Harness({ useInitial }: { useInitial: boolean }) {
      const [open, setOpen] = useState(false);
      const inputRef = useRef<HTMLInputElement>(null);
      return (
        <>
          <button onClick={() => setOpen(true)}>Opener</button>
          <Modal
            isOpen={open}
            onClose={() => setOpen(false)}
            title="Focus"
            {...(useInitial ? { initialFocusRef: inputRef } : {})}
          >
            <input aria-label="Name" ref={inputRef} />
          </Modal>
        </>
      );
    }

    const { unmount } = withScopes(<Harness useInitial={false} />);
    const opener = screen.getByRole("button", { name: "Opener" });
    act(() => opener.focus());
    fireEvent.click(opener);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
    unmount();

    withScopes(<Harness useInitial />);
    const opener2 = screen.getByRole("button", { name: "Opener" });
    act(() => opener2.focus());
    fireEvent.click(opener2);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Name" })
    );
    press("Escape");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener2);
  });

  it("a click on the backdrop closes; a click inside does not; mousedown inside then mouseup on the backdrop does not close", () => {
    const onClose = vi.fn();
    withScopes(
      <Modal isOpen onClose={onClose} title="Clicks">
        <input aria-label="Text" />
      </Modal>
    );
    const dialog = screen.getByRole("dialog");
    const backdrop = backdropOf(dialog);
    const input = screen.getByRole("textbox", { name: "Text" });

    // A click inside
    fireEvent.mouseDown(input);
    fireEvent.click(input);
    expect(onClose).not.toHaveBeenCalled();

    // A text selection dragged out of the field: the browser fires the
    // click on the common ancestor, the backdrop
    fireEvent.mouseDown(input);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    // A click on the backdrop
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("while open, a page-scope shortcut does not run", () => {
    const spy = vi.fn();
    function Page() {
      useShortcutScope({ layer: "page", keys: { r: spy } });
      return null;
    }
    withScopes(
      <>
        <Page />
        <Modal isOpen onClose={() => {}} title="Blocking">
          <button>Inside</button>
        </Modal>
      </>
    );

    press("r");

    expect(spy).not.toHaveBeenCalled();
  });

  it("two stacked modals: Escape closes only the top one", () => {
    function Stack() {
      const [lowerOpen, setLowerOpen] = useState(true);
      const [upperOpen, setUpperOpen] = useState(false);
      return (
        <Modal
          isOpen={lowerOpen}
          onClose={() => setLowerOpen(false)}
          title="Lower"
        >
          <button onClick={() => setUpperOpen(true)}>Open upper</button>
          <Modal
            isOpen={upperOpen}
            onClose={() => setUpperOpen(false)}
            title="Upper"
          >
            <button>Upper button</button>
          </Modal>
        </Modal>
      );
    }
    withScopes(<Stack />);

    fireEvent.click(screen.getByRole("button", { name: "Open upper" }));
    expect(screen.getByRole("dialog", { name: "Upper" })).toBeTruthy();

    press("Escape");

    expect(screen.queryByRole("dialog", { name: "Upper" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Lower" })).toBeTruthy();
  });
});
