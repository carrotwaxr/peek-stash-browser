/**
 * VR mode on one player: the VR button, the prefetch of the VR chunk, the
 * choice of projection, and turning the 3D view on and off.
 *
 * This module and `VrControls` are the small `vr-ui` chunk: `useVrMode`
 * (which loads with the Scene page) imports it with `import()` only when the
 * scene is VR, so a page without a VR scene never fetches it. Lint refuses a
 * static import of this module, and of `VrControls` anywhere but here.
 *
 * The fork, three.js and `peekVr` are the separate, large `vr` chunk,
 * reached only through `loadVr()`: where the browser can enter a headset
 * (`isSessionSupported`) it is fetched ahead, elsewhere at the first VR click.
 *
 * In a headset the fork's HUD steps the queue and toggles the viewer's
 * favourite through the handlers `useVrMode` gives here, and shows the
 * favourite it is told.
 *
 * In Safari, turning VR on while native HLS plays moves to the Direct source
 * (`preferDirect`).
 */
import { VR_PROJECTIONS, type VrProjection } from "@peek/shared-types";
import videojs from "video.js";
import {
  type BarControl,
  type ControlBarPlayer,
  addOrderedControl,
} from "../controlBarOrder";
import type { PlayerSource } from "../playerSources";
import { VR_BUTTON_NAME, VrMenuButton } from "./VrControls";
import { loadVr, prefetchVr } from "./loadVr";
import type { PeekVr, VrHud } from "./vrPlugin";

/** The parts of the source selector plugin VR mode reads. */
interface SourceSelector {
  /** The source menu: one item per player source, in the player's order */
  menu: {
    items: Array<{ source: PlayerSource; hasClass(name: string): boolean }>;
  };
  /** The user's pick: loads at the current time, playing on if it was */
  fallback: { select(source: PlayerSource): void };
}

/** The part of the player VR mode uses (video.js types it `any`). */
export interface VrModePlayer {
  controlBar: {
    removeChild(child: unknown): void;
  };
  isDisposed(): boolean;
  currentSrc(): string;
  /** The `sourceSelector` plugin, absent on a player without it */
  sourceSelector?: () => SourceSelector;
  /** Registered by `vrPlugin`, so present only after `loadVr()`. */
  peekVr?: () => PeekVr;
}

/** What VR mode needs from the page, given again on each change. */
export interface VrModeInputs {
  /** The scene's detected projection (`scene.vr.projection`) */
  detected: VrProjection;
  /** Where the user's pick for this scene is kept; null with no user */
  storageKey: string | null;
  /** `canDecode` on the scene's file: true, false, or null (cannot tell) */
  decodes: boolean | null;
}

export interface VrMode {
  /**
   * The page's inputs, given after each render: another scene or user key
   * applies its projection, kept in VR; the file's decode check is kept for
   * the next time VR turns on.
   */
  update(inputs: VrModeInputs): void;
  /** The viewer's favourite on the scene, for the HUD to show. */
  setFavorite(favorite: boolean): void;
  /** Turns VR off and removes the button (nothing to do on a disposed player). */
  detach(): void;
}

interface XrNavigator {
  xr?: { isSessionSupported(mode: string): Promise<boolean> };
}

function readChoice(key: string | null): VrProjection | null {
  if (!key) return null;
  try {
    const stored = localStorage.getItem(key);
    return (VR_PROJECTIONS as readonly (string | null)[]).includes(stored)
      ? (stored as VrProjection)
      : null;
  } catch {
    return null;
  }
}

function writeChoice(key: string | null, projection: VrProjection) {
  if (!key) return;
  try {
    localStorage.setItem(key, projection);
  } catch {
    // Storage is blocked: the pick lasts until the page closes
  }
}

/** The path of a source address, absolute (signed) or not (session). */
const pathOf = (src: string) => new URL(src, window.location.href).pathname;

