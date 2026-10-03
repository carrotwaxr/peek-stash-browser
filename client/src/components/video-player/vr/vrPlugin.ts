/**
 * `peekVr`: Peek's thin layer over `@blaineam/videojs-vr` (the fork, which
 * bundles three.js). It turns the fork on with a projection, changes the
 * projection, turns it off again, and tags the fork's textures sRGB. The
 * headset HUD's next, previous and favourite buttons call Peek's handlers,
 * and its favourite shows the viewer's own.
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
}

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
  /** Disposes the fork: the canvas goes and the flat video shows again. */
  disable(): void;
  /** What the HUD's next, previous and favourite do; the last given wins. */
  setHud(hud: VrHud): void;
  /** The favourite the HUD shows, kept across the HUDs the fork rebuilds. */
  setFavorite(favorite: boolean): void;
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

  const setProjection = (projection: VrProjection) => {
    if (!fork) return;
    fork.setProjection(projection);
    // The fork rebuilds the mesh at once only inside a headset session; on the
    // page the new projection would wait for the next source load
    if (fork.initialized_ && !fork.isPresenting()) fork.init();
  };

  return {
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
      fork.on("initialized", fixVideoTexture);
      fork.on("initialized", showFavorite);
      player.on("loadedmetadata", fixVideoTexture);
      // The fork starts on `loadedmetadata`. A click during playback comes
      // after it: start now when the metadata is already there
      if (player.readyState() >= 1) {
        fork.init();
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
      player.off("loadedmetadata", fixVideoTexture);
      if (preloadBefore !== null) player.preload(preloadBefore);
      preloadBefore = null;
      const ending = fork;
      fork = null;
      // The fork's dispose runs reset(): the canvas, the VR big play button and
      // the headset session go, the video shows again, and `player.vr` makes a
      // fresh instance next time
      ending.dispose();
    },
    setHud(next) {
      hud = next;
    },
    setFavorite(next) {
      favorite = next;
      showFavorite();
    },
    get enabled() {
      return fork !== null;
    },
  };
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
