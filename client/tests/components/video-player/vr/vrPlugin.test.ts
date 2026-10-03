/**
 * The peekVr plugin is Peek's thin layer over @blaineam/videojs-vr: it turns
 * the fork on with a projection, changes the projection, turns it off again,
 * and tags the fork's textures sRGB so the picture is not washed out.
 *
 * The fork is mocked: a fake stands in for the instance `player.vr()` creates.
 */
import type {
  VrOptions,
  VrPlugin,
  VrProjectionType,
  VrTexture,
} from "@blaineam/videojs-vr";
import { untrusted } from "@tests/helpers/untrusted";
import { must } from "@tests/testUtils";
import videojs from "video.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type VrPlayer,
  createVrController,
} from "@/components/video-player/vr/vrPlugin";

vi.mock("@blaineam/videojs-vr", () => ({ default: {} }));

// The module the fork's webvr-polyfill reads its defaults from; the polyfill
// copies it at construction, which is inside `player.vr()`
const polyfillConfig = vi.hoisted(() => ({
  DPDB_URL: "https://dpdb.webvr.rocks/dpdb.json",
  MOBILE_WAKE_LOCK: true,
  ROTATE_INSTRUCTIONS_DISABLED: false,
}));
vi.mock("webvr-polyfill/src/config", () => ({ default: polyfillConfig }));

class Emitter {
  private readonly listeners = new Map<string, Set<() => void>>();

