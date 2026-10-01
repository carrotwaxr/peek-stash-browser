/**
 * The persist-volume plugin remembers the player's volume and mute state in
 * localStorage and restores them on the next player.
 */
import { untrusted } from "@tests/helpers/untrusted";
import videojs from "video.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/components/video-player/plugins/persist-volume";

interface VolumePlayer {
  persistVolume(options?: { enabled?: boolean }): unknown;
  volume(value?: number): number;
  muted(value?: boolean): boolean;
  trigger(event: string): void;
  dispose(): void;
}

function makePlayer(): VolumePlayer {
  const video = document.createElement("video");
  document.body.appendChild(video);
  return untrusted<VolumePlayer>(videojs(video, { controls: true }));
}

describe("persistVolume", () => {
  let players: VolumePlayer[] = [];

  beforeEach(() => {
    localStorage.clear();
    players = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    players.forEach((p) => p.dispose());
    document.body.innerHTML = "";
  });

  const start = () => {
    const player = makePlayer();
    players.push(player);
    player.persistVolume();
    return player;
  };

  it("a volume change is stored and restored on the next player", async () => {
    const first = start();
    first.volume(0.3);
    first.muted(true);
    first.trigger("volumechange");

    const second = start();
    await vi.waitFor(() => {
      expect(second.volume()).toBeCloseTo(0.3);
      expect(second.muted()).toBe(true);
    });
  });

  it("blocked storage does not throw", async () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", { getItem: blocked, setItem: blocked });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const player = start();
    expect(() => {
      player.volume(0.5);
      player.trigger("volumechange");
    }).not.toThrow();
    await vi.waitFor(() => expect(console.warn).toHaveBeenCalled());
  });
});
