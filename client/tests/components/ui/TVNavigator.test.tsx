import { type ReactNode, useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GlobalLayout from "@/components/ui/GlobalLayout";
import TVNavigator from "@/components/ui/TVNavigator";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";
import { TVModeProvider } from "@/contexts/TVModeProvider";
import { useCardKeyboardNav } from "@/hooks/useCardKeyboardNav";
import { useShortcutScope } from "@/hooks/useShortcutScope";
import { createAuthValue, must } from "../../testUtils";

vi.mock("@/api", () => ({
  apiGet: vi.fn().mockResolvedValue({ settings: {} }),
}));
vi.mock("@/components/ui/TopBar", () => ({ default: () => null }));
// The sidebar's icons and logo read the theme
vi.mock("@/components/icons/index", () => ({ ThemedIcon: () => null }));
vi.mock("@/components/branding/PeekLogo", () => ({ PeekLogo: () => null }));
vi.mock("@/hooks/useScrollRestoration", () => ({ default: vi.fn() }));

// happy-dom has no layout: each element placed here gets a synthetic box
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

function place(el: Element, { left, top, width, height }: Box) {
  const r = { left, top, right: left + width, bottom: top + height };
  el.getBoundingClientRect = () =>
    ({ ...r, x: left, y: top, width, height, toJSON: () => r }) as DOMRect;
}

function placeById(id: string, box: Box) {
  place(must(document.getElementById(id), id), box);
}

const byId = (id: string) => must(document.getElementById(id), id);

function renderWithNavigator(ui: ReactNode) {
  return render(
    <MemoryRouter>
      <ShortcutScopeProvider>
        <TVNavigator />
        {ui}
      </ShortcutScopeProvider>
    </MemoryRouter>
  );
}

/** A modal overlay like the lightbox: it owns Left and Right */
function FakeLightbox({
  onPrev,
  onNext,
}: {
  onPrev: () => void;
  onNext: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useShortcutScope({
    layer: "overlay",
    root: () => ref.current,
    keys: { left: onPrev, right: onNext },
  });
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <button id="lb-top">Info</button>
      <button id="lb-bottom">Close</button>
    </div>
  );
}

/** A card whose keys are N5's: Enter does what a click does */
function Card({ id, onActivate }: { id: string; onActivate: () => void }) {
  const { onKeyDown } = useCardKeyboardNav({ onActivate });
  return <div id={id} data-tv-item tabIndex={-1} onKeyDown={onKeyDown} />;
}

describe("TVNavigator", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("with a modal lightbox open, arrows stay inside it", () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    renderWithNavigator(
      <main>
        <div id="card-a" data-tv-item tabIndex={-1} />
        <FakeLightbox onPrev={onPrev} onNext={onNext} />
      </main>
    );
    placeById("lb-top", { left: 0, top: 0, width: 50, height: 50 });
    placeById("lb-bottom", { left: 0, top: 400, width: 50, height: 50 });
    // Nearer below than the lightbox's own button, but under the modal
    placeById("card-a", { left: 0, top: 100, width: 50, height: 50 });
    act(() => byId("lb-top").focus());

    // The lightbox's own arrows win over the tv scope
    fireEvent.keyDown(byId("lb-top"), { key: "ArrowRight" });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("lb-top");

    // An arrow it leaves moves focus inside it only
    fireEvent.keyDown(byId("lb-top"), { key: "ArrowDown" });
    expect(document.activeElement?.id).toBe("lb-bottom");
  });

  it("arrows in the search input move the caret; Up leaves the input", () => {
    renderWithNavigator(
      <main>
        <button id="tab">Scenes</button>
        <input id="search" type="text" defaultValue="two words" />
      </main>
    );
    placeById("tab", { left: 0, top: 0, width: 100, height: 40 });
    placeById("search", { left: 0, top: 100, width: 300, height: 40 });
    const input = byId("search");
    act(() => input.focus());

    // Left and Right are the input's: not prevented, focus stays
    expect(fireEvent.keyDown(input, { key: "ArrowLeft" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "ArrowRight" })).toBe(true);
    expect(document.activeElement).toBe(input);
    // Space types a space
    expect(fireEvent.keyDown(input, { key: " " })).toBe(true);

    expect(fireEvent.keyDown(input, { key: "ArrowUp" })).toBe(false);
    expect(document.activeElement?.id).toBe("tab");
  });

  it("Enter on a focused card is the card's (N5)", () => {
    const onActivate = vi.fn();
    renderWithNavigator(
      <main>
        <Card id="card" onActivate={onActivate} />
      </main>
    );
    placeById("card", { left: 0, top: 0, width: 100, height: 100 });
    act(() => byId("card").focus());

    fireEvent.keyDown(byId("card"), { key: "Enter" });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("card");
  });

  it("moves between cards by where they are", () => {
    renderWithNavigator(
      <main>
        <div>
          <div id="c0" data-tv-item tabIndex={-1} />
          <div id="c1" data-tv-item tabIndex={-1} />
          <div id="c2" data-tv-item tabIndex={-1} />
        </div>
      </main>
    );
    // Two columns: c2 is under c0
    placeById("c0", { left: 0, top: 0, width: 100, height: 100 });
    placeById("c1", { left: 120, top: 0, width: 100, height: 100 });
    placeById("c2", { left: 0, top: 120, width: 100, height: 100 });
    act(() => byId("c1").focus());

    fireEvent.keyDown(byId("c1"), { key: "ArrowLeft" });
    expect(document.activeElement?.id).toBe("c0");
    fireEvent.keyDown(byId("c0"), { key: "ArrowDown" });
    expect(document.activeElement?.id).toBe("c2");
    // PageDown is left to the page's own scope
    expect(fireEvent.keyDown(byId("c2"), { key: "PageDown" })).toBe(true);
  });

  it("focuses the first item in <main> once it renders", async () => {
    const { rerender } = renderWithNavigator(<main />);
    expect(document.activeElement).toBe(document.body);

    rerender(
      <MemoryRouter>
        <ShortcutScopeProvider>
          <TVNavigator />
          <main>
            <div id="first" data-tv-item tabIndex={-1} />
          </main>
        </ShortcutScopeProvider>
      </MemoryRouter>
    );
    await vi.waitFor(() => {
      expect(document.activeElement?.id).toBe("first");
    });
  });
});

