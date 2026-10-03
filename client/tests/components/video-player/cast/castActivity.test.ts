/**
 * Watch progress, resume and plays record while casting.
 *
 * The cast tracker reads the receiver (a fake RemotePlayer here) once a
 * second: it counts the seconds the TV played, never paused or buffering
 * time and never more than the TV's position moved, saves every 10 s with the
 * TV's position, and counts the play once past `minimumPlayPercent`. It sends
 * through the page's viewing, the one the local tracker uses, so a play counts
 * once whichever tracker reaches the threshold. While connected the local
 * tracker is off.
 */
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiPost } from "@/api";
import type * as apiModule from "@/api";
import {
  type Viewing,
  createViewing,
} from "@/components/video-player/activitySenders";
import { CastActivity } from "@/components/video-player/cast/castActivity";
import {
  type CastPlayer,
  CastSessionController,
} from "@/components/video-player/cast/castSession";
import type TrackActivityPlugin from "@/components/video-player/plugins/track-activity";
import "@/components/video-player/plugins/track-activity";
// The production registration of the cast middleware
import "@/components/video-player/videoPlayerUtils";
import {
  type TestPlayer,
  startPlayer,
  stubMediaElement,
} from "./castTestPlayer";
import {
  FakeRemotePlayer,
  FakeSession,
  castMedia,
  fakeFramework,
} from "./fakeCast";

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof apiModule>()),
  apiFetch: vi.fn(() => Promise.resolve({ success: true })),
  apiPost: vi.fn(() => Promise.resolve({ success: true })),
}));

interface SaveBody {
  sceneId: string;
  instanceId: string;
  resumeTime: number;
  playDuration: number;
}

const saves = () =>
  vi
    .mocked(apiPost)
    .mock.calls.filter(([endpoint]) => endpoint.endsWith("save-activity"))
    .map(([, body]) => body as SaveBody);

const playCounts = () =>
  vi
    .mocked(apiPost)
    .mock.calls.filter(([endpoint]) => endpoint.endsWith("play-count"))
    .map(([, body]) => body as { playToken: string });

