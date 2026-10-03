import { type ReactNode, StrictMode, useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ShortcutScopeOptions,
  ShortcutScopeProvider,
} from "@/contexts/ShortcutScopeContext";
import { ShortcutDispatcher } from "@/contexts/shortcutDispatcher";
import {
  useShortcutScope,
  useShortcutScopeContext,
} from "@/hooks/useShortcutScope";

/** A component that holds one scope. */
function Scope(props: ShortcutScopeOptions) {
  useShortcutScope(props);
  return null;
}

/** A modal overlay scope rooted at its own element, like a dialog. */
function Overlay({
  keys,
  children,
}: {
  keys?: ShortcutScopeOptions["keys"];
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useShortcutScope({
    layer: "overlay",
    root: () => ref.current,
    ...(keys ? { keys } : {}),
  });
  return (
    <div ref={ref} data-testid="overlay">
      {children}
    </div>
  );
}

/** Reads topModalRoot() from the context. */
let readTopModalRoot: () => Element | null = () => null;
function TopModalProbe() {
  const { topModalRoot } = useShortcutScopeContext();
  readTopModalRoot = topModalRoot;
  return null;
}

function renderScopes(ui: ReactNode) {
  return render(<ShortcutScopeProvider>{ui}</ShortcutScopeProvider>);
}

/** Dispatches a keydown on the target (the body by default) and returns it. */
function press(
  key: string,
  target: EventTarget = document.activeElement ?? document.body,
  init: Partial<KeyboardEventInit> = {}
) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function focusNew<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  el.focus();
  return el;
}

afterEach(() => {
  vi.useRealTimers();
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
});

