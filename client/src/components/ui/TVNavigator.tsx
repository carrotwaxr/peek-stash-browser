import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  useShortcutScope,
  useShortcutScopeContext,
} from "../../hooks/useShortcutScope";
import { type Direction, moveFocus } from "../../utils/spatialFocus";

/** How long after a route change the first item may still take focus */
const ROUTE_FOCUS_WAIT_MS = 5000;

/**
 * TV mode's arrow keys (item 50), mounted by `GlobalLayout` while TV mode is
 * on. A `tv` scope: an arrow moves focus to the nearest item in that
 * direction by position (`utils/spatialFocus.ts`), inside the top modal when
 * one is open (the dispatcher hands a modal's unused arrows here), else the
 * whole page. PageUp and PageDown are left to the page's own scope.
 *
 * After a route change it focuses the first `[data-tv-item]` in `<main>`
 * once one renders, unless focus is still inside `<main>` (a list keeps it in
 * its search box), moved on meanwhile (the Scene page focuses its player) or
 * a dialog is open.
 */
const TVNavigator = () => {
  const { topModalRoot } = useShortcutScopeContext();
  const location = useLocation();

  const move = (direction: Direction) => () =>
    moveFocus(direction, topModalRoot() ?? document.body);

  useShortcutScope({
    layer: "tv",
    keys: {
      up: move("up"),
      down: move("down"),
      left: move("left"),
      right: move("right"),
    },
  });

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;

    // What had focus when the route changed: a card about to be replaced
    // (a page change), the sidebar link that was pressed, or nothing
    const before = document.activeElement;

    /** True once there is nothing left to do */
    const focusFirstItem = (): boolean => {
      if (topModalRoot()) return true;
      const active = document.activeElement;
      const lost = !active || active === document.body;
      if (!lost) {
        // Focus moved on since the change (the player took it, the user
        // pressed a key): leave it
        if (active !== before) return true;
        // Still on an old item of this page: wait for it to go
        if (main.contains(active)) return false;
      }
      const first = main.querySelector<HTMLElement>("[data-tv-item]");
      if (!first) return false;
      first.focus({ preventScroll: true });
      return true;
    };

    if (focusFirstItem()) return;
    const observer = new MutationObserver(() => {
      if (focusFirstItem()) observer.disconnect();
    });
    observer.observe(main, { childList: true, subtree: true });
    const timer = setTimeout(() => observer.disconnect(), ROUTE_FOCUS_WAIT_MS);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [location.key, topModalRoot]);

  return null;
};

export default TVNavigator;
