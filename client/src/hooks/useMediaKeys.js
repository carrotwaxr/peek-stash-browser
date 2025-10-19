import { useEffect } from "react";

/**
 * Custom hook for handling media keyboard shortcuts
 * Supports standard media keys (play/pause, next/prev track, etc.)
 *
 * @param {Object} options Configuration options
 * @param {Function} options.onPlayPause Callback for play/pause
 * @param {Function} options.onNextTrack Callback for next track
 * @param {Function} options.onPreviousTrack Callback for previous track
 * @param {Function} options.onSeekForward Callback for seek forward
 * @param {Function} options.onSeekBackward Callback for seek backward
 * @param {Function} options.onVolumeUp Callback for volume up
 * @param {Function} options.onVolumeDown Callback for volume down
 * @param {Function} options.onMute Callback for mute toggle
 * @param {boolean} options.enabled Whether media keys are enabled
 */
export const useMediaKeys = ({
  onPlayPause,
  onNextTrack,
  onPreviousTrack,
  onSeekForward,
  onSeekBackward,
  onVolumeUp,
  onVolumeDown,
  onMute,
  enabled = true,
} = {}) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Don't handle media keys if user is typing in an input
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      ) {
        return;
      }

      let handled = false;

      switch (e.key) {
        // Media play/pause
        case "MediaPlayPause":
        case " ": // Space bar
          if (e.key === " " && e.target.tagName === "BUTTON") {
            // Let buttons handle space naturally
            return;
          }
          e.preventDefault();
          onPlayPause?.();
          handled = true;
          break;

        // Media next track
        case "MediaTrackNext":
          e.preventDefault();
          onNextTrack?.();
          handled = true;
          break;

        // Media previous track
        case "MediaTrackPrevious":
          e.preventDefault();
          onPreviousTrack?.();
          handled = true;
          break;

        // Seek forward (right arrow or custom)
        case "MediaFastForward":
        case "ArrowRight":
          // Only handle if not in a text input and Ctrl/Cmd is held
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onSeekForward?.();
            handled = true;
          }
          break;

        // Seek backward (left arrow or custom)
        case "MediaRewind":
        case "ArrowLeft":
          // Only handle if not in a text input and Ctrl/Cmd is held
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onSeekBackward?.();
            handled = true;
          }
          break;

        // Volume up
        case "ArrowUp":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onVolumeUp?.();
            handled = true;
          }
          break;

        // Volume down
        case "ArrowDown":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            onVolumeDown?.();
            handled = true;
          }
          break;

        // Mute toggle
        case "m":
        case "M":
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            onMute?.();
            handled = true;
          }
          break;

        // Fullscreen toggle
        case "f":
        case "F":
          if (!e.ctrlKey && !e.metaKey) {
            // Let video player handle fullscreen via its own controls
            // But we could add a callback here if needed
          }
          break;
      }

      return handled;
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    onPlayPause,
    onNextTrack,
    onPreviousTrack,
    onSeekForward,
    onSeekBackward,
    onVolumeUp,
    onVolumeDown,
    onMute,
  ]);
};

/**
 * Hook specifically for playlist-based media controls
 * Only enables next/prev when in a playlist
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

  useMediaKeys({
    enabled: enabled && hasPlaylist,

    onPlayPause: () => {
      const player = playerRef.current;
      if (player) {
        if (player.paused()) {
          player.play();
        } else {
          player.pause();
        }
      }
    },

    onNextTrack: () => {
      if (hasPlaylist && playNext) {
        playNext();
      }
    },

    onPreviousTrack: () => {
      if (hasPlaylist && playPrevious) {
        playPrevious();
      }
    },

    onSeekForward: () => {
      const player = playerRef.current;
      if (player) {
        player.currentTime(player.currentTime() + 10);
      }
    },

    onSeekBackward: () => {
      const player = playerRef.current;
      if (player) {
        player.currentTime(Math.max(0, player.currentTime() - 10));
      }
    },

    onVolumeUp: () => {
      const player = playerRef.current;
      if (player) {
        player.volume(Math.min(1, player.volume() + 0.1));
      }
    },

    onVolumeDown: () => {
      const player = playerRef.current;
      if (player) {
        player.volume(Math.max(0, player.volume() - 0.1));
      }
    },

    onMute: () => {
      const player = playerRef.current;
      if (player) {
        player.muted(!player.muted());
      }
    },
  });
};
