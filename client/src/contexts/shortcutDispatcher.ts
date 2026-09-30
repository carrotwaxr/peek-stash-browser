import { createContext } from "react";
import {
  buildKeyCombo,
  isEditableTarget,
  isModifierKey,
  isSingleLineTextInput,
  targetOwnsKey,
} from "../utils/keyTargets";

/**
 * One keyboard dispatcher for the whole app (item 40).
 *
 * Components declare what their keys do with `useShortcutScope`; they add no
 * `keydown` listener of their own. The dispatcher is one `window` listener in
 * the bubble phase, so element `onKeyDown` handlers run first and a key they
 * handle (`preventDefault`) reaches no scope.
 *
 * For each key:
 * 1. A pending sequence (a prefix like `r` under 1 s old) gives the key to its
 *    owner and to nothing else.
 * 2. In a text field only Escape is dispatched (exception: Up and Down leave a
 *    single-line input, to `tv` scopes only). A key the focused control owns
 *    (Space on a button, arrows on a slider) is not dispatched.
 * 3. Scopes are walked from the top layer down, the most recently registered
 *    first within a layer, skipping disabled scopes and scopes whose root does
 *    not hold the focus. The first handler that does not return false wins and
 *    the dispatcher calls `preventDefault()`.
 * 4. The walk stops at the first enabled modal scope (an overlay: the
 *    lightbox, a dialog). Exception: an arrow the modal leaves unhandled goes
 *    to the `tv` scopes, which move focus inside `topModalRoot()`.
 *
 * A control that stops a key from bubbling but does not use it (video.js's
 * controls do) hands it over with `dispatch(event)`, which runs the same steps.
 */

export type ShortcutLayer = "global" | "tv" | "page" | "player" | "overlay";

/**
 * Returns false when the key is not its to handle, so the walk goes on; any
 * other result (including none) counts as handled.
 */
export type ShortcutHandler = (event: KeyboardEvent) => unknown;

export interface ShortcutScopeOptions {
  layer: ShortcutLayer;
  enabled?: boolean;
  /** Default: `layer === "overlay"` */
  modal?: boolean;
  /** The scope acts only while focus is inside root or on no element */
  root?: () => Element | null;
  keys?: Readonly<Record<string, ShortcutHandler>>;
  /** A prefix and what the key after it does: `{ r: { "1": ..., f: ... } }` */
  sequences?: Readonly<
    Record<string, Readonly<Record<string, ShortcutHandler>>>
  >;
}

/** How long a sequence prefix waits for its second key */
export const SEQUENCE_TIMEOUT_MS = 1000;

const LAYER_RANK: Readonly<Record<ShortcutLayer, number>> = {
  global: 0,
  tv: 1,
  page: 2,
  player: 3,
  overlay: 4,
};

const ARROW_COMBOS = new Set(["up", "down", "left", "right"]);

interface RegisteredScope {
  order: number;
  read: () => ShortcutScopeOptions;
}

interface PendingSequence {
  scope: RegisteredScope;
  prefix: string;
  at: number;
}

const isModal = (options: ShortcutScopeOptions) =>
  options.modal ?? options.layer === "overlay";

export class ShortcutDispatcher {
  private readonly scopes = new Set<RegisteredScope>();
  // Events dispatch() took, so the window listener does not take them again
  private readonly dispatched = new WeakSet<KeyboardEvent>();
  private nextOrder = 0;
  private pending: PendingSequence | null = null;
  private listening = false;

  /**
   * Adds a scope; `read` returns its current options (so handlers stay fresh
   * without re-registering). Returns the function that removes it.
   */
  register(read: () => ShortcutScopeOptions): () => void {
    const scope: RegisteredScope = { order: this.nextOrder++, read };
    this.scopes.add(scope);
    this.listen();
    return () => {
      this.scopes.delete(scope);
      if (this.pending?.scope === scope) this.pending = null;
      if (this.scopes.size === 0) this.stopListening();
    };
  }

  /** The root of the topmost enabled modal scope, else null (for TV focus). */
  readonly topModalRoot = (): Element | null => {
    for (const { options } of this.enabledScopes()) {
      if (isModal(options)) return options.root?.() ?? null;
    }
    return null;
  };