/**
 * Safari plays HLS natively, and a native HLS video drawn into WebGL can
 * show black frames (Vision Pro), so entering VR there moves from HLS to the
 * Direct source, the file itself, at the same time, when `canDecode` says
 * the browser decodes the file. Direct is whatever entry the player was
 * given: C6's signed one from the media link, or the session path when the
 * link failed; nothing is built here. A Direct that has already failed is
 * not tried again. Leaving VR keeps Direct. Same rule as `isDirectSource`
 * (which lives in the Scene chunk), without MKV, which Safari does not play.
 */
function preferDirect(player: VrModePlayer, decodes: boolean | null) {
  if (!videojs.browser.IS_SAFARI || decodes !== true) return;
  if (!pathOf(player.currentSrc()).endsWith("/stream.m3u8")) return;
  const selector = player.sourceSelector?.();
  const direct = selector?.menu.items.find(({ source }) =>
    pathOf(source.src).endsWith("/proxy-stream/stream")
  );
  if (!selector || !direct || direct.hasClass("vjs-source-menu-item-error")) {
    return;
  }
  selector.fallback.select(direct.source);
}

/** Fetches the VR chunk ahead where a headset can run. */
function prefetchWhereHeadsetsRun(run: { cancelled: boolean }) {
  void (async () => {
    try {
      const xr = (navigator as XrNavigator).xr;
      if (!xr || !(await xr.isSessionSupported("immersive-vr"))) return;
      if (!run.cancelled) prefetchVr();
    } catch {
      // No headset support: the first VR click loads the chunk
    }
  })();
}

/**
 * Puts the VR button on `player` and runs VR mode until `detach()`. `hud` is
 * what the headset HUD's buttons do; its functions are called afresh on each
 * press, so they can reach the page's latest handlers.
 */
export function attachVrMode(
  player: VrModePlayer,
  initial: VrModeInputs,
  hud: VrHud
): VrMode {
  let inputs = initial;
  let favorite = false;
  let alive = true;
  let loading = false;
  const run = { cancelled: false };
  prefetchWhereHeadsetsRun(run);

  // What the button shows and its callbacks act on: the 3D view's state and
  // the projection to use (the user's pick, else the detected one)
  const view = {
    enabled: false,
    projection: readChoice(inputs.storageKey) ?? inputs.detected,
  };

  let button: VrMenuButton | null = null;
  const refresh = () => button?.refresh();

  const toggle = async () => {
    if (view.enabled) {
      player.peekVr?.().disable();
      view.enabled = false;
      refresh();
      return;
    }
    if (loading) return;
    loading = true;
    try {
      await loadVr();
      if (!alive || player.isDisposed()) return;
      const vr = player.peekVr?.();
      if (!vr) return;
      vr.setHud(hud);
      vr.setFavorite(favorite);
      vr.enable(view.projection);
      view.enabled = true;
      preferDirect(player, inputs.decodes);
    } catch (error) {
      // Stays flat; the next click tries again
      console.error("[VR] could not start", error);
    } finally {
      loading = false;
    }
    refresh();
  };

  const choose = (projection: VrProjection) => {
    view.projection = projection;
    writeChoice(inputs.storageKey, projection);
    if (view.enabled) player.peekVr?.().setProjection(projection);
    refresh();
  };

  button = new VrMenuButton(player, {
    state: () => ({ ...view, secure: window.isSecureContext }),
    onToggle: () => void toggle(),
    onProjection: choose,
  });
  addOrderedControl(
    player as unknown as ControlBarPlayer,
    VR_BUTTON_NAME,
    button as unknown as BarControl
  );

  return {
    update(next) {
      const same =
        next.detected === inputs.detected &&
        next.storageKey === inputs.storageKey;
      inputs = next;
      if (same) return;
      view.projection = readChoice(next.storageKey) ?? next.detected;
      if (view.enabled) player.peekVr?.().setProjection(view.projection);
      refresh();
    },
    setFavorite(next) {
      favorite = next;
      if (view.enabled) player.peekVr?.().setFavorite(next);
    },
    detach() {
      alive = false;
      run.cancelled = true;
      const shown = button;
      button = null;
      // A disposed player took the button, the fork and the view with it
      if (!shown || player.isDisposed()) return;
      if (view.enabled) player.peekVr?.().disable();
      view.enabled = false;
      player.controlBar.removeChild(shown);
      shown.dispose();
    },
  };
}
