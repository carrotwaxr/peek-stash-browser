/**
 * The Scene page's initial focus (`useInitialFocus`) lands on the play button
 * a moment after the scene loads, but never takes focus the user has already
 * put on another control: a key pressed there must not reach the player.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInitialFocus } from "@/hooks/useFocusTrap";

/** A page holding a player with its play button, and a button outside both */
function page() {
  const container = document.createElement("div");
  const player = document.createElement("div");
  player.tabIndex = -1;
  const play = document.createElement("button");
  play.className = "vjs-big-play-button";
  player.appendChild(play);
  container.appendChild(player);
  const outside = document.createElement("button");
  document.body.append(container, outside);
  return { container, player, play, outside };
}

describe("useInitialFocus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("focuses the target once the delay passes while focus is on nothing", () => {
    const { container, play } = page();

    renderHook(() =>
      useInitialFocus({ current: container }, ".vjs-big-play-button")
    );
    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(play);
  });

  it("moves focus from an element holding the target (the player around its play button)", () => {
    const { container, player, play } = page();
    player.focus();

    renderHook(() =>
      useInitialFocus({ current: container }, ".vjs-big-play-button")
    );
    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(play);
  });

  it("leaves focus on a control the user focused before the delay passed", () => {
    const { container, outside } = page();

    renderHook(() =>
      useInitialFocus({ current: container }, ".vjs-big-play-button")
    );
    outside.focus();
    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(outside);
  });

  /**
   * The Scene page: enabled while no scene loads, and `request` the scene the
   * latest load asked for (null before the first load starts)
   */
  function renderOnPage(
    container: HTMLElement,
    initialProps: { loading: boolean; request?: string | null } = {
      loading: false,
    }
  ) {
    // One ref for the page's life, as the page's own is
    const ref = { current: container };
    return renderHook(
      ({ loading, request }: { loading: boolean; request?: string | null }) =>
        useInitialFocus(ref, ".vjs-big-play-button", !loading, request),
      { initialProps }
    );
  }

  it("a scene change started from a similar-scene card moves focus to the target once the scene lands", () => {
    const { container, play, outside: card } = page();
    const { rerender } = renderOnPage(container);
    vi.advanceTimersByTime(100);
    expect(document.activeElement).toBe(play);

    // The card is focused when the change starts and keeps focus until the
    // new scene lands
    card.focus();
    rerender({ loading: true });
    rerender({ loading: false });
    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(play);
  });

  it("a scene change whose scene lands after the user left the card for another control leaves focus there", () => {
    const { container, outside: card } = page();
    const other = document.createElement("button");
    document.body.appendChild(other);
    const { rerender } = renderOnPage(container);
    vi.advanceTimersByTime(100);

    card.focus();
    rerender({ loading: true });
    other.focus();
    rerender({ loading: false });
    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(other);
  });

  it("Next pressed while the first scene still loads moves focus to the target once the next scene lands", () => {
    const { container, player, play, outside: next } = page();
    // The player took focus for the first scene, which is still loading
    player.focus();
    const { rerender } = renderOnPage(container, {
      loading: true,
      request: "123:inst-a",
    });
    vi.advanceTimersByTime(100);

    // Next is focused when the step starts and keeps focus until the next
    // scene lands
    next.focus();
    rerender({ loading: true, request: "124:inst-a" });
    rerender({ loading: false, request: "124:inst-a" });
    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(play);
  });

  it("the first load starting after the user focused a control leaves focus there", () => {
    const { container, outside } = page();
    // The page mounts loading, before the load has asked for its scene
    const { rerender } = renderOnPage(container, {
      loading: true,
      request: null,
    });

    outside.focus();
    rerender({ loading: true, request: "123:inst-a" });
    rerender({ loading: false, request: "123:inst-a" });
    vi.advanceTimersByTime(100);

    expect(document.activeElement).toBe(outside);
  });
});
