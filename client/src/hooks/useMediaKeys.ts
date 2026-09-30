import type React from "react";
import { useCallback, useContext, useMemo } from "react";
import {
  type ShortcutHandler,
  ShortcutScopeContext,
} from "../contexts/shortcutDispatcher";
import { useShortcutScope } from "./useShortcutScope";

interface VideoPlayer {
  paused: () => boolean;
  play: () => void;
  pause: () => void;
  currentTime: (time?: number) => number;
  duration: () => number;
  volume: (vol?: number) => number;
  muted: (muted?: boolean) => boolean;
  playbackRate: (rate?: number) => number;
  isFullscreen: () => boolean;
  exitFullscreen: () => void;
  requestFullscreen: () => void;
}

interface UsePlaylistMediaKeysOptions {
  playerRef: React.RefObject<VideoPlayer | null>;
  playlist: { scenes?: unknown[] } | null;
  playNext: (() => void) | null;
  playPrevious: (() => void) | null;
  enabled?: boolean;
  /** The player's element: keys act only while focus is inside it or on nothing */
  root: () => Element | null;
}

/**
 * The video player's keyboard shortcuts (YouTube-standard keys) as one
 * `player` scope. The scope acts only while focus is inside the player's
 * element or on nothing, so Space, the arrows and Home/End on the page's
 * buttons, menus and tabs do their own job. An `r` sequence owns the key
 * after it, so `r` then 5 rates and does not jump to 50%.
 *
 * @param {Object} options Configuration options
 * @param {Object} options.playerRef Ref to Video.js player instance
 * @param {Object} options.playlist Current playlist object
 * @param {Function} options.playNext Callback to play next in playlist
 * @param {Function} options.playPrevious Callback to play previous in playlist
 * @param {boolean} options.enabled Whether controls are enabled
 * @param {Function} options.root The player's element
 */