describe("ShortcutScopeProvider", () => {
  it("with a page scope and a modal overlay scope both mapping r-then-4, only the overlay's handler runs", () => {
    const pageRate = vi.fn();
    const overlayRate = vi.fn();
    renderScopes(
      <>
        <Scope layer="page" sequences={{ r: { "4": pageRate } }} />
        <Scope layer="overlay" sequences={{ r: { "4": overlayRate } }} />
      </>
    );

    press("r");
    const event = press("4");

    expect(overlayRate).toHaveBeenCalledTimes(1);
    expect(pageRate).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("a modal overlay hides every scope below it, including global g-then-s", () => {
    const goScenes = vi.fn();
    const help = vi.fn();
    renderScopes(
      <>
        <Scope
          layer="global"
          keys={{ "shift+?": help }}
          sequences={{ g: { s: goScenes } }}
        />
        <Scope layer="overlay" />
      </>
    );

    press("g");
    press("s");
    press("?", undefined, { shiftKey: true });

    expect(goScenes).not.toHaveBeenCalled();
    expect(help).not.toHaveBeenCalled();
  });

  it("a sequence prefix hands the next key to its owner only: r then 4 rates and a player scope's 4 does not seek", () => {
    const rate = vi.fn();
    const seek = vi.fn();
    renderScopes(
      <>
        <Scope layer="page" sequences={{ r: { "4": rate } }} />
        <Scope layer="player" keys={{ "4": seek }} />
      </>
    );

    press("r");
    press("4");
    expect(rate).toHaveBeenCalledTimes(1);
    expect(seek).not.toHaveBeenCalled();

    // With no sequence pending, 4 is the player's
    press("4");
    expect(seek).toHaveBeenCalledTimes(1);
    expect(rate).toHaveBeenCalledTimes(1);
  });

  it("a sequence expires after 1 s", () => {
    vi.useFakeTimers();
    const rate = vi.fn();
    const seek = vi.fn();
    renderScopes(
      <>
        <Scope layer="page" sequences={{ r: { "4": rate } }} />
        <Scope layer="player" keys={{ "4": seek }} />
      </>
    );

    press("r");
    act(() => {
      vi.advanceTimersByTime(1001);
    });
    press("4");

    expect(rate).not.toHaveBeenCalled();
    expect(seek).toHaveBeenCalledTimes(1);
  });

  it("a key an element handler already handled (defaultPrevented) reaches no scope", () => {
    const handler = vi.fn();
    renderScopes(<Scope layer="page" keys={{ k: handler }} />);
    const card = focusNew("div", { tabindex: "0" });
    card.addEventListener("keydown", (e) => e.preventDefault());

    press("k", card);

    expect(handler).not.toHaveBeenCalled();
    card.remove();
  });

  it.each(["input", "textarea"] as const)(
    "in an input or textarea only Escape is dispatched; Space types (%s)",
    (tag) => {
      const space = vi.fn();
      const letter = vi.fn();
      const escape = vi.fn();
      renderScopes(
        <Scope
          layer="page"
          keys={{ space, k: letter, esc: escape }}
          sequences={{ r: { "4": letter } }}
        />
      );
      const field = focusNew(tag);

      const spaceEvent = press(" ", field);
      press("k", field);
      press("r", field);
      press("4", field);
      press("Escape", field);

      expect(space).not.toHaveBeenCalled();
      expect(spaceEvent.defaultPrevented).toBe(false);
      expect(letter).not.toHaveBeenCalled();
      expect(escape).toHaveBeenCalledTimes(1);
      field.remove();
    }
  );

  it("Up and Down in a single-line input reach a tv scope and no other layer, Left and Right at the caret's edge; in a textarea they move the caret", () => {
    const tvUp = vi.fn();
    const tvDown = vi.fn();
    const tvLeft = vi.fn();
    const pageUp = vi.fn();
    renderScopes(
      <>
        <Scope layer="tv" keys={{ up: tvUp, down: tvDown, left: tvLeft }} />
        <Scope layer="page" keys={{ up: pageUp }} />
      </>
    );

    const input = focusNew("input", { type: "search", value: "abc" });
    input.setSelectionRange(1, 1);
    const upEvent = press("ArrowUp", input);
    press("ArrowDown", input);
    const leftEvent = press("ArrowLeft", input);
    expect(tvUp).toHaveBeenCalledTimes(1);
    expect(tvDown).toHaveBeenCalledTimes(1);
    expect(upEvent.defaultPrevented).toBe(true);
    // Text lies to the left: the caret's
    expect(tvLeft).not.toHaveBeenCalled();
    expect(leftEvent.defaultPrevented).toBe(false);
    expect(pageUp).not.toHaveBeenCalled();
    // At the start: Left leaves
    input.setSelectionRange(0, 0);
    press("ArrowLeft", input);
    expect(tvLeft).toHaveBeenCalledTimes(1);
    input.remove();

    const textarea = focusNew("textarea");
    const caretEvent = press("ArrowUp", textarea);
    expect(tvUp).toHaveBeenCalledTimes(1);
    expect(caretEvent.defaultPrevented).toBe(false);
    textarea.remove();
  });

  it("with a modal overlay open that leaves an arrow unhandled, the tv scope gets it and topModalRoot() is the overlay's root; a key the overlay handles never reaches tv; scopes below the modal other than tv never run", () => {
    const rootsSeen: (Element | null)[] = [];
    const tvLeft = vi.fn(() => {
      rootsSeen.push(readTopModalRoot());
    });
    const tvRight = vi.fn();
    const pageLeft = vi.fn();
    const pageKey = vi.fn();
    const overlayRight = vi.fn();
    const { getByTestId, getByRole, unmount } = renderScopes(
      <>
        <TopModalProbe />
        <Scope layer="tv" keys={{ left: tvLeft, right: tvRight }} />
        <Scope layer="page" keys={{ left: pageLeft, k: pageKey }} />
        <Overlay keys={{ right: overlayRight }}>
          <button type="button">Inside</button>
        </Overlay>
      </>
    );
    getByRole("button").focus();

    press("ArrowLeft");
    press("ArrowRight");
    press("k");

    expect(tvLeft).toHaveBeenCalledTimes(1);
    expect(rootsSeen).toEqual([getByTestId("overlay")]);
    expect(overlayRight).toHaveBeenCalledTimes(1);
    expect(tvRight).not.toHaveBeenCalled();
    expect(pageLeft).not.toHaveBeenCalled();
    expect(pageKey).not.toHaveBeenCalled();
    unmount();
  });

  it("topModalRoot() is null with no modal scope", () => {
    renderScopes(
      <>
        <TopModalProbe />
        <Scope layer="page" keys={{ k: vi.fn() }} />
      </>
    );
    expect(readTopModalRoot()).toBeNull();
  });

  it("Space and Enter on a focused button reach no scope; the button activates", () => {
    const space = vi.fn();
    const enter = vi.fn();
    const letter = vi.fn();
    renderScopes(<Scope layer="page" keys={{ space, enter, k: letter }} />);
    const button = focusNew("button");

    const spaceEvent = press(" ", button);
    const enterEvent = press("Enter", button);
    press("k", button);

    expect(space).not.toHaveBeenCalled();
    expect(enter).not.toHaveBeenCalled();
    // Not prevented, so the browser activates the button
    expect(spaceEvent.defaultPrevented).toBe(false);
    expect(enterEvent.defaultPrevented).toBe(false);
    // Other keys on a button still reach the scopes
    expect(letter).toHaveBeenCalledTimes(1);
    button.remove();
  });

  it("the most recently registered scope in a layer goes first; unmounting restores the previous owner", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderScopes(
      <>
        <Scope layer="page" keys={{ k: first }} />
        <Scope layer="page" keys={{ k: second }} />
      </>
    );

    press("k");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();

    rerender(
      <ShortcutScopeProvider>
        <Scope layer="page" keys={{ k: first }} />
      </ShortcutScopeProvider>
    );
    press("k");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("a handler that returns false passes the key to the next scope", () => {
    const upper = vi.fn(() => false);
    const lower = vi.fn();
    renderScopes(
      <>
        <Scope layer="global" keys={{ k: lower }} />
        <Scope layer="page" keys={{ k: upper }} />
      </>
    );

    press("k");

    expect(upper).toHaveBeenCalledTimes(1);
    expect(lower).toHaveBeenCalledTimes(1);
  });

  it("a disabled scope is skipped", () => {
    const handler = vi.fn();
    renderScopes(<Scope layer="page" enabled={false} keys={{ k: handler }} />);
    press("k");
    expect(handler).not.toHaveBeenCalled();
  });

  it("StrictMode double mount registers each scope once", () => {
    // A handler that returns false lets the walk continue, so a second
    // registration of the same scope would call it twice
    const handler = vi.fn(() => false);
    render(
      <StrictMode>
        <ShortcutScopeProvider>
          <Scope layer="page" keys={{ k: handler }} />
        </ShortcutScopeProvider>
      </StrictMode>
    );

    press("k");

    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("ShortcutDispatcher.dispatch", () => {
  const unregister: (() => void)[] = [];
  afterEach(() => {
    for (const off of unregister.splice(0)) off();
  });

  function setup(...scopes: ShortcutScopeOptions[]) {
    const dispatcher = new ShortcutDispatcher();
    for (const options of scopes) {
      unregister.push(dispatcher.register(() => options));
    }
    return dispatcher;
  }

  it("runs a key a control stopped from bubbling, and prevents its default", () => {
    const mute = vi.fn();
    const dispatcher = setup({ layer: "player", keys: { m: mute } });
    const control = focusNew("div", { tabindex: "0" });
    control.addEventListener("keydown", (event) => {
      event.stopPropagation();
      dispatcher.dispatch(event);
    });

    const event = press("m", control);

    expect(mute).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    control.remove();
  });

  it("handles a dispatched event once when it also reaches the window listener", () => {
    const handler = vi.fn(() => false);
    const dispatcher = setup({ layer: "player", keys: { m: handler } });
    const control = focusNew("div", { tabindex: "0" });
    control.addEventListener("keydown", (event) => {
      dispatcher.dispatch(event);
    });

    press("m", control);

    expect(handler).toHaveBeenCalledTimes(1);
    control.remove();
  });

  it("a dispatched key stops at a modal overlay like any other", () => {
    const mute = vi.fn();
    const dispatcher = setup(
      { layer: "player", keys: { m: mute } },
      { layer: "overlay" }
    );
    const control = focusNew("div", { tabindex: "0" });
    control.addEventListener("keydown", (event) => {
      event.stopPropagation();
      dispatcher.dispatch(event);
    });

    press("m", control);

    expect(mute).not.toHaveBeenCalled();
    control.remove();
  });
});
