/**
 * Types for `@blaineam/videojs-vr`, which ships none. Importing the package
 * registers its `vr` plugin on video.js (`player.vr(options)` creates the
 * instance, `player.vr()` returns it). Only what Peek uses is declared, from
 * the pinned version's `src/plugin.js`; three.js objects are reduced to the
 * fields Peek touches. Only `vr/vrPlugin.ts` imports the package (lint).
 */
declare module "@blaineam/videojs-vr" {
  /** The projection names the fork accepts (`src/utils.js` `validProjections`). */
  export type VrProjectionType =
    | "NONE"
    | "AUTO"
    | "180"
    | "180_LR"
    | "180_MONO"
    | "360"
    | "360_LR"
    | "360_TB"
    | "360_CUBE"
    | "EAC"
    | "EAC_LR"
    | "SBS_MONO"
    | "FISHEYE_180"
    | "FISHEYE_180_LR"
    | "FISHEYE_200"
    | "FISHEYE_200_LR"
    | "FISHEYE_220"
    | "FISHEYE_220_LR"
    | "FISHEYE_360"
    | "FISHEYE_360_LR";

  /** A three.js texture, as far as the colour-space fix needs it. */
  export interface VrTexture {
    colorSpace: string;
    needsUpdate: boolean;
  }

  export interface VrOptions {
    projection?: VrProjectionType;
    /** The in-headset control bar (on by default). */
    enableVRHUD?: boolean;
    /** The in-headset media gallery (on by default; Peek turns it off). */
    enableVRGallery?: boolean;
    /**
     * The HUD's buttons. The fork reads these once, when `player.vr()`
     * creates it; `onFavorite` also makes the HUD draw its favourite button.
     */
    onNext?: (() => void) | null;
    onPrevious?: (() => void) | null;
    onFavorite?: (() => void) | null;
  }

  /** The plugin instance `player.vr(options)` creates. */
  export interface VrPlugin {
    /**
     * Sets the projection for the next `init()`; rebuilds the mesh at once
     * only while a headset session is presenting.
     */
    setProjection(projection: VrProjectionType): void;
    /**
     * Builds the renderer for the current video. The fork runs it on each
     * `loadedmetadata`; inside a headset session it only swaps the texture and
     * returns before `initialized`.
     */
    init(): void;
    /** Removes the canvas and restores the flat video. */
    reset(): void;
    /** Ends the plugin: `reset()`, and `player.vr` creates a new one again. */
    dispose(): void;
    isPresenting(): boolean;
    /** The HUD's favourite button; lost when `init()` builds a new HUD. */
    setFavoriteState(isFavorited: boolean): void;
    /** Plugin events: `initialized`, `vr-next`, `vr-previous`, `vr-favorite`. */
    on(type: string, listener: () => void): void;
    off(type: string, listener: () => void): void;
    /** Set by `init()`, cleared by `reset()`. */
    readonly initialized_?: boolean;
    videoTexture?: VrTexture | undefined;
    posterTexture?: VrTexture | null;
  }

  const VR: unknown;
  export default VR;
}

/**
 * The defaults `webvr-polyfill` (the fork's dependency) copies when it is
 * constructed. Only the two Peek sets are declared; v0.10.12 `src/config.js`.
 */
declare module "webvr-polyfill/src/config" {
  const config: {
    /** The device database URL; falsy means no request is made. */
    DPDB_URL: string;
    /** Plays a `data:` video on phones to keep the screen awake. */
    MOBILE_WAKE_LOCK: boolean;
  };
  export default config;
}