export const usePlaylistMediaKeys = ({
  playerRef,
  playlist,
  playNext,
  playPrevious,
  enabled = true,
  root,
}: UsePlaylistMediaKeysOptions) => {
  const hasPlaylist = playlist && playlist.scenes && playlist.scenes.length > 1;

  // Define all keyboard shortcuts for the video player
  const keys = useMemo<Record<string, ShortcutHandler>>(
    () => ({
      // ============================================================================
      // PLAYBACK CONTROL
      // ============================================================================

      // Play/Pause (multiple keys for compatibility)
      space: () => {
        const player = playerRef.current;
        if (player) {
          if (player.paused()) {
            player.play();
          } else {
            player.pause();
          }
        }
      },

      k: () => {
        const player = playerRef.current;
        if (player) {
          if (player.paused()) {
            player.play();
          } else {
            player.pause();
          }
        }
      },

      // Standard media keys
      mediaplaypause: () => {
        const player = playerRef.current;
        if (player) {
          if (player.paused()) {
            player.play();
          } else {
            player.pause();
          }
        }
      },

      // ============================================================================
      // SEEKING
      // ============================================================================

      // Jump backward 10 seconds (J key - YouTube style)
      j: () => {
        const player = playerRef.current;
        if (player) {
          player.currentTime(Math.max(0, player.currentTime() - 10));
        }
      },

      // Jump forward 10 seconds (L key - YouTube style)
      l: () => {
        const player = playerRef.current;
        if (player) {
          player.currentTime(player.currentTime() + 10);
        }
      },

      // Arrow keys for 5-second jumps (no modifier needed)
      left: () => {
        const player = playerRef.current;
        if (player) {
          player.currentTime(Math.max(0, player.currentTime() - 5));
        }
      },

      right: () => {
        const player = playerRef.current;
        if (player) {
          player.currentTime(player.currentTime() + 5);
        }
      },

      // Media keys
      mediafastforward: () => {
        const player = playerRef.current;
        if (player) {
          player.currentTime(player.currentTime() + 10);
        }
      },

      mediarewind: () => {
        const player = playerRef.current;
        if (player) {
          player.currentTime(Math.max(0, player.currentTime() - 10));
        }
      },

      // Jump to start/end
      home: () => {
        const player = playerRef.current;
        if (player) {
          player.currentTime(0);
        }
      },

      end: () => {
        const player = playerRef.current;
        if (player && player.duration()) {
          player.currentTime(player.duration());
        }
      },

      // Number keys for percentage jumps (0-9)
      // r then 0-5 sets the rating: the sequence owns the key after r
      "0": () => {
        jumpToPercentage(playerRef, 0);
      },
      "1": () => {
        jumpToPercentage(playerRef, 10);
      },
      "2": () => {
        jumpToPercentage(playerRef, 20);
      },
      "3": () => {
        jumpToPercentage(playerRef, 30);
      },
      "4": () => {
        jumpToPercentage(playerRef, 40);
      },
      "5": () => {
        jumpToPercentage(playerRef, 50);
      },
      "6": () => jumpToPercentage(playerRef, 60),
      "7": () => jumpToPercentage(playerRef, 70),
      "8": () => jumpToPercentage(playerRef, 80),
      "9": () => jumpToPercentage(playerRef, 90),

      // ============================================================================
      // VOLUME CONTROL
      // ============================================================================

      up: () => {
        const player = playerRef.current;
        if (player) {
          player.volume(Math.min(1, player.volume() + 0.05));
        }
      },

      down: () => {
        const player = playerRef.current;
        if (player) {
          player.volume(Math.max(0, player.volume() - 0.05));
        }
      },

      m: () => {
        const player = playerRef.current;
        if (player) {
          player.muted(!player.muted());
        }
      },

      // ============================================================================
      // PLAYBACK SPEED
      // ============================================================================

      "shift+>": () => {
        const player = playerRef.current;
        if (player) {
          const currentRate = player.playbackRate();
          const newRate = Math.min(2, currentRate + 0.25);
          player.playbackRate(newRate);
        }
      },

      "shift+<": () => {
        const player = playerRef.current;
        if (player) {
          const currentRate = player.playbackRate();
          const newRate = Math.max(0.25, currentRate - 0.25);
          player.playbackRate(newRate);
        }
      },

      // ============================================================================
      // DISPLAY CONTROL
      // ============================================================================

      // r then f toggles the favorite: the sequence owns the key after r
      f: () => {
        const player = playerRef.current;
        if (player) {
          if (player.isFullscreen()) {
            player.exitFullscreen();
          } else {
            player.requestFullscreen();
          }
        }
      },

      // ============================================================================
      // PLAYLIST NAVIGATION (only if in a playlist)
      // ============================================================================

      ...(hasPlaylist && playNext && playPrevious
        ? {
            // Hardware media keys
            mediatracknext: () => playNext(),
            mediatrackprevious: () => playPrevious(),
            // Shift+N and Shift+P (letters ignore shift in the key name, so
            // the handlers check it)
            n: (event: KeyboardEvent) => {
              if (!event.shiftKey) return false;
              playNext();
              return undefined;
            },
            p: (event: KeyboardEvent) => {
              if (!event.shiftKey) return false;
              playPrevious();
              return undefined;
            },
          }
        : {}),
    }),
    [playerRef, hasPlaylist, playNext, playPrevious]
  );

  useShortcutScope({
    layer: "player",
    enabled,
    root,
    keys,
  });
};

/** The event video.js hands over: its copy of the DOM event */
type VideoJsKeyEvent = KeyboardEvent & { isPropagationStopped?: () => boolean };

/**
 * The player's `userActions.hotkeys` option: video.js's controls (the play
 * button, the control bar) stop every key but Tab from bubbling and pass the
 * keys they do not use to this function, which hands them to the shortcut
 * dispatcher, so the player's keys work with focus on its controls. Keys a
 * control uses (Space and Enter click a button, arrows move a slider) never
 * come here. video.js also passes every key that bubbles through the player's
 * element; those reach the dispatcher's `window` listener, so they are left
 * to it and handled once, after the page's element handlers.
 */
export function usePlayerHotkeys(): (event: VideoJsKeyEvent) => void {
  const dispatcher = useContext(ShortcutScopeContext);
  return useCallback(
    (event: VideoJsKeyEvent) => {
      if (event.isPropagationStopped?.()) dispatcher.dispatch(event);
    },
    [dispatcher]
  );
}

/**
 * Jump to a percentage of the video duration
 * @param {Object} playerRef - Ref to Video.js player
 * @param {number} percentage - Percentage (0-100)
 */
function jumpToPercentage(
  playerRef: React.RefObject<VideoPlayer | null>,
  percentage: number
) {
  const player = playerRef.current;
  if (player && player.duration()) {
    const targetTime = (player.duration() * percentage) / 100;
    player.currentTime(targetTime);
  }
}
