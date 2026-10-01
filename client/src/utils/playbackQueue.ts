import type { NormalizedScene } from "@peek/shared-types";
import { newClientToken } from "./clientToken";

/**
 * One scene of the player's queue: which scene, on which server, and the
 * fields the playlist sidebar and status card draw. The player loads the rest
 * by id, so nothing else travels (a full scene is about 7 KB, and a queue of
 * a grid's 250 rows was copied into sessionStorage on every navigation).
 */
export interface PlaybackEntry {
  sceneId: string;
  instanceId: string;
  position: number;
  scene: {
    title: string | null;
    paths: { screenshot: string | null };
    files: [{ duration: number | null; basename: string | null }] | [];
    studio: { name: string } | null;
  };
}

/** The player's controls as the history entry keeps them for a reload */
export interface PlaybackQueueControls {
  autoplayNext: boolean;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  shuffleHistory: number[];
}

/**
 * The queue a navigation hands the player in `location.state`. The player
 * writes it back into the history entry at each step (router `replace`), so
 * a reload or Back finds it there. `shuffle` and `repeat` are starting values
 * only: the player owns its controls (autoplay, shuffle, repeat and the
 * shuffle history) from then on, and keeps them in `controls`.
 */
export interface PlaybackQueue {
  /**
   * The queue's identity: a navigation carrying another key starts another
   * queue, one carrying this key moves within it
   */
  key: string;
  id: string;
  name: string;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  scenes: PlaybackEntry[];
  currentIndex: number;
  /** The controls at the last step, written back by the player so a reload keeps them */
  controls?: PlaybackQueueControls;
}

/** A scene file as a list row carries it; `basename` is added by the server */
type QueueSceneFile = { duration: number | null; basename?: string | null };

/** The queue entry for a scene at a position: ids and the sidebar's fields */
export const toPlaybackEntry = (
  scene: NormalizedScene,
  position: number
): PlaybackEntry => {
  // A row can lack a part (a scene with no file, or a partial test row)
  const { files, paths } = scene as {
    files?: QueueSceneFile[];
    paths?: { screenshot?: string | null };
  };
  const file = files?.[0];
  return {
    sceneId: scene.id,
    instanceId: scene.instanceId,
    position,
    scene: {
      title: scene.title ?? null,
      paths: { screenshot: paths?.screenshot ?? null },
      files: file
        ? [{ duration: file.duration, basename: file.basename ?? null }]
        : [],
      studio: scene.studio?.name ? { name: scene.studio.name } : null,
    },
  };
};

/**
 * The queue for a list of scenes, starting at `currentIndex`, with shuffle
 * and repeat off unless the caller sets them, under a new key.
 */
export const buildPlaybackQueue = (options: {
  id: string;
  name: string;
  scenes: readonly NormalizedScene[];
  currentIndex: number;
  shuffle?: boolean;
  repeat?: "none" | "one" | "all";
}): PlaybackQueue => ({
  key: newClientToken(),
  id: options.id,
  name: options.name,
  shuffle: options.shuffle ?? false,
  repeat: options.repeat ?? "none",
  scenes: options.scenes.map(toPlaybackEntry),
  currentIndex: options.currentIndex,
});

/** What a navigation to a scene hands over in `location.state` */
export interface SceneLocationState {
  playlist?: PlaybackQueue;
  shouldResume?: boolean;
  shouldAutoplay?: boolean;
  fromPageTitle?: string;
}

/** The scene page's part of a history entry's state (none: an empty one) */
export function readSceneLocationState(state: unknown): SceneLocationState {
  if (typeof state !== "object" || state === null) return {};
  const { playlist, shouldResume, shouldAutoplay, fromPageTitle } =
    state as Record<string, unknown>;
  const isQueue =
    typeof playlist === "object" &&
    playlist !== null &&
    Array.isArray((playlist as { scenes?: unknown }).scenes);
  return {
    ...(isQueue && { playlist: playlist as PlaybackQueue }),
    ...(typeof shouldResume === "boolean" && { shouldResume }),
    ...(typeof shouldAutoplay === "boolean" && { shouldAutoplay }),
    ...(typeof fromPageTitle === "string" && { fromPageTitle }),
  };
}
