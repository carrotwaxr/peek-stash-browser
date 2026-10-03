/**
 * Key names and the rules for which element owns a key, shared by the
 * shortcut dispatcher (`contexts/shortcutDispatcher.ts`).
 */

const KEY_NAMES: Readonly<Record<string, string>> = {
  " ": "space",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Escape: "esc",
  Enter: "enter",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "del",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
};

/** A key's short name: `ArrowUp` is "up", " " is "space", `K` is "k". */
export function normalizeKey(key: string): string {
  return KEY_NAMES[key] ?? key.toLowerCase();
}

/**
 * The combination a shortcut map names: modifiers in a fixed order, then the
 * key ("ctrl+left", "shift+?", "space"). Meta counts as ctrl. Letters ignore
 * shift (K and k are both "k"); a shifted symbol keeps its character ("shift+>").
 */
export function buildKeyCombo(event: KeyboardEvent): string {
  const parts: string[] = [];
  let key = normalizeKey(event.key);

  if (event.ctrlKey || event.metaKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");

  const isLetter = /^[a-z]$/i.test(event.key);
  if (event.shiftKey && !isLetter) {
    parts.push("shift");
    if (event.key.length === 1) {
      key = event.key;
    }
  }

  parts.push(key);
  return parts.join("+");
}

/** Keys that only modify another key; they never start or end a shortcut. */
export function isModifierKey(key: string): boolean {
  return (
    key === "Shift" ||
    key === "Control" ||
    key === "Alt" ||
    key === "Meta" ||
    key === "CapsLock" ||
    key === "AltGraph"
  );
}

// Input types that take no typed text
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

function asElement(target: EventTarget | null): HTMLElement | null {
  return target instanceof HTMLElement ? target : null;
}

/** An `input` that takes a single line of text (text, search, email, ...). */
export function isSingleLineTextInput(
  target: EventTarget | null
): target is HTMLInputElement {
  const el = asElement(target);
  return (
    el instanceof HTMLInputElement &&
    !NON_TEXT_INPUT_TYPES.has(el.type.toLowerCase())
  );
}

/**
 * Whether Left or Right would leave a single-line text input: its caret
 * sits at that edge with no text selected (Left at the start, Right at the
 * end), or the input shows the page no caret at all (number, date, time...).
 * TV focus then moves on, so no field strands the controls beside it.
 */
export function caretAtEdge(
  input: HTMLInputElement,
  combo: "left" | "right"
): boolean {
  const { selectionStart: start, selectionEnd: end } = input;
  if (start === null || end === null) return true;
  if (start !== end) return false;
  return combo === "left" ? start === 0 : end === input.value.length;
}

/** A field the user types into: a text input, a textarea or contenteditable. */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = asElement(target);
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (isSingleLineTextInput(el)) return true;
  // happy-dom leaves isContentEditable undefined; read the attribute too
  const editable = el.closest("[contenteditable]");
  return (
    el.isContentEditable ||
    (editable !== null && editable.getAttribute("contenteditable") !== "false")
  );
}

const ARROWS = new Set(["up", "down", "left", "right"]);
const ACTIVATION_KEYS = new Set(["space", "enter"]);

/** TV mode is on: `TVModeProvider` sets `html.tv-mode` */
export function isTVModeOn(): boolean {
  return document.documentElement.classList.contains("tv-mode");
}

/** A native checkbox or radio */
export function isCheckable(
  target: EventTarget | null
): target is HTMLInputElement {
  const el = asElement(target);
  return (
    el instanceof HTMLInputElement &&
    (el.type.toLowerCase() === "checkbox" || el.type.toLowerCase() === "radio")
  );
}

/** A native range input or an ARIA slider */
export function isSlider(el: HTMLElement): boolean {
  return (
    (el instanceof HTMLInputElement && el.type.toLowerCase() === "range") ||
    el.closest('[role="slider"]') !== null
  );
}

/**
 * Whether the focused control uses this key itself, so no shortcut may take
 * it: sliders, selects, menus and listboxes own the arrows; buttons and links
 * own Space and Enter (they activate).
 *
 * In TV mode (arrows move focus by position, `TVNavigator`) a closed select
 * gives up its arrows and Enter (TV focus moves on, and Enter opens its
 * picker), and a slider gives up Up and Down but keeps Left and Right to
 * change its value. An open menu or listbox keeps its arrows in any mode.
 * Enter on a checkbox or radio is ticked by the dispatcher in TV mode
 * (browsers ignore it; a remote's OK sends it).
 */
export function targetOwnsKey(
  target: EventTarget | null,
  combo: string
): boolean {
  const el = asElement(target);
  if (!el) return false;

  if (ARROWS.has(combo)) {
    if (el instanceof HTMLSelectElement) return !isTVModeOn();
    if (isSlider(el)) {
      return !isTVModeOn() || combo === "left" || combo === "right";
    }
    return (
      el.closest('[role="menu"], [role="menubar"], [role="listbox"]') !== null
    );
  }

  if (ACTIVATION_KEYS.has(combo)) {
    if (el instanceof HTMLSelectElement) {
      return !(isTVModeOn() && combo === "enter");
    }
    return (
      el.closest(
        'button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"], input[type="checkbox"], input[type="radio"]'
      ) !== null
    );
  }

  return false;
}
