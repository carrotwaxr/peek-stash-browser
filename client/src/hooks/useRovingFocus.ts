import { type KeyboardEvent, type RefObject, useCallback } from "react";

interface RovingFocusOptions {
  /** CSS selector for the items inside the container, e.g. `[role="option"]` */
  itemSelector: string;
  /**
   * Which arrows move: `vertical` is Up and Down, `horizontal` Left and
   * Right, `both` all four. Default `vertical`.
   */
  orientation?: "vertical" | "horizontal" | "both";
  /** Whether a move past either end wraps to the other. Default true. */
  loop?: boolean;
}

const KEYS = {
  vertical: { prev: ["ArrowUp"], next: ["ArrowDown"] },
  horizontal: { prev: ["ArrowLeft"], next: ["ArrowRight"] },
  both: {
    prev: ["ArrowUp", "ArrowLeft"],
    next: ["ArrowDown", "ArrowRight"],
  },
} as const;

/** An item that cannot take focus: native `disabled` or `aria-disabled` */
function isDisabled(el: HTMLElement): boolean {
  return (
    el.matches(":disabled") ||
    el.getAttribute("aria-disabled") === "true" ||
    el.closest("fieldset:disabled") !== null
  );
}

/**
 * Arrow-key focus for a menu or listbox: returns an `onKeyDown` for the
 * container that moves DOM focus among the items its selector matches
 * (the arrows of `orientation`, Home and End), skipping disabled ones and
 * wrapping unless `loop` is false.
 *
 * A key it handles calls `preventDefault`, so no shortcut scope and not the TV
 * navigator also moves focus (`targetOwnsKey` gives the arrows to an item
 * inside a `role="menu"` or `role="listbox"`; without that role the
 * `preventDefault` still keeps them from the scopes).
 */
export function useRovingFocus(
  containerRef: RefObject<HTMLElement | null>,
  { itemSelector, orientation = "vertical", loop = true }: RovingFocusOptions
) {
  return useCallback(
    (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      const items = Array.from(
        container.querySelectorAll<HTMLElement>(itemSelector)
      ).filter((item) => !isDisabled(item));
      if (items.length === 0) return;

      const { prev, next } = KEYS[orientation];
      const active = document.activeElement;
      const current = items.findIndex(
        (item) => item === active || (active && item.contains(active))
      );
      const last = items.length - 1;

      let target: number | null = null;
      if (event.key === "Home") {
        target = 0;
      } else if (event.key === "End") {
        target = last;
      } else if ((next as readonly string[]).includes(event.key)) {
        if (current === -1) target = 0;
        else if (current < last) target = current + 1;
        else target = loop ? 0 : last;
      } else if ((prev as readonly string[]).includes(event.key)) {
        if (current === -1) target = last;
        else if (current > 0) target = current - 1;
        else target = loop ? last : 0;
      }
      if (target === null) return;

      event.preventDefault();
      items[target]?.focus();
    },
    [containerRef, itemSelector, orientation, loop]
  );
}
