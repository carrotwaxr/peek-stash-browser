import { afterEach, describe, expect, it } from "vitest";
import {
  type Candidate,
  moveFocus,
  pickNext,
  tvCandidates,
} from "@/utils/spatialFocus";
import { must } from "../testUtils";

// happy-dom has no layout, so every rect here is synthetic.

type Rect = Candidate<string>["rect"];

const rect = (
  left: number,
  top: number,
  width: number,
  height: number
): Rect => ({ left, top, right: left + width, bottom: top + height });

// A grid of 100 x 100 cards, 20 px apart, from (300, 200)
const CARD = 100;
const GAP = 20;
const cardRect = (index: number, columns: number) =>
  rect(
    300 + (index % columns) * (CARD + GAP),
    200 + Math.floor(index / columns) * (CARD + GAP),
    CARD,
    CARD
  );

const grid = (count: number, columns: number): Candidate<string>[] =>
  Array.from({ length: count }, (_, i) => ({
    el: `card-${i}`,
    rect: cardRect(i, columns),
  }));

// Sidebar links, 240 px wide, 40 px tall, every 50 px from y = 100
const sidebar = (count: number): Candidate<string>[] =>
  Array.from({ length: count }, (_, i) => ({
    el: `nav-${i}`,
    rect: rect(0, 100 + i * 50, 240, 40),
  }));

/** Every candidate but the one we start from */
const others = (all: Candidate<string>[], from: string) =>
  all.filter((c) => c.el !== from);

const rectOf = (all: Candidate<string>[], el: string) =>
  must(
    all.find((c) => c.el === el),
    el
  ).rect;

describe("pickNext", () => {
  it("Down in a 6-column grid of 12 moves from index 1 to index 7", () => {
    const all = grid(12, 6);
    expect(pickNext(rectOf(all, "card-1"), others(all, "card-1"), "down")).toBe(
      "card-7"
    );
  });

  it("Down from column 5 into a last row of 2 lands on the nearest, index 7, instead of escaping", () => {
    const all = grid(8, 6);
    expect(pickNext(rectOf(all, "card-5"), others(all, "card-5"), "down")).toBe(
      "card-7"
    );
  });

  it("Left from column 0 reaches the sidebar item level with it", () => {
    const all = [...grid(12, 6), ...sidebar(12)];
    // card-6 is row 1: top 320, centre 370; nav-5 spans 350 to 390
    expect(pickNext(rectOf(all, "card-6"), others(all, "card-6"), "left")).toBe(
      "nav-5"
    );
  });

  it("Up from the first row reaches the search row above", () => {
    const all = [
      ...grid(12, 6),
      ...sidebar(12),
      { el: "search", rect: rect(300, 120, 400, 40) },
      { el: "sort", rect: rect(720, 120, 120, 40) },
    ];
    expect(pickNext(rectOf(all, "card-1"), others(all, "card-1"), "up")).toBe(
      "search"
    );
  });

  it("no candidate in a direction returns null", () => {
    const all = grid(12, 6);
    expect(
      pickNext(rectOf(all, "card-5"), others(all, "card-5"), "right")
    ).toBeNull();
    expect(pickNext(rectOf(all, "card-2"), others(all, "card-2"), "up")).toBe(
      null
    );
  });

  it("an item level with the start is not beyond it up or down", () => {
    const all = [
      { el: "input", rect: rect(300, 100, 400, 40) },
      // Same row, a little shorter
      { el: "button", rect: rect(720, 105, 80, 30) },
    ];
    expect(pickNext(rectOf(all, "input"), others(all, "input"), "down")).toBe(
      null
    );
    expect(pickNext(rectOf(all, "input"), others(all, "input"), "up")).toBe(
      null
    );
  });
});

/** Gives an element a layout box */
function place(el: Element, r: Rect) {
  el.getBoundingClientRect = () =>
    ({
      ...r,
      x: r.left,
      y: r.top,
      width: r.right - r.left,
      height: r.bottom - r.top,
      toJSON: () => r,
    }) as DOMRect;
}

