import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useIncrementalList } from "@/hooks/useIncrementalList";

/** Every observer built, with what it watches, so a test can report entries */
let observers: FakeObserver[] = [];

class FakeObserver {
  readonly watched = new Set<Element>();
  constructor(private readonly callback: IntersectionObserverCallback) {
    observers.push(this);
  }
  observe(target: Element) {
    this.watched.add(target);
  }
  unobserve(target: Element) {
    this.watched.delete(target);
  }
  disconnect() {
    this.watched.clear();
  }
  report(isIntersecting: boolean) {
    const entries = [...this.watched].map(
      (target) =>
        ({
          target,
          isIntersecting,
          intersectionRatio: isIntersecting ? 1 : 0,
        }) as IntersectionObserverEntry
    );
    act(() => this.callback(entries, this as unknown as IntersectionObserver));
  }
}

/** Every observer reports the sentinel, which is the only thing watched */
const reach = () => observers.forEach((o) => o.report(true));
const leave = () => observers.forEach((o) => o.report(false));

const numbered = (n: number) => Array.from({ length: n }, (_, i) => i);

const List = ({
  items,
  chunk,
  wanted = 0,
}: {
  items: number[];
  chunk?: number;
  wanted?: number;
}) => {
  const { visible, sentinelRef, hasMore, showAtLeast } = useIncrementalList(
    items,
    { chunk }
  );
  return (
    <div>
      <span data-testid="count">{visible.length}</span>
      <button type="button" onClick={() => showAtLeast(wanted)}>
        show
      </button>
      {hasMore && <div ref={sentinelRef} data-testid="sentinel" />}
    </div>
  );
};

const count = () => Number(screen.getByTestId("count").textContent);

describe("useIncrementalList", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the first chunk of 200 and a sentinel while items remain", () => {
    render(<List items={numbered(450)} />);
    expect(count()).toBe(200);
    expect(screen.getByTestId("sentinel")).toBeInTheDocument();
  });

  it("returns every item and no sentinel when they fit one chunk", () => {
    render(<List items={numbered(150)} />);
    expect(count()).toBe(150);
    expect(screen.queryByTestId("sentinel")).not.toBeInTheDocument();
  });

  it("the sentinel coming into view adds a chunk, until the items run out", () => {
    render(<List items={numbered(450)} />);
    reach();
    expect(count()).toBe(400);
    leave();
    reach();
    expect(count()).toBe(450);
    expect(screen.queryByTestId("sentinel")).not.toBeInTheDocument();
  });

  it("the sentinel staying in view adds one chunk, not one per render", () => {
    render(<List items={numbered(1000)} />);
    reach();
    reach();
    expect(count()).toBe(400);
  });

  it("takes the chunk size from the options", () => {
    render(<List items={numbered(100)} chunk={30} />);
    expect(count()).toBe(30);
    reach();
    expect(count()).toBe(60);
  });

  it("a new items array resets to the first chunk", () => {
    const { rerender } = render(<List items={numbered(1000)} />);
    reach();
    expect(count()).toBe(400);
    leave();
    rerender(<List items={numbered(1000)} />);
    expect(count()).toBe(200);
    // and the sentinel still pages the new list
    reach();
    expect(count()).toBe(400);
  });

  it("a longer list after every chunk showed loads its next chunk with the sentinel in view", () => {
    const { rerender } = render(<List items={numbered(300)} />);
    reach();
    expect(count()).toBe(300);
    expect(screen.queryByTestId("sentinel")).not.toBeInTheDocument();

    rerender(<List items={numbered(1000)} />);
    reach();
    expect(count()).toBe(400);
  });

  it("a new items array with the sentinel still in view loads the next chunk", () => {
    const { rerender } = render(<List items={numbered(1000)} />);
    reach();
    expect(count()).toBe(400);
    // Narrowed near the bottom: the sentinel after the first chunk is in view
    // and the observer reports no change
    rerender(<List items={numbered(900)} />);
    expect(count()).toBe(400);
  });

  it("showAtLeast grows to the whole chunk holding that many, never shrinks", () => {
    const { rerender } = render(<List items={numbered(1000)} wanted={201} />);
    fireEvent.click(screen.getByText("show"));
    expect(count()).toBe(400);

    rerender(<List items={numbered(1000)} wanted={950} />);
    // The same array was not passed: a new one resets, then grows
    fireEvent.click(screen.getByText("show"));
    expect(count()).toBe(1000);
    expect(screen.queryByTestId("sentinel")).not.toBeInTheDocument();
  });

  it("showAtLeast below what shows changes nothing", () => {
    render(<List items={numbered(1000)} wanted={10} />);
    reach();
    fireEvent.click(screen.getByText("show"));
    expect(count()).toBe(400);
  });

  it("shows everything where there is no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<List items={numbered(450)} />);
    expect(count()).toBe(450);
  });
});