  on(type: string, listener: () => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  off(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  trigger(type: string) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener();
  }

  count(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const texture = (): VrTexture => ({ colorSpace: "", needsUpdate: false });

/** What the fork's instance does that the plugin relies on. */
class FakeFork extends Emitter implements VrPlugin {
  initialized_ = false;
  presenting = false;
  videoTexture: VrTexture | undefined = undefined;
  posterTexture: VrTexture | null = null;
  setProjection = vi.fn<(projection: VrProjectionType) => void>();
  // As the fork: a new video texture each time, then `initialized`
  init = vi.fn(() => {
    this.initialized_ = true;
    this.videoTexture = texture();
    this.posterTexture = null;
    this.trigger("initialized");
  });
  reset = vi.fn();
  dispose = vi.fn();
  isPresenting = vi.fn(() => this.presenting);
  setFavoriteState = vi.fn();
}

/** A control the fork adds to the bar (its headset button) */
class FakeControl {
  dispose = vi.fn();
}

/** The player's control bar, with the children the fork adds */
class FakeBar {
  readonly children = new Map<string, FakeControl>();
  getChild = (name: string) => this.children.get(name);
  /** As the fork's `addCardboardButton_` */
  addChild(name: string) {
    const control = new FakeControl();
    this.children.set(name, control);
    return control;
  }
  removeChild = vi.fn((child: FakeControl) => {
    for (const [name, control] of this.children) {
      if (control === child) this.children.delete(name);
    }
  });
}

class FakePlayer extends Emitter implements VrPlayer {
  state = 0;
  controlBar = new FakeBar();
  /** The player's `preload` option: Peek's players start with none */
  preloading = "none";
  forks: FakeFork[] = [];
  vr = vi.fn((_options: VrOptions) => {
    const fork = new FakeFork();
    this.forks.push(fork);
    // As the fork's constructor: it starts on the player's loadedmetadata
    this.on("loadedmetadata", fork.init);
    // Component.dispose drops the listeners the plugin added
    fork.dispose.mockImplementation(() => {
      this.off("loadedmetadata", fork.init);
    });
    return fork;
  });
  readyState = () => this.state;
  play = vi.fn();
  /** Set when video.js's HLS engine (VHS) plays the source */
  vhs: object | undefined = undefined;
  tech = () => ({ vhs: this.vhs });
  source = { src: "/api/scene/1/proxy-stream/stream", type: "video/mp4" };
  currentSource = () => this.source;
  src = vi.fn();
  preload(value?: string): string {
    if (value !== undefined) this.preloading = value;
    return this.preloading;
  }

  get fork(): FakeFork {
    const fork = this.forks.at(-1);
    if (!fork) throw new Error("the fork was never created");
    return fork;
  }
}

describe("peekVr", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is registered on video.js and gives one controller per player", () => {
    const video = document.createElement("video");
    document.body.appendChild(video);
    const player = untrusted<{ peekVr(): unknown; dispose(): void }>(
      videojs(video, { controls: true })
    );

    expect(player.peekVr()).toBe(player.peekVr());
    player.dispose();
  });

  it("enable creates the fork once with the projection and no gallery, then sets the projection", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);

    vr.enable("180_LR");
    vr.enable("360_TB");

    expect(player.vr).toHaveBeenCalledTimes(1);
    const [options] = must(player.vr.mock.calls[0], "player.vr's call");
    expect(options.projection).toBe("180_LR");
    expect(options.enableVRGallery).toBe(false);
    expect(player.fork.setProjection).toHaveBeenCalledWith("360_TB");
    expect(vr.enabled).toBe(true);
  });

  it("turns off the polyfill's device database and wake lock before the fork is created", () => {
    const player = new FakePlayer();
    const seen: Array<{ dpdb: unknown; wake: unknown }> = [];
    player.vr.mockImplementationOnce((_options: VrOptions) => {
      // What the polyfill's constructor would copy at this moment
      seen.push({
        dpdb: polyfillConfig.DPDB_URL,
        wake: polyfillConfig.MOBILE_WAKE_LOCK,
      });
      const fork = new FakeFork();
      player.forks.push(fork);
      return fork;
    });

    createVrController(player).enable("180_LR");

    // No request to dpdb.webvr.rocks and no data: video for a wake lock, so
    // the CSP needs neither connect-src nor media-src data:
    expect(seen).toEqual([{ dpdb: "", wake: false }]);
  });

  it("enable before metadata leaves the start to loadedmetadata", () => {
    const player = new FakePlayer();

    createVrController(player).enable("180_LR");

    expect(player.fork.init).not.toHaveBeenCalled();
  });

  it("enable before metadata asks for it, without playing, and the fork draws once it comes", () => {
    const player = new FakePlayer();

    createVrController(player).enable("180_LR");

    expect(player.preloading).toBe("metadata");
    expect(player.play).not.toHaveBeenCalled();
    expect(player.fork.init).not.toHaveBeenCalled();

    player.state = 1;
    player.trigger("loadedmetadata");

    expect(player.fork.init).toHaveBeenCalledTimes(1);
    expect(player.fork.initialized_).toBe(true);
  });

  it("a native source loads on the preload change: the source is not set again", () => {
    const player = new FakePlayer();

    createVrController(player).enable("180_LR");

    expect(player.src).not.toHaveBeenCalled();
  });

  it("VHS, which decided at the source's load to wait for play, is given the source again", () => {
    const player = new FakePlayer();
    player.vhs = {};
    player.source = {
      src: "/api/scene/1/proxy-stream/stream.m3u8?resolution=STANDARD",
      type: "application/x-mpegURL",
    };

    const preloadAtLoad: string[] = [];
    player.src.mockImplementation(() => {
      preloadAtLoad.push(player.preloading);
    });

    createVrController(player).enable("180_LR");

    // After the preload change, so the new load reads "metadata"
    expect(player.src).toHaveBeenCalledExactlyOnceWith(player.source);
    expect(preloadAtLoad).toEqual(["metadata"]);
    expect(player.play).not.toHaveBeenCalled();
  });

  it("enable with the metadata there leaves the player's preload alone", () => {
    const player = new FakePlayer();
    player.state = 1;

    createVrController(player).enable("180_LR");

    expect(player.preloading).toBe("none");
  });

  it("disable puts back the preload enable changed", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);
    vr.enable("180_LR");

    vr.disable();

    expect(player.preloading).toBe("none");
  });

  it("enable after loadedmetadata initialises at once", () => {
    const player = new FakePlayer();
    player.state = 1;

    createVrController(player).enable("180_LR");

    expect(player.fork.init).toHaveBeenCalledTimes(1);
  });

  it("a projection pick outside XR re-initialises; inside XR it does not", () => {
    const player = new FakePlayer();
    player.state = 4;
    const vr = createVrController(player);
    vr.enable("180_LR");
    const fork = player.fork;

    vr.setProjection("360_TB");
    expect(fork.setProjection).toHaveBeenLastCalledWith("360_TB");
    expect(fork.init).toHaveBeenCalledTimes(2);

    fork.presenting = true;
    vr.setProjection("FISHEYE_200_LR");
    expect(fork.setProjection).toHaveBeenLastCalledWith("FISHEYE_200_LR");
    expect(fork.init).toHaveBeenCalledTimes(2);
  });

  it("a projection pick before the fork has started only sets the projection", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);
    vr.enable("180_LR");

    vr.setProjection("360");

    expect(player.fork.setProjection).toHaveBeenCalledWith("360");
    expect(player.fork.init).not.toHaveBeenCalled();
  });

  it("the video texture is tagged sRGB after initialized", () => {
    const player = new FakePlayer();
    player.state = 1;

    createVrController(player).enable("180_LR");

    expect(player.fork.videoTexture).toEqual({
      colorSpace: "srgb",
      needsUpdate: true,
    });
  });

  it("the video texture is tagged sRGB after loadedmetadata, as when the fork swaps it inside XR", () => {
    const player = new FakePlayer();
    createVrController(player).enable("180_LR");
    // The fork's XR source-change path makes a new texture and returns before
    // triggering initialized
    player.fork.init.mockImplementation(() => {});
    player.fork.videoTexture = texture();

    player.trigger("loadedmetadata");

    expect(player.fork.videoTexture).toEqual({
      colorSpace: "srgb",
      needsUpdate: true,
    });
  });

  it("the poster texture is tagged sRGB when the fork assigns it", () => {
    const player = new FakePlayer();
    createVrController(player).enable("180_LR");
    const fork = player.fork;

    fork.posterTexture = texture();

    expect(fork.posterTexture).toEqual({
      colorSpace: "srgb",
      needsUpdate: true,
    });
    fork.posterTexture = null;
    expect(fork.posterTexture).toBeNull();
  });

  it("a texture already sRGB is left alone", () => {
    const player = new FakePlayer();
    createVrController(player).enable("180_LR");
    const fork = player.fork;
    fork.init.mockImplementation(() => {});
    fork.videoTexture = { colorSpace: "srgb", needsUpdate: false };

    player.trigger("loadedmetadata");

    expect(fork.videoTexture).toEqual({
      colorSpace: "srgb",
      needsUpdate: false,
    });
  });

  it("disable runs the fork's dispose path and stops listening", () => {
    const player = new FakePlayer();
    player.state = 1;
    const vr = createVrController(player);
    vr.enable("180_LR");
    const fork = player.fork;

    vr.disable();

    expect(fork.dispose).toHaveBeenCalledTimes(1);
    expect(player.count("loadedmetadata")).toBe(0);
    expect(vr.enabled).toBe(false);
    vr.setProjection("360");
    expect(fork.setProjection).not.toHaveBeenCalled();
  });

  it("disable removes and disposes the fork's headset button from the control bar", () => {
    const player = new FakePlayer();
    player.state = 1;
    const vr = createVrController(player);
    vr.enable("180_LR");
    // The fork adds it on a phone or where immersive-vr is supported; its
    // reset() looks for it on the player, never the bar, and leaves it
    const headset = player.controlBar.addChild("CardboardButton");

    vr.disable();

    expect(player.controlBar.removeChild).toHaveBeenCalledWith(headset);
    expect(headset.dispose).toHaveBeenCalledTimes(1);
    expect(player.controlBar.getChild("CardboardButton")).toBeUndefined();
  });

  it("disable with no headset button leaves the control bar alone", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);
    vr.enable("180_LR");

    vr.disable();

    expect(player.controlBar.removeChild).not.toHaveBeenCalled();
  });

  it("a fork that cannot be disposed still loses its headset button", () => {
    const player = new FakePlayer();
    player.state = 1;
    const vr = createVrController(player);
    vr.enable("180_LR");
    const headset = player.controlBar.addChild("CardboardButton");
    player.fork.dispose.mockImplementation(() => {
      throw new Error("canvas already removed");
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    vr.disable();

    expect(headset.dispose).toHaveBeenCalledTimes(1);
    expect(player.controlBar.getChild("CardboardButton")).toBeUndefined();
  });

  it("enable after disable starts a new fork from the flat view", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);
    vr.enable("180_LR");
    vr.disable();

    vr.enable("360_TB");

    expect(player.vr).toHaveBeenCalledTimes(2);
    const [options] = must(player.vr.mock.lastCall, "player.vr's last call");
    expect(options.projection).toBe("360_TB");
    expect(options.enableVRGallery).toBe(false);
  });

  it("disable when VR is off does nothing", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);

    expect(() => {
      vr.disable();
    }).not.toThrow();
    expect(player.vr).not.toHaveBeenCalled();
  });
});

