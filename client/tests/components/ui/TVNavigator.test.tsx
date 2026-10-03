import { type ReactNode, useRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilterControl } from "@/components/ui/FilterControls";
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
  libraryApi: {
    findPerformersMinimal: vi.fn().mockResolvedValue([]),
  },
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
    const input = byId("search") as HTMLInputElement;
    act(() => input.focus());
    // The caret between "two" and "words": text lies both ways
    input.setSelectionRange(3, 3);

    // Left and Right are the input's: not prevented, focus stays
    expect(fireEvent.keyDown(input, { key: "ArrowLeft" })).toBe(true);
    expect(fireEvent.keyDown(input, { key: "ArrowRight" })).toBe(true);
    expect(document.activeElement).toBe(input);
    // Space types a space
    expect(fireEvent.keyDown(input, { key: " " })).toBe(true);

    expect(fireEvent.keyDown(input, { key: "ArrowUp" })).toBe(false);
    expect(document.activeElement?.id).toBe("tab");
  });

  it("Left and Right leave a text input at the caret's edge, a number or date input at once", () => {
    renderWithNavigator(
      <main>
        <button id="before">Before</button>
        <input id="text" type="text" defaultValue="abc" />
        <input id="number" type="number" defaultValue="12" />
        <input id="date" type="date" />
        <button id="after">After</button>
      </main>
    );
    // One row: before, text, number, date, after
    ["before", "text", "number", "date", "after"].forEach((id, i) =>
      placeById(id, { left: i * 200, top: 0, width: 150, height: 40 })
    );
    const text = byId("text") as HTMLInputElement;
    act(() => text.focus());

    // The caret at the end: Left moves it, Right leaves
    text.setSelectionRange(3, 3);
    expect(fireEvent.keyDown(text, { key: "ArrowLeft" })).toBe(true);
    expect(document.activeElement).toBe(text);
    expect(fireEvent.keyDown(text, { key: "ArrowRight" })).toBe(false);
    expect(document.activeElement?.id).toBe("number");

    // A number input shows no caret to the page: both arrows leave it
    fireEvent.keyDown(byId("number"), { key: "ArrowRight" });
    expect(document.activeElement?.id).toBe("date");
    fireEvent.keyDown(byId("date"), { key: "ArrowRight" });
    expect(document.activeElement?.id).toBe("after");
    fireEvent.keyDown(byId("after"), { key: "ArrowLeft" });
    fireEvent.keyDown(byId("date"), { key: "ArrowLeft" });
    fireEvent.keyDown(byId("number"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(text);

    // The caret at the start: Right moves it, Left leaves; text selected
    // across the edge is the input's too
    text.setSelectionRange(0, 2);
    expect(fireEvent.keyDown(text, { key: "ArrowLeft" })).toBe(true);
    expect(document.activeElement).toBe(text);
    text.setSelectionRange(0, 0);
    expect(fireEvent.keyDown(text, { key: "ArrowRight" })).toBe(true);
    expect(document.activeElement).toBe(text);
    expect(fireEvent.keyDown(text, { key: "ArrowLeft" })).toBe(false);
    expect(document.activeElement?.id).toBe("before");
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

describe("TVNavigator on selects and sliders", () => {
  beforeEach(() => {
    document.documentElement.classList.add("tv-mode");
  });
  afterEach(() => {
    document.documentElement.classList.remove("tv-mode");
  });

  function renderControls() {
    renderWithNavigator(
      <main>
        <button id="above">Above</button>
        <select id="sort" defaultValue="b">
          <option value="a">A</option>
          <option value="b">B</option>
          <option value="c">C</option>
        </select>
        <input id="range" type="range" defaultValue="50" />
        <button id="below">Below</button>
      </main>
    );
    placeById("above", { left: 0, top: 0, width: 100, height: 40 });
    placeById("sort", { left: 0, top: 100, width: 100, height: 40 });
    placeById("range", { left: 0, top: 200, width: 100, height: 40 });
    placeById("below", { left: 0, top: 300, width: 100, height: 40 });
  }

  it("arrows on a focused select move focus and never change its value", () => {
    renderControls();
    const select = byId("sort");
    act(() => select.focus());

    // Prevented: the browser does not step the select's value
    expect(fireEvent.keyDown(select, { key: "ArrowDown" })).toBe(false);
    expect(document.activeElement?.id).toBe("range");
    expect((select as HTMLSelectElement).value).toBe("b");

    act(() => select.focus());
    expect(fireEvent.keyDown(select, { key: "ArrowUp" })).toBe(false);
    expect(document.activeElement?.id).toBe("above");
  });

  it("an arrow with nowhere to go still never changes a select", () => {
    renderControls();
    const select = byId("sort");
    act(() => select.focus());

    expect(fireEvent.keyDown(select, { key: "ArrowRight" })).toBe(false);
    expect(document.activeElement).toBe(select);
  });

  it("Enter on a focused select opens its picker", () => {
    renderControls();
    const select = byId("sort") as HTMLSelectElement;
    const showPicker = vi.fn();
    select.showPicker = showPicker;
    act(() => select.focus());

    expect(fireEvent.keyDown(select, { key: "Enter" })).toBe(false);
    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(select);
  });

  it("on a range input Left and Right are the input's; Up and Down move focus", () => {
    renderControls();
    const range = byId("range");
    act(() => range.focus());

    expect(fireEvent.keyDown(range, { key: "ArrowLeft" })).toBe(true);
    expect(fireEvent.keyDown(range, { key: "ArrowRight" })).toBe(true);
    expect(document.activeElement).toBe(range);

    expect(fireEvent.keyDown(range, { key: "ArrowDown" })).toBe(false);
    expect(document.activeElement?.id).toBe("below");
  });
});

describe("TVNavigator on a filter field's picker", () => {
  beforeEach(() => {
    document.documentElement.classList.add("tv-mode");
  });
  afterEach(() => {
    document.documentElement.classList.remove("tv-mode");
  });

  it("in TV mode Down from the Performers modifier lands on the Performers picker", () => {
    renderWithNavigator(
      <main>
        <FilterControl
          type="searchable-select"
          entityType="performers"
          label="Performers"
          controlId="filter-performerIds"
          multi
          modifierOptions={[
            { value: "INCLUDES", label: "Has ANY" },
            { value: "EXCLUDES", label: "Has NONE" },
          ]}
          modifierValue="INCLUDES"
          onModifierChange={() => {}}
          value={[]}
          onChange={() => {}}
        />
        <button id="below">Below</button>
      </main>
    );
    const condition = byId("filter-performerIds");
    const picker = screen.getByRole("button", { name: /^Performers/ });
    place(condition, { left: 0, top: 0, width: 200, height: 40 });
    place(picker, { left: 0, top: 50, width: 200, height: 40 });
    placeById("below", { left: 0, top: 200, width: 200, height: 40 });
    act(() => condition.focus());

    fireEvent.keyDown(condition, { key: "ArrowDown" });

    expect(document.activeElement).toBe(picker);

    fireEvent.keyDown(picker, { key: "ArrowDown" });
    expect(document.activeElement?.id).toBe("below");
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
    expect(screen.getAllByRole("link", { name: /settings/i }).length).toBe(1);
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
