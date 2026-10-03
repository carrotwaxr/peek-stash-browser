/**
 * VR mode for the player: the VR button on a VR scene, the choice of
 * projection, and turning the 3D view on and off.
 *
 * What stays out of the Scene chunk: the fork, three.js and `peekVr` itself
 * (the lazy `vr` chunk, reached only through `loadVr()`). This hook, the
 * button (`VrControls`) and `loadVr` are small and load with the page.
 *
 * - The button shows when the scene's lookup says it is VR (`scene.vr`) and
 *   TV mode is off. It is added with `addOrderedControl`, so it keeps its
 *   place before AirPlay and Cast whichever loads first.
 * - Where the browser can enter a headset (`isSessionSupported`) the chunk is
 *   fetched ahead; elsewhere it loads at the first VR click.
 * - The projection is the scene's detected one, or the user's own pick for
 *   this scene on this device (localStorage, per user, scene and instance).
 */
import { type RefObject, useEffect, useRef } from "react";
import {
  type SceneVr,
  VR_PROJECTIONS,
  type VrProjection,
} from "@peek/shared-types";
import { useAuth } from "../../../hooks/useAuth";
import { useTVMode } from "../../../hooks/useTVMode";
import {
  type BarControl,
  type ControlBarPlayer,
  addOrderedControl,
} from "../controlBarOrder";
import { VR_BUTTON_NAME, VrMenuButton } from "./VrControls";
import { loadVr, prefetchVr } from "./loadVr";
import type { PeekVr } from "./vrPlugin";

/** The part of the player this hook uses (video.js types it `any`). */
interface VrModePlayer {
  controlBar: {
    removeChild(child: unknown): void;
  };
  isDisposed(): boolean;
  /** Registered by `vrPlugin`, so present only after `loadVr()`. */
  peekVr?: () => PeekVr;
}

interface XrNavigator {
  xr?: { isSessionSupported(mode: string): Promise<boolean> };
}

/** Where a user's pick for one scene on one instance is kept. */
const choiceKey = (userId: number | string, sceneKey: string) =>
  `peek.vr.${userId}.${sceneKey}`;

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

/** The part of the scene this hook reads. */
export interface VrModeScene {
  vr?: SceneVr | null;
}

export function useVrMode({
  playerRef,
  scene,
  sceneKey,
}: {
  playerRef: RefObject<unknown>;
  scene: VrModeScene | null | undefined;
  /** The scene's `makeCompositeKey(id, instanceId)`; undefined with no scene */
  sceneKey: string | undefined;
}) {
  const { isTVMode } = useTVMode();
  const { user } = useAuth();
  const userId = user?.id;

  const detected = scene?.vr?.projection ?? null;
  const showButton = detected !== null && !isTVMode;
  const storageKey =
    userId !== undefined && sceneKey ? choiceKey(userId, sceneKey) : null;

  // What the button shows and its callbacks act on: the 3D view's state and
  // the projection to use (the user's pick, else the detected one)
  const view = useRef<{ enabled: boolean; projection: VrProjection }>({
    enabled: false,
    projection: "180_LR",
  });
  const latest = useRef({ detected, storageKey });
  const buttonRef = useRef<VrMenuButton | null>(null);

  useEffect(() => {
    latest.current = { detected, storageKey };
  }, [detected, storageKey]);

  // Fetch the VR chunk ahead where a headset can run
  useEffect(() => {
    if (!showButton) return;
    const run = { cancelled: false };
    void (async () => {
      try {
        const xr = (navigator as XrNavigator).xr;
        if (!xr || !(await xr.isSessionSupported("immersive-vr"))) return;
        if (!run.cancelled) prefetchVr();
      } catch {
        // No headset support: the first VR click loads the chunk
      }
    })();
    return () => {
      run.cancelled = true;
    };
  }, [showButton]);

  // The button
  useEffect(() => {
    const player = playerRef.current as VrModePlayer | null;
    if (!showButton || !player) return;

    let alive = true;
    let loading = false;
    const { detected: shown, storageKey: key } = latest.current;
    view.current = {
      enabled: false,
      projection: readChoice(key) ?? shown ?? "180_LR",
    };

    const refresh = () => buttonRef.current?.refresh();

    const toggle = async () => {
      const vr = view.current;
      if (vr.enabled) {
        player.peekVr?.().disable();
        vr.enabled = false;
        refresh();
        return;
      }
      if (loading) return;
      loading = true;
      try {
        await loadVr();
        if (!alive || player.isDisposed()) return;
        player.peekVr?.().enable(vr.projection);
        vr.enabled = true;
      } catch (error) {
        // Stays flat; the next click tries again
        console.error("[VR] could not start", error);
      } finally {
        loading = false;
      }
      refresh();
    };

    const choose = (projection: VrProjection) => {
      view.current.projection = projection;
      writeChoice(latest.current.storageKey, projection);
      if (view.current.enabled) player.peekVr?.().setProjection(projection);
      refresh();
    };

    const button = new VrMenuButton(player, {
      state: () => ({ ...view.current, secure: window.isSecureContext }),
      onToggle: () => void toggle(),
      onProjection: choose,
    });
    addOrderedControl(
      player as unknown as ControlBarPlayer,
      VR_BUTTON_NAME,
      button as unknown as BarControl
    );
    buttonRef.current = button;

    return () => {
      alive = false;
      buttonRef.current = null;
      // A disposed player took the button, the fork and the view with it
      if (player.isDisposed()) return;
      if (view.current.enabled) player.peekVr?.().disable();
      view.current.enabled = false;
      player.controlBar.removeChild(button);
      button.dispose();
    };
  }, [showButton, playerRef]);

  // Another scene: its projection (or the user's pick for it), kept in VR
  useEffect(() => {
    if (!showButton) return;
    const projection = readChoice(storageKey) ?? detected;
    view.current.projection = projection;
    if (view.current.enabled) {
      (playerRef.current as VrModePlayer | null)
        ?.peekVr?.()
        .setProjection(projection);
    }
    buttonRef.current?.refresh();
  }, [showButton, detected, storageKey, playerRef]);
}
