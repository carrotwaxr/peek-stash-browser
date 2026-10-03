/**
 * useVrMode puts a VR button on the player of a VR scene, prefetches the VR
 * chunk where a headset can run, and turns the 3D view on and off through
 * the lazy `peekVr` plugin. The loader and the plugin are fakes here.
 */
import { type ReactNode, StrictMode, createElement } from "react";
import {
  type SceneVr,
  VR_PROJECTIONS,
  type VrProjection,
} from "@peek/shared-types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { untrusted } from "@tests/helpers/untrusted";
import { createAuthValue, must } from "@tests/testUtils";
import videojs from "video.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type PlayerSource,
  buildPlayerSources,
} from "@/components/video-player/playerSources";
import type { VrMenuButton } from "@/components/video-player/vr/VrControls";
import { loadVr, prefetchVr } from "@/components/video-player/vr/loadVr";
import { useVrMode } from "@/components/video-player/vr/useVrMode";
import type { VrHud } from "@/components/video-player/vr/vrPlugin";
import * as vrUi from "@/components/video-player/vr/vrUi";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { TVModeContext } from "@/contexts/TVModeContext";
import {
  type ScenePlayerReducerState,
  initialState,
  scenePlayerReducer,
} from "@/contexts/scenePlayerReducer";
import type * as browserPlayback from "@/utils/browserPlayback";

vi.mock("@/components/video-player/vr/loadVr", () => ({
  loadVr: vi.fn(() => Promise.resolve()),
  prefetchVr: vi.fn(),
}));

// The real VR UI, its attach watched
vi.mock("@/components/video-player/vr/vrUi", async (importOriginal) => {
  const real = await importOriginal<typeof vrUi>();
  return { ...real, attachVrMode: vi.fn(real.attachVrMode) };
});

// The file's decode check: H.264 decodes, HEVC does not, anything else
// cannot be told
vi.mock("@/utils/browserPlayback", async (importOriginal) => {
  const real = await importOriginal<typeof browserPlayback>();
  return {
    ...real,
    canDecode: vi.fn(({ video_codec }: { video_codec?: string | null }) =>
      video_codec === "h264" ? true : video_codec === "hevc" ? false : null
    ),
  };
});

// The favourite write (useUpdateFavorite), answered by each test
const saveFavorite = vi.hoisted(() =>
  vi.fn(
    (_vars: {
      entityType: string;
      entityId: string;
      favorite: boolean;
      instanceId: string;
    }) => Promise.resolve({})
  )
);
vi.mock("@/api/hooks/useFavoriteMutation", () => ({
  useUpdateFavorite: () => ({ mutateAsync: saveFavorite }),
}));

const USER_ID = 7;

interface FakeVr {
  enabled: boolean;
  enable: ReturnType<typeof vi.fn>;
  setProjection: ReturnType<typeof vi.fn>;
  disable: ReturnType<typeof vi.fn>;
  setHud: ReturnType<typeof vi.fn>;
  setFavorite: ReturnType<typeof vi.fn>;
  /** The handlers the HUD's buttons call, as given to `setHud` */
  hud: VrHud | null;
}

function fakeVr(): FakeVr {
  const vr: FakeVr = {
    enabled: false,
    hud: null,
    setHud: vi.fn((hud: VrHud) => {
      vr.hud = hud;
    }),
    setFavorite: vi.fn(),
    enable: vi.fn(() => {
      vr.enabled = true;
    }),
    setProjection: vi.fn(),
    disable: vi.fn(() => {
      vr.enabled = false;
    }),
  };
  return vr;
}

type Player = ReturnType<typeof makePlayer>;

function makePlayer() {
  const video = document.createElement("video");
  document.body.appendChild(video);
  const player = videojs(video, { controls: true }) as unknown as {
    controlBar: {
      getChild(name: string): VrMenuButton | undefined;
      children(): Array<{ name(): string }>;
    };
    isDisposed(): boolean;
    dispose(): void;
    peekVr: () => FakeVr;
  };
  const vr = fakeVr();
  player.peekVr = () => vr;
  return Object.assign(player, { vr });
}

