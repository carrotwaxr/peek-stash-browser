import { afterEach, describe, expect, it } from "vitest";
import {
  buildKeyCombo,
  isEditableTarget,
  isSingleLineTextInput,
  targetOwnsKey,
} from "@/utils/keyTargets";

function keyEvent(key: string, init: Partial<KeyboardEventInit> = {}) {
  return new KeyboardEvent("keydown", { key, ...init });
}

function mount<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  parent: HTMLElement = document.body
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  parent.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("buildKeyCombo", () => {
  it.each([
    [" ", "space"],
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["Escape", "esc"],
    ["Enter", "enter"],
    ["PageDown", "pagedown"],
  ])("normalizes %s to '%s'", (rawKey, combo) => {
    expect(buildKeyCombo(keyEvent(rawKey))).toBe(combo);
  });

  it("reads Ctrl and Meta as ctrl: ctrl+s, ctrl+left", () => {
    expect(buildKeyCombo(keyEvent("s", { ctrlKey: true }))).toBe("ctrl+s");
    expect(buildKeyCombo(keyEvent("s", { metaKey: true }))).toBe("ctrl+s");
    expect(buildKeyCombo(keyEvent("ArrowLeft", { ctrlKey: true }))).toBe(
      "ctrl+left"
    );
  });

  it("names Alt: alt+a", () => {
    expect(buildKeyCombo(keyEvent("a", { altKey: true }))).toBe("alt+a");
  });

  it("keeps the shifted symbol: shift+? and shift+>", () => {
    expect(buildKeyCombo(keyEvent("?", { shiftKey: true }))).toBe("shift+?");
    expect(buildKeyCombo(keyEvent(">", { shiftKey: true }))).toBe("shift+>");
  });

  it("letters ignore shift: Shift+K is k", () => {
    expect(buildKeyCombo(keyEvent("K", { shiftKey: true }))).toBe("k");
    expect(buildKeyCombo(keyEvent("R"))).toBe("r");
  });
});

describe("isEditableTarget", () => {
  it("text inputs, textareas and contenteditable are editable; buttons, checkboxes and sliders are not", () => {
    const div = mount("div");
    div.contentEditable = "true";
    expect(isEditableTarget(mount("input"))).toBe(true);
    expect(isEditableTarget(mount("input", { type: "search" }))).toBe(true);
    expect(isEditableTarget(mount("textarea"))).toBe(true);
    expect(isEditableTarget(div)).toBe(true);
    expect(isEditableTarget(mount("button"))).toBe(false);
    expect(isEditableTarget(mount("input", { type: "checkbox" }))).toBe(false);
    expect(isEditableTarget(mount("input", { type: "range" }))).toBe(false);
    expect(isEditableTarget(document.body)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it("only a text-type input is single-line", () => {
    expect(isSingleLineTextInput(mount("input"))).toBe(true);
    expect(isSingleLineTextInput(mount("input", { type: "search" }))).toBe(
      true
    );
    expect(isSingleLineTextInput(mount("textarea"))).toBe(false);
    expect(isSingleLineTextInput(mount("input", { type: "range" }))).toBe(
      false
    );
  });
});

describe("targetOwnsKey", () => {
  it("targetOwnsKey: sliders, selects and role=menu own arrows; buttons and links own Space and Enter", () => {
    const range = mount("input", { type: "range" });
    const slider = mount("div", { role: "slider", tabindex: "0" });
    const select = mount("select");
    const menu = mount("div", { role: "menu" });
    const menuItem = mount("button", { role: "menuitem" }, menu);
    const button = mount("button");
    const link = mount("a", { href: "/scenes" });
    const card = mount("div", { tabindex: "0" });

    for (const el of [range, slider, select, menuItem]) {
      expect(targetOwnsKey(el, "left")).toBe(true);
      expect(targetOwnsKey(el, "down")).toBe(true);
    }
    expect(targetOwnsKey(range, "r")).toBe(false);

    for (const el of [button, link]) {
      expect(targetOwnsKey(el, "space")).toBe(true);
      expect(targetOwnsKey(el, "enter")).toBe(true);
      expect(targetOwnsKey(el, "left")).toBe(false);
      expect(targetOwnsKey(el, "r")).toBe(false);
    }

    expect(targetOwnsKey(card, "space")).toBe(false);
    expect(targetOwnsKey(card, "left")).toBe(false);
    expect(targetOwnsKey(document.body, "space")).toBe(false);
  });
});
