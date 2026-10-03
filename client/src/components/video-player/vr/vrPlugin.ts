/**
 * `peekVr`: Peek's thin layer over `@blaineam/videojs-vr` (the fork, which
 * bundles three.js). It turns the fork on with a projection, changes the
 * projection, turns it off again, and tags the fork's textures sRGB. The
 * headset HUD's next, previous and favourite buttons call Peek's handlers,
 * and its favourite shows the viewer's own. A view that cannot start (no
 * WebGL context) is taken down again and reported, the flat video untouched.
 *
 * This module is the fork's only importer, and only `loadVr.ts` imports this
 * module (lint), through `import()`: it and the fork make the lazy `vr` chunk.
 * Other code reaches the plugin as `player.peekVr()` after `loadVr()`.
 */
import "@blaineam/videojs-vr";
import type { VrOptions, VrPlugin, VrTexture } from "@blaineam/videojs-vr";
import type { VrProjection } from "@peek/shared-types";
import videojs from "video.js";
import polyfillConfig from "webvr-polyfill/src/config";

/** The part of a video.js player the plugin uses (video.js types it `any`). */
export interface VrPlayer {
  /** The fork's plugin: creates its instance on the first call. */
  vr(options: VrOptions): VrPlugin;
  readyState(): number;
  /** The media element's `preload`: Peek's players start with "none" */
  preload(): string;
  preload(value: string): void;
  /** `vhs` is set while video.js's HLS engine plays the source */
  tech(options: { IWillNotUseThisInPlugins: true }): { vhs?: unknown };
  currentSource(): object;
  src(source: object): void;
  on(type: string, listener: () => void): void;
  off(type: string, listener: () => void): void;
  /** Where the fork adds its headset (Cardboard) button */
  controlBar: {
    getChild(name: string): { dispose(): void } | undefined;
    removeChild(child: { dispose(): void }): void;
  };
}

/** The fork's headset button: it enters VR in a headset or a Cardboard */
const HEADSET_BUTTON = "CardboardButton";

/** What the headset HUD's buttons do. */
export interface VrHud {
  onNext(): void;
  onPrevious(): void;
  onFavorite(): void;
}

export interface PeekVr {
  /**
   * Shows the player in 3D with `projection`; when already on, only changes
   * the projection.
   */
  enable(projection: VrProjection): void;
  /** Changes the projection, on the page and in a headset. No-op while off. */
  setProjection(projection: VrProjection): void;
  /**
   * Disposes the fork: the canvas and its headset button go, and the flat
   * video shows again.
   */
  disable(): void;
  /** What the HUD's next, previous and favourite do; the last given wins. */
  setHud(hud: VrHud): void;
  /** The favourite the HUD shows, kept across the HUDs the fork rebuilds. */
  setFavorite(favorite: boolean): void;
  /**
   * Called, with the error, after a start failed (the fork threw while
   * building its renderer) and VR was taken down: `enabled` is false again.
   * It can run inside `enable()` or later, on `loadedmetadata`. The last
   * handler given wins.
   */
  onFailure(handler: (error: unknown) => void): void;
  readonly enabled: boolean;
}

/**
 * The fork builds a `webvr-polyfill` in its constructor, which on a phone
 * without WebXR makes a Cardboard display. By default that fetches Google's
 * device database from dpdb.webvr.rocks (a dead third-party host) and plays a
 * `data:` video as a screen wake lock. Peek's CSP allows neither, and neither
 * is wanted: the polyfill reads these defaults when it is constructed, so
 * they are set before `player.vr()`.
 */
function silencePolyfill() {
  polyfillConfig.DPDB_URL = "";
  polyfillConfig.MOBILE_WAKE_LOCK = false;
}

/**
 * The fork creates its textures without a colour space, so three.js treats
 * the sRGB video as linear and encodes it a second time on output: the picture
 * is washed out. Stash applies the same fix (stash#7248).
 */
function tagSrgb(texture: VrTexture | null | undefined) {
  if (texture && texture.colorSpace !== "srgb") {
    texture.colorSpace = "srgb";
    texture.needsUpdate = true;
  }
}

/**
 * The fork loads the poster texture asynchronously, with no event, and puts it
 * on the materials as soon as it is assigned: tag it on assignment.
 */
function tagPosterOnAssignment(fork: VrPlugin) {
  let poster = fork.posterTexture ?? null;
  Object.defineProperty(fork, "posterTexture", {
    configurable: true,
    enumerable: true,
    get: () => poster,
    set: (texture: VrTexture | null) => {
      tagSrgb(texture);
      poster = texture;
    },
  });
}

