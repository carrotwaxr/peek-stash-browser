import { useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type InViewOptions, useInView } from "@/hooks/useInView";

/** Every observer built, with what it watches, so a test can report entries */
let observers: FakeObserver[] = [];

class FakeObserver {
  readonly watched = new Set<Element>();
  disconnected = false;
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit | undefined
  ) {
    observers.push(this);
  }
  observe(target: Element) {
    this.watched.add(target);
  }
  unobserve(target: Element) {
    this.watched.delete(target);
  }
  disconnect() {
    this.disconnected = true;
    this.watched.clear();
  }
  /** Report every watched element at `ratio` */
  report(ratio: number) {
    const entries = [...this.watched].map(
      (target) =>
        ({
          target,
          isIntersecting: ratio > 0,
          intersectionRatio: ratio,
        }) as IntersectionObserverEntry
    );
    act(() => this.callback(entries, this as unknown as IntersectionObserver));
  }
}

const Probe = ({ id, ...options }: InViewOptions & { id: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, options);
  return (
    <div ref={ref} data-testid={id}>
      {inView ? "in" : "out"}
    </div>
  );
};

describe("useInView", () => {
  beforeEach(() => {
    observers = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("callers with the same options share one observer; other options get their own", () => {
    render(
      <>
        <Probe id="a" rootMargin="200px" />
        <Probe id="b" rootMargin="200px" />
        <Probe id="c" threshold={0.5} />
      </>
    );

    expect(observers).toHaveLength(2);
    expect(must(observers[0]).watched.size).toBe(2);

    must(observers[0]).report(1);
    expect(screen.getByTestId("a")).toHaveTextContent("in");
    expect(screen.getByTestId("b")).toHaveTextContent("in");
    expect(screen.getByTestId("c")).toHaveTextContent("out");
  });

  it("minRatio needs that share of the element in view", () => {
    render(<Probe id="a" minRatio={0.9} threshold={[0, 0.9]} />);
    const observer = must(observers[0]);

    observer.report(0.5);
    expect(screen.getByTestId("a")).toHaveTextContent("out");
    observer.report(0.95);
    expect(screen.getByTestId("a")).toHaveTextContent("in");
  });

  it("once keeps true and stops watching; the last caller gone disconnects", () => {
    const { unmount } = render(
      <>
        <Probe id="a" once />
        <Probe id="b" />
      </>
    );
    const observer = must(observers[0]);

    observer.report(1);
    expect(observer.watched.size).toBe(1);
    observer.report(0);
    expect(screen.getByTestId("a")).toHaveTextContent("in");
    expect(screen.getByTestId("b")).toHaveTextContent("out");

    unmount();
    expect(observer.disconnected).toBe(true);
  });

  it("a caller that joins an element already watched gets its last entry", () => {
    const Two = ({ second }: { second: boolean }) => {
      const ref = useRef<HTMLDivElement>(null);
      const first = useInView(ref);
      const late = useInView(ref, { skip: !second });
      return <div ref={ref}>{`${first} ${late}`}</div>;
    };
    const { rerender } = render(<Two second={false} />);
    must(observers[0]).report(1);

    rerender(<Two second />);

    expect(screen.getByText("true true")).toBeInTheDocument();
  });

  it("with no IntersectionObserver everything is in view", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(<Probe id="a" />);

    expect(screen.getByTestId("a")).toHaveTextContent("in");
  });

  it("an observer built under an earlier stub is not reused", () => {
    // Still mounted: its observer outlives the stub it was built under
    render(<Probe id="a" />);

    class Replacement extends FakeObserver {}
    vi.stubGlobal("IntersectionObserver", Replacement);
    render(<Probe id="b" />);

    expect(observers).toHaveLength(2);
    expect(must(observers[1])).toBeInstanceOf(Replacement);
    expect(must(observers[1]).watched.size).toBe(1);
  });
});
