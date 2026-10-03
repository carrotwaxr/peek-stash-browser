/**
 * attachVrMode puts the VR button on one player and runs VR mode until
 * `detach()`: the projection (the user's pick, else the detected one), the
 * lazy load of the VR plugin, and turning the 3D view on and off. The loader
 * and the plugin are fakes; the player and the button are real. The page's
 * wiring (the user key, the HUD handlers) is in useVrMode.test.ts.
 */
import type { VrProjection } from "@peek/shared-types";
import { must } from "@tests/testUtils";
import videojs from "video.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VrMenuButton } from "@/components/video-player/vr/VrControls";
import { loadVr } from "@/components/video-player/vr/loadVr";
import type { VrHud } from "@/components/video-player/vr/vrPlugin";
import {
  type VrMode,
  type VrModeInputs,
  type VrModePlayer,
  attachVrMode,
} from "@/components/video-player/vr/vrUi";

vi.mock("@/components/video-player/vr/loadVr", () => ({
  loadVr: vi.fn(() => Promise.resolve()),
  prefetchVr: vi.fn(),
}));

const KEY = "peek.vr.7.123:inst-a";
const OTHER_KEY = "peek.vr.7.124:inst-a";

const hud: VrHud = {
  onNext: () => {},
  onPrevious: () => {},
  onFavorite: () => {},
};

function fakeVr() {
  const vr = {
    enabled: false,
    enable: vi.fn((_projection: VrProjection) => {
      vr.enabled = true;
    }),
    disable: vi.fn(() => {
      vr.enabled = false;
    }),
    setProjection: vi.fn(),
    setHud: vi.fn(),
    setFavorite: vi.fn(),
    onFailure: vi.fn<(handler: (error: unknown) => void) => void>(),
  };
  return vr;
}

/** What happy-dom lacks: a canvas that makes a WebGL context, or none */
const loseContext = vi.fn();
function stubWebGl(available: boolean) {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(((
    type: string
  ) =>
    available && (type === "webgl2" || type === "webgl")
      ? { getExtension: () => ({ loseContext }) }
      : null) as never);
}

/** The notice VR puts on the player, if any */
const notice = (player: TestPlayer) =>
  player.el().querySelector(".vjs-vr-notice")?.textContent ?? null;

interface TestPlayer extends VrModePlayer {
  controlBar: VrModePlayer["controlBar"] & {
    getChild(name: string): VrMenuButton | undefined;
  };
  dispose(): void;
}

const players: TestPlayer[] = [];

/** A real video.js player; `withPlugin: false` is one whose fork never registered */
function makePlayer(withPlugin = true) {
  const video = document.createElement("video");
  document.body.appendChild(video);
  const player = videojs(video, { controls: true }) as unknown as TestPlayer;
  players.push(player);
  const vr = fakeVr();
  if (withPlugin) player.peekVr = () => vr as never;
  return { player, vr };
}

const attached: VrMode[] = [];

function attach(
  player: TestPlayer,
  inputs: VrModeInputs = { detected: "180_LR", storageKey: KEY, decodes: null }
) {
  const mode = attachVrMode(player, inputs, hud);
  attached.push(mode);
  return mode;
}

const button = (player: TestPlayer) =>
  must(player.controlBar.getChild("peekVrButton"), "the VR button");

const toggle = (player: TestPlayer) =>
  must(button(player).vrToggle, "the toggle item");

const radio = (player: TestPlayer, projection: VrProjection) => {
  const radios = must(button(player).vrRadios, "the radios");
  return must(
    radios.find(([name]) => name === projection),
    `the ${projection} radio`
  )[1];
};

const isOn = (player: TestPlayer) =>
  toggle(player).el().getAttribute("aria-checked") === "true";

// video.js hears its own events: native clicks never reach it
const press = (item: { trigger(event: string): void }) =>
  flush(() => item.trigger("click"));

/** A promise the test settles when it chooses */
function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flush(step: () => void) {
  step();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.mocked(loadVr).mockImplementation(() => Promise.resolve());
  stubWebGl(true);
});

