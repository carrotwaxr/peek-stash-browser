/**
 * `peekVr`: Peek's thin layer over `@blaineam/videojs-vr` (the fork, which
 * bundles three.js). It turns the fork on with a projection, changes the
 * projection, turns it off again, and tags the fork's textures sRGB.
 *
 * This module is the fork's only importer, and only `loadVr.ts` imports this
 * module (lint), through `import()`: it and the fork make the lazy `vr` chunk.
 * Other code reaches the plugin as `player.peekVr()` after `loadVr()`.
 */
import "@blaineam/videojs-vr";
import type { VrOptions, VrPlugin, VrTexture } from "@blaineam/videojs-vr";
import type { VrProjection } from "@peek/shared-types";
import videojs from "video.js";

/** The part of a video.js player the plugin uses (video.js types it `any`). */
export interface VrPlayer {
  /** The fork's plugin: creates its instance on the first call. */
  vr(options: VrOptions): VrPlugin;
  readyState(): number;
  on(type: string, listener: () => void): void;
  off(type: string, listener: () => void): void;
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
  readonly enabled: boolean;
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
      fork = player.vr({ projection, enableVRGallery: false });
      tagPosterOnAssignment(fork);
      fork.on("initialized", fixVideoTexture);
      player.on("loadedmetadata", fixVideoTexture);
      // The fork starts on `loadedmetadata`. Peek's players preload nothing,
      // and a click during playback comes after it: start now when the
      // metadata is already there
      if (player.readyState() >= 1) fork.init();
    },
    setProjection,
    disable() {
      if (!fork) return;
      player.off("loadedmetadata", fixVideoTexture);
      const ending = fork;
      fork = null;
      // The fork's dispose runs reset(): the canvas, the VR big play button and
      // the headset session go, the video shows again, and `player.vr` makes a
      // fresh instance next time
      ending.dispose();
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
