/**
 * The markers plugin puts a dot on the timeline for every clip: a dot added
 * before the duration is known is placed when it arrives (a source swap
 * resets it), and a clip with no generated preview gets a hollow dot.
 */
import { untrusted } from "@tests/helpers/untrusted";
import videojs from "video.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@/components/video-player/plugins/markers";
import type MarkersPlugin from "@/components/video-player/plugins/markers";

/** video.js is untyped here: only what the tests call */
interface MarkersPlayer {
  markers(): MarkersPlugin;
  duration(): number;
  trigger(event: string): void;
  el(): Element;
  dispose(): void;
}

function makePlayer() {
  const video = document.createElement("video");
  document.body.appendChild(video);
  const player = untrusted<MarkersPlayer>(videojs(video, { controls: true }));
  const duration = vi.spyOn(player, "duration");
  duration.mockReturnValue(NaN);
  return { player, duration };
}

function dots(player: MarkersPlayer): HTMLElement[] {
  return Array.from(
    player
      .el()
      .querySelectorAll<HTMLElement>(".vjs-progress-holder .vjs-marker")
  );
}

describe("MarkersPlugin", () => {
  let current: MarkersPlayer | null = null;

  beforeEach(() => {
    current = null;
  });

  afterEach(() => {
    current?.dispose();
    document.body.innerHTML = "";
  });

  it("a marker added before the duration is known is placed when durationchange fires", () => {
    const { player, duration } = makePlayer();
    current = player;
    const plugin = player.markers();

    plugin.addDotMarker({ seconds: 30, title: "Early" });
    const [dot] = dots(player);
    expect(dot?.style.left).toBe("");
    expect(dot?.style.visibility).not.toBe("visible");

    duration.mockReturnValue(120);
    player.trigger("durationchange");

    expect(dot?.style.left).toBe("calc(25% - 3px)");
    expect(dot?.style.visibility).toBe("visible");
  });

  it("a new duration moves the dots already placed", () => {
    const { player, duration } = makePlayer();
    current = player;
    const plugin = player.markers();

    duration.mockReturnValue(100);
    plugin.addDotMarker({ seconds: 50, title: "Middle" });
    const [dot] = dots(player);
    expect(dot?.style.left).toBe("calc(50% - 3px)");

    duration.mockReturnValue(200);
    player.trigger("loadedmetadata");

    expect(dot?.style.left).toBe("calc(25% - 3px)");
  });

  it("an unknown or infinite duration places nothing", () => {
    const { player, duration } = makePlayer();
    current = player;
    const plugin = player.markers();

    duration.mockReturnValue(Infinity);
    plugin.addDotMarker({ seconds: 30, title: "Live" });

    const [dot] = dots(player);
    expect(dot?.style.left).toBe("");
  });

  it("ungenerated clips get a dot with the ungenerated class", () => {
    const { player, duration } = makePlayer();
    current = player;
    const plugin = player.markers();
    duration.mockReturnValue(100);

    plugin.addClipMarkers([
      { seconds: 10, title: "Ready", isGenerated: true },
      { seconds: 20, title: "Pending", isGenerated: false },
    ]);

    const [ready, pending] = dots(player);
    expect(dots(player)).toHaveLength(2);
    expect(ready?.classList.contains("vjs-marker-ungenerated")).toBe(false);
    expect(pending?.classList.contains("vjs-marker-ungenerated")).toBe(true);
  });

  // Hard-coded from the crypto-js implementation this replaced: a tag keeps
  // the colour it has always had
  it.each([
    ["Blowjob", 264],
    ["Anal", 185],
    ["日本語", 13],
    ["", 349],
  ])("tag hues are unchanged: %j is %i", (tag, hue) => {
    const { player } = makePlayer();
    current = player;
    expect(player.markers().computeBaseHue(tag)).toBe(hue);
  });
});