interface TestScene {
  id: string;
  instanceId: string;
  favorite?: boolean;
  vr?: SceneVr | null;
  files?: Array<{ video_codec: string; audio_codec: string }>;
}

interface HookProps {
  scene: TestScene | null;
  nextScene: () => void;
  prevScene: () => void;
  queueLength: number;
}

const vrScene = (projection: VrProjection = "180_LR", id = "123") => ({
  id,
  instanceId: "inst-a",
  vr: { projection, source: "tag" as const },
});
const flatScene = { id: "124", instanceId: "inst-a", vr: null };

let tvMode = false;
const players: Player[] = [];

function wrapperOf(strict: boolean) {
  const auth = createAuthValue({
    isAuthenticated: true,
    user: {
      id: USER_ID,
      username: "viewer",
      role: "USER",
      setupCompleted: true,
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    const tree = createElement(
      AuthContext.Provider,
      { value: auth },
      createElement(
        TVModeContext.Provider,
        { value: { isTVMode: tvMode, toggleTVMode: () => {} } },
        children
      )
    );
    return strict ? createElement(StrictMode, null, tree) : tree;
  };
}

/** Lets the VR UI chunk's import and the effects it starts finish */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/**
 * Renders the hook on a fresh player. `reducer`: actions go through the
 * Scene page's reducer and its scene comes back as the next render's, as on
 * the page; otherwise `dispatch` only records them.
 */
async function setup(
  scene: TestScene | null,
  {
    strict = false,
    queueLength = 3,
    reducer = false,
  }: { strict?: boolean; queueLength?: number; reducer?: boolean } = {}
) {
  const player = makePlayer();
  players.push(player);
  const playerRef = { current: player };
  let props: HookProps = {
    scene,
    nextScene: vi.fn(),
    prevScene: vi.fn(),
    queueLength,
  };
  let state = untrusted<ScenePlayerReducerState>({ ...initialState, scene });
  const dispatch = vi.fn((action: { type: string; payload?: unknown }) => {
    if (!reducer) return;
    state = scenePlayerReducer(state, action);
    rerender({ scene: untrusted<TestScene | null>(state.scene) });
  });
  const rendered = renderHook(
    (current: HookProps) =>
      useVrMode({
        playerRef,
        scene: current.scene,
        sceneKey: current.scene
          ? `${current.scene.id}:${current.scene.instanceId}`
          : undefined,
        nextScene: current.nextScene,
        prevScene: current.prevScene,
        queueLength: current.queueLength,
        dispatch,
      }),
    { initialProps: props, wrapper: wrapperOf(strict) }
  );
  function rerender(next: Partial<HookProps>) {
    props = { ...props, ...next };
    if (next.scene !== undefined) {
      state = untrusted<ScenePlayerReducerState>({
        ...state,
        scene: next.scene,
      });
    }
    rendered.rerender(props);
  }
  // The button comes with the vr-ui chunk, a moment after the render
  if (scene?.vr && !tvMode) {
    await waitFor(() => {
      expect(buttons(player)).toHaveLength(1);
    });
  }
  await settle();
  return {
    player,
    playerRef,
    dispatch,
    rerender,
    props: () => props,
  };
}

const buttons = (player: Player) =>
  player.controlBar.children().filter((c) => c.name() === "peekVrButton");

const buttonOf = (player: Player) =>
  must(player.controlBar.getChild("peekVrButton"), "the VR button");

const buttonEl = (player: Player) => buttonOf(player).el() as Element;

/** A menu entry: its element to read, and its video.js component to press */
interface Entry {
  el: HTMLElement;
  component: { trigger(event: string): void };
}

const toggleOf = (player: Player): Entry => {
  const component = must(buttonOf(player).vrToggle, "the toggle item");
  return { el: component.el(), component };
};

const radioOf = (player: Player, index: number): Entry => {
  const [, component] = must(
    must(buttonOf(player).vrRadios, "the radios")[index],
    "a projection"
  );
  return { el: component.el(), component };
};

// video.js hears its own events: jsdom's native clicks never reach it
const click = (entry: Entry) =>
  act(async () => {
    entry.component.trigger("click");
    await Promise.resolve();
  });

function stubXr(
  isSessionSupported: ((mode: string) => Promise<boolean>) | undefined
) {
  Object.defineProperty(navigator, "xr", {
    value: isSessionSupported ? { isSessionSupported } : undefined,
    configurable: true,
  });
}

beforeEach(() => {
  tvMode = false;
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("isSecureContext", true);
  stubXr(undefined);
});

afterEach(() => {
  players.splice(0).forEach((p) => p.isDisposed() || p.dispose());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("useVrMode: the button", () => {
  it("adds one VR button for a VR scene", async () => {
    const { player } = await setup(vrScene());
    expect(buttons(player)).toHaveLength(1);
  });

  it("adds none for a scene without vr", async () => {
    const { player } = await setup(flatScene);
    expect(buttons(player)).toHaveLength(0);
  });

  it("attaches no VR controls for a scene without vr", async () => {
    await setup(flatScene);
    expect(vrUi.attachVrMode).not.toHaveBeenCalled();
  });

  it("adds none in TV mode", async () => {
    tvMode = true;
    const { player } = await setup(vrScene());
    expect(buttons(player)).toHaveLength(0);
  });

  it("keeps one button after a StrictMode remount", async () => {
    const { player } = await setup(vrScene(), { strict: true });
    expect(buttons(player)).toHaveLength(1);
  });

  it("is placed before the fullscreen toggle", async () => {
    const { player } = await setup(vrScene());
    const names = player.controlBar.children().map((c) => c.name());
    const vr = names.indexOf("peekVrButton");
    const fullscreen = names.indexOf("FullscreenToggle");
    expect(vr).toBeGreaterThan(-1);
    expect(fullscreen).toBeGreaterThan(vr);
  });

  it("names the toggle and the projections with their checked states", async () => {
    const { player } = await setup(vrScene("360"));
    const toggle = toggleOf(player).el;
    expect(toggle.getAttribute("role")).toBe("menuitemcheckbox");
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.textContent).toContain("VR view");
    const checked = Array.from(
      buttonEl(player).querySelectorAll<HTMLElement>('[role="menuitemradio"]')
    ).filter((item) => item.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]?.getAttribute("role")).toBe("menuitemradio");
  });

  it("removes the button and turns VR off when the scene is not VR", async () => {
    const { player, rerender } = await setup(vrScene());
    await click(toggleOf(player));
    expect(player.vr.enabled).toBe(true);

    rerender({ scene: flatScene });
    expect(buttons(player)).toHaveLength(0);
    expect(player.vr.disable).toHaveBeenCalledTimes(1);
  });

  it("keeps VR on across VR scenes and follows the next scene's projection", async () => {
    const { player, rerender } = await setup(vrScene("180_LR", "123"));
    await click(toggleOf(player));

    rerender({ scene: vrScene("360", "125") });

    expect(buttons(player)).toHaveLength(1);
    expect(player.vr.disable).not.toHaveBeenCalled();
    expect(player.vr.setProjection).toHaveBeenCalledWith("360");
    expect(toggleOf(player).el.getAttribute("aria-checked")).toBe("true");
    expect(
      radioOf(player, VR_PROJECTIONS.indexOf("360")).el.getAttribute(
        "aria-checked"
      )
    ).toBe("true");
  });

  it("shows the HTTPS note only without a secure context", async () => {
    vi.stubGlobal("isSecureContext", false);
    const { player } = await setup(vrScene());
    expect(buttonEl(player).textContent).toContain("Headset mode needs HTTPS");
  });

  it("has no HTTPS note in a secure context", async () => {
    const { player } = await setup(vrScene());
    expect(buttonEl(player).textContent).not.toContain(
      "Headset mode needs HTTPS"
    );
  });
});

describe("useVrMode: the prefetch", () => {
  it("runs when immersive-vr is supported", async () => {
    const supported = vi.fn(() => Promise.resolve(true));
    stubXr(supported);
    await setup(vrScene());
    await waitFor(() => expect(prefetchVr).toHaveBeenCalledTimes(1));
    expect(supported).toHaveBeenCalledWith("immersive-vr");
  });

  it.each([
    ["resolves false", () => Promise.resolve(false)],
    ["rejects", () => Promise.reject(new Error("no"))],
    [
      "throws",
      () => {
        throw new Error("no");
      },
    ],
  ])("never runs when isSessionSupported %s", async (_name, impl) => {
    const supported = vi.fn(impl);
    stubXr(supported as (mode: string) => Promise<boolean>);
    await setup(vrScene());
    await waitFor(() => expect(supported).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });
    expect(prefetchVr).not.toHaveBeenCalled();
  });

  it("never runs without navigator.xr", async () => {
    stubXr(undefined);
    await setup(vrScene());
    await act(async () => {
      await Promise.resolve();
    });
    expect(prefetchVr).not.toHaveBeenCalled();
  });

  it("never runs for a scene without vr", async () => {
    const supported = vi.fn(() => Promise.resolve(true));
    stubXr(supported);
    await setup(flatScene);
    await act(async () => {
      await Promise.resolve();
    });
    expect(supported).not.toHaveBeenCalled();
    expect(prefetchVr).not.toHaveBeenCalled();
  });
});

describe("useVrMode: turning VR on", () => {
  it("loads the plugin and enables it with the scene's projection", async () => {
    const { player } = await setup(vrScene("360_TB"));
    await click(toggleOf(player));
    expect(loadVr).toHaveBeenCalledTimes(1);
    expect(player.vr.enable).toHaveBeenCalledWith("360_TB");
    expect(toggleOf(player).el.getAttribute("aria-checked")).toBe("true");
  });

  it("enables with the remembered projection", async () => {
    localStorage.setItem(`peek.vr.${USER_ID}.123:inst-a`, "FISHEYE_200_LR");
    const { player } = await setup(vrScene("180_LR"));
    await click(toggleOf(player));
    expect(player.vr.enable).toHaveBeenCalledWith("FISHEYE_200_LR");
  });

  it("ignores a remembered value that is not a projection", async () => {
    localStorage.setItem(`peek.vr.${USER_ID}.123:inst-a`, "SIDEWAYS");
    const { player } = await setup(vrScene("180_MONO"));
    await click(toggleOf(player));
    expect(player.vr.enable).toHaveBeenCalledWith("180_MONO");
  });

  it("a choice of another scene or instance does not apply", async () => {
    localStorage.setItem(`peek.vr.${USER_ID}.123:inst-b`, "360");
    localStorage.setItem(`peek.vr.${USER_ID + 1}.123:inst-a`, "360");
    localStorage.setItem(`peek.vr.${USER_ID}.999:inst-a`, "360");
    const { player } = await setup(vrScene("180_LR"));
    await click(toggleOf(player));
    expect(player.vr.enable).toHaveBeenCalledWith("180_LR");
  });

  it("a second click turns it off", async () => {
    const { player } = await setup(vrScene());
    await click(toggleOf(player));
    await click(toggleOf(player));
    expect(player.vr.disable).toHaveBeenCalledTimes(1);
    expect(toggleOf(player).el.getAttribute("aria-checked")).toBe("false");
  });

  it("stays off, and can try again, when the plugin fails to load", async () => {
    vi.mocked(loadVr).mockRejectedValueOnce(new Error("offline"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { player } = await setup(vrScene());
    await click(toggleOf(player));
    expect(player.vr.enable).not.toHaveBeenCalled();
    expect(toggleOf(player).el.getAttribute("aria-checked")).toBe("false");

    await click(toggleOf(player));
    expect(player.vr.enable).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });
});

describe("useVrMode: the projection menu", () => {
  it("stores a pick under the user's key for this scene", async () => {
    const { player } = await setup(vrScene("180_LR"));
    await click(radioOf(player, 2));
    expect(localStorage.getItem(`peek.vr.${USER_ID}.123:inst-a`)).toBe(
      VR_PROJECTIONS[2]
    );
  });

  it("changes the live projection when VR is on", async () => {
    const { player } = await setup(vrScene("180_LR"));
    await click(toggleOf(player));
    await click(radioOf(player, 3));
    expect(player.vr.setProjection).toHaveBeenCalledWith("360_LR");
    expect(radioOf(player, 3).el.getAttribute("aria-checked")).toBe("true");
  });

  it("only remembers the pick while VR is off", async () => {
    const { player } = await setup(vrScene("180_LR"));
    await click(radioOf(player, 3));
    expect(player.vr.setProjection).not.toHaveBeenCalled();
    expect(player.vr.enable).not.toHaveBeenCalled();
    await click(toggleOf(player));
    expect(player.vr.enable).toHaveBeenCalledWith("360_LR");
  });
});

describe("useVrMode: the headset HUD", () => {
  /** Presses one of the HUD's buttons, as the fork calls its callbacks */
  const press = (player: Player, button: keyof VrHud) =>
    act(async () => {
      must(player.vr.hud, "the HUD's handlers")[button]();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  it("next and previous step the queue when it has more than one scene", async () => {
    const { player, props } = await setup(vrScene(), { queueLength: 2 });
    await click(toggleOf(player));

    await press(player, "onNext");
    await press(player, "onPrevious");

    expect(props().nextScene).toHaveBeenCalledTimes(1);
    expect(props().prevScene).toHaveBeenCalledTimes(1);
  });

  it.each([1, 0])(
    "next and previous do nothing with %i scenes in the queue",
    async (queueLength) => {
      const { player, props } = await setup(vrScene(), { queueLength });
      await click(toggleOf(player));

      await press(player, "onNext");
      await press(player, "onPrevious");

      expect(props().nextScene).not.toHaveBeenCalled();
      expect(props().prevScene).not.toHaveBeenCalled();
    }
  );

  it("after a re-render with new handlers, the HUD's next calls the new one", async () => {
    const { player, props, rerender } = await setup(vrScene());
    await click(toggleOf(player));
    const first = props().nextScene;
    const latest = vi.fn();

    rerender({ nextScene: latest });
    await press(player, "onNext");

    expect(latest).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("favourite saves the user's favourite with the scene's instance", async () => {
    const { player, dispatch } = await setup({
      ...vrScene(),
      favorite: false,
    });
    await click(toggleOf(player));

    await press(player, "onFavorite");

    expect(saveFavorite).toHaveBeenCalledWith({
      entityType: "scene",
      entityId: "123",
      favorite: true,
      instanceId: "inst-a",
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_SCENE_FAVORITE",
      payload: { sceneId: "123", instanceId: "inst-a", favorite: true },
    });
  });

  it("the HUD shows the scene's favourite and follows it", async () => {
    const { player, rerender } = await setup({
      ...vrScene(),
      favorite: true,
    });
    await click(toggleOf(player));
    expect(player.vr.setFavorite).toHaveBeenLastCalledWith(true);

    rerender({ scene: { ...vrScene(), favorite: false } });
    expect(player.vr.setFavorite).toHaveBeenLastCalledWith(false);
  });

  it("a second HUD toggle unfavourites", async () => {
    const { player } = await setup(
      { ...vrScene(), favorite: false },
      { reducer: true }
    );
    await click(toggleOf(player));

    await press(player, "onFavorite");
    expect(player.vr.setFavorite).toHaveBeenLastCalledWith(true);
    await press(player, "onFavorite");

    expect(saveFavorite.mock.calls.map(([vars]) => vars.favorite)).toEqual([
      true,
      false,
    ]);
    expect(player.vr.setFavorite).toHaveBeenLastCalledWith(false);
  });

  it("a failed write reverts the scene's favourite and the HUD", async () => {
    saveFavorite.mockRejectedValueOnce(new Error("offline"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { player, dispatch } = await setup(
      { ...vrScene(), favorite: false },
      { reducer: true }
    );
    await click(toggleOf(player));

    await press(player, "onFavorite");

    expect(dispatch).toHaveBeenLastCalledWith({
      type: "SET_SCENE_FAVORITE",
      payload: { sceneId: "123", instanceId: "inst-a", favorite: false },
    });
    expect(player.vr.setFavorite).toHaveBeenLastCalledWith(false);
    logged.mockRestore();
  });

  it("a scene change inside VR keeps the session, and the HUD shows the new scene", async () => {
    const { player, rerender } = await setup({
      ...vrScene("180_LR", "123"),
      favorite: false,
    });
    await click(toggleOf(player));

    rerender({ scene: { ...vrScene("360", "125"), favorite: true } });

    expect(player.vr.disable).not.toHaveBeenCalled();
    expect(player.vr.enable).toHaveBeenCalledTimes(1);
    expect(player.vr.setProjection).toHaveBeenLastCalledWith("360");
    expect(player.vr.setFavorite).toHaveBeenLastCalledWith(true);
  });
});

describe("useVrMode: the source VR plays on Safari", () => {
  const realBrowser = videojs.browser;
  const setSafari = (safari: boolean) => {
    videojs.browser = { ...realBrowser, IS_SAFARI: safari };
  };

  beforeEach(() => {
    setSafari(true);
  });

  afterEach(() => {
    videojs.browser = realBrowser;
  });

  const base = "/api/scene/123/proxy-stream";
  const sessionStreams = [
    {
      url: `${base}/stream?instanceId=inst-a`,
      mime_type: "video/mp4",
      label: "Direct stream",
    },
    {
      url: `${base}/stream.mp4?instanceId=inst-a`,
      mime_type: "video/mp4",
      label: "MP4",
    },
    {
      url: `${base}/stream.m3u8?instanceId=inst-a`,
      mime_type: "application/vnd.apple.mpegurl",
      label: "HLS",
    },
  ];
  // C6's media link: Direct and HLS, signed
  const signedStreams = [
    {
      url: `${base}/stream?instanceId=inst-a&uid=7&exp=9&scope=media&sig=d`,
      label: "Direct stream",
    },
    {
      url: `${base}/stream.m3u8?instanceId=inst-a&uid=7&exp=9&scope=media&sig=h`,
      label: "HLS",
    },
  ];

  /** The player's sources, as useVideoPlayer builds them */
  const sourcesFor = (
    decodes: boolean,
    signed?: Array<{ url: string; label: string }>
  ) =>
    buildPlayerSources(
      { id: "123", instanceId: "inst-a", sceneStreams: sessionStreams },
      () => decodes,
      signed
    );

  const labelled = (sources: PlayerSource[], label: string) =>
    must(
      sources.find((s) => s.label === label),
      label
    );

  /**
   * The player's source selector as VR reaches it: the menu's sources, and
   * `select`, the user's pick, which loads at the current time and plays on
   * (sourceSelector.test). `playing` is the source loaded now.
   */
  function giveSources(
    player: Player,
    sources: PlayerSource[],
    playing: PlayerSource,
    errored: PlayerSource[] = []
  ) {
    let current = playing.src;
    const select = vi.fn((source: PlayerSource) => {
      current = source.src;
    });
    Object.assign(player, {
      currentSrc: () => current,
      sourceSelector: () => ({
        menu: {
          items: sources.map((source) => ({
            source,
            hasClass: (name: string) =>
              name === "vjs-source-menu-item-error" && errored.includes(source),
          })),
        },
        fallback: { select },
      }),
    });
    return select;
  }

  const sceneWith = (videoCodec: string, id = "123") => ({
    ...vrScene("180_LR", id),
    files: [{ video_codec: videoCodec, audio_codec: "aac" }],
  });

  it("entering VR while HLS plays moves to the Direct source", async () => {
    const { player } = await setup(sceneWith("h264"));
    const sources = sourcesFor(true);
    const select = giveSources(player, sources, labelled(sources, "HLS"));

    await click(toggleOf(player));

    expect(player.vr.enable).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(labelled(sources, "Direct stream"));
  });

  it("with C6's signed sources, the Direct source it moves to is the signed one", async () => {
    const { player } = await setup(sceneWith("h264"));
    const sources = sourcesFor(true, signedStreams);
    const select = giveSources(player, sources, labelled(sources, "HLS"));

    await click(toggleOf(player));

    const [chosen] = must(select.mock.calls[0], "the source chosen");
    const url = new URL(chosen.src);
    expect(url.pathname).toBe(`${base}/stream`);
    expect(url.searchParams.get("sig")).toBe("d");
    expect(url.searchParams.get("scope")).toBe("media");
  });

  it("outside Safari the source is unchanged", async () => {
    setSafari(false);
    const { player } = await setup(sceneWith("h264"));
    const sources = sourcesFor(true);
    const select = giveSources(player, sources, labelled(sources, "HLS"));

    await click(toggleOf(player));

    expect(player.vr.enable).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });

  it("leaving VR does not move back", async () => {
    const { player } = await setup(sceneWith("h264"));
    const sources = sourcesFor(true);
    const select = giveSources(player, sources, labelled(sources, "HLS"));

    await click(toggleOf(player));
    await click(toggleOf(player));

    expect(player.vr.disable).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenLastCalledWith(labelled(sources, "Direct stream"));
  });

  it("a file canDecode refuses stays on HLS", async () => {
    const { player } = await setup(sceneWith("hevc"));
    const sources = sourcesFor(false);
    const select = giveSources(player, sources, labelled(sources, "HLS"));

    await click(toggleOf(player));

    expect(player.vr.enable).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
  });

  it("a file canDecode cannot tell about stays on HLS", async () => {
    const { player } = await setup(sceneWith("vp9"));
    const sources = sourcesFor(true);
    const select = giveSources(player, sources, labelled(sources, "HLS"));

    await click(toggleOf(player));

    expect(select).not.toHaveBeenCalled();
  });

  it("a Direct source that has already failed is not tried again", async () => {
    const { player } = await setup(sceneWith("h264"));
    const sources = sourcesFor(true);
    const select = giveSources(player, sources, labelled(sources, "HLS"), [
      labelled(sources, "Direct stream"),
    ]);

    await click(toggleOf(player));

    expect(select).not.toHaveBeenCalled();
  });

  it("while a source other than HLS plays, it stays", async () => {
    const { player } = await setup(sceneWith("h264"));
    const sources = sourcesFor(true);
    const select = giveSources(player, sources, labelled(sources, "MP4"));

    await click(toggleOf(player));

    expect(select).not.toHaveBeenCalled();
  });

  it("checks the file of the scene showing, after a scene change", async () => {
    const { player, rerender } = await setup(sceneWith("hevc", "123"));
    rerender({ scene: sceneWith("h264", "125") });
    const sources = sourcesFor(true);
    const select = giveSources(player, sources, labelled(sources, "HLS"));

    await click(toggleOf(player));

    expect(select).toHaveBeenCalledWith(labelled(sources, "Direct stream"));
  });
});
