import { useContext, useEffect, useLayoutEffect, useRef } from "react";
import {
  type ShortcutDispatcher,
  ShortcutScopeContext,
  type ShortcutScopeOptions,
} from "../contexts/shortcutDispatcher";

/**
 * Declares a component's keyboard shortcuts on the app's scope stack (see
 * `contexts/shortcutDispatcher.ts`). The scope is registered while it is
 * enabled, so the most recently enabled scope in a layer goes first; its
 * handlers are read through a ref, so they are always the latest render's.
 *
 * @example
 * useShortcutScope({
 *   layer: "overlay",
 *   enabled: isOpen,
 *   root: () => dialogRef.current,
 *   keys: { esc: onClose },
 * });
 */
export function useShortcutScope(options: ShortcutScopeOptions): void {
  const dispatcher = useContext(ShortcutScopeContext);
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  const enabled = options.enabled !== false;
  useEffect(() => {
    if (!enabled) return;
    return dispatcher.register(() => optionsRef.current);
  }, [dispatcher, enabled]);
}

/** The dispatcher, for `topModalRoot()` (TV focus stays inside the top modal). */
export function useShortcutScopeContext(): Pick<
  ShortcutDispatcher,
  "topModalRoot"
> {
  return useContext(ShortcutScopeContext);
}