describe("peekVr: a view that cannot start", () => {
  /** What the fork does when WebGL is missing: it throws inside init */
  const noWebGl = () =>
    new Error("THREE.WebGLRenderer: Error creating WebGL context.");

  it("the fork's own start is replaced by one that runs once per loadedmetadata", () => {
    const player = new FakePlayer();
    createVrController(player).enable("180_LR");

    player.state = 1;
    player.trigger("loadedmetadata");

    expect(player.fork.init).toHaveBeenCalledTimes(1);
    expect(player.count("loadedmetadata")).toBe(2);
  });

  it("a start that throws on loadedmetadata disposes the fork, puts the preload back and tells the handler", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);
    const failed = vi.fn();
    vr.onFailure(failed);
    vr.enable("180_LR");
    const fork = player.fork;
    const error = noWebGl();
    fork.init.mockImplementationOnce(() => {
      throw error;
    });
    // The fork only resets a view it finished: dispose must find it marked so
    const initializedAtDispose: Array<boolean> = [];
    fork.dispose.mockImplementation(() => {
      initializedAtDispose.push(fork.initialized_);
    });

    player.state = 1;
    expect(() => {
      player.trigger("loadedmetadata");
    }).not.toThrow();

    expect(failed).toHaveBeenCalledExactlyOnceWith(error);
    expect(fork.dispose).toHaveBeenCalledTimes(1);
    expect(initializedAtDispose).toEqual([true]);
    expect(vr.enabled).toBe(false);
    expect(player.preloading).toBe("none");
    expect(player.count("loadedmetadata")).toBe(0);
  });

  it("a start that throws inside enable (the metadata was there) fails the same way", () => {
    const player = new FakePlayer();
    player.state = 1;
    const vr = createVrController(player);
    const failed = vi.fn();
    vr.onFailure(failed);
    player.vr.mockImplementationOnce((_options: VrOptions) => {
      const fork = new FakeFork();
      fork.init.mockImplementation(() => {
        throw noWebGl();
      });
      player.forks.push(fork);
      return fork;
    });

    expect(() => {
      vr.enable("180_LR");
    }).not.toThrow();

    expect(failed).toHaveBeenCalledTimes(1);
    expect(player.fork.dispose).toHaveBeenCalledTimes(1);
    expect(vr.enabled).toBe(false);
  });

  it("a re-initialise that throws on a projection pick fails the same way", () => {
    const player = new FakePlayer();
    player.state = 4;
    const vr = createVrController(player);
    const failed = vi.fn();
    vr.onFailure(failed);
    vr.enable("180_LR");
    player.fork.init.mockImplementationOnce(() => {
      throw noWebGl();
    });

    expect(() => {
      vr.setProjection("360_TB");
    }).not.toThrow();

    expect(failed).toHaveBeenCalledTimes(1);
    expect(vr.enabled).toBe(false);
  });

  it("a fork that cannot be disposed after a failed start still ends VR", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);
    vr.enable("180_LR");
    player.fork.init.mockImplementationOnce(() => {
      throw noWebGl();
    });
    // reset() reaches the half-built canvas that is not in the page
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    player.fork.dispose.mockImplementation(() => {
      throw new TypeError("Cannot read properties of null");
    });

    player.state = 1;
    expect(() => {
      player.trigger("loadedmetadata");
    }).not.toThrow();

    expect(vr.enabled).toBe(false);
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("after a failure the next enable starts a new fork", () => {
    const player = new FakePlayer();
    player.state = 1;
    const vr = createVrController(player);
    player.vr.mockImplementationOnce((_options: VrOptions) => {
      const fork = new FakeFork();
      fork.init.mockImplementation(() => {
        throw noWebGl();
      });
      player.forks.push(fork);
      return fork;
    });
    vr.enable("180_LR");

    vr.enable("180_LR");

    expect(player.vr).toHaveBeenCalledTimes(2);
    expect(vr.enabled).toBe(true);
  });

  it("a failure with no handler set does not throw", () => {
    const player = new FakePlayer();
    player.state = 1;
    player.vr.mockImplementationOnce((_options: VrOptions) => {
      const fork = new FakeFork();
      fork.init.mockImplementation(() => {
        throw noWebGl();
      });
      player.forks.push(fork);
      return fork;
    });

    expect(() => {
      createVrController(player).enable("180_LR");
    }).not.toThrow();
  });

  it("video.js removes a plugin's own start by the function it registered", () => {
    // The fork registers `this.on(player, "loadedmetadata", this.init)`; the
    // controller takes it off with `player.off("loadedmetadata", fork.init)`
    const Plugin = videojs.getPlugin("plugin") as unknown as new (
      player: object
    ) => object;
    const started = vi.fn();
    class Fork extends Plugin {
      init = () => {
        started();
      };

      constructor(player: object) {
        super(player);
        (
          this as unknown as {
            on(target: object, type: string, fn: () => void): void;
          }
        ).on(player, "loadedmetadata", this.init);
      }
    }
    videojs.registerPlugin("peekTestFork", Fork);
    const video = document.createElement("video");
    document.body.appendChild(video);
    const player = untrusted<{
      peekTestFork(): { init: () => void };
      off(type: string, fn: () => void): void;
      trigger(type: string): void;
      dispose(): void;
    }>(videojs(video));
    const fork = player.peekTestFork();

    // Registered: the event reaches it
    player.trigger("loadedmetadata");
    expect(started).toHaveBeenCalledTimes(1);

    player.off("loadedmetadata", fork.init);
    player.trigger("loadedmetadata");

    expect(started).toHaveBeenCalledTimes(1);
    player.dispose();
  });
});

