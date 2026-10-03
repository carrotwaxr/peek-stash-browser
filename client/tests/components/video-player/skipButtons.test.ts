/**
 * The playlist's Previous and Next buttons in the control bar. Each shows
 * only while the queue gives it a handler, and hides with `vjs-hidden`, so
 * the control bar's container queries (VideoPlayer.css, C12) can count the
 * buttons that show (`:not(.vjs-hidden)`) and make room for them.
 */
import { untrusted } from "@tests/helpers/untrusted";
import videojs from "video.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/components/video-player/plugins/skip-buttons";

interface SkipPlayer {
  skipButtons(): {
    setForwardHandler(handler: (() => void) | undefined): void;
    setBackwardHandler(handler: (() => void) | undefined): void;
  };
  ready(callback: () => void): void;
  el(): HTMLElement;
  hasClass(name: string): boolean;
  dispose(): void;
}

let players: SkipPlayer[] = [];

function makePlayer(): SkipPlayer {
  const video = document.createElement("video");
  document.body.appendChild(video);
  const player = untrusted<SkipPlayer>(videojs(video, { controls: true }));
  players.push(player);
  return player;
}

/** The bar's Next and Previous buttons, once the player is ready */
async function buttonsOf(player: SkipPlayer) {
  await new Promise<void>((resolve) => {
    player.ready(resolve);
  });
  const bar = player.el().querySelector(".vjs-control-bar");
  const button = (icon: string) => {
    const found = bar?.querySelector(`.vjs-skip-button.${icon}`);
    if (!found) throw new Error(`no ${icon} button in the control bar`);
    return found;
  };
  return {
    next: button("vjs-icon-next-item"),
    previous: button("vjs-icon-previous-item"),
  };
}

const hidden = (button: Element) => button.classList.contains("vjs-hidden");

describe("skipButtons", () => {
  afterEach(() => {
    players.forEach((player) => player.dispose());
    players = [];
    document.body.innerHTML = "";
  });

  it("with no queue both buttons are hidden with vjs-hidden", async () => {
    const player = makePlayer();
    player.skipButtons();

    const { next, previous } = await buttonsOf(player);

    expect(hidden(next)).toBe(true);
    expect(hidden(previous)).toBe(true);
  });

  it("a handler shows its button, and taking it away hides it again", async () => {
    const player = makePlayer();
    const skip = player.skipButtons();
    const { next, previous } = await buttonsOf(player);

    skip.setForwardHandler(vi.fn());
    expect(hidden(next)).toBe(false);
    expect(hidden(previous)).toBe(true);
    expect(player.hasClass("vjs-skip-buttons-next")).toBe(true);

    skip.setBackwardHandler(vi.fn());
    expect(hidden(previous)).toBe(false);

    skip.setForwardHandler(undefined);
    skip.setBackwardHandler(undefined);
    expect(hidden(next)).toBe(true);
    expect(hidden(previous)).toBe(true);
    expect(player.hasClass("vjs-skip-buttons-next")).toBe(false);
  });

  it("handlers set before the player is ready show their buttons once it is", async () => {
    const player = makePlayer();
    const skip = player.skipButtons();
    skip.setForwardHandler(vi.fn());
    skip.setBackwardHandler(vi.fn());

    const { next, previous } = await buttonsOf(player);

    expect(hidden(next)).toBe(false);
    expect(hidden(previous)).toBe(false);
  });
});
