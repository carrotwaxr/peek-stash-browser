/**
 * The AirPlay button shows in Safari when an AirPlay target is in range and
 * opens the system picker. The attribute and the availability listener belong
 * on the tech's <video>, not on the <video-js> wrapper, and TV mode hides it.
 */
import { untrusted } from "@tests/helpers/untrusted";
import videojs from "video.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AirPlayPlayer,
  setupAirPlay,
} from "@/components/video-player/plugins/airplay";

interface BarControl {
  el(): HTMLElement;
  hasClass(name: string): boolean;
  trigger(event: string): void;
  controlText(): string;
}

/** The player as the tests drive it */
interface TestPlayer {
  controlBar: { getChild(name: string): BarControl | undefined };
  tech(options: { IWillNotUseThisInPlugins: boolean }): { el(): HTMLElement };
  ready(callback: () => void): void;
  el(): HTMLElement;
  dispose(): void;
}

/** The plugin takes the part of a video.js player it uses */
const setUp = (player: TestPlayer) =>
  setupAirPlay(untrusted<AirPlayPlayer>(player));

const showPicker = vi.fn();
const proto = HTMLVideoElement.prototype as unknown as Record<string, unknown>;

function makePlayer(): TestPlayer {
  const wrapper = document.createElement("video-js");
  document.body.appendChild(wrapper);
  return untrusted<TestPlayer>(videojs(wrapper, { controls: true }));
}

/** A started player, ready, with the plugin set up */
async function start() {
  const player = makePlayer();
  const stop = setUp(player);
  await new Promise<void>((resolve) => player.ready(resolve));
  const tech = player.tech({ IWillNotUseThisInPlugins: true }).el();
  const button = () => player.controlBar.getChild("peekAirPlayButton");
  return { player, stop, tech, button };
}

function availability(tech: HTMLElement, availability: string) {
  const event = new Event("webkitplaybacktargetavailabilitychanged");
  Object.assign(event, { availability });
  tech.dispatchEvent(event);
}

describe("AirPlay button", () => {
  const players: TestPlayer[] = [];

  beforeEach(() => {
    showPicker.mockReset();
    document.documentElement.classList.remove("tv-mode");
  });

  afterEach(() => {
    players.splice(0).forEach((player) => player.dispose());
    delete proto.webkitShowPlaybackTargetPicker;
    document.documentElement.classList.remove("tv-mode");
    document.body.innerHTML = "";
  });

  const supported = () => {
    proto.webkitShowPlaybackTargetPicker = function picker(this: unknown) {
      showPicker(this);
    };
  };

  it("adds no button where webkitShowPlaybackTargetPicker is missing", async () => {
    const { player, tech, button } = await start();
    players.push(player);

    availability(tech, "available");

    expect(button()).toBeUndefined();
    expect(tech.hasAttribute("x-webkit-airplay")).toBe(false);
  });

  it("shows the button on available and hides it on not-available", async () => {
    supported();
    const { player, tech, button } = await start();
    players.push(player);

    expect(button()?.hasClass("vjs-hidden")).toBe(true);

    availability(tech, "available");
    expect(button()?.hasClass("vjs-hidden")).toBe(false);

    availability(tech, "not-available");
    expect(button()?.hasClass("vjs-hidden")).toBe(true);
  });

  it("puts the attribute and the listener on the tech's video, not the wrapper", async () => {
    supported();
    const { player, tech, button } = await start();
    players.push(player);

    expect(tech.tagName).toBe("VIDEO");
    expect(tech.getAttribute("x-webkit-airplay")).toBe("allow");
    expect(player.el().hasAttribute("x-webkit-airplay")).toBe(false);

    // The wrapper hears nothing: only the tech's element drives the button
    availability(player.el(), "available");
    expect(button()?.hasClass("vjs-hidden")).toBe(true);
    availability(tech, "available");
    expect(button()?.hasClass("vjs-hidden")).toBe(false);
  });

  it("opens the picker on a click", async () => {
    supported();
    const { player, tech, button } = await start();
    players.push(player);
    availability(tech, "available");

    // video.js reads event props a DOM event lacks in happy-dom: trigger its own
    button()?.trigger("click");

    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(showPicker).toHaveBeenCalledWith(tech);
  });

  it("is named AirPlay", async () => {
    supported();
    const { player, button } = await start();
    players.push(player);

    expect(button()?.controlText()).toBe("AirPlay");
    expect(button()?.el().textContent).toContain("AirPlay");
  });

  it("sits before the fullscreen toggle", async () => {
    supported();
    const { player, button } = await start();
    players.push(player);

    const bar = button()?.el().parentElement;
    const order = Array.from(bar?.children ?? []).map((el) => el.className);
    const airplay = order.findIndex((name) => name.includes("airplay"));
    const fullscreen = order.findIndex((name) =>
      name.includes("fullscreen-control")
    );
    expect(airplay).toBeGreaterThan(-1);
    expect(airplay).toBeLessThan(fullscreen);
  });

  it("is hidden in TV mode, even with a target in range", async () => {
    supported();
    document.documentElement.classList.add("tv-mode");
    const { player, tech, button } = await start();
    players.push(player);

    availability(tech, "available");
    expect(button()?.hasClass("vjs-hidden")).toBe(true);

    document.documentElement.classList.remove("tv-mode");
    await vi.waitFor(() => {
      expect(button()?.hasClass("vjs-hidden")).toBe(false);
    });

    document.documentElement.classList.add("tv-mode");
    await vi.waitFor(() => {
      expect(button()?.hasClass("vjs-hidden")).toBe(true);
    });
  });

  it("adds one button when set up twice on the same player", async () => {
    supported();
    const { player, tech } = await start();
    players.push(player);
    setUp(player);
    await new Promise<void>((resolve) => player.ready(resolve));
    availability(tech, "available");

    expect(player.el().querySelectorAll(".vjs-airplay-button")).toHaveLength(1);
  });

  it("stops listening when torn down", async () => {
    supported();
    const { player, stop, tech, button } = await start();
    players.push(player);

    stop();
    availability(tech, "available");

    expect(button()?.hasClass("vjs-hidden")).toBe(true);
  });
});