describe("peekVr: the headset HUD", () => {
  const optionsOf = (player: FakePlayer): VrOptions =>
    must(player.vr.mock.calls[0], "player.vr's call")[0];

  const hud = () => ({
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onFavorite: vi.fn(),
  });

  it("gives the fork next, previous and favourite callbacks", () => {
    const player = new FakePlayer();
    createVrController(player).enable("180_LR");

    const options = optionsOf(player);
    expect(options.onNext).toBeTypeOf("function");
    expect(options.onPrevious).toBeTypeOf("function");
    // With onFavorite the fork draws the HUD's favourite button
    expect(options.onFavorite).toBeTypeOf("function");
    // Pressed before any handler is set: nothing happens
    expect(() => options.onNext?.()).not.toThrow();
  });

  it("the HUD's buttons call the handlers set last, not those at creation", () => {
    const player = new FakePlayer();
    const vr = createVrController(player);
    const first = hud();
    const latest = hud();
    vr.setHud(first);
    vr.enable("180_LR");
    vr.setHud(latest);

    const options = optionsOf(player);
    options.onNext?.();
    options.onPrevious?.();
    options.onFavorite?.();

    expect(latest.onNext).toHaveBeenCalledTimes(1);
    expect(latest.onPrevious).toHaveBeenCalledTimes(1);
    expect(latest.onFavorite).toHaveBeenCalledTimes(1);
    expect(first.onNext).not.toHaveBeenCalled();
    expect(first.onPrevious).not.toHaveBeenCalled();
    expect(first.onFavorite).not.toHaveBeenCalled();
  });

  it("shows the favourite set before enable once the fork has built its HUD", () => {
    const player = new FakePlayer();
    player.state = 1;
    const vr = createVrController(player);
    vr.setFavorite(true);
    vr.enable("180_LR");

    expect(player.fork.setFavoriteState).toHaveBeenLastCalledWith(true);
  });

  it("follows each change, and shows it again on a rebuilt HUD", () => {
    const player = new FakePlayer();
    player.state = 1;
    const vr = createVrController(player);
    vr.enable("180_LR");

    vr.setFavorite(true);
    expect(player.fork.setFavoriteState).toHaveBeenLastCalledWith(true);
    vr.setFavorite(false);
    expect(player.fork.setFavoriteState).toHaveBeenLastCalledWith(false);

    // The next source's loadedmetadata: the fork builds a new HUD
    player.fork.setFavoriteState.mockClear();
    player.fork.init();
    expect(player.fork.setFavoriteState).toHaveBeenCalledWith(false);
  });

  it("a favourite set while off creates no fork", () => {
    const player = new FakePlayer();
    createVrController(player).setFavorite(true);
    expect(player.vr).not.toHaveBeenCalled();
  });
});
