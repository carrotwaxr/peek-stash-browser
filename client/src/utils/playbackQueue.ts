import type { NormalizedScene } from "@peek/shared-types";

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

/** The queue `Scene` hands the player and keeps in sessionStorage */
export interface PlaybackQueue {
  id: string;
  name: string;
  shuffle: boolean;
  repeat: "none" | "one" | "all";
  scenes: PlaybackEntry[];
  currentIndex: number;
  autoplayNext?: boolean;
  shuffleHistory?: number[];
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
 * The queue for a list of scenes, starting at `currentIndex`. Options a caller
 * does not set stay out of the queue, so the player's own defaults apply.
 */
export const buildPlaybackQueue = (options: {
  id: string;
  name: string;
  scenes: readonly NormalizedScene[];
  currentIndex: number;
  shuffle?: boolean;
  repeat?: "none" | "one" | "all";
  autoplayNext?: boolean;
  shuffleHistory?: number[];
}): PlaybackQueue => ({
  id: options.id,
  name: options.name,
  shuffle: options.shuffle ?? false,
  repeat: options.repeat ?? "none",
  ...(options.autoplayNext !== undefined && {
    autoplayNext: options.autoplayNext,
  }),
  ...(options.shuffleHistory !== undefined && {
    shuffleHistory: options.shuffleHistory,
  }),
  scenes: options.scenes.map(toPlaybackEntry),
  currentIndex: options.currentIndex,
});