describe("GlobalLayout and TV mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("tv-mode");
  });

  function renderLayout() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider
            value={createAuthValue({
              isAuthenticated: true,
              user: {
                id: 1,
                username: "viewer",
                role: "USER",
              } as unknown as NonNullable<
                ReturnType<typeof createAuthValue>["user"]
              >,
            })}
          >
            <TVModeProvider>
              <ShortcutScopeProvider>
                <GlobalLayout>
                  <div>
                    <div id="c0" data-tv-item tabIndex={-1} />
                    <div id="c1" data-tv-item tabIndex={-1} />
                  </div>
                </GlobalLayout>
              </ShortcutScopeProvider>
            </TVModeProvider>
          </AuthContext.Provider>
        </QueryClientProvider>
      </MemoryRouter>
    );
  }

  it("off in desktop mode: no scope, sidebar items are in the Tab order", () => {
    renderLayout();
    placeById("c0", { left: 300, top: 0, width: 100, height: 100 });
    placeById("c1", { left: 420, top: 0, width: 100, height: 100 });
    act(() => byId("c0").focus());

    // No tv scope: the arrow is the browser's
    expect(fireEvent.keyDown(byId("c0"), { key: "ArrowRight" })).toBe(true);
    expect(document.activeElement?.id).toBe("c0");
    expect(document.documentElement).not.toHaveClass("tv-mode");

    // CS-17: no sidebar link or button is taken out of the Tab order
    const sidebar = must(document.querySelector("aside"), "sidebar");
    const controls = sidebar.querySelectorAll("a, button");
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control.getAttribute("tabindex")).toBeNull();
    }
    expect(screen.getAllByRole("link", { name: /settings/i }).length).toBe(2);
  });

  it("on in TV mode: html.tv-mode is set and arrows move focus", () => {
    localStorage.setItem("peek-tv-mode", "true");
    renderLayout();
    expect(document.documentElement).toHaveClass("tv-mode");
    placeById("c0", { left: 300, top: 0, width: 100, height: 100 });
    placeById("c1", { left: 420, top: 0, width: 100, height: 100 });
    act(() => byId("c0").focus());

    expect(fireEvent.keyDown(byId("c0"), { key: "ArrowRight" })).toBe(false);
    expect(document.activeElement?.id).toBe("c1");
  });
});
