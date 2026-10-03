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
import { createAuthValue, must } from "@tests/testUtils";
import videojs from "video.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VrMenuButton } from "@/components/video-player/vr/VrControls";
import { loadVr, prefetchVr } from "@/components/video-player/vr/loadVr";
import { useVrMode } from "@/components/video-player/vr/useVrMode";
import * as vrUi from "@/components/video-player/vr/vrUi";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { TVModeContext } from "@/contexts/TVModeContext";

vi.mock("@/components/video-player/vr/loadVr", () => ({
  loadVr: vi.fn(() => Promise.resolve()),
  prefetchVr: vi.fn(),
}));

// The real VR UI, its attach watched
vi.mock("@/components/video-player/vr/vrUi", async (importOriginal) => {
  const real = await importOriginal<typeof vrUi>();
  return { ...real, attachVrMode: vi.fn(real.attachVrMode) };
});

const USER_ID = 7;

interface FakeVr {
  enabled: boolean;
  enable: ReturnType<typeof vi.fn>;
  setProjection: ReturnType<typeof vi.fn>;
  disable: ReturnType<typeof vi.fn>;
}

function fakeVr(): FakeVr {
  const vr: FakeVr = {
    enabled: false,
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

interface SceneProps {
  scene: {
    id: string;
    instanceId: string;
    vr?: SceneVr | null;
  } | null;
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

async function setup(scene: SceneProps["scene"], { strict = false } = {}) {
  const player = makePlayer();
  players.push(player);
  const playerRef = { current: player };
  const rendered = renderHook(
    ({ scene: current }: SceneProps) =>
      useVrMode({
        playerRef,
        scene: current,
        sceneKey: current ? `${current.id}:${current.instanceId}` : undefined,
      }),
    { initialProps: { scene }, wrapper: wrapperOf(strict) }
  );
  // The button comes with the vr-ui chunk, a moment after the render
  if (scene?.vr && !tvMode) {
    await waitFor(() => {
      expect(buttons(player)).toHaveLength(1);
    });
  }
  await settle();
  return { player, playerRef, ...rendered };
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
