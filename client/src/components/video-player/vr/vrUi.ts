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
 */
import { VR_PROJECTIONS, type VrProjection } from "@peek/shared-types";
import {
  type BarControl,
  type ControlBarPlayer,
  addOrderedControl,
} from "../controlBarOrder";
import { VR_BUTTON_NAME, VrMenuButton } from "./VrControls";
import { loadVr, prefetchVr } from "./loadVr";
import type { PeekVr } from "./vrPlugin";

/** The part of the player VR mode uses (video.js types it `any`). */
export interface VrModePlayer {
  controlBar: {
    removeChild(child: unknown): void;
  };
  isDisposed(): boolean;
  /** Registered by `vrPlugin`, so present only after `loadVr()`. */
  peekVr?: () => PeekVr;
}

/** What VR mode needs from the page, given again on each change. */
export interface VrModeInputs {
  /** The scene's detected projection (`scene.vr.projection`) */
  detected: VrProjection;
  /** Where the user's pick for this scene is kept; null with no user */
  storageKey: string | null;
}

export interface VrMode {
  /** Another scene, or another user key: its projection, kept in VR. */
  update(inputs: VrModeInputs): void;
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

/** Puts the VR button on `player` and runs VR mode until `detach()`. */
export function attachVrMode(
  player: VrModePlayer,
  initial: VrModeInputs
): VrMode {
  let inputs = initial;
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
      player.peekVr?.().enable(view.projection);
      view.enabled = true;
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
      if (
        next.detected === inputs.detected &&
        next.storageKey === inputs.storageKey
      ) {
        return;
      }
      inputs = next;
      view.projection = readChoice(next.storageKey) ?? next.detected;
      if (view.enabled) player.peekVr?.().setProjection(view.projection);
      refresh();
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
