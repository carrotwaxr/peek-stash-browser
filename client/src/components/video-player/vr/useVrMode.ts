/**
 * VR mode for the player, as it loads with the Scene page: only the decision
 * whether this scene gets VR at all. A scene with `vr` (and TV mode off)
 * fetches the small `vr-ui` chunk (`vrUi.ts`: the button, the projection menu
 * and the logic behind them) and attaches it to the player; any other scene
 * does nothing and fetches nothing. The fork and three.js are the larger
 * `vr` chunk, which `vrUi` loads in turn (`loadVr`).
 *
 * The button keeps its place before AirPlay and Cast whichever loads first
 * (`addOrderedControl`), so it may appear a moment after the other controls.
 *
 * In a headset, the HUD's next and previous step the queue (when it holds
 * more than one scene) and its favourite toggles the viewer's own favourite
 * through `useSceneFavorite`, as the page's heart does; the HUD shows
 * `scene.favorite`. The fork keeps the callbacks it was created with, so they
 * call this render's handlers through a ref.
 */
import { type RefObject, useEffect, useRef, useState } from "react";
import type { SceneVr } from "@peek/shared-types";
import { useAuth } from "../../../hooks/useAuth";
import { useTVMode } from "../../../hooks/useTVMode";
import { canDecode } from "../../../utils/browserPlayback";
import type { DecodableFile } from "../playerSources";
import {
  type FavoriteScene,
  type SetSceneFavoriteAction,
  useSceneFavorite,
} from "../useSceneFavorite";
import type { VrHud } from "./vrPlugin";
import type * as VrUiModule from "./vrUi";
import type { VrMode, VrModeInputs, VrModePlayer } from "./vrUi";

type VrUi = typeof VrUiModule;

/** The part of the scene this hook reads. */
export interface VrModeScene extends FavoriteScene {
  vr?: SceneVr | null;
  files?: DecodableFile[] | null;
}

/** Where a user's pick for one scene on one instance is kept. */
const choiceKey = (userId: number | string, sceneKey: string) =>
  `peek.vr.${userId}.${sceneKey}`;

export function useVrMode({
  playerRef,
  scene,
  sceneKey,
  nextScene,
  prevScene,
  queueLength,
  dispatch,
}: {
  playerRef: RefObject<unknown>;
  scene: VrModeScene | null | undefined;
  /** The scene's `makeCompositeKey(id, instanceId)`; undefined with no scene */
  sceneKey: string | undefined;
  /** The queue's steps (`useQueueNavigation`) */
  nextScene: () => void;
  prevScene: () => void;
  /** How many scenes the queue holds (0 with no queue) */
  queueLength: number;
  /** The player context's dispatch, for SET_SCENE_FAVORITE */
  dispatch: (action: SetSceneFavoriteAction) => void;
}) {
  const { isTVMode } = useTVMode();
  const { user } = useAuth();
  const userId = user?.id;

  const detected = scene?.vr?.projection ?? null;
  const showButton = detected !== null && !isTVMode;
  const storageKey =
    userId !== undefined && sceneKey ? choiceKey(userId, sceneKey) : null;
  // Whether the browser decodes the file (null without one): in Safari, VR
  // moves to Direct only then
  const decodes = canDecode(scene?.files?.[0] ?? {});
  const inputs: VrModeInputs | null = detected
    ? { detected, storageKey, decodes }
    : null;

  const { favorite, toggleFavorite } = useSceneFavorite(scene, dispatch);

  const [ui, setUi] = useState<VrUi | null>(null);
  const latest = useRef(inputs);
  const mode = useRef<VrMode | null>(null);
  const handlers = useRef({
    nextScene,
    prevScene,
    queueLength,
    toggleFavorite,
  });

  useEffect(() => {
    latest.current = inputs;
    handlers.current = { nextScene, prevScene, queueLength, toggleFavorite };
    // Another VR scene: its projection (or the user's pick for it), kept in
    // VR, and its file; the same inputs again change nothing
    if (inputs) mode.current?.update(inputs);
  });

  // The HUD's buttons: one object for the player's life, calling the latest
  // handlers. A one-scene queue has nowhere to step.
  const [hud] = useState<VrHud>(() => ({
    onNext: () => {
      const { nextScene: step, queueLength: length } = handlers.current;
      if (length > 1) step();
    },
    onPrevious: () => {
      const { prevScene: step, queueLength: length } = handlers.current;
      if (length > 1) step();
    },
    onFavorite: () => {
      void handlers.current.toggleFavorite();
    },
  }));

  // The VR UI chunk, the first time a VR scene shows
  useEffect(() => {
    if (!showButton || ui) return;
    let alive = true;
    import("./vrUi").then(
      (loaded) => {
        if (alive) setUi(loaded);
      },
      (error: unknown) => {
        // No button this time; the next VR scene tries again
        console.error("[VR] could not load the VR controls", error);
      }
    );
    return () => {
      alive = false;
    };
  }, [showButton, ui]);

  // The button, while the scene is VR
  useEffect(() => {
    const player = playerRef.current as VrModePlayer | null;
    const initial = latest.current;
    if (!ui || !showButton || !player || !initial) return;
    const attached = ui.attachVrMode(player, initial, hud);
    mode.current = attached;
    return () => {
      mode.current = null;
      attached.detach();
    };
  }, [ui, showButton, playerRef, hud]);

  // What the HUD shows: the scene's favourite, after each change and on the
  // VR UI's arrival
  useEffect(() => {
    mode.current?.setFavorite(favorite);
  }, [favorite, ui, showButton]);
}
