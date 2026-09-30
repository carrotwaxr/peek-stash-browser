import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { act, fireEvent, render } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SceneCard from "@/components/ui/SceneCard";
import { getDefaultSettings } from "@/config/entityDisplayConfig";

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: false }),
}));
// A fully featured card: every part a user can switch on is on
vi.mock("@/contexts/CardDisplaySettingsContext", () => ({
  useCardDisplaySettings: () => ({
    getSettings: (entityType: string) => ({
      ...getDefaultSettings(entityType),
      showCodeOnCard: true,
      showStudio: true,
      showDate: true,
      showDescriptionOnCard: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
      showMenu: true,
    }),
  }),
}));

const HOVER_QUERY = "(hover: hover)";

/** Every observer and hover listener the cards create, counted */
const counts = {
  intersection: [] as { disconnected: boolean }[],
  resize: [] as { disconnected: boolean }[],
  hoverListeners: 0,
};

/** An IntersectionObserver that reports what it observes as visible, or not */
let reportVisible = false;

class CountingIntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly thresholds: readonly number[] = [];
  private readonly record = { disconnected: false };
  constructor(private readonly callback: IntersectionObserverCallback) {
    counts.intersection.push(this.record);
  }
  observe(target: Element) {
    if (!reportVisible) return;
    queueMicrotask(() =>
      this.callback(
        [
          {
            target,
            isIntersecting: true,
            intersectionRatio: 1,
          } as IntersectionObserverEntry,
        ],
        this as unknown as IntersectionObserver
      )
    );
  }
  unobserve() {}
  disconnect() {
    this.record.disconnected = true;
  }
  takeRecords() {
    return [];
  }
}

class CountingResizeObserver {
  private readonly record = { disconnected: false };
  constructor() {
    counts.resize.push(this.record);
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.record.disconnected = true;
  }
}

/** A pointer device: the hover query matches */
const matchMedia = (query: string) => ({
  matches: query === HOVER_QUERY,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {
    if (query === HOVER_QUERY) counts.hoverListeners += 1;
  },
  removeEventListener: () => {},
  dispatchEvent: () => false,
});

/** A scene with everything a card can show */
const fullScene = (i: number) =>
  ({
    id: String(i),
    instanceId: "inst-a",
    title: `Scene ${i} with a title long enough to scroll`,
    details: "A description that runs over several lines of the card.",
    code: `CODE-${i}`,
    date: "2024-01-01",
    rating: 80,
    favorite: false,
    o_counter: 2,
    play_count: 3,
    resume_time: 30,
    studio: { id: "1", name: "Studio" },
    paths: {
      screenshot: `/screenshot/${i}.jpg`,
      vtt: `/vtt/${i}.vtt`,
      sprite: `/sprite/${i}.jpg`,
    },
    files: [{ duration: 3600, width: 1920, height: 1080 }],
    performers: [{ id: "1", name: "Performer" }],
    tags: [{ id: "1", name: "Tag" }],
    inheritedTags: [{ id: "2", name: "Inherited" }],
    groups: [{ id: "1", name: "Group" }],
    galleries: [{ id: "1", title: "Gallery" }],
  }) as unknown as NormalizedScene;

/** `n` cards; scroll autoplay (a one-column grid) adds a second observer */
const renderCards = (n: number, autoplayOnScroll = true) =>
  render(
    <SignedInWithQuery>
      <MemoryRouter>
        {Array.from({ length: n }, (_, i) => (
          <SceneCard
            key={i}
            scene={fullScene(i)}
            autoplayOnScroll={autoplayOnScroll}
          />
        ))}
      </MemoryRouter>
    </SignedInWithQuery>
  );

describe("the cost of a grid of scene cards", () => {
  beforeEach(() => {
    counts.intersection = [];
    counts.resize = [];
    counts.hoverListeners = 0;
    reportVisible = false;
    vi.stubGlobal("IntersectionObserver", CountingIntersectionObserver);
    vi.stubGlobal("ResizeObserver", CountingResizeObserver);
    vi.stubGlobal("matchMedia", matchMedia);
    // Nothing here needs an answer; a request that never settles keeps
    // background fetches from reaching the network
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {}))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("100 scene cards create at most 3 IntersectionObservers and 1 hover media query listener", () => {
    renderCards(100);

    expect(counts.intersection.length).toBeLessThanOrEqual(3);
    expect(counts.hoverListeners).toBe(1);
  });

  it("100 scene cards create no ResizeObserver until one is hovered", () => {
    // A grid of several columns: a hover plays the preview
    const { container } = renderCards(100, false);
    expect(counts.resize).toHaveLength(0);

    const preview = must(
      container.querySelector('a[href="/scene/0"] > div.relative.h-full'),
      "the first card's preview"
    );
    fireEvent.mouseEnter(preview);
    expect(counts.resize).toHaveLength(1);

    fireEvent.mouseLeave(preview);
    expect(counts.resize.every((r) => r.disconnected)).toBe(true);
  });

  it("a scene card renders one screenshot img", async () => {
    reportVisible = true;
    const { container } = renderCards(1);
    await act(() => Promise.resolve());

    expect(
      container.querySelectorAll('img[src="/screenshot/0.jpg"]')
    ).toHaveLength(1);
  });

  it("unmounting every card disconnects the shared observers", () => {
    const { unmount } = renderCards(100);
    expect(counts.intersection.length).toBeGreaterThan(0);

    unmount();

    expect(counts.intersection.every((o) => o.disconnected)).toBe(true);
    expect(counts.resize.every((o) => o.disconnected)).toBe(true);
  });
});
