import { MemoryRouter } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HelpModal from "@/components/ui/HelpModal";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import { useShortcutScope } from "@/hooks/useShortcutScope";

/** A page holding a page-scope key and a global key, like the app shell. */
function Page({
  onPageKey,
  onGlobalKey,
}: {
  onPageKey: () => void;
  onGlobalKey: () => void;
}) {
  useShortcutScope({ layer: "page", keys: { k: onPageKey } });
  useShortcutScope({ layer: "global", keys: { j: onGlobalKey } });
  return null;
}

function renderHelp(onClose = vi.fn()) {
  const onPageKey = vi.fn();
  const onGlobalKey = vi.fn();
  render(
    <MemoryRouter initialEntries={["/scene/1"]}>
      <ShortcutScopeProvider>
        <Page onPageKey={onPageKey} onGlobalKey={onGlobalKey} />
        <HelpModal onClose={onClose} />
      </ShortcutScopeProvider>
    </MemoryRouter>
  );
  return { onClose, onPageKey, onGlobalKey };
}

/** Dispatches a keydown on the focused element (the body if none). */
function press(key: string) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event;
}

afterEach(() => {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
});

describe("HelpModal", () => {
  it("is a modal dialog", () => {
    renderHelp();

    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });

  it("a page-scope or global key does not fire while help is open", () => {
    const { onPageKey, onGlobalKey } = renderHelp();

    press("k");
    press("j");

    expect(onPageKey).not.toHaveBeenCalled();
    expect(onGlobalKey).not.toHaveBeenCalled();
  });

  it("Escape closes the help dialog", () => {
    const { onClose } = renderHelp();

    press("Escape");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the dialog", () => {
    renderHelp();

    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(
      true
    );
  });
});