let trackers: CastActivity[] = [];
let players: TestPlayer[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  trackers.forEach((tracker) => tracker.stop());
  trackers = [];
  vi.useRealTimers();
  players.forEach((player) => player.dispose());
  players = [];
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** A tracker on a TV playing at `currentTime` of a `duration` s scene */
function track({
  duration = 600,
  currentTime = 0,
  minimumPlayPercent = 20,
  viewing = createViewing("12", "inst-a"),
}: {
  duration?: number;
  currentTime?: number;
  minimumPlayPercent?: number;
  viewing?: Viewing;
} = {}) {
  const tv = Object.assign(new FakeRemotePlayer(), {
    duration,
    currentTime,
    isMediaLoaded: true,
    playerState: "PLAYING",
  });
  const tracker = new CastActivity({
    remote: untrusted<cast.framework.RemotePlayer>(tv),
    media: castMedia(),
    viewing,
    minimumPlayPercent,
  });
  tracker.start();
  trackers.push(tracker);
  return { tv, tracker, viewing };
}

/** The TV plays on for `seconds`, its position moving with the clock */
async function play(tv: FakeRemotePlayer, seconds: number) {
  for (let second = 0; second < seconds; second += 1) {
    tv.currentTime += 1;
    await vi.advanceTimersByTimeAsync(1000);
  }
}

/** The local tracker, wired to `viewing` as `useVideoPlayer` wires it */
async function localTracker(viewing: Viewing, minimumPlayPercent: number) {
  stubMediaElement();
  const player = await startPlayer();
  players.push(player);
  vi.spyOn(player, "duration").mockReturnValue(100);
  const local = untrusted<{ trackActivity(): TrackActivityPlugin }>(
    player
  ).trackActivity();
  local.saveActivity = viewing.save;
  local.incrementPlayCount = viewing.countPlay;
  local.minimumPlayPercent = minimumPlayPercent;
  local.setEnabled(true);
  return local;
}

describe("CastActivity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("while PLAYING, a save goes every 10 s with the remote position and the played seconds", async () => {
    const { tv } = track({ currentTime: 100 });

    await play(tv, 25);

    expect(saves()).toEqual([
      {
        sceneId: "12",
        instanceId: "inst-a",
        resumeTime: 110,
        playDuration: 10,
      },
      {
        sceneId: "12",
        instanceId: "inst-a",
        resumeTime: 120,
        playDuration: 10,
      },
    ]);
  });

  it("paused or buffering time is not counted", async () => {
    const { tv, tracker } = track({ currentTime: 100 });

    await play(tv, 4);
    tv.playerState = "PAUSED";
    await vi.advanceTimersByTimeAsync(30_000);
    tv.playerState = "BUFFERING";
    await vi.advanceTimersByTimeAsync(30_000);
    tv.playerState = "PLAYING";
    await play(tv, 6);
    tracker.stop();

    // The pause saves what was played so far, the stop the rest
    expect(saves().map((body) => body.playDuration)).toEqual([4, 6]);
    expect(saves().map((body) => body.resumeTime)).toEqual([104, 110]);
  });

  it("a 5-minute timer gap (throttled tab) counts at most the change in remote position", async () => {
    const { tv } = track({ currentTime: 100 });

    // The tab's timers stop for five minutes; the TV moved two minutes on
    // (it was paused for the rest)
    vi.setSystemTime(Date.now() + 300_000);
    tv.currentTime = 220;
    await vi.advanceTimersByTimeAsync(1000);

    expect(saves()).toEqual([
      {
        sceneId: "12",
        instanceId: "inst-a",
        resumeTime: 220,
        playDuration: 120,
      },
    ]);
  });

  it("a seek forward on the TV is not counted as played", async () => {
    const { tv, tracker } = track({ currentTime: 100 });

    await play(tv, 3);
    tv.currentTime = 400;
    await vi.advanceTimersByTimeAsync(1000);
    tracker.stop();

    expect(saves().map((body) => body.playDuration)).toEqual([4]);
  });

  it("the play count is sent once past minimumPlayPercent, with one playToken across retries", async () => {
    vi.mocked(apiPost).mockImplementation((endpoint) =>
      endpoint.endsWith("play-count") && playCounts().length <= 2
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ success: true })
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { tv, viewing } = track({ duration: 100, minimumPlayPercent: 20 });

    await play(tv, 19);
    expect(playCounts()).toEqual([]);

    await play(tv, 40);

    expect(playCounts()).toEqual([
      { sceneId: "12", instanceId: "inst-a", playToken: viewing.playToken },
      { sceneId: "12", instanceId: "inst-a", playToken: viewing.playToken },
      { sceneId: "12", instanceId: "inst-a", playToken: viewing.playToken },
    ]);
  });

  it("98 % or more saves resume 0", async () => {
    const { tv } = track({ duration: 100, currentTime: 88 });

    await play(tv, 10);

    expect(saves()).toEqual([
      { sceneId: "12", instanceId: "inst-a", resumeTime: 0, playDuration: 10 },
    ]);
  });

  it("pagehide flushes with keepalive", async () => {
    const { tv } = track({ currentTime: 100 });
    await play(tv, 5);

    window.dispatchEvent(new Event("pagehide"));

    expect(saves()).toEqual([]);
    const [endpoint, options] = must(vi.mocked(apiFetch).mock.calls[0]);
    expect(endpoint).toBe("/watch-history/save-activity");
    expect(options?.keepalive).toBe(true);
    const body = options?.body;
    expect(typeof body).toBe("string");
    expect(JSON.parse(typeof body === "string" ? body : "null")).toEqual({
      sceneId: "12",
      instanceId: "inst-a",
      resumeTime: 105,
      playDuration: 5,
    });
  });

  it("the body carries sceneId and instanceId", async () => {
    const { tv } = track({ viewing: createViewing("12", "inst-b") });

    await play(tv, 10);

    expect(saves()).toEqual([
      { sceneId: "12", instanceId: "inst-b", resumeTime: 10, playDuration: 10 },
    ]);
  });

  it("stop ends the tracking: no save after it", async () => {
    const { tv, tracker } = track();
    await play(tv, 2);
    tracker.stop();
    vi.mocked(apiPost).mockClear();

    await play(tv, 30);
    window.dispatchEvent(new Event("pagehide"));

    expect(saves()).toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe("one play per viewing, local and cast", () => {
  it("a play counted locally at 25 % is not counted again by the cast tracker", async () => {
    const viewing = createViewing("12", "inst-a");
    const local = await localTracker(viewing, 25);
    vi.useFakeTimers();
    local.start();
    await vi.advanceTimersByTimeAsync(30_000);
    local.setEnabled(false);
    expect(playCounts()).toHaveLength(1);

    const { tv } = track({ duration: 100, minimumPlayPercent: 25, viewing });
    await play(tv, 40);

    expect(playCounts()).toEqual([
      { sceneId: "12", instanceId: "inst-a", playToken: viewing.playToken },
    ]);
  });

  it("a play counted by the cast tracker is not counted again by the local tracker after the cast ends", async () => {
    const viewing = createViewing("12", "inst-a");
    const local = await localTracker(viewing, 25);
    vi.useFakeTimers();
    local.setEnabled(false);

    const { tv, tracker } = track({
      duration: 100,
      minimumPlayPercent: 25,
      viewing,
    });
    await play(tv, 30);
    tracker.stop();
    expect(playCounts()).toHaveLength(1);

    // The cast ends: the local tracker plays on past the threshold
    local.setEnabled(true);
    local.start();
    await vi.advanceTimersByTimeAsync(40_000);

    expect(playCounts()).toEqual([
      { sceneId: "12", instanceId: "inst-a", playToken: viewing.playToken },
    ]);
  });
});

describe("the session controller", () => {
  /** A controller on a real player whose local tracker is wired to `viewing` */
  async function attachController(viewing: Viewing) {
    const local = await localTracker(viewing, 20);
    const player = must(players.at(-1));
    const fake = fakeFramework();
    const session = new CastSessionController({
      framework: fake.framework,
      media: castMedia(),
      player: untrusted<CastPlayer>(player),
      page: () => ({
        scene: { id: "12", instanceId: "inst-a" },
        resumeTime: null,
        viewing: { current: viewing },
        minimumPlayPercent: 20,
      }),
      fetchLink: () =>
        Promise.resolve({
          expiresAt: "2099-01-01T00:00:00.000Z",
          streams: [],
          cast: {
            url: "/api/scene/12/proxy-stream/stream?sig=abc",
            contentType: "video/mp4",
            kind: "direct",
          },
          captions: [],
          poster: null,
        }),
      notify: vi.fn(),
    });
    session.attach();
    return { fake, local, session };
  }

  /** Lets the start's link fetch and load settle */
  async function settle() {
    for (let step = 0; step < 5; step += 1) await Promise.resolve();
  }

  it("the local tracker is disabled while connected and enabled after", async () => {
    const viewing = createViewing("12", "inst-a");
    const { fake, local, session } = await attachController(viewing);
    const setEnabled = vi.spyOn(local, "setEnabled");
    expect(local.enabled).toBe(true);

    const cast = new FakeSession();
    fake.context.startSession(cast);
    await settle();
    expect(cast.loadMedia).toHaveBeenCalledTimes(1);
    expect(local.enabled).toBe(false);

    fake.context.endSession();
    expect(local.enabled).toBe(true);
    expect(setEnabled.mock.calls).toEqual([[false], [true]]);
    session.detach();
  });

  it("while connected, the TV's progress is saved through the page's viewing until the session ends", async () => {
    const viewing = createViewing("12", "inst-a");
    const { fake, session } = await attachController(viewing);
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });

    // The TV plays the scene from 300 s as the session starts
    const tv = fake.remote();
    Object.assign(tv, {
      isMediaLoaded: true,
      duration: 600,
      currentTime: 300,
      playerState: "PLAYING",
    });
    fake.context.startSession(new FakeSession());
    await settle();
    await play(tv, 10);

    expect(saves()).toEqual([
      {
        sceneId: "12",
        instanceId: "inst-a",
        resumeTime: 310,
        playDuration: 10,
      },
    ]);

    // The SDK clears the RemotePlayer as the session goes: the last save
    // keeps the TV's last position
    await play(tv, 3);
    Object.assign(tv, { isMediaLoaded: false, currentTime: 0, duration: 0 });
    fake.context.endSession();
    expect(saves().at(-1)).toEqual({
      sceneId: "12",
      instanceId: "inst-a",
      resumeTime: 313,
      playDuration: 3,
    });

    vi.mocked(apiPost).mockClear();
    await play(tv, 30);
    expect(saves()).toEqual([]);
    session.detach();
  });
});
