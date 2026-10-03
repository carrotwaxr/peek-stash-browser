/**
 * useCast ties the Scene page's player to a Cast session: a session start
 * pauses the local player and loads the scene on the receiver with the
 * user's signed link, the page's controls then drive the receiver, and a
 * session end hands the scene back to the local player where the TV left it.
 * TV mode, or a tab that cannot cast, loads no cast code and never Google's
 * script.
 */
import { StrictMode, createElement } from "react";
import type { ReactNode } from "react";
import type { SceneMediaLinkResponse } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, apiPost } from "@/api";
import type * as apiModule from "@/api";
import { queryKeys } from "@/api/queryKeys";
import {
  type Viewing,
  createViewing,
} from "@/components/video-player/activitySenders";
import { loadCastSdk } from "@/components/video-player/cast/castSdk";
import type * as castSdkModule from "@/components/video-player/cast/castSdk";
import { castSenderId } from "@/components/video-player/cast/castSenderId";
import type * as castSessionModule from "@/components/video-player/cast/castSession";
import { canCast } from "@/components/video-player/cast/castSupport";
import type * as castSupportModule from "@/components/video-player/cast/castSupport";
import {
  type UseCastOptions,
  castChunk,
  useCast,
} from "@/components/video-player/cast/useCast";
// The production registration of the cast middleware
import "@/components/video-player/videoPlayerUtils";
import { TVModeContext } from "@/contexts/TVModeContext";
import { showError } from "@/utils/toast";
import {
  type TestPlayer,
  startPlayer,
  stubMediaElement,
} from "./castTestPlayer";
import {
  CAST_STATE,
  type FakeFramework,
  FakeSession,
  REMOTE_EVENT,
  fakeFramework,
  fakeMedia,
} from "./fakeCast";

vi.mock("@/components/video-player/cast/castSdk", () => ({
  loadCastSdk: vi.fn(),
}));
// Every case but the browser checks' own runs as a tab that can cast
vi.mock("@/components/video-player/cast/castSupport", () => ({
  canCast: vi.fn(),
}));
vi.mock("@/components/video-player/cast/castSenderId", () => ({
  castSenderId: vi.fn(),
}));
vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof apiModule>()),
  apiFetch: vi.fn(),
  apiPost: vi.fn(),
}));
vi.mock("@/utils/toast", () => ({ showError: vi.fn() }));

const CAST_SESSION = "@/components/video-player/cast/castSession";
const SIGNED = "instanceId=inst-a&uid=7&exp=99&scope=media&sig=abc";
const NOW = Date.parse("2026-10-03T10:00:00.000Z");

function mediaLink(
  expiresAt = "2026-10-03T22:00:00.000Z"
): SceneMediaLinkResponse {
  return {
    expiresAt,
    streams: [],
    cast: {
      url: `/api/scene/12/proxy-stream/stream?${SIGNED}`,
      contentType: "video/mp4",
      kind: "direct",
    },
    captions: [],
    poster: `/api/scene/12/poster?${SIGNED}`,
  };
}

const SCENE = {
  id: "12",
  instanceId: "inst-a",
  title: "Harbour Lights",
  performers: [{ name: "Ada" }],
};

/** The next entry in the queue */
const NEXT = { id: "13", instanceId: "inst-a", title: "Low Tide" };

let fake: FakeFramework;
let media: ReturnType<typeof stubMediaElement>;
let players: TestPlayer[] = [];
let queryClient: QueryClient;

beforeEach(() => {
  fake = fakeFramework();
  media = stubMediaElement();
  vi.stubGlobal("chrome", { cast: { media: fakeMedia } });
  vi.mocked(canCast).mockReturnValue(true);
  vi.mocked(loadCastSdk).mockResolvedValue(fake.framework);
  vi.mocked(apiPost).mockResolvedValue(mediaLink());
  vi.mocked(apiFetch).mockResolvedValue({ success: true });
  vi.mocked(showError).mockClear();
  vi.mocked(loadCastSdk).mockClear();
  vi.mocked(apiPost).mockClear();
  vi.mocked(apiFetch).mockClear();
  vi.mocked(castSenderId).mockReturnValue("tab-a");
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
  vi.useRealTimers();
  players.forEach((player) => player.dispose());
  players = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

interface RenderOptions {
  tvMode?: boolean;
  /** Wait for the controller's listeners (default: unless in TV mode) */
  waitForAttach?: boolean;
  strict?: boolean;
  resumeTime?: number | null;
  scene?: typeof SCENE;
  /** The page's viewing of the scene (none by default) */
  viewing?: Viewing | null;
  /** The page has no player yet (the ref is empty) */
  noPlayer?: boolean;
  /** The tab's autoplay-next setting (on by default) and repeat mode */
  autoplayNext?: boolean;
  repeat?: string;
}

/** Real time passes (the cast code's timers and awaits run) until `check` */
async function eventually(check: () => boolean, what: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** Lets a link fetch and a load settle (real time; the clock may be fake) */
const settle = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 30)));

