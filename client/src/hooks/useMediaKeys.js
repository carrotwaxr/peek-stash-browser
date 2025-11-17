import { useEffect, useMemo } from "react";
import { useVideoPlayerShortcuts } from "./useKeyboardShortcuts.js";

/**
 * Hook for video player keyboard shortcuts
 * Uses the new useKeyboardShortcuts hook with YouTube-standard shortcuts
 *
 * @param {Object} options Configuration options
 * @param {Object} options.playerRef Ref to Video.js player instance
 * @param {Object} options.playlist Current playlist object
 * @param {Function} options.playNext Callback to play next in playlist
 * @param {Function} options.playPrevious Callback to play previous in playlist
 * @param {boolean} options.enabled Whether controls are enabled
 */
export const usePlaylistMediaKeys = ({
  playerRef,
  playlist,
  playNext,
  playPrevious,
  enabled = true,
}) => {
  const hasPlaylist = playlist && playlist.scenes && playlist.scenes.length > 1;

  // Define all keyboard shortcuts for the video player
  const shortcuts = useMemo(
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
      "0": () => jumpToPercentage(playerRef, 0),
      "1": () => jumpToPercentage(playerRef, 10),
      "2": () => jumpToPercentage(playerRef, 20),
      "3": () => jumpToPercentage(playerRef, 30),
      "4": () => jumpToPercentage(playerRef, 40),
      "5": () => jumpToPercentage(playerRef, 50),
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
          }
        : {}),
    }),
    [playerRef, hasPlaylist, playNext, playPrevious]
  );

  // Use the video player shortcuts hook
  useVideoPlayerShortcuts(playerRef, shortcuts, {
    enabled: enabled && !!playerRef.current,
  });

  // Handle Shift+N/P separately since buildKeyCombo ignores shift for letters
  useEffect(() => {
    if (!hasPlaylist || !playNext || !playPrevious || !enabled) return;

    const handleShiftNav = (event) => {
      // Only handle if shift is pressed
      if (!event.shiftKey) return;

      // Don't handle if user is typing in an input field
      const target = event.target;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "n") {
        event.preventDefault();
        playNext();
      } else if (key === "p") {
        event.preventDefault();
        playPrevious();
      }
    };

    document.addEventListener("keydown", handleShiftNav);
    return () => document.removeEventListener("keydown", handleShiftNav);
  }, [hasPlaylist, playNext, playPrevious, enabled]);
};

/**
 * Jump to a percentage of the video duration
 * @param {Object} playerRef - Ref to Video.js player
 * @param {number} percentage - Percentage (0-100)
 */
function jumpToPercentage(playerRef, percentage) {
  const player = playerRef.current;
  if (player && player.duration()) {
    const targetTime = (player.duration() * percentage) / 100;
    player.currentTime(targetTime);
  }
}
