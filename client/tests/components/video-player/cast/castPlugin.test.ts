/**
 * The Cast button sits in the control bar's one order, shows only while a
 * Cast device is in range, and names what it does; the status line over the
 * player says where the scene plays.
 */
import { untrusted } from "@tests/helpers/untrusted";
import videojs from "video.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CastControlsPlayer,
  addCastButton,
  addCastStatus,
} from "@/components/video-player/cast/castPlugin";
import { addOrderedControl } from "@/components/video-player/controlBarOrder";
import type * as controlBarOrderModule from "@/components/video-player/controlBarOrder";

vi.mock("@/components/video-player/controlBarOrder", async (importOriginal) => {
  const actual = await importOriginal<typeof controlBarOrderModule>();
  return { ...actual, addOrderedControl: vi.fn(actual.addOrderedControl) };
});

interface BarControl {
  el(): HTMLElement;
  hasClass(name: string): boolean;
  trigger(event: string): void;
  controlText(): string;
}

/** The player as the tests drive it */
interface TestPlayer {
  controlBar: {
    getChild(name: string): BarControl | undefined;
    children(): BarControl[];
  };
  el(): HTMLElement;
  dispose(): void;
}

const players: TestPlayer[] = [];

function makePlayer() {
  const wrapper = document.createElement("video-js");
  document.body.appendChild(wrapper);
  const player = untrusted<TestPlayer>(videojs(wrapper, { controls: true }));
  players.push(player);
  return player;
}

const asCastPlayer = (player: TestPlayer) =>
  untrusted<CastControlsPlayer>(player);

const castButton = (player: TestPlayer) =>
  player.controlBar.getChild("peekCastButton");

afterEach(() => {
  players.splice(0).forEach((player) => player.dispose());
  document.body.innerHTML = "";
  vi.mocked(addOrderedControl).mockClear();
});

describe("Cast button", () => {
  it("is hidden while NO_DEVICES_AVAILABLE and shown otherwise", () => {
    const player = makePlayer();
    const button = addCastButton(asCastPlayer(player), vi.fn());

    // Nothing is known before the SDK says a device is in range
    expect(castButton(player)?.hasClass("vjs-hidden")).toBe(true);

    button.setCastState("NOT_CONNECTED", null);
    expect(castButton(player)?.hasClass("vjs-hidden")).toBe(false);

    button.setCastState("NO_DEVICES_AVAILABLE", null);
    expect(castButton(player)?.hasClass("vjs-hidden")).toBe(true);

    button.setCastState("CONNECTED", "Living Room TV");
    expect(castButton(player)?.hasClass("vjs-hidden")).toBe(false);
  });

  it("its accessible name is Cast when idle and 'Stop casting (<device>)' when connected", () => {
    const player = makePlayer();
    const button = addCastButton(asCastPlayer(player), vi.fn());

    button.setCastState("NOT_CONNECTED", null);
    expect(castButton(player)?.controlText()).toBe("Cast");
    expect(castButton(player)?.el().textContent).toContain("Cast");

    button.setCastState("CONNECTED", "Living Room TV");
    expect(castButton(player)?.controlText()).toBe(
      "Stop casting (Living Room TV)"
    );
    expect(castButton(player)?.hasClass("vjs-cast-connected")).toBe(true);

    button.setCastState("NOT_CONNECTED", null);
    expect(castButton(player)?.controlText()).toBe("Cast");
    expect(castButton(player)?.hasClass("vjs-cast-connected")).toBe(false);
  });

  it("on a page whose scene the session does not play, it reads 'Cast this scene (<device>)' and still shows connected", () => {
    const player = makePlayer();
    const button = addCastButton(asCastPlayer(player), vi.fn());

    button.setCastState("CONNECTED", "Living Room TV", false);

    expect(castButton(player)?.controlText()).toBe(
      "Cast this scene (Living Room TV)"
    );
    expect(castButton(player)?.hasClass("vjs-cast-connected")).toBe(true);
  });

  it("is added through addOrderedControl as peekCastButton, before the fullscreen toggle", () => {
    const player = makePlayer();
    addCastButton(asCastPlayer(player), vi.fn());

    expect(vi.mocked(addOrderedControl)).toHaveBeenCalledWith(
      player,
      "peekCastButton",
      "PeekCastButton"
    );
    const children = player.controlBar.children();
    const cast = children.findIndex((child) => child === castButton(player));
    const fullscreen = children.findIndex(
      (child) => child === player.controlBar.getChild("fullscreenToggle")
    );
    expect(cast).toBeGreaterThan(-1);
    expect(cast).toBe(fullscreen - 1);
  });

  it("a click calls the handler", () => {
    const player = makePlayer();
    const onClick = vi.fn();
    const button = addCastButton(asCastPlayer(player), onClick);
    button.setCastState("NOT_CONNECTED", null);

    // video.js reads event props a DOM event lacks in happy-dom: trigger its own
    castButton(player)?.trigger("click");

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("a second add keeps one button, and remove takes it out", () => {
    const player = makePlayer();
    addCastButton(asCastPlayer(player), vi.fn());
    const second = addCastButton(asCastPlayer(player), vi.fn());

    expect(player.el().querySelectorAll(".vjs-cast-button")).toHaveLength(1);

    second.remove();
    expect(castButton(player)).toBeFalsy();
    expect(player.el().querySelectorAll(".vjs-cast-button")).toHaveLength(0);
  });
});

describe("Cast status line", () => {
  it("reads 'Casting to <device>' as a status while connected, and nothing otherwise", () => {
    const player = makePlayer();
    const status = addCastStatus(asCastPlayer(player));
    const line = () => player.el().querySelector(".vjs-cast-status");

    expect(line()?.getAttribute("role")).toBe("status");
    expect(line()?.textContent).toBe("");

    status.show("Living Room TV");
    expect(line()?.textContent).toBe("Casting to Living Room TV");
    expect(line()?.classList.contains("vjs-cast-status-active")).toBe(true);

    // Another tab loaded the media: this one mirrors it
    status.show("Living Room TV", false);
    expect(line()?.textContent).toBe("Casting on Living Room TV");

    status.show(null);
    expect(line()?.textContent).toBe("");
    expect(line()?.classList.contains("vjs-cast-status-active")).toBe(false);

    status.remove();
    expect(line()).toBeNull();
  });

  it("a second add keeps one line", () => {
    const player = makePlayer();
    addCastStatus(asCastPlayer(player));
    addCastStatus(asCastPlayer(player));

    expect(player.el().querySelectorAll(".vjs-cast-status")).toHaveLength(1);
  });
});