async function renderCast(options: RenderOptions = {}) {
  const player = await startPlayer();
  players.push(player);
  const before = fake.controllers.length;
  const { tvMode = false, strict = false, waitForAttach = !tvMode } = options;
  const wrapper = ({ children }: { children: ReactNode }) => {
    const inner = createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        TVModeContext.Provider,
        { value: { isTVMode: tvMode, toggleTVMode: () => {} } },
        children
      )
    );
    return strict ? createElement(StrictMode, null, inner) : inner;
  };
  const scene = options.scene ?? SCENE;
  // One ref for the page's life, as useVideoPlayer keeps it; by default no
  // viewing (the cast tracker's own tests are in castActivity.test.ts)
  const viewing = { current: options.viewing ?? null };
  const dispatch = vi.fn<(action: unknown) => void>();
  const props: UseCastOptions = {
    playerRef: { current: options.noPlayer ? null : player },
    scene,
    sceneKey: `${scene.id}:${scene.instanceId}`,
    dispatch,
    autoplayNext: options.autoplayNext ?? true,
    repeat: options.repeat ?? "none",
    restartCount: 0,
    playlist: null,
    resumeTime: options.resumeTime ?? null,
    minimumPlayPercent: 20,
    viewing,
  };
  const rendered = renderHook((current: UseCastOptions) => useCast(current), {
    wrapper,
    initialProps: props,
  });
  // The SDK and the cast chunk resolve after the effect runs
  await act(() => Promise.resolve());
  if (waitForAttach) {
    await eventually(
      () =>
        fake.controllers.length > before &&
        must(fake.controllers.at(-1)).count(REMOTE_EVENT.CURRENT_TIME_CHANGED) >
          0,
      "the cast controller"
    );
  }

  let current = props;
  /**
   * The page changes scene (a queue step) or restarts it; `next.viewing` is
   * the new scene's viewing, set as useVideoPlayer's tracker effect sets it
   */
  const step = (next: {
    scene?: typeof NEXT;
    restartCount?: number;
    viewing?: Viewing;
  }) => {
    const nextScene = next.scene ?? current.scene ?? SCENE;
    if (next.viewing) viewing.current = next.viewing;
    current = {
      ...current,
      scene: nextScene,
      sceneKey: `${nextScene.id}:${nextScene.instanceId}`,
      restartCount: next.restartCount ?? current.restartCount,
    };
    rendered.rerender(current);
  };
  return { player, rendered, step, viewing, dispatch };
}

const castButton = (player: TestPlayer) =>
  player.controlBar.getChild("peekCastButton");

/** A session starts on the TV and the scene loads there */
async function startCasting(player: TestPlayer) {
  const session = new FakeSession();
  fake.context.startSession(session);
  await waitFor(() => expect(session.loadMedia).toHaveBeenCalled());
  const remote = fake.remote();
  Object.assign(remote, {
    isMediaLoaded: true,
    duration: 600,
    playerState: "PLAYING",
  });
  return { session, remote, controller: fake.controller(), player };
}

interface SentLoadRequest {
  currentTime: number;
  autoplay: boolean;
  activeTrackIds: number[];
  media: { contentId: string; customData: unknown };
}

const loadRequestOf = (session: FakeSession, index = 0) =>
  untrusted<SentLoadRequest>(
    must(session.loadMedia.mock.calls[index], `loadMedia call ${index}`)[0]
  );

/** From here the cast tracker's interval and clock are fake */
function fakeClock() {
  vi.mocked(Date.now).mockRestore();
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "Date"],
    now: NOW,
  });
}

/** The receiver plays its media from `currentTime` (every tab's view of it) */
function tvPlays(currentTime: number) {
  for (const remote of fake.remotes) {
    Object.assign(remote, {
      isMediaLoaded: true,
      isPaused: false,
      duration: 600,
      currentTime,
      playerState: "PLAYING",
    });
  }
}

/** The TV plays on for `seconds`, its position moving with the clock */
async function playTv(seconds: number) {
  for (let second = 0; second < seconds; second += 1) {
    for (const remote of fake.remotes) remote.currentTime += 1;
    await vi.advanceTimersByTimeAsync(1000);
  }
}

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

/** A live session whose receiver plays `scene`, loaded by the tab `sender` */
function liveSession(scene: string, sender: string) {
  const session = new FakeSession();
  session.mediaSession = { media: { customData: { scene, sender } } };
  fake.context.session = session;
  fake.context.castState = CAST_STATE.CONNECTED;
  return session;
}

const statusLine = (player: TestPlayer) =>
  player.el().querySelector(".vjs-cast-status")?.textContent;

/**
 * A caption track on the local player, as setupSubtitles adds it but with no
 * source: video.js would fetch it once shown (castSession.test.ts matches a
 * track's format by its source)
 */
function addCaption(player: TestPlayer, lang: string, type: string) {
  const added = untrusted<{
    addRemoteTextTrack(
      options: object,
      manualCleanup: boolean
    ): { track: { mode: string } };
  }>(player).addRemoteTextTrack(
    {
      kind: "captions",
      srclang: lang,
      label: `${lang} (${type})`,
    },
    false
  );
  return added.track;
}

/** The media link with English WebVTT captions */
function linkWithCaptions(): SceneMediaLinkResponse {
  return {
    ...mediaLink(),
    captions: [
      {
        url: `/api/scene/12/caption?lang=en&type=vtt&${SIGNED}`,
        lang: "en",
        type: "vtt",
      },
    ],
  };
}

