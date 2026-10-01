import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import Modal from "../../src/components/ui/Modal";
import { useConfirmDialog } from "../../src/hooks/useConfirmDialog";

type Confirm = ReturnType<typeof useConfirmDialog>["confirm"];

/** Renders the hook's dialog and hands out its `confirm` */
const Harness = ({ onReady }: { onReady: (confirm: Confirm) => void }) => {
  const { confirm, dialog } = useConfirmDialog();
  onReady(confirm);
  return <>{dialog}</>;
};

const renderHarness = (wrap = (node: React.ReactNode) => node) => {
  let confirm: Confirm | undefined;
  const utils = render(
    <ShortcutScopeProvider>
      {wrap(
        <Harness
          onReady={(c) => {
            confirm = c;
          }}
        />
      )}
    </ShortcutScopeProvider>
  );
  if (!confirm) throw new Error("hook did not render");
  return { ...utils, confirm };
};

const pressEscape = () => {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
};

describe("useConfirmDialog", () => {
  it("Confirm resolves true and closes the dialog", async () => {
    const { confirm } = renderHarness();

    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = confirm({
        title: "Delete it?",
        message: "Gone for good.",
        confirmText: "Delete",
      });
    });

    const dialog = screen.getByRole("dialog", { name: "Delete it?" });
    expect(dialog.textContent).toContain("Gone for good.");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await expect(answer).resolves.toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Cancel resolves false", async () => {
    const { confirm } = renderHarness();

    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = confirm({ message: "Sure?" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with focus on Cancel, not on the close button", () => {
    const { confirm } = renderHarness();

    act(() => {
      void confirm({ message: "Sure?", confirmText: "Delete" });
    });

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" })
    );
  });

  it("Escape resolves false and closes only the confirm, not the modal under it", async () => {
    const onModalClose = vi.fn();
    const { confirm } = renderHarness((node) => (
      <Modal isOpen onClose={onModalClose} title="Edit things">
        {node}
      </Modal>
    ));

    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = confirm({ title: "Remove it?", message: "Sure?" });
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(2);

    pressEscape();

    await expect(answer).resolves.toBe(false);
    expect(onModalClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Edit things" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Remove it?" })).toBeNull();
  });

  it("a backdrop click resolves false", async () => {
    const { confirm } = renderHarness();

    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = confirm({ message: "Sure?" });
    });
    const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);

    await expect(answer).resolves.toBe(false);
  });

  it("unmount resolves false", async () => {
    const { confirm, unmount } = renderHarness();

    let answer: Promise<boolean> | undefined;
    act(() => {
      answer = confirm({ message: "Sure?" });
    });
    unmount();

    await expect(answer).resolves.toBe(false);
  });

  it("a second confirm resolves the first false and shows the second", async () => {
    const { confirm } = renderHarness();

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    act(() => {
      first = confirm({ title: "First?", message: "One" });
    });
    act(() => {
      second = confirm({
        title: "Second?",
        message: "Two",
        confirmText: "Yes",
      });
    });

    await expect(first).resolves.toBe(false);
    expect(screen.getByRole("dialog", { name: "Second?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    await expect(second).resolves.toBe(true);
  });

  it("confirm keeps its identity across renders", () => {
    const seen: Confirm[] = [];
    const Rerendering = () => {
      const [, setTick] = useState(0);
      const { confirm, dialog } = useConfirmDialog();
      seen.push(confirm);
      return (
        <>
          <button type="button" onClick={() => setTick((t) => t + 1)}>
            tick
          </button>
          {dialog}
        </>
      );
    };
    render(<Rerendering />);
    fireEvent.click(screen.getByRole("button", { name: "tick" }));

    expect(seen.length).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(1);
  });
});