describe("tvCandidates", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("candidates skip zero-size, `inert`, `aria-hidden` and elements inside a `[data-tv-item]` other than the item itself", () => {
    document.body.innerHTML = `
      <div id="root">
        <div data-tv-item tabindex="-1" id="card">
          <button id="inside-card">Rate</button>
          <a href="/x" id="link-in-card">Link</a>
        </div>
        <button id="plain">Plain</button>
        <a href="/y" id="link">Link</a>
        <input id="search" type="text" />
        <button id="collapsed">Hidden by display</button>
        <div inert><button id="in-inert">Inert</button></div>
        <div aria-hidden="true"><button id="in-hidden">Hidden</button></div>
        <button id="disabled" disabled>Disabled</button>
        <div id="not-focusable">Text</div>
      </div>`;
    let x = 0;
    for (const el of document.querySelectorAll("#root *")) {
      place(el, rect(x, 0, 50, 50));
      x += 60;
    }
    place(must(document.getElementById("collapsed"), "collapsed"), {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    });

    const ids = tvCandidates(must(document.getElementById("root"), "root")).map(
      (el) => el.id
    );
    expect(ids).toEqual(["card", "plain", "link", "search"]);
  });

  it("skips controls that take the arrows themselves (a select, a range)", () => {
    document.body.innerHTML = `
      <div id="root">
        <select id="page"><option>1</option></select>
        <input id="zoom" type="range" />
        <button id="next">Next</button>
      </div>`;
    for (const el of document.querySelectorAll("#root *")) {
      place(el, rect(0, 0, 50, 50));
    }
    const ids = tvCandidates(must(document.getElementById("root"), "root")).map(
      (el) => el.id
    );
    expect(ids).toEqual(["next"]);
  });
});

describe("moveFocus", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  /** A 6-column grid of `count` cards in its own container, with a pager below */
  function renderGrid(count: number) {
    const cards = Array.from(
      { length: count },
      (_, i) => `<div data-tv-item tabindex="-1" id="card-${i}"></div>`
    ).join("");
    document.body.innerHTML = `
      <main>
        <div id="grid">${cards}</div>
        <button id="pager">Next page</button>
      </main>`;
    for (let i = 0; i < count; i++) {
      place(
        must(document.getElementById(`card-${i}`), `card-${i}`),
        cardRect(i, 6)
      );
    }
    // Right under column 5, below the short last row
    place(
      must(document.getElementById("pager"), "pager"),
      rect(900, 460, 100, 30)
    );
  }

  it("Down from column 5 goes to the short last row of its grid, not the pager under it", () => {
    renderGrid(8);
    must(document.getElementById("card-5"), "card-5").focus();

    expect(moveFocus("down", document.body)).toBe(true);
    expect(document.activeElement?.id).toBe("card-7");
  });

  it("Down from the last row leaves the grid", () => {
    renderGrid(8);
    must(document.getElementById("card-7"), "card-7").focus();

    expect(moveFocus("down", document.body)).toBe(true);
    expect(document.activeElement?.id).toBe("pager");
  });

  it("with nothing focused, focuses the first item", () => {
    renderGrid(8);
    expect(moveFocus("down", document.body)).toBe(true);
    expect(document.activeElement?.id).toBe("card-0");
  });

  it("returns false and keeps focus when nothing is in that direction", () => {
    renderGrid(8);
    must(document.getElementById("card-0"), "card-0").focus();

    expect(moveFocus("up", document.body)).toBe(false);
    expect(document.activeElement?.id).toBe("card-0");
  });

  it("stays inside the root it is given", () => {
    document.body.innerHTML = `
      <div id="modal"><button id="a">A</button><button id="b">B</button></div>
      <button id="outside">Outside</button>`;
    place(must(document.getElementById("a"), "a"), rect(0, 0, 50, 50));
    place(must(document.getElementById("b"), "b"), rect(0, 300, 50, 50));
    // Closer than b, but outside the modal
    place(
      must(document.getElementById("outside"), "outside"),
      rect(0, 100, 50, 50)
    );
    must(document.getElementById("a"), "a").focus();

    expect(
      moveFocus("down", must(document.getElementById("modal"), "modal"))
    ).toBe(true);
    expect(document.activeElement?.id).toBe("b");
  });
});