export function createVrController(player: VrPlayer): PeekVr {
  let fork: VrPlugin | null = null;
  let hud: VrHud | null = null;
  /** The `preload` enable replaced, put back by disable */
  let preloadBefore: string | null = null;
  let favorite = false;
  let failed: ((error: unknown) => void) | null = null;

  // The fork builds a new HUD on each `init()` (a new source), with the
  // favourite button unset
  const showFavorite = () => {
    fork?.setFavoriteState(favorite);
  };

  // `init()` makes a new video texture. Inside a headset session it returns
  // before `initialized`, so the fork's own loadedmetadata handler (which runs
  // before this one, being added first) is covered too.
  const fixVideoTexture = () => {
    tagSrgb(fork?.videoTexture);
  };

  // The fork's `init()` throws when the browser cannot make a WebGL context,
  // after it has swapped the big play button. Run on `loadedmetadata`, where
  // video.js would only log the error, it takes VR down and reports instead
  const startFork = () => {
    const starting = fork;
    if (!starting) return;
    try {
      starting.init();
    } catch (error) {
      // `reset()` (so `dispose()`) does nothing for a view `init()` did not
      // finish, and would leave the VR play button in place of the video's
      starting.initialized_ = true;
      controller.disable();
      failed?.(error);
    }
  };

  const setProjection = (projection: VrProjection) => {
    if (!fork) return;
    fork.setProjection(projection);
    // The fork rebuilds the mesh at once only inside a headset session; on the
    // page the new projection would wait for the next source load
    if (fork.initialized_ && !fork.isPresenting()) startFork();
  };

  const controller: PeekVr = {
    enable(projection) {
      if (fork) {
        setProjection(projection);
        return;
      }
      silencePolyfill();
      // The fork keeps these callbacks for its life: they call whatever
      // `setHud` gave last
      fork = player.vr({
        projection,
        enableVRGallery: false,
        onNext: () => hud?.onNext(),
        onPrevious: () => hud?.onPrevious(),
        onFavorite: () => hud?.onFavorite(),
      });
      tagPosterOnAssignment(fork);
      // The fork starts itself on `loadedmetadata` through its own handler,
      // which video.js matches by function: take it off, and run `startFork`
      // in its place (added before `fixVideoTexture`, as the fork's was)
      player.off("loadedmetadata", fork.init);
      player.on("loadedmetadata", startFork);
      fork.on("initialized", fixVideoTexture);
      fork.on("initialized", showFavorite);
      player.on("loadedmetadata", fixVideoTexture);
      // The fork starts on `loadedmetadata`. A click during playback comes
      // after it: start now when the metadata is already there
      if (player.readyState() >= 1) {
        startFork();
      } else if (player.preload() === "none") {
        // Peek's players preload nothing, so before play the fork would wait
        // for play to draw. Asking for the metadata brings the canvas at the
        // click; nothing plays, and a seek waiting for the metadata (the
        // resume point) still applies
        preloadBefore = player.preload();
        player.preload("metadata");
        // A native source (Direct, Safari's HLS) loads on that change. VHS
        // (HLS elsewhere) decided at the source's load to wait for play: it
        // gets the source again, and with it the new preload
        if (player.tech({ IWillNotUseThisInPlugins: true }).vhs) {
          player.src(player.currentSource());
        }
      }
    },
    setProjection,
    disable() {
      if (!fork) return;
      player.off("loadedmetadata", startFork);
      player.off("loadedmetadata", fixVideoTexture);
      if (preloadBefore !== null) player.preload(preloadBefore);
      preloadBefore = null;
      const ending = fork;
      fork = null;
      // The fork's dispose runs reset(): the canvas, the VR big play button and
      // the headset session go, the video shows again, and `player.vr` makes a
      // fresh instance next time
      try {
        ending.dispose();
      } catch (error) {
        // After a failed start `reset()` can reach a canvas that is no longer
        // in the page; the fork is disposed by then, and the video shows
        console.error("[VR] could not tidy up after a failed start", error);
      }
      // The fork adds its headset button to the control bar (on a phone, or
      // where immersive-vr is supported) but its reset() looks for it on the
      // player and leaves it: pressed, it would make a fork Peek never sees
      const headset = player.controlBar.getChild(HEADSET_BUTTON);
      if (headset) {
        player.controlBar.removeChild(headset);
        headset.dispose();
      }
    },
    setHud(next) {
      hud = next;
    },
    setFavorite(next) {
      favorite = next;
      showFavorite();
    },
    onFailure(handler) {
      failed = handler;
    },
    get enabled() {
      return fork !== null;
    },
  };
  return controller;
}

const controllers = new WeakMap<object, PeekVr>();

function peekVr(this: VrPlayer): PeekVr {
  let controller = controllers.get(this);
  if (!controller) {
    controller = createVrController(this);
    controllers.set(this, controller);
  }
  return controller;
}

videojs.registerPlugin("peekVr", peekVr);