afterEach(() => {
  attached.splice(0).forEach((mode) => mode.detach());
  players.splice(0).forEach((p) => p.isDisposed() || p.dispose());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("attachVrMode: no stored pick", () => {
  it("with no user key the pick lasts for the page only: nothing is stored", async () => {
    const { player, vr } = makePlayer();
    attach(player, { detected: "180_LR", storageKey: null, decodes: null });
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    await press(radio(player, "360"));
    await press(toggle(player));

    expect(setItem).not.toHaveBeenCalled();
    expect(vr.enable).toHaveBeenCalledWith("360");
  });

  it("with no user key a stored pick under another key is not read", async () => {
    localStorage.setItem(KEY, "360");
    const { player, vr } = makePlayer();
    attach(player, { detected: "180_LR", storageKey: null, decodes: null });

    await press(toggle(player));

    expect(vr.enable).toHaveBeenCalledWith("180_LR");
  });
});

describe("attachVrMode: blocked storage", () => {
  it("a read that throws falls back to the detected projection", async () => {
    const { player, vr } = makePlayer();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {},
    });
    attach(player);

    await press(toggle(player));

    expect(vr.enable).toHaveBeenCalledWith("180_LR");
  });

  it("a write that throws still applies the pick until the page closes", async () => {
    const { player, vr } = makePlayer();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("full", "QuotaExceededError");
      },
    });
    attach(player);

    await press(radio(player, "360_TB"));
    await press(toggle(player));

    expect(vr.enable).toHaveBeenCalledWith("360_TB");
  });
});

describe("attachVrMode: turning VR on", () => {
  it("a second click while the plugin is still loading does not load it twice", async () => {
    const pending = deferred();
    vi.mocked(loadVr).mockImplementation(() => pending.promise);
    const { player, vr } = makePlayer();
    attach(player);

    await press(toggle(player));
    await press(toggle(player));
    pending.resolve();
    await flush(() => {});

    expect(loadVr).toHaveBeenCalledTimes(1);
    expect(vr.enable).toHaveBeenCalledTimes(1);
    expect(isOn(player)).toBe(true);
  });

  it("detaching while the plugin loads leaves the view off", async () => {
    const pending = deferred();
    vi.mocked(loadVr).mockImplementation(() => pending.promise);
    const { player, vr } = makePlayer();
    const mode = attach(player);

    await press(toggle(player));
    mode.detach();
    pending.resolve();
    await flush(() => {});

    expect(vr.enable).not.toHaveBeenCalled();
    expect(vr.setHud).not.toHaveBeenCalled();
  });

  it("a player disposed while the plugin loads is left alone", async () => {
    const pending = deferred();
    vi.mocked(loadVr).mockImplementation(() => pending.promise);
    const { player, vr } = makePlayer();
    attach(player);

    await press(toggle(player));
    player.dispose();
    pending.resolve();
    await flush(() => {});

    expect(vr.enable).not.toHaveBeenCalled();
  });

  it("a plugin that did not register stays flat, and the next click tries again", async () => {
    const { player } = makePlayer(false);
    attach(player);

    await press(toggle(player));
    expect(isOn(player)).toBe(false);

    // The fork registers `peekVr` after the first attempt
    const vr = fakeVr();
    player.peekVr = () => vr as never;
    await press(toggle(player));

    expect(loadVr).toHaveBeenCalledTimes(2);
    expect(vr.enable).toHaveBeenCalledWith("180_LR");
    expect(isOn(player)).toBe(true);
  });
});

