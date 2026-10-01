import type { ProfilerOnRenderCallback } from "react";
import { MemoryRouter } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { act, fireEvent, render } from "@testing-library/react";
import { SignedInWithQuery } from "@tests/helpers/SignedInWithQuery";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as baseCard from "@/components/ui/BaseCard";
import type { BaseCardProps } from "@/components/ui/BaseCard";
import SceneCard from "@/components/ui/SceneCard";
import TVNavigator from "@/components/ui/TVNavigator";
import { getDefaultSettings } from "@/config/entityDisplayConfig";
import { ShortcutScopeProvider } from "@/contexts/ShortcutScopeContext";

vi.mock("@/contexts/ConfigContext", () => ({
  useConfig: () => ({ hasMultipleInstances: false }),
}));
let tvMode = false;
vi.mock("@/hooks/useTVMode", () => ({
  useTVMode: () => ({ isTVMode: tvMode }),
}));

/** Commits per card: a card committed when anything inside it rendered */
const commits = new Map<string, number>();
const recordCommit: ProfilerOnRenderCallback = (id) => {
  commits.set(id, (commits.get(id) ?? 0) + 1);
};

// A Profiler inside each card, under the card's own component: it reports a
// commit only when the card, or a part of it, rendered (a card that skipped
// its render reports nothing, where a Profiler placed by the list would
// report every render of the list)
vi.mock("@/components/ui/BaseCard", async (importOriginal) => {
  const actual = await importOriginal<typeof baseCard>();
  const { Profiler, createElement, forwardRef } = await import("react");
  const Profiled = forwardRef<HTMLDivElement, BaseCardProps>((props, ref) =>
    createElement(
      Profiler,
      {
        id: props.ratingEntity?.id ?? "?",
        onRender: recordCommit,
      },
      createElement(actual.BaseCard, { ...props, ref })
    )
  );
  return { ...actual, BaseCard: Profiled, default: Profiled };
});
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
    rating100: 80,
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
    tvMode = false;
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

  describe("re-renders", () => {
    /** What the server holds; each fetch answers a fresh copy of it */
    let serverRows: NormalizedScene[] = [];
    let client: QueryClient | undefined;
    const openScene = vi.fn();

    /** A list page's grid: one query, dimmed while it refetches */
    function SceneList() {
      client = useQueryClient();
      const { data, isFetching, dataUpdatedAt } = useQuery({
        queryKey: ["cardCost", "scenes"],
        queryFn: () => Promise.resolve(structuredClone(serverRows)),
      });
      return (
        <div
          data-testid="list"
          data-fetching={isFetching}
          data-updated={dataUpdatedAt}
          className={isFetching ? "opacity-60" : ""}
        >
          {data?.map((scene) => (
            <SceneCard key={scene.id} scene={scene} onClick={openScene} />
          ))}
        </div>
      );
    }

    const renderList = async (n: number) => {
      serverRows = Array.from({ length: n }, (_, i) => fullScene(i));
      const view = render(
        <SignedInWithQuery>
          <MemoryRouter>
            <SceneList />
          </MemoryRouter>
        </SignedInWithQuery>
      );
      await waitForCards(view.container, n);
      return view;
    };

    /** Waits for the list's first answer */
    const waitForCards = (container: HTMLElement, n: number) =>
      vi.waitFor(() =>
        expect(container.querySelectorAll("[data-tv-item]")).toHaveLength(n)
      );

    /**
     * Refetches the list's query (only it: the user-settings query never
     * answers here) and waits until the list has drawn the answer
     */
    const refetch = async (container: HTMLElement) => {
      const list = must(
        container.querySelector<HTMLElement>('[data-testid="list"]'),
        "the list"
      );
      const before = list.dataset.updated;
      await act(() =>
        must(client, "the query client").refetchQueries({
          queryKey: ["cardCost"],
        })
      );
      await vi.waitFor(() => {
        expect(list.dataset.updated).not.toBe(before);
        expect(list.dataset.fetching).toBe("false");
      });
    };

    beforeEach(() => {
      commits.clear();
    });

    it("a list refetch with unchanged rows renders each card once", async () => {
      const { container } = await renderList(48);
      expect(commits.size).toBe(48);

      await refetch(container);

      // Once each: when it mounted
      expect([...new Set(commits.values())]).toEqual([1]);
    });

    it("a rating change from the server renders the card once, not twice", async () => {
      const { container } = await renderList(48);
      commits.clear();

      serverRows = serverRows.map((scene) =>
        scene.id === "5" ? { ...scene, rating: 40, rating100: 40 } : scene
      );
      await refetch(container);

      expect(commits.get("5")).toBe(1);
      expect(commits.size).toBe(1);
      // The card shows the server's rating
      const cardFive = must(
        container
          .querySelector('a[href="/scene/5"]')
          ?.closest("[data-tv-item]"),
        "card 5"
      );
      expect(cardFive.textContent).toContain("4.0");
    });

    it("in TV mode an arrow press re-renders at most two cards of 48", async () => {
      tvMode = true;
      serverRows = Array.from({ length: 48 }, (_, i) => fullScene(i));
      const { container } = render(
        <SignedInWithQuery>
          <MemoryRouter>
            <ShortcutScopeProvider>
              <TVNavigator />
              <SceneList />
            </ShortcutScopeProvider>
          </MemoryRouter>
        </SignedInWithQuery>
      );
      await waitForCards(container, 48);

      // happy-dom has no layout: the cards sit in 8 rows of 6
      const cards = [
        ...container.querySelectorAll<HTMLElement>("[data-tv-item]"),
      ];
      cards.forEach((card, i) => {
        const left = (i % 6) * 300;
        const top = Math.floor(i / 6) * 400;
        const r = { left, top, right: left + 280, bottom: top + 380 };
        card.getBoundingClientRect = () =>
          ({ ...r, x: left, y: top, width: 280, height: 380 }) as DOMRect;
      });
      act(() => must(cards[0], "the first card").focus());
      commits.clear();

      fireEvent.keyDown(must(cards[0], "the first card"), {
        key: "ArrowRight",
      });

      expect(document.activeElement).toBe(cards[1]);
      expect(commits.size).toBeLessThanOrEqual(2);
    });
  });
});