/** The last track change the page sent to the receiver */
function lastTrackEdit(session: FakeSession) {
  const edit = vi.mocked(
    must(session.mediaSession?.editTracksInfo, "editTracksInfo")
  );
  return must(edit.mock.lastCall, "an editTracksInfo call")[0];
}

describe("useCast", () => {
  it("session start pauses the local player and loads the media at its start time", async () => {
    const { player } = await renderCast({ resumeTime: 300 });
    const pause = vi.spyOn(player, "pause");

    const { session } = await startCasting(player);

    expect(pause).toHaveBeenCalled();
    expect(vi.mocked(apiPost)).toHaveBeenCalledWith("/scene/12/media-link", {
      instanceId: "inst-a",
    });
    const request = loadRequestOf(session);
    // Not played here: the user's resume point
    expect(request.currentTime).toBe(300);
    expect(request.media.contentId).toBe(
      `${window.location.origin}/api/scene/12/proxy-stream/stream?${SIGNED}`
    );
    // The link is C2's query, so a later start within the hour reuses it
    expect(
      queryClient.getQueryData(queryKeys.scenes.mediaLink("inst-a", "12"))
    ).toEqual(mediaLink());
  });

  it("play, pause and seek on the page go to the controller while connected", async () => {
    const { player } = await renderCast();
    const { remote, controller } = await startCasting(player);

    remote.isPaused = true;
    void player.play();
    expect(controller.playOrPause).toHaveBeenCalledTimes(1);

    remote.isPaused = false;
    player.pause();
    expect(controller.playOrPause).toHaveBeenCalledTimes(2);

    player.currentTime(200);
    expect(remote.currentTime).toBe(200);
    expect(controller.seek).toHaveBeenCalledTimes(1);

    expect(media.play).not.toHaveBeenCalled();
    expect(media.seek).not.toHaveBeenCalled();
  });

  it("player.paused() follows the remote", async () => {
    const { player } = await renderCast();
    const { remote } = await startCasting(player);

    remote.isPaused = false;
    expect(player.paused()).toBe(false);
    remote.isPaused = true;
    expect(player.paused()).toBe(true);
  });

  it("on CURRENT_TIME_CHANGED and IS_PAUSED_CHANGED the player fires timeupdate, play and pause, so the control bar follows", async () => {
    const { player } = await renderCast();
    const { remote, controller } = await startCasting(player);
    const fired: string[] = [];
    for (const event of ["timeupdate", "play", "pause"]) {
      player.on(event, () => fired.push(event));
    }

    remote.currentTime = 50;
    controller.emit(REMOTE_EVENT.CURRENT_TIME_CHANGED);
    remote.isPaused = false;
    controller.emit(REMOTE_EVENT.IS_PAUSED_CHANGED);
    remote.isPaused = true;
    controller.emit(REMOTE_EVENT.IS_PAUSED_CHANGED);

    expect(fired).toEqual(["timeupdate", "play", "pause"]);
    expect(player.currentTime()).toBe(50);
  });

  it("session end seeks the local player to the last remote time, paused", async () => {
    const { player } = await renderCast();
    const { remote, controller } = await startCasting(player);
    remote.currentTime = 250;
    controller.emit(REMOTE_EVENT.CURRENT_TIME_CHANGED);
    const paused: string[] = [];
    player.on("pause", () => paused.push("pause"));

    // The SDK clears the RemotePlayer as the session goes
    remote.currentTime = 0;
    fake.context.endSession();

    expect(player.peekCastConnected).toBe(false);
    expect(media.seek).toHaveBeenCalledWith(250);
    expect(player.paused()).toBe(true);
    expect(media.play).not.toHaveBeenCalled();
    expect(paused).toEqual(["pause"]);
  });

  it("a failed load shows a toast and keeps the local player", async () => {
    const { player } = await renderCast();
    const session = new FakeSession();
    session.loadMedia.mockRejectedValue("LOAD_FAILED");

    fake.context.startSession(session);

    await waitFor(() =>
      expect(vi.mocked(showError)).toHaveBeenCalledWith(
        "Couldn't play this scene on Living Room TV"
      )
    );
    expect(player.peekCastConnected).toBe(false);
    void player.play();
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it("a scene with no source a Cast device plays shows a toast and keeps the local player", async () => {
    vi.mocked(apiPost).mockResolvedValue({ ...mediaLink(), cast: null });
    const { player } = await renderCast();
    const session = new FakeSession();

    fake.context.startSession(session);

    await waitFor(() =>
      expect(vi.mocked(showError)).toHaveBeenCalledWith(
        "This scene has no format a Cast device can play"
      )
    );
    expect(session.loadMedia).not.toHaveBeenCalled();
    expect(player.peekCastConnected).toBe(false);
  });

  it("a load or media error after the link's expiresAt shows 'Cast link expired, start casting again'", async () => {
    const { player } = await renderCast();

    // A load refused once the link has run out
    const expired = mediaLink(new Date(NOW - 1000).toISOString());
    queryClient.setQueryData(
      queryKeys.scenes.mediaLink("inst-a", "12"),
      expired
    );
    vi.mocked(apiPost).mockResolvedValue(expired);
    const first = new FakeSession();
    first.loadMedia.mockRejectedValue("LOAD_FAILED");
    fake.context.startSession(first);
    await waitFor(() =>
      expect(vi.mocked(showError)).toHaveBeenCalledWith(
        "Cast link expired, start casting again"
      )
    );
    fake.context.endSession();

    // A receiver error mid-scene, 12 hours on
    vi.mocked(showError).mockClear();
    vi.mocked(apiPost).mockResolvedValue(mediaLink());
    queryClient.clear();
    const { session, remote, controller } = await startCasting(player);
    session.mediaSession = { idleReason: "ERROR" };
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-10-03T22:00:01.000Z"));
    remote.playerState = "IDLE";
    controller.emit(REMOTE_EVENT.PLAYER_STATE_CHANGED);

    expect(vi.mocked(showError)).toHaveBeenCalledWith(
      "Cast link expired, start casting again"
    );
  });

  it("a receiver error before expiresAt says playback failed", async () => {
    const { player } = await renderCast();
    const { session, remote, controller } = await startCasting(player);
    session.mediaSession = { idleReason: "ERROR" };

    remote.playerState = "IDLE";
    controller.emit(REMOTE_EVENT.PLAYER_STATE_CHANGED);

    expect(vi.mocked(showError)).toHaveBeenCalledWith(
      "Couldn't play this scene on Living Room TV"
    );
  });

  it("a resumed session whose customData.scene is another scene does not attach", async () => {
    const { player } = await renderCast();
    const session = new FakeSession();
    session.mediaSession = { media: { customData: { scene: "99:inst-a" } } };

    fake.context.resumeSession(session);
    await act(() => Promise.resolve());

    expect(player.peekCastConnected).not.toBe(true);
    expect(session.loadMedia).not.toHaveBeenCalled();
  });

  it("a resumed session playing this scene attaches without loading it again", async () => {
    const { player } = await renderCast();
    const session = new FakeSession();
    session.mediaSession = { media: { customData: { scene: "12:inst-a" } } };

    fake.context.resumeSession(session);

    expect(player.peekCastConnected).toBe(true);
    expect(session.loadMedia).not.toHaveBeenCalled();
  });

  it("a page opened while this scene already casts attaches to the session", async () => {
    const session = new FakeSession();
    session.mediaSession = { media: { customData: { scene: "12:inst-a" } } };
    fake.context.session = session;
    fake.context.castState = CAST_STATE.CONNECTED;

    const { player } = await renderCast();

    expect(player.peekCastConnected).toBe(true);
    expect(player.peekCastState).toBe(CAST_STATE.CONNECTED);
    expect(session.loadMedia).not.toHaveBeenCalled();
  });

  it("while connected, player.peekCastConnected is true and player.peekCastState holds the state, and peek:caststate fires on each change", async () => {
    const { player } = await renderCast();
    let changes = 0;
    player.on("peek:caststate", () => {
      changes += 1;
    });

    fake.context.setCastState(CAST_STATE.NOT_CONNECTED);
    expect(changes).toBe(1);
    expect(player.peekCastState).toBe(CAST_STATE.NOT_CONNECTED);
    expect(player.peekCastConnected).not.toBe(true);

    await startCasting(player);
    expect(player.peekCastConnected).toBe(true);
    expect(player.peekCastState).toBe(CAST_STATE.CONNECTED);
    const whileConnected = changes;
    expect(whileConnected).toBeGreaterThanOrEqual(3);

    fake.context.endSession();
    expect(player.peekCastConnected).toBe(false);
    expect(player.peekCastState).toBe(CAST_STATE.NOT_CONNECTED);
    expect(changes).toBeGreaterThan(whileConnected);
  });

  it("shows 'Casting to <device>' over the player while connected", async () => {
    const { player } = await renderCast();
    const line = () => player.el().querySelector(".vjs-cast-status");

    await startCasting(player);
    expect(line()?.textContent).toBe("Casting to Living Room TV");

    fake.context.endSession();
    expect(line()?.textContent).toBe("");
  });

  it("the Cast button opens Chrome's Cast dialog", async () => {
    const { player } = await renderCast();
    fake.context.setCastState(CAST_STATE.NOT_CONNECTED);

    untrusted<{ trigger(event: string): void }>(castButton(player)).trigger(
      "click"
    );

    expect(fake.context.requestSession).toHaveBeenCalledTimes(1);
  });

  it("in TV mode no cast module loads and no button shows", async () => {
    const loadSdk = vi.spyOn(castChunk, "loadSdk");
    const load = vi.spyOn(castChunk, "load");
    const { player } = await renderCast({ tvMode: true });

    expect(loadSdk).not.toHaveBeenCalled();
    expect(vi.mocked(loadCastSdk)).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(castButton(player)).toBeUndefined();
  });

  it("in a non-Chromium browser no cast module loads", async () => {
    // The real browser check, in a secure Firefox tab
    const actual = await vi.importActual<typeof castSupportModule>(
      "@/components/video-player/cast/castSupport"
    );
    vi.mocked(canCast).mockImplementation(actual.canCast);
    vi.stubGlobal("isSecureContext", true);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0"
    );
    const loadSdk = vi.spyOn(castChunk, "loadSdk");
    const load = vi.spyOn(castChunk, "load");
    const { player } = await renderCast({ waitForAttach: false });

    expect(vi.mocked(canCast)).toHaveBeenCalled();
    expect(loadSdk).not.toHaveBeenCalled();
    expect(vi.mocked(loadCastSdk)).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(castButton(player)).toBeUndefined();
  });

  it("the cast chunk is requested only after __onGCastApiAvailable(true)", async () => {
    // The real loader, in a secure Chromium tab whose script never runs
    const actual = await vi.importActual<typeof castSdkModule>(
      "@/components/video-player/cast/castSdk"
    );
    vi.mocked(loadCastSdk).mockImplementation(actual.loadCastSdk);
    vi.stubGlobal("isSecureContext", true);
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    );
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => node);
    const loadSdk = vi.spyOn(castChunk, "loadSdk");
    const load = vi.spyOn(castChunk, "load");
    const { player } = await renderCast({ waitForAttach: false });

    expect(loadSdk).toHaveBeenCalledTimes(1);
    expect(vi.mocked(loadCastSdk)).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();

    vi.stubGlobal("cast", { framework: fake.framework });
    vi.stubGlobal("chrome", {
      cast: {
        media: fakeMedia,
        AutoJoinPolicy: { ORIGIN_SCOPED: "origin_scoped" },
      },
    });
    must(window.__onGCastApiAvailable, "the SDK callback")(true);

    await waitFor(() => expect(castButton(player)).toBeTruthy());
    expect(load).toHaveBeenCalledTimes(1);
  });

  describe("when the cast code is not ready", () => {
    /** A promise the test settles when the page has moved on */
    function deferred<T>() {
      let resolve: (value: T) => void = () => {};
      let reject: (error: unknown) => void = () => {};
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    }

    it("a page with no player yet loads no cast code", async () => {
      const loadSdk = vi.spyOn(castChunk, "loadSdk");
      const load = vi.spyOn(castChunk, "load");
      await renderCast({ noPlayer: true, waitForAttach: false });
      await settle();

      expect(loadSdk).not.toHaveBeenCalled();
      expect(vi.mocked(loadCastSdk)).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
    });

    it("a page left while the SDK module loads goes no further", async () => {
      const sdkModule = deferred<typeof castSdkModule>();
      vi.spyOn(castChunk, "loadSdk").mockReturnValue(sdkModule.promise);
      const load = vi.spyOn(castChunk, "load");
      const { rendered } = await renderCast({ waitForAttach: false });

      rendered.unmount();
      sdkModule.resolve({ loadCastSdk: vi.mocked(loadCastSdk) });
      await settle();

      expect(vi.mocked(loadCastSdk)).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
    });

    it("a page left while Google's script loads never loads the cast session", async () => {
      const framework = deferred<FakeFramework["framework"] | null>();
      vi.mocked(loadCastSdk).mockReturnValue(framework.promise);
      const load = vi.spyOn(castChunk, "load");
      const { rendered } = await renderCast({ waitForAttach: false });
      await settle();
      expect(vi.mocked(loadCastSdk)).toHaveBeenCalledTimes(1);

      rendered.unmount();
      framework.resolve(fake.framework);
      await settle();

      expect(load).not.toHaveBeenCalled();
      expect(fake.controllers).toHaveLength(0);
    });

    it("a browser whose Cast SDK never becomes available shows no button and no error", async () => {
      vi.mocked(loadCastSdk).mockResolvedValue(null);
      const load = vi.spyOn(castChunk, "load");
      const { player } = await renderCast({ waitForAttach: false });
      await settle();

      expect(vi.mocked(loadCastSdk)).toHaveBeenCalledTimes(1);
      expect(load).not.toHaveBeenCalled();
      expect(castButton(player)).toBeUndefined();
      expect(vi.mocked(showError)).not.toHaveBeenCalled();
    });

    it("a page left while the cast session code loads starts no session", async () => {
      const session = deferred<typeof castSessionModule>();
      vi.spyOn(castChunk, "load").mockReturnValue(session.promise);
      const { player, rendered } = await renderCast({ waitForAttach: false });
      await settle();

      rendered.unmount();
      session.resolve(
        await vi.importActual<typeof castSessionModule>(CAST_SESSION)
      );
      await settle();

      expect(fake.controllers).toHaveLength(0);
      expect(castButton(player)).toBeFalsy();
    });

    it("a player disposed while the cast session code loads starts no session", async () => {
      const session = deferred<typeof castSessionModule>();
      vi.spyOn(castChunk, "load").mockReturnValue(session.promise);
      const { player } = await renderCast({ waitForAttach: false });
      await settle();

      player.dispose();
      players = players.filter((open) => open !== player);
      session.resolve(
        await vi.importActual<typeof castSessionModule>(CAST_SESSION)
      );
      await settle();

      expect(fake.controllers).toHaveLength(0);
    });

    it("a cast chunk that fails to load is logged, and the page shows no button", async () => {
      const failure = new Error("chunk failed");
      vi.spyOn(castChunk, "load").mockRejectedValue(failure);
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const { player } = await renderCast({ waitForAttach: false });
      await settle();

      expect(logged).toHaveBeenCalledWith(
        "[Cast] could not load the cast code",
        failure
      );
      expect(castButton(player)).toBeUndefined();
      expect(vi.mocked(showError)).not.toHaveBeenCalled();
    });
  });

  it("unmount removes every listener, the button and the status line", async () => {
    const { player, rendered } = await renderCast();
    const controller = fake.controller();

    rendered.unmount();

    expect(fake.context.count("caststatechanged")).toBe(0);
    expect(fake.context.count("sessionstatechanged")).toBe(0);
    for (const event of Object.values(REMOTE_EVENT)) {
      expect(controller.count(event)).toBe(0);
    }
    expect(castButton(player)).toBeFalsy();
    expect(player.el().querySelector(".vjs-cast-status")).toBeNull();
  });

  describe("the cast follows the page", () => {
    it("Next on the page while connected loads the next scene on the receiver", async () => {
      const { player, step } = await renderCast();
      const { session } = await startCasting(player);

      step({ scene: NEXT });

      await waitFor(() => expect(session.loadMedia).toHaveBeenCalledTimes(2));
      expect(vi.mocked(apiPost)).toHaveBeenCalledWith("/scene/13/media-link", {
        instanceId: "inst-a",
      });
      const request = loadRequestOf(session, 1);
      expect(request.media.customData).toEqual({
        scene: "13:inst-a",
        sender: "tab-a",
      });
      expect(request.currentTime).toBe(0);
      // The TV was playing: it plays the next scene
      expect(request.autoplay).toBe(true);
      expect(player.peekCastConnected).toBe(true);
      expect(media.play).not.toHaveBeenCalled();
    });

    it("a restartCount bump while connected reloads the same scene at 0", async () => {
      const { player, step } = await renderCast({ resumeTime: 300 });
      const { session, remote } = await startCasting(player);
      remote.isPaused = true;

      step({ restartCount: 1 });

      await waitFor(() => expect(session.loadMedia).toHaveBeenCalledTimes(2));
      const request = loadRequestOf(session, 1);
      expect(request.media.customData).toEqual({
        scene: "12:inst-a",
        sender: "tab-a",
      });
      expect(request.currentTime).toBe(0);
      // A paused TV stays paused
      expect(request.autoplay).toBe(false);
    });

    it("after a step, save-activity names the receiver's scene, never the page's previous one", async () => {
      const { step } = await renderCast({
        viewing: createViewing("12", "inst-a"),
      });
      fakeClock();
      tvPlays(0);
      const session = new FakeSession();
      fake.context.startSession(session);
      await settle();
      await playTv(12);
      expect(saves().map((save) => save.sceneId)).toEqual(["12"]);

      // Next: the page shows scene 13 with its own viewing; the TV loads it
      step({ scene: NEXT, viewing: createViewing("13", "inst-a") });
      await settle();
      expect(session.loadMedia).toHaveBeenCalledTimes(2);
      // What the TV played of scene 12 since the last save
      expect(saves().at(-1)).toEqual({
        sceneId: "12",
        instanceId: "inst-a",
        resumeTime: 12,
        playDuration: 2,
      });

      vi.mocked(apiPost).mockClear();
      for (const remote of fake.remotes) remote.currentTime = 0;
      await playTv(11);
      expect(saves()).toEqual([
        {
          sceneId: "13",
          instanceId: "inst-a",
          resumeTime: 11,
          playDuration: 10,
        },
      ]);
    });

    it("on another scene's page, Cast loads this scene into the live session", async () => {
      const session = liveSession("99:inst-a", "tab-z");
      const { player } = await renderCast();
      expect(player.peekCastConnected).not.toBe(true);
      const button = must(castButton(player), "the Cast button");
      expect(button.hasClass("vjs-cast-connected")).toBe(true);

      untrusted<{ trigger(event: string): void }>(button).trigger("click");

      await waitFor(() => expect(session.loadMedia).toHaveBeenCalledTimes(1));
      expect(fake.context.requestSession).not.toHaveBeenCalled();
      expect(loadRequestOf(session).media.customData).toEqual({
        scene: "12:inst-a",
        sender: "tab-a",
      });
      expect(player.peekCastConnected).toBe(true);
    });

    it("on another scene's page, play loads this scene into the live session and the local player stays paused", async () => {
      const session = liveSession("99:inst-a", "tab-z");
      const { player } = await renderCast({ resumeTime: 300 });

      void player.play();

      await waitFor(() => expect(session.loadMedia).toHaveBeenCalledTimes(1));
      const request = loadRequestOf(session);
      expect(request.media.customData).toEqual({
        scene: "12:inst-a",
        sender: "tab-a",
      });
      expect(request.currentTime).toBe(300);
      expect(media.play).not.toHaveBeenCalled();
      expect(player.peekCastConnected).toBe(true);
    });

    it("unmount while connected flushes one keepalive save and leaves the session", async () => {
      const { rendered } = await renderCast({
        viewing: createViewing("12", "inst-a"),
      });
      const controller = fake.controller();
      fakeClock();
      tvPlays(0);
      const session = new FakeSession();
      fake.context.startSession(session);
      await settle();
      await playTv(5);
      expect(saves()).toEqual([]);

      rendered.unmount();

      expect(vi.mocked(apiFetch).mock.calls).toEqual([
        [
          "/watch-history/save-activity",
          {
            method: "POST",
            body: JSON.stringify({
              sceneId: "12",
              instanceId: "inst-a",
              resumeTime: 5,
              playDuration: 5,
            }),
            keepalive: true,
          },
        ],
      ]);
      // The page let go; the TV plays on
      expect(fake.context.count("sessionstatechanged")).toBe(0);
      expect(controller.playOrPause).not.toHaveBeenCalled();
      expect(fake.context.getCurrentSession()).toBe(session);

      await playTv(30);
      expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);
      expect(saves()).toEqual([]);
    });

    it("a second tab attached to the same media sends no save-activity and shows 'Casting on <device>'", async () => {
      vi.mocked(castSenderId).mockReturnValue("tab-b");
      const session = liveSession("12:inst-a", "tab-a");
      const { player } = await renderCast({
        viewing: createViewing("12", "inst-a"),
      });

      expect(player.peekCastConnected).toBe(true);
      expect(statusLine(player)).toBe("Casting on Living Room TV");
      fakeClock();
      tvPlays(100);
      await playTv(30);

      expect(saves()).toEqual([]);
      expect(vi.mocked(apiFetch)).not.toHaveBeenCalled();
      expect(session.loadMedia).not.toHaveBeenCalled();
    });

    it("a load from the second tab moves tracking to it and the first tab's tracker flushes and stops", async () => {
      const first = createViewing("12", "inst-a");
      const second = createViewing("12", "inst-a");
      const firstSaves = vi.spyOn(first, "save");
      const secondSaves = vi.spyOn(second, "save");

      // The first tab casts and records
      const tabA = await renderCast({ viewing: first });
      fakeClock();
      tvPlays(0);
      const session = new FakeSession();
      fake.context.startSession(session);
      await settle();
      await playTv(12);
      expect(firstSaves).toHaveBeenCalledTimes(1);
      expect(statusLine(tabA.player)).toBe("Casting to Living Room TV");

      // The second tab joins the same media: it mirrors, it does not record
      vi.mocked(castSenderId).mockReturnValue("tab-b");
      const tabB = await renderCast({ viewing: second });
      // Its RemotePlayer has the receiver's state too
      tvPlays(12);
      expect(tabB.player.peekCastConnected).toBe(true);
      expect(statusLine(tabB.player)).toBe("Casting on Living Room TV");

      // The second tab restarts the scene: its load names it
      tabB.step({ restartCount: 1 });
      await settle();
      expect(session.loadMedia).toHaveBeenCalledTimes(2);
      expect(loadRequestOf(session, 1).media.customData).toEqual({
        scene: "12:inst-a",
        sender: "tab-b",
      });
      // Every tab's RemotePlayer sees the new media
      for (const controller of fake.controllers) {
        controller.emit(REMOTE_EVENT.MEDIA_INFO_CHANGED);
      }

      // The first tab saved what it had and stopped
      expect(firstSaves).toHaveBeenCalledTimes(2);
      expect(firstSaves.mock.lastCall).toEqual([12, 2, undefined]);
      expect(statusLine(tabA.player)).toBe("Casting on Living Room TV");
      expect(statusLine(tabB.player)).toBe("Casting to Living Room TV");

      for (const remote of fake.remotes) remote.currentTime = 0;
      await playTv(11);
      expect(firstSaves).toHaveBeenCalledTimes(2);
      expect(secondSaves).toHaveBeenCalledTimes(1);
      expect(secondSaves.mock.lastCall).toEqual([11, 10, undefined]);
    });

    it("turning captions off on the page sends activeTrackIds: []", async () => {
      vi.mocked(apiPost).mockResolvedValue(linkWithCaptions());
      const { player } = await renderCast();
      const track = addCaption(player, "en", "vtt");
      track.mode = "showing";

      const { session } = await startCasting(player);
      expect(loadRequestOf(session).activeTrackIds).toEqual([1]);

      track.mode = "disabled";
      // video.js reports a track list change on a timer
      await settle();

      expect(lastTrackEdit(session).activeTrackIds).toEqual([]);
    });

    it("turning a caption on sends its id", async () => {
      vi.mocked(apiPost).mockResolvedValue(linkWithCaptions());
      const { player } = await renderCast();
      const track = addCaption(player, "en", "vtt");

      const { session } = await startCasting(player);
      expect(loadRequestOf(session).activeTrackIds).toEqual([]);

      track.mode = "showing";
      await settle();

      expect(lastTrackEdit(session).activeTrackIds).toEqual([1]);
    });
    describe("a scene that finishes on the TV", () => {
      /** The receiver reports `reason` as the media's idle reason */
      function receiverIdles(
        session: FakeSession,
        remote: ReturnType<typeof fake.remote>,
        controller: ReturnType<typeof fake.controller>,
        reason: string
      ) {
        session.mediaSession = { ...session.mediaSession, idleReason: reason };
        remote.playerState = "IDLE";
        controller.emit(REMOTE_EVENT.PLAYER_STATE_CHANGED);
      }

      it("a finished remote scene steps the queue and loads the next scene's link", async () => {
        const { player, step, dispatch } = await renderCast();
        // The reducer's step: the page moves to the next entry
        dispatch.mockImplementation(() => step({ scene: NEXT }));
        const { session, remote, controller } = await startCasting(player);

        await act(() => {
          receiverIdles(session, remote, controller, "FINISHED");
          return Promise.resolve();
        });

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith({
          type: "NEXT_SCENE",
          payload: { autoplay: true },
        });
        await waitFor(() => expect(session.loadMedia).toHaveBeenCalledTimes(2));
        expect(vi.mocked(apiPost)).toHaveBeenCalledWith(
          "/scene/13/media-link",
          {
            instanceId: "inst-a",
          }
        );
        const request = loadRequestOf(session, 1);
        expect(request.media.customData).toEqual({
          scene: "13:inst-a",
          sender: "tab-a",
        });
        expect(request.currentTime).toBe(0);
        // The scene that just finished was playing: the next one plays on
        expect(request.autoplay).toBe(true);
        expect(media.play).not.toHaveBeenCalled();
      });

      it("repeat one reloads the same scene", async () => {
        const { player, dispatch } = await renderCast({ repeat: "one" });
        const { session, remote, controller } = await startCasting(player);

        await act(() => {
          receiverIdles(session, remote, controller, "FINISHED");
          return Promise.resolve();
        });

        await waitFor(() => expect(session.loadMedia).toHaveBeenCalledTimes(2));
        expect(dispatch).not.toHaveBeenCalled();
        const request = loadRequestOf(session, 1);
        expect(request.media.customData).toEqual({
          scene: "12:inst-a",
          sender: "tab-a",
        });
        expect(request.currentTime).toBe(0);
        expect(request.autoplay).toBe(true);
      });

      it("no advance when the tab's autoplay is off", async () => {
        const { player, dispatch } = await renderCast({ autoplayNext: false });
        const { session, remote, controller } = await startCasting(player);

        await act(() => {
          receiverIdles(session, remote, controller, "FINISHED");
          return Promise.resolve();
        });
        await settle();

        expect(dispatch).not.toHaveBeenCalled();
        expect(session.loadMedia).toHaveBeenCalledTimes(1);
      });

      it("an idle reason other than FINISHED does not step", async () => {
        const { player, dispatch } = await renderCast();
        const { session, remote, controller } = await startCasting(player);

        for (const reason of ["CANCELLED", "INTERRUPTED"]) {
          await act(() => {
            receiverIdles(session, remote, controller, reason);
            return Promise.resolve();
          });
        }
        await settle();

        expect(dispatch).not.toHaveBeenCalled();
        expect(session.loadMedia).toHaveBeenCalledTimes(1);
      });

      it("a tab mirroring media another tab loaded does not step the queue", async () => {
        vi.mocked(castSenderId).mockReturnValue("tab-b");
        const session = liveSession("12:inst-a", "tab-a");
        const { dispatch } = await renderCast();
        const remote = fake.remote();
        Object.assign(remote, { isMediaLoaded: true, duration: 600 });

        await act(() => {
          receiverIdles(session, remote, fake.controller(), "FINISHED");
          return Promise.resolve();
        });
        await settle();

        expect(dispatch).not.toHaveBeenCalled();
        expect(session.loadMedia).not.toHaveBeenCalled();
      });
    });
  });

  describe("under StrictMode", () => {
    it("one Cast button after a remount", async () => {
      const { player } = await renderCast({ strict: true });
      fake.context.setCastState(CAST_STATE.NOT_CONNECTED);

      expect(player.el().querySelectorAll(".vjs-cast-button")).toHaveLength(1);
      expect(player.el().querySelectorAll(".vjs-cast-status")).toHaveLength(1);
    });

    it("one listener per CastContext event after a remount", async () => {
      await renderCast({ strict: true });

      expect(fake.context.count("caststatechanged")).toBe(1);
      expect(fake.context.count("sessionstatechanged")).toBe(1);
      const live = fake.controllers.filter(
        (controller) => controller.count(REMOTE_EVENT.CURRENT_TIME_CHANGED) > 0
      );
      expect(live).toHaveLength(1);
    });

    it("one load request per session start", async () => {
      const { player } = await renderCast({ strict: true });

      const { session } = await startCasting(player);
      await act(() => Promise.resolve());

      expect(session.loadMedia).toHaveBeenCalledTimes(1);
      expect(vi.mocked(apiPost)).toHaveBeenCalledTimes(1);
    });

    it("one load request per scene change", async () => {
      const { player, step } = await renderCast({ strict: true });
      const { session } = await startCasting(player);

      step({ scene: NEXT });
      await waitFor(() => expect(session.loadMedia).toHaveBeenCalledTimes(2));
      await settle();

      expect(session.loadMedia).toHaveBeenCalledTimes(2);
      const nextLinks = vi
        .mocked(apiPost)
        .mock.calls.filter(([endpoint]) => endpoint === "/scene/13/media-link");
      expect(nextLinks).toHaveLength(1);
    });
  });
});