  private listen() {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener("keydown", this.handleKeyDown);
  }

  private stopListening() {
    if (!this.listening) return;
    this.listening = false;
    this.pending = null;
    window.removeEventListener("keydown", this.handleKeyDown);
  }

  /** Enabled scopes, top layer first, the latest registered first in a layer */
  private enabledScopes() {
    return [...this.scopes]
      .map((scope) => ({ scope, options: scope.read() }))
      .filter(({ options }) => options.enabled !== false)
      .sort(
        (a, b) =>
          LAYER_RANK[b.options.layer] - LAYER_RANK[a.options.layer] ||
          b.scope.order - a.scope.order
      );
  }

  /**
   * Runs the dispatcher's steps for a key that will not reach its `window`
   * listener: a control inside a scope's root stopped it from bubbling and
   * left it unused. The event may be a copy of the DOM event whose
   * `preventDefault` forwards to it, as video.js hands over. An event already
   * dispatched is not dispatched again, from here or from the listener.
   */
  dispatch(event: KeyboardEvent): void {
    this.handleKeyDown(event);
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (this.dispatched.has(event)) return;
    this.dispatched.add(event);
    if (event.defaultPrevented || event.isComposing) return;
    if (isModifierKey(event.key)) return;

    const combo = buildKeyCombo(event);

    // 1. A pending sequence takes the next key, whatever it is
    const pending = this.pending;
    this.pending = null;
    if (pending && Date.now() - pending.at < SEQUENCE_TIMEOUT_MS) {
      if (!this.scopes.has(pending.scope)) return;
      const options = pending.scope.read();
      if (options.enabled === false) return;
      const handler = options.sequences?.[pending.prefix]?.[combo];
      if (handler && handler(event) !== false) event.preventDefault();
      return;
    }

    // 2. The focused element's own keys
    const target = event.target;
    let tvOnly = false;
    if (isEditableTarget(target)) {
      if (
        (combo === "up" || combo === "down") &&
        isSingleLineTextInput(target)
      ) {
        tvOnly = true;
      } else if (combo !== "esc") {
        return;
      }
    } else if (targetOwnsKey(target, combo)) {
      return;
    }

    // 3. The walk
    const scopes = this.enabledScopes();
    for (const [i, { scope, options }] of scopes.entries()) {
      const modal = isModal(options);
      if (tvOnly && options.layer !== "tv" && !modal) continue;

      if (
        (!tvOnly || options.layer === "tv") &&
        focusInside(options, target) &&
        this.tryScope(scope, options, combo, event)
      ) {
        event.preventDefault();
        return;
      }

      if (modal) {
        // 4. An arrow the modal left: the tv scopes below it move focus
        if (ARROW_COMBOS.has(combo)) {
          for (const below of scopes.slice(i + 1)) {
            if (
              below.options.layer === "tv" &&
              focusInside(below.options, target) &&
              this.tryScope(below.scope, below.options, combo, event)
            ) {
              event.preventDefault();
              return;
            }
          }
        }
        return;
      }
    }
  };

  /** Runs the scope's handler for the key; true when it handled it. */
  private tryScope(
    scope: RegisteredScope,
    options: ShortcutScopeOptions,
    combo: string,
    event: KeyboardEvent
  ): boolean {
    if (options.sequences?.[combo]) {
      this.pending = { scope, prefix: combo, at: Date.now() };
      return true;
    }
    const handler = options.keys?.[combo];
    if (!handler) return false;
    return handler(event) !== false;
  }
}

/** Focus is inside the scope's root, or on no element (the body). */
function focusInside(
  options: ShortcutScopeOptions,
  target: EventTarget | null
): boolean {
  if (!options.root) return true;
  if (
    !(target instanceof Element) ||
    target === document.body ||
    target === document.documentElement
  ) {
    return true;
  }
  const root = options.root();
  return root !== null && root.contains(target);
}

// Outside a provider (a component test) scopes share one dispatcher
export const ShortcutScopeContext = createContext<ShortcutDispatcher>(
  new ShortcutDispatcher()
);
