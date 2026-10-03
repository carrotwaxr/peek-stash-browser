/**
 * While a cast is attached, every caller of the local player (the control
 * bar, the hotkeys, the seek and skip buttons, the media session, the clip
 * list) reaches the receiver through one video.js middleware: the getters
 * answer from the RemotePlayer, and seeks, play and pause go to the
 * controller and stop at the middleware. A seek never moves the paused local
 * element, so a piped transcode starts no local ffmpeg.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { remoteView } from "@/components/video-player/cast/castSession";
// The production registration: the cast middleware before durationMiddleware
import "@/components/video-player/videoPlayerUtils";
import {
  type TestPlayer,
  startPlayer,
  stubMediaElement,
} from "./castTestPlayer";
import { castMedia, fakeFramework } from "./fakeCast";

let players: TestPlayer[] = [];
let media: ReturnType<typeof stubMediaElement>;

beforeEach(() => {
  media = stubMediaElement();
});

afterEach(() => {
  players.forEach((player) => player.dispose());
  players = [];
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

/** A player attached to a fake receiver at 120 s of 600, playing */
async function attached(source?: Parameters<typeof startPlayer>[0]) {
  const player = await startPlayer(source);
  players.push(player);
  const fake = fakeFramework();
  const remote = new fake.framework.RemotePlayer();
  const controller = new fake.framework.RemotePlayerController(remote);
  Object.assign(remote, {
    currentTime: 120,
    duration: 600,
    isPaused: false,
    isMediaLoaded: true,
    playerState: "PLAYING",
  });
  const session: { idleReason: string | null } = { idleReason: null };
  Object.assign(player, {
    peekCastConnected: true,
    peekCastRemote: remoteView(remote, controller, () => session, castMedia()),
  });
  return { player, remote, controller: fake.controller(), session };
}

describe("castMiddleware", () => {
  it("while connected, currentTime, duration, paused and ended answer from the RemotePlayer", async () => {
    const { player, remote, session } = await attached();
    // The player caches its duration: the controller has it read again
    player.tech(true).trigger("durationchange");

    expect(player.currentTime()).toBe(120);
    expect(player.duration()).toBe(600);
    expect(player.paused()).toBe(false);
    expect(player.ended()).toBe(false);

    remote.isPaused = true;
    expect(player.paused()).toBe(true);

    remote.playerState = "IDLE";
    session.idleReason = "FINISHED";
    expect(player.ended()).toBe(true);
  });

  it("a hotkey seek while connected reaches the controller and the local element does not seek", async () => {
    const { player, remote, controller } = await attached();

    // What the dispatcher's seek keys do (usePlayerHotkeys, useMediaKeys)
    player.currentTime(player.currentTime() + 10);

    expect(remote.currentTime).toBe(130);
    expect(controller.seek).toHaveBeenCalledTimes(1);
    expect(media.seek).not.toHaveBeenCalled();
  });

  it("a seek on an offset transcode while connected loads no source", async () => {
    const { player, controller } = await attached({
      src: "/api/scene/12/proxy-stream/stream.mp4?instanceId=inst-a&resolution=STANDARD",
      type: "video/mp4",
      offset: true,
      duration: 600,
    });
    const tech = player.tech(true);
    const setSource = vi.spyOn(tech, "setSource");
    vi.useFakeTimers();

    player.currentTime(400);
    // durationMiddleware would reload `?start=400` after 200 ms
    vi.advanceTimersByTime(1000);

    expect(controller.seek).toHaveBeenCalledTimes(1);
    expect(setSource).not.toHaveBeenCalled();
    expect(player.currentSrc()).not.toContain("start=");
    expect(media.seek).not.toHaveBeenCalled();
  });

  it("play and pause while connected call playOrPause and are terminated locally", async () => {
    const { player, remote, controller } = await attached();

    remote.isPaused = true;
    void player.play();
    expect(controller.playOrPause).toHaveBeenCalledTimes(1);
    expect(media.play).not.toHaveBeenCalled();

    remote.isPaused = false;
    player.pause();
    expect(controller.playOrPause).toHaveBeenCalledTimes(2);
    expect(media.pause).not.toHaveBeenCalled();

    // Already as asked: nothing toggles
    void player.play();
    expect(controller.playOrPause).toHaveBeenCalledTimes(2);
    expect(media.play).not.toHaveBeenCalled();
  });

  it("not connected, every call passes through", async () => {
    const { player, controller } = await attached();
    Object.assign(player, { peekCastConnected: false });

    expect(player.currentTime()).toBe(0);
    expect(player.paused()).toBe(true);
    expect(player.ended()).toBe(false);

    player.currentTime(30);
    expect(media.seek).toHaveBeenCalledWith(30);

    void player.play();
    expect(media.play).toHaveBeenCalledTimes(1);
    player.pause();
    expect(media.pause).toHaveBeenCalled();

    expect(controller.seek).not.toHaveBeenCalled();
    expect(controller.playOrPause).not.toHaveBeenCalled();
  });
});
