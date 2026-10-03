/**
 * useCast ties the Scene page's player to a Cast session: a session start
 * pauses the local player and loads the scene on the receiver with the
 * user's signed link, the page's controls then drive the receiver, and a
 * session end hands the scene back to the local player where the TV left it.
 * TV mode never loads Google's script.
 */
import { StrictMode, createElement } from "react";
import type { ReactNode } from "react";
import type { SceneMediaLinkResponse } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiPost } from "@/api";
import type * as apiModule from "@/api";
import { queryKeys } from "@/api/queryKeys";
import { loadCastSdk } from "@/components/video-player/cast/castSdk";
import type * as castSdkModule from "@/components/video-player/cast/castSdk";
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
vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof apiModule>()),
  apiPost: vi.fn(),
}));
vi.mock("@/utils/toast", () => ({ showError: vi.fn() }));

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

let fake: FakeFramework;
let media: ReturnType<typeof stubMediaElement>;
let players: TestPlayer[] = [];
let queryClient: QueryClient;

beforeEach(() => {
  fake = fakeFramework();
  media = stubMediaElement();
  vi.stubGlobal("chrome", { cast: { media: fakeMedia } });
  vi.mocked(loadCastSdk).mockResolvedValue(fake.framework);
  vi.mocked(apiPost).mockResolvedValue(mediaLink());
  vi.mocked(showError).mockClear();
  vi.mocked(loadCastSdk).mockClear();
  vi.mocked(apiPost).mockClear();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
});

afterEach(() => {
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
}

async function renderCast(options: RenderOptions = {}) {
  const player = await startPlayer();
  players.push(player);
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
  const props: UseCastOptions = {
    playerRef: { current: player },
    scene,
    sceneKey: `${scene.id}:${scene.instanceId}`,
    dispatch: vi.fn(),
    autoplayNext: true,
    repeat: "none",
    restartCount: 0,
    playlist: null,
    resumeTime: options.resumeTime ?? null,
    minimumPlayPercent: 20,
    // No viewing: the cast tracker's own tests are in castActivity.test.ts
    viewing: { current: null },
  };
  const rendered = renderHook(() => useCast(props), { wrapper });
  // The SDK and the cast chunk resolve after the effect runs
  await act(() => Promise.resolve());
  if (waitForAttach) {
    await waitFor(() =>
      expect(fake.context.count("sessionstatechanged")).toBeGreaterThan(0)
    );
  }
  return { player, rendered };
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

const loadRequestOf = (session: FakeSession) =>
  untrusted<{ currentTime: number; media: { contentId: string } }>(
    must(session.loadMedia.mock.calls[0], "loadMedia call")[0]
  );

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
    void player.play();
    expect(media.play).toHaveBeenCalledTimes(1);
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

  it("TV mode never calls loadCastSdk and never shows the button", async () => {
    const load = vi.spyOn(castChunk, "load");
    const { player } = await renderCast({ tvMode: true });

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
    const load = vi.spyOn(castChunk, "load");
    const { player } = await renderCast({ waitForAttach: false });

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
  });
});