describe("attachVrMode: a browser without WebGL", () => {
  it("says so and stays flat, without fetching the VR code", async () => {
    stubWebGl(false);
    const { player, vr } = makePlayer();
    attach(player);

    await press(toggle(player));

    expect(isOn(player)).toBe(false);
    expect(loadVr).not.toHaveBeenCalled();
    expect(vr.enable).not.toHaveBeenCalled();
    expect(notice(player)).toBe(
      "This browser can't show VR video: WebGL is unavailable"
    );
  });

  it("a probe that throws counts as no WebGL", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => {
        throw new Error("blocked");
      }
    );
    const { player, vr } = makePlayer();
    attach(player);

    await press(toggle(player));

    expect(vr.enable).not.toHaveBeenCalled();
    expect(notice(player)).toContain("WebGL is unavailable");
  });

  it("the notice is an alert on the player that goes after a few seconds", async () => {
    vi.useFakeTimers();
    try {
      stubWebGl(false);
      const { player } = makePlayer();
      attach(player);

      await press(toggle(player));

      expect(
        player.el().querySelector(".vjs-vr-notice")?.getAttribute("role")
      ).toBe("alert");
      vi.advanceTimersByTime(6_999);
      expect(notice(player)).not.toBeNull();
      vi.advanceTimersByTime(1);
      expect(notice(player)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a second failure replaces the notice rather than stacking another", async () => {
    stubWebGl(false);
    const { player } = makePlayer();
    attach(player);

    await press(toggle(player));
    await press(toggle(player));

    expect(player.el().querySelectorAll(".vjs-vr-notice")).toHaveLength(1);
  });

  it("detaching takes the notice off", async () => {
    stubWebGl(false);
    const { player } = makePlayer();
    const mode = attach(player);
    await press(toggle(player));

    mode.detach();

    expect(notice(player)).toBeNull();
  });

  it("the probe's context is released", async () => {
    const { player } = makePlayer();
    attach(player);

    await press(toggle(player));

    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("a start that fails after the plugin loaded unticks VR and says so", async () => {
    const { player, vr } = makePlayer();
    attach(player);
    await press(toggle(player));
    expect(isOn(player)).toBe(true);
    const failed = must(vr.onFailure.mock.lastCall, "the failure handler")[0];

    failed(new Error("THREE.WebGLRenderer: Error creating WebGL context."));

    expect(isOn(player)).toBe(false);
    expect(notice(player)).toContain("WebGL");
  });

  it("a start that fails inside enable leaves VR off", async () => {
    const { player, vr } = makePlayer();
    attach(player);
    // As the plugin: the start fails inside enable() and VR goes down again
    vr.enable.mockImplementation(() => {
      const failed = must(vr.onFailure.mock.lastCall, "the handler")[0];
      failed(new Error("no context"));
    });

    await press(toggle(player));

    expect(isOn(player)).toBe(false);
    expect(notice(player)).not.toBeNull();
  });

  it("after a failure the next click tries again", async () => {
    const { player, vr } = makePlayer();
    attach(player);
    await press(toggle(player));
    must(vr.onFailure.mock.lastCall, "the handler")[0](new Error("x"));

    await press(toggle(player));

    expect(vr.enable).toHaveBeenCalledTimes(2);
    expect(isOn(player)).toBe(true);
  });
});

describe("attachVrMode: update", () => {
  it("the same scene and key again changes nothing", async () => {
    const { player, vr } = makePlayer();
    const mode = attach(player);
    await press(toggle(player));

    mode.update({ detected: "180_LR", storageKey: KEY, decodes: null });

    expect(vr.setProjection).not.toHaveBeenCalled();
    expect(isOn(player)).toBe(true);
  });

  it("another scene of the same projection reads its own stored pick", async () => {
    localStorage.setItem(OTHER_KEY, "FISHEYE_200_LR");
    const { player, vr } = makePlayer();
    const mode = attach(player);
    await press(toggle(player));

    mode.update({ detected: "180_LR", storageKey: OTHER_KEY, decodes: null });

    expect(vr.setProjection).toHaveBeenCalledWith("FISHEYE_200_LR");
  });

  it("another scene of the same projection with no pick keeps the detected one", async () => {
    const { player, vr } = makePlayer();
    const mode = attach(player);
    await press(toggle(player));

    mode.update({ detected: "180_LR", storageKey: OTHER_KEY, decodes: null });

    expect(vr.setProjection).toHaveBeenCalledWith("180_LR");
  });

  it("the same key with another detected projection follows the detection", async () => {
    const { player, vr } = makePlayer();
    const mode = attach(player);
    await press(toggle(player));

    mode.update({ detected: "360", storageKey: KEY, decodes: null });

    expect(vr.setProjection).toHaveBeenCalledWith("360");
  });

  it("while VR is off a new scene's projection waits for the next enable", async () => {
    const { player, vr } = makePlayer();
    const mode = attach(player);

    mode.update({ detected: "360", storageKey: OTHER_KEY, decodes: null });
    await press(toggle(player));

    expect(vr.setProjection).not.toHaveBeenCalled();
    expect(vr.enable).toHaveBeenCalledWith("360");
  });
});

describe("attachVrMode: the favourite", () => {
  it("is given to the plugin on enable, and follows while VR is on", async () => {
    const { player, vr } = makePlayer();
    const mode = attach(player);
    mode.setFavorite(true);
    expect(vr.setFavorite).not.toHaveBeenCalled();

    await press(toggle(player));
    expect(vr.setFavorite).toHaveBeenLastCalledWith(true);

    mode.setFavorite(false);
    expect(vr.setFavorite).toHaveBeenLastCalledWith(false);
  });
});

describe("attachVrMode: detach", () => {
  it("turns VR off and removes the button", async () => {
    const { player, vr } = makePlayer();
    const mode = attach(player);
    await press(toggle(player));

    mode.detach();

    expect(vr.disable).toHaveBeenCalledTimes(1);
    expect(player.controlBar.getChild("peekVrButton")).toBeFalsy();
  });

  it("twice does nothing the second time", async () => {
    const { player, vr } = makePlayer();
    const mode = attach(player);
    await press(toggle(player));

    mode.detach();
    mode.detach();

    expect(vr.disable).toHaveBeenCalledTimes(1);
  });
});
