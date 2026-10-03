/**
 * The VR button is a video.js menu button: a "VR view" toggle, one radio item
 * per projection, and on an insecure origin a line saying headset mode needs
 * HTTPS. Roles and checked states are what a screen reader hears (RC22).
 */
import { VR_PROJECTIONS } from "@peek/shared-types";
import { must } from "@tests/testUtils";
import videojs from "video.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  VR_BUTTON_NAME,
  VrMenuButton,
  type VrMenuModel,
} from "@/components/video-player/vr/VrControls";

interface BarPlayer {
  controlBar: { addChild(child: unknown): { el(): Element } };
  dispose(): void;
}

const players: BarPlayer[] = [];

function mount(model: Partial<VrMenuModel> = {}) {
  const state: VrMenuModel = {
    enabled: false,
    projection: "180_LR",
    secure: true,
    ...model,
  };
  const onToggle = vi.fn();
  const onProjection = vi.fn();
  const video = document.createElement("video");
  document.body.appendChild(video);
  const player = videojs(video, { controls: true }) as unknown as BarPlayer;
  players.push(player);
  const button = new VrMenuButton(player, {
    state: () => state,
    onToggle,
    onProjection,
  });
  player.controlBar.addChild(button);
  const el = button.el() as Element;
  return { state, button, el, onToggle, onProjection };
}

const toggle = (el: Element) =>
  must(el.querySelector('[role="menuitemcheckbox"]'), "the toggle");
const radios = (el: Element) =>
  Array.from(el.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));

afterEach(() => {
  players.splice(0).forEach((player) => player.dispose());
  document.body.innerHTML = "";
});

describe("VrMenuButton", () => {
  it("is named VR", () => {
    const { el, button } = mount();
    expect(button.name()).toBe(VR_BUTTON_NAME);
    expect(el.querySelector(".vjs-control-text")?.textContent).toBe("VR");
    expect(el.className).toContain("vjs-vr-button");
  });

  it("has a VR view checkbox that follows the state", () => {
    const { el, state, button } = mount();
    expect(toggle(el).textContent).toContain("VR view");
    expect(toggle(el).getAttribute("aria-checked")).toBe("false");

    state.enabled = true;
    button.refresh();
    expect(toggle(el).getAttribute("aria-checked")).toBe("true");
  });

  it("has one radio per projection, the current one checked", () => {
    const { el, state, button } = mount({ projection: "360" });
    expect(radios(el)).toHaveLength(VR_PROJECTIONS.length);
    const checked = (root: Element) =>
      radios(root)
        .filter((item) => item.getAttribute("aria-checked") === "true")
        .map((item) => radios(root).indexOf(item));
    expect(checked(el)).toEqual([VR_PROJECTIONS.indexOf("360")]);

    state.projection = "EAC_LR";
    button.refresh();
    expect(checked(el)).toEqual([VR_PROJECTIONS.indexOf("EAC_LR")]);
  });

  it("calls back on a click of the toggle and of a projection", () => {
    const { button, onToggle, onProjection } = mount();
    // video.js hears its own events (jsdom's native clicks never reach it)
    must(button.vrToggle, "the toggle item").trigger("click");
    expect(onToggle).toHaveBeenCalledTimes(1);

    const second = must(
      must(button.vrRadios, "the radios")[1],
      "the second projection"
    );
    second[1].trigger("click");
    expect(onProjection).toHaveBeenCalledWith(VR_PROJECTIONS[1]);
  });

  it("shows no HTTPS note on a secure origin", () => {
    const { el } = mount({ secure: true });
    expect(el.textContent).not.toContain("Headset mode needs HTTPS");
  });

  it("says headset mode needs HTTPS on an insecure origin, as a line that cannot take focus", () => {
    const { el } = mount({ secure: false });
    const note = must(
      Array.from(el.querySelectorAll<HTMLLIElement>("li")).find((li) =>
        li.textContent?.includes("Headset mode needs HTTPS")
      ),
      "the note"
    );
    expect(note.getAttribute("role")).toBe("presentation");
    expect(note.hasAttribute("tabindex")).toBe(false);
    expect(note.classList.contains("vjs-menu-item")).toBe(false);
    // The toggle and the projections still work: desktop drag needs no HTTPS
    expect(toggle(el)).toBeTruthy();
    expect(radios(el)).toHaveLength(VR_PROJECTIONS.length);
  });
});
