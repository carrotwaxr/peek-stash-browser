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
 */
import { type RefObject, useEffect, useRef, useState } from "react";
import type { SceneVr } from "@peek/shared-types";
import { useAuth } from "../../../hooks/useAuth";
import { useTVMode } from "../../../hooks/useTVMode";
import type * as VrUiModule from "./vrUi";
import type { VrMode, VrModeInputs, VrModePlayer } from "./vrUi";

type VrUi = typeof VrUiModule;

/** The part of the scene this hook reads. */
export interface VrModeScene {
  vr?: SceneVr | null;
}

/** Where a user's pick for one scene on one instance is kept. */
const choiceKey = (userId: number | string, sceneKey: string) =>
  `peek.vr.${userId}.${sceneKey}`;

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
  const inputs: VrModeInputs | null = detected
    ? { detected, storageKey }
    : null;

  const [ui, setUi] = useState<VrUi | null>(null);
  const latest = useRef(inputs);
  const mode = useRef<VrMode | null>(null);

  useEffect(() => {
    latest.current = inputs;
  });

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
    const attached = ui.attachVrMode(player, initial);
    mode.current = attached;
    return () => {
      mode.current = null;
      attached.detach();
    };
  }, [ui, showButton, playerRef]);

  // Another VR scene: its projection (or the user's pick for it), kept in VR
  useEffect(() => {
    if (detected) mode.current?.update({ detected, storageKey });
  }, [detected, storageKey]);
}
