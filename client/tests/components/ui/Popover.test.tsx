/**
 * Popover: a non-modal panel under its anchor. It closes on Escape (its own
 * key handler), on a press outside (heard in the capture phase, so it also
 * closes inside a Modal), on focus moving on to a control outside it, and
 * returns focus to the anchor.
 */
import { type ReactNode, useRef, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Modal from "@/components/ui/Modal";
import Popover from "@/components/ui/Popover";
import SearchableSelect from "@/components/ui/SearchableSelect";
import TVNavigator from "@/components/ui/TVNavigator";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import { TVModeProvider } from "@/contexts/TVModeProvider";
import { useShortcutScope } from "@/hooks/useShortcutScope";

const { findPerformersMinimal } = vi.hoisted(() => ({
  findPerformersMinimal: vi.fn(),
}));
vi.mock("@/api", () => ({ libraryApi: { findPerformersMinimal } }));

/** An anchor button that toggles a popover holding `children` */
function Harness({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        ref={anchorRef}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Anchor
      </button>
      <Popover
        anchorRef={anchorRef}
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        label="Things"
      >
        {children}
      </Popover>
    </div>
  );
}

const anchor = () => screen.getByRole("button", { name: "Anchor" });

/** The select's trigger: the anchor is the other button that says whether it is expanded */
const selectTrigger = () =>
  must(
    screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-expanded"))[1],
    "the select's trigger"
  );

function renderHarness(children: ReactNode, onClose?: () => void) {
  return render(
    <ShortcutScopeProvider>
      <Harness {...(onClose ? { onClose } : {})}>{children}</Harness>
    </ShortcutScopeProvider>
  );
}

beforeEach(() => {
  findPerformersMinimal.mockResolvedValue([]);
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("tv-mode");
  vi.restoreAllMocks();
});

describe("Popover", () => {
  it("opens under its anchor and moves focus into it", () => {
    renderHarness(
      <>
        <button>First</button>
        <button data-popover-focus>Second</button>
      </>
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    // The anchor sits 10px down and 5px right of its wrapper, 30px tall
    const target = anchor();
    Object.defineProperties(target, {
      offsetTop: { value: 10 },
      offsetLeft: { value: 5 },
      offsetHeight: { value: 30 },
    });
    target.getBoundingClientRect = () =>
      ({ top: 10, bottom: 40, left: 105, right: 145 }) as DOMRect;
    fireEvent.click(target);

    const dialog = screen.getByRole("dialog", { name: "Things" });
    expect(dialog).not.toHaveAttribute("aria-modal");
    // Under it, with a 4px gap, lined up with its left edge
    expect(dialog.style.top).toBe("44px");
    expect(dialog.style.left).toBe("5px");
    // Focus goes to the child marked for it
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Second" })
    );
  });

  it("stays on screen sideways: an anchor near either edge keeps it 8px in", () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute("role") === "dialog" ? 320 : 40;
      }
    );
    renderHarness(<button>Only</button>);
    const target = anchor();
    // The anchor 300px from the screen's left, 300px into its wrapper
    Object.defineProperty(target, "offsetLeft", { value: 300 });
    target.getBoundingClientRect = () =>
      ({ top: 0, bottom: 30, left: 300, right: 340 }) as DOMRect;
    fireEvent.click(target);

    // 300 + 320 would run past 390: its right edge 8px in, at 62px
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.left).toBe("62px");
    expect(dialog.style.transform).toBe("");
  });

  it("flips above the anchor near the bottom of the viewport", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.getAttribute("role") === "dialog" ? 80 : 30;
      }
    );
    renderHarness(<button>Only</button>);
    const target = anchor();
    Object.defineProperty(target, "offsetTop", { value: 150 });
    target.getBoundingClientRect = () =>
      ({ top: 150, bottom: 180, left: 0, right: 40 }) as DOMRect;
    fireEvent.click(target);

    // 150 - 80 - 4: the popover's bottom edge 4px above the anchor
    expect(screen.getByRole("dialog").style.top).toBe("66px");
  });

  it("Escape closes it and returns focus to the anchor", () => {
    const onClose = vi.fn();
    renderHarness(<button>Inside</button>, onClose);
    fireEvent.click(anchor());
    const inside = screen.getByRole("button", { name: "Inside" });
    expect(document.activeElement).toBe(inside);

    fireEvent.keyDown(inside, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(anchor());
  });

  it("a press outside closes it, in the capture phase (it closes inside a Modal too)", () => {
    const onClose = vi.fn();
    render(
      <ShortcutScopeProvider>
        <Modal isOpen onClose={vi.fn()} title="Settings">
          <p>Elsewhere in the dialog</p>
          <Harness onClose={onClose}>
            <button>Inside</button>
          </Harness>
        </Modal>
      </ShortcutScopeProvider>
    );
    fireEvent.click(anchor());
    expect(screen.getByRole("dialog", { name: "Things" })).toBeTruthy();

    // A press inside, or on the anchor (which toggles it itself), keeps it
    fireEvent.mouseDown(screen.getByRole("button", { name: "Inside" }));
    fireEvent.mouseDown(anchor());
    expect(onClose).not.toHaveBeenCalled();

    // The Modal's backdrop stops the press bubbling: the document hears it first
    fireEvent.mouseDown(screen.getByText("Elsewhere in the dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Things" })).toBeNull();
  });

  it("a press inside a SearchableSelect list drawn in it does not close it", async () => {
    const onClose = vi.fn();
    renderHarness(
      <SearchableSelect
        entityType="performers"
        value={[]}
        onChange={vi.fn()}
        multi
      />,
      onClose
    );
    fireEvent.click(anchor());
    fireEvent.click(selectTrigger());
    const search = await screen.findByPlaceholderText("Type to search...");

    fireEvent.mouseDown(search);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Things" })).toBeTruthy();
  });

  it("an Escape that closes a SearchableSelect list inside the popover leaves the popover open", async () => {
    const onClose = vi.fn();
    renderHarness(
      <SearchableSelect
        entityType="performers"
        value={[]}
        onChange={vi.fn()}
        multi
      />,
      onClose
    );
    fireEvent.click(anchor());
    fireEvent.click(selectTrigger());
    const search = await screen.findByPlaceholderText("Type to search...");

    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Type to search...")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Things" })).toBeTruthy();

    // With the list closed, the next Escape is the popover's
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focus moving on to a control outside (Tab) closes it; into the anchor, or into a Modal opened over it, keeps it", () => {
    const onClose = vi.fn();
    render(
      <ShortcutScopeProvider>
        <Harness onClose={onClose}>
          <button>Inside</button>
        </Harness>
        <button>After</button>
        <div role="dialog" aria-modal="true" aria-label="Over it">
          <button>In a Modal</button>
        </div>
      </ShortcutScopeProvider>
    );
    fireEvent.click(anchor());
    const inside = screen.getByRole("button", { name: "Inside" });

    fireEvent.blur(inside, { relatedTarget: anchor() });
    fireEvent.blur(inside, {
      relatedTarget: screen.getByRole("button", { name: "In a Modal" }),
    });
    // Focus lost to nothing (a press on the page) is the press's to judge
    fireEvent.blur(inside, { relatedTarget: null });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.blur(inside, {
      relatedTarget: screen.getByRole("button", { name: "After" }),
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Things" })).toBeNull();
  });

  it("is not modal: no overlay scope, page keys still run", () => {
    localStorage.setItem("peek-tv-mode", "true");
    const onPageUp = vi.fn();
    function PageScope() {
      useShortcutScope({ layer: "page", keys: { pageup: onPageUp } });
      return null;
    }
    render(
      <TVModeProvider>
        <ShortcutScopeProvider>
          <PageScope />
          <Harness>
            <button>Inside</button>
          </Harness>
        </ShortcutScopeProvider>
      </TVModeProvider>
    );
    fireEvent.click(anchor());
    const inside = screen.getByRole("button", { name: "Inside" });
    expect(document.activeElement).toBe(inside);

    fireEvent.keyDown(inside, { key: "PageUp" });

    expect(onPageUp).toHaveBeenCalledTimes(1);
  });

  describe("inside a Modal", () => {
    beforeEach(() => {
      localStorage.setItem("peek-tv-mode", "true");
    });

    it("keeps focus in the dialog, and TV focus moves inside it", () => {
      const place = (el: HTMLElement, top: number) => {
        el.getBoundingClientRect = () =>
          ({
            left: 0,
            right: 50,
            top,
            bottom: top + 40,
            x: 0,
            y: top,
            width: 50,
            height: 40,
            toJSON: () => ({}),
          }) as DOMRect;
      };
      render(
        <MemoryRouter>
          <TVModeProvider>
            <ShortcutScopeProvider>
              <TVNavigator />
              <button>Behind the dialog</button>
              <Modal isOpen onClose={vi.fn()} title="Settings">
                <Harness>
                  <button>One</button>
                  <button>Two</button>
                </Harness>
              </Modal>
            </ShortcutScopeProvider>
          </TVModeProvider>
        </MemoryRouter>
      );
      fireEvent.click(anchor());

      // It renders in place: inside the dialog, not in a portal beside it
      const modal = screen.getByRole("dialog", { name: "Settings" });
      const popover = screen.getByRole("dialog", { name: "Things" });
      expect(modal.contains(popover)).toBe(true);
      const one = screen.getByRole("button", { name: "One" });
      const two = screen.getByRole("button", { name: "Two" });
      expect(document.activeElement).toBe(one);

      place(screen.getByRole("button", { name: "Behind the dialog" }), 0);
      place(anchor(), 100);
      place(one, 200);
      place(two, 300);
      act(() => one.focus());

      fireEvent.keyDown(one, { key: "ArrowDown" });
      expect(document.activeElement).toBe(two);
      fireEvent.keyDown(two, { key: "ArrowUp" });
      expect(document.activeElement).toBe(one);
      // Up from the first stays in the dialog: the page behind is out of reach
      fireEvent.keyDown(one, { key: "ArrowUp" });
      expect(modal.contains(document.activeElement)).toBe(true);
    });
  });
});
