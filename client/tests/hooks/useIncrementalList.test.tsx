import { act, render, screen } from "@testing-library/react";
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

const List = ({ items, chunk }: { items: number[]; chunk?: number }) => {
  const { visible, sentinelRef, hasMore } = useIncrementalList(items, {
    chunk,
  });
  return (
    <div>
      <span data-testid="count">{visible.length}</span>
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
    rerender(<List items={numbered(1000)} />);
    expect(count()).toBe(200);
    // and the sentinel still pages the new list
    leave();
    reach();
    expect(count()).toBe(400);
  });

  it("shows everything where there is no IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<List items={numbered(450)} />);
    expect(count()).toBe(450);
  });
});
