import { useCallback, useMemo } from "react";
import { useScenePlayer } from "../contexts/ScenePlayerContext";
import { nextIndex, prevIndex } from "../contexts/scenePlayerReducer";

/** Which way a queue goes on: the controls, the media keys and the end of a video all use this */
export interface QueueNavigation {
  /** Plays the entry at `index` (an unavailable or missing one is ignored) */
  goTo: (index: number) => void;
  /** The next entry by the queue's rules (Shuffle, Repeat All, unavailable skipped) */
  next: () => void;
  prev: () => void;
  /** Whether Next / Previous would go anywhere */
  canNext: boolean;
  canPrev: boolean;
  /** The entry Next would play, or null (in Shuffle it is not known) */
  upNextIndex: number | null;
}

/**
 * The one way the UI steps through the play queue. Where a step lands is the
 * reducer's own rule (`nextIndex`, `prevIndex`); a step keeps playing when
 * the player is playing and stays paused when it is paused.
 */
export function useQueueNavigation(): QueueNavigation {
  const {
    playlist,
    currentIndex,
    shuffle,
    repeat,
    shuffleHistory,
    unavailable,
    dispatch,
    isPlaying,
  } = useScenePlayer();

  const { canNext, canPrev, upNextIndex } = useMemo(() => {
    const state = {
      playlist,
      currentIndex,
      shuffle,
      repeat,
      shuffleHistory,
      unavailable,
    };
    // Only whether a step exists matters here, never which one a shuffle picks
    const ahead = nextIndex(state, () => 0);
    return {
      canNext: ahead !== null,
      canPrev: prevIndex(state, () => 0) !== null,
      upNextIndex:
        shuffle || ahead === null || ahead.index === currentIndex
          ? null
          : ahead.index,
    };
  }, [playlist, currentIndex, shuffle, repeat, shuffleHistory, unavailable]);

  const total = playlist?.scenes?.length ?? 0;

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= total || unavailable.includes(index)) return;
      dispatch({
        type: "GOTO_SCENE_INDEX",
        payload: { index, shouldAutoplay: isPlaying() },
      });
    },
    [dispatch, isPlaying, total, unavailable]
  );

  const next = useCallback(() => {
    dispatch({ type: "NEXT_SCENE", payload: { autoplay: isPlaying() } });
  }, [dispatch, isPlaying]);

  const prev = useCallback(() => {
    dispatch({ type: "PREV_SCENE", payload: { autoplay: isPlaying() } });
  }, [dispatch, isPlaying]);

  return { goTo, next, prev, canNext, canPrev, upNextIndex };
}
