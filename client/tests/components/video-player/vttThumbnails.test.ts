/**
 * The seek-thumbnail plugin loads a scene's sprite VTT and shows the cue under
 * the pointer: a fast scene change never shows the previous scene's file, a
 * player keeps one thumbnail holder, and a reset takes back its listeners.
 */
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import videojs from "video.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/components/video-player/vtt-thumbnails";

/** video.js is untyped here: only what the tests call */
interface VttPlugin {
  src(vtt: string, sprite: string): void;
  detach(): void;
  updateThumbnailStyle(percent: number, width: number): void;
}

interface VttPlayer {
  vttThumbnails(options?: Record<string, unknown>): VttPlugin;
  duration(): number;
  el(): Element;
  ready(callback: () => void): void;
  dispose(): void;
}

const SCENE_A = {
  vtt: "/api/proxy/scene/1/vtt/thumbs?instanceId=i1",
  sprite: "/api/proxy/scene/1/sprite?instanceId=i1",
  file: "WEBVTT\n\n00:00:00.000 --> 00:01:40.000\na_sprite.jpg#xywh=0,0,100,50\n",
};
const SCENE_B = {
  vtt: "/api/proxy/scene/2/vtt/thumbs?instanceId=i1",
  sprite: "/api/proxy/scene/2/sprite?instanceId=i1",
  file: "WEBVTT\n\n00:00:00.000 --> 00:01:40.000\nb_sprite.jpg#xywh=200,90,160,90\n",
};

interface PendingRequest {
  url: string;
  signal: AbortSignal | undefined;
  answer(text: string): void;
}

/** VTT requests held until the test answers them, in any order */
function holdVttRequests() {
  const pending: PendingRequest[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, init?: RequestInit) =>
        new Promise((resolve, reject) => {
          const signal = init?.signal ?? undefined;
          signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
          pending.push({
            url,
            signal,
            answer: (text) =>
              resolve({
                ok: true,
                status: 200,
                statusText: "OK",
                text: () => Promise.resolve(text),
              }),
          });
        })
    )
  );
  return {
    pending,
    async answer(url: string, text: string) {
      must(pending.find((request) => request.url === url)).answer(text);
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

const players: VttPlayer[] = [];

async function makePlayer() {
  const video = document.createElement("video");
  document.body.appendChild(video);
  const player = untrusted<VttPlayer>(videojs(video, { controls: true }));
  players.push(player);
  vi.spyOn(player, "duration").mockReturnValue(100);
  const plugin = player.vttThumbnails({ showTimestamp: true });
  await new Promise<void>((resolve) => player.ready(resolve));
  return { player, plugin };
}

function holders(player: VttPlayer): HTMLElement[] {
  return Array.from(
    player.el().querySelectorAll<HTMLElement>(".vjs-vtt-thumbnail-display")
  );
}

function progressControl(player: VttPlayer): HTMLElement {
  return must(
    player.el().querySelector<HTMLElement>(".vjs-progress-control"),
    "progress control"
  );
}

describe("VTTThumbnailsPlugin", () => {
  afterEach(() => {
    for (const player of players.splice(0)) player.dispose();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a VTT answer for the previous scene is ignored", async () => {
    const network = holdVttRequests();
    const { player, plugin } = await makePlayer();

    plugin.src(SCENE_A.vtt, SCENE_A.sprite);
    plugin.src(SCENE_B.vtt, SCENE_B.sprite);
    await network.answer(SCENE_B.vtt, SCENE_B.file);
    await network.answer(SCENE_A.vtt, SCENE_A.file);

    plugin.updateThumbnailStyle(0.1, 1000);
    const holder = must(holders(player)[0], "thumbnail holder");
    expect(holder.style.width).toBe("160px");
    expect(holder.style.height).toBe("90px");
  });

  it("a scene change leaves one thumbnail holder", async () => {
    const network = holdVttRequests();
    const { player, plugin } = await makePlayer();

    plugin.src(SCENE_A.vtt, SCENE_A.sprite);
    plugin.src(SCENE_B.vtt, SCENE_B.sprite);
    await network.answer(SCENE_A.vtt, SCENE_A.file);
    await network.answer(SCENE_B.vtt, SCENE_B.file);

    expect(holders(player)).toHaveLength(1);
  });

  it("reset removes its pointer listeners", async () => {
    const network = holdVttRequests();
    const { player, plugin } = await makePlayer();
    const bar = progressControl(player);
    const added = vi.spyOn(bar, "addEventListener");
    const removed = vi.spyOn(bar, "removeEventListener");

    plugin.src(SCENE_A.vtt, SCENE_A.sprite);
    await network.answer(SCENE_A.vtt, SCENE_A.file);
    bar.dispatchEvent(new Event("pointerover"));
    plugin.detach();

    expect(added.mock.calls.length).toBeGreaterThan(0);
    for (const [type, listener] of added.mock.calls) {
      expect(removed).toHaveBeenCalledWith(type, listener);
    }
    expect(holders(player)).toHaveLength(0);
  });

  it("detach aborts the request in flight and its answer adds nothing", async () => {
    const network = holdVttRequests();
    const { player, plugin } = await makePlayer();

    plugin.src(SCENE_A.vtt, SCENE_A.sprite);
    plugin.detach();
    await network.answer(SCENE_A.vtt, SCENE_A.file);

    expect(must(network.pending[0]).signal?.aborted).toBe(true);
    expect(holders(player)).toHaveLength(0);
  });

  it("disposing the player aborts the request in flight", async () => {
    const network = holdVttRequests();
    const { player, plugin } = await makePlayer();

    plugin.src(SCENE_A.vtt, SCENE_A.sprite);
    player.dispose();
    players.splice(players.indexOf(player), 1);

    expect(must(network.pending[0]).signal?.aborted).toBe(true);
  });
});
