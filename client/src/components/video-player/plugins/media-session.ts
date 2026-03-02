import videojs from "video.js";

/**
 * MediaSessionPlugin
 *
 * Integrates with the MediaSession API to provide OS-level media controls.
 * Enables keyboard media keys (play/pause/next/prev) and mobile lock screen controls.
 *
 * Ported from Stash's media-session.ts plugin.
 */
class MediaSessionPlugin extends videojs.getPlugin("plugin") {
  constructor(player, options) {
    super(player, options);

    player.ready(() => {
      player.addClass("vjs-media-session");
      this.setActionHandlers();
    });

    player.on("play", () => {
      this.updatePlaybackState();
    });

    player.on("pause", () => {
      this.updatePlaybackState();
    });

    this.updatePlaybackState();
  }

  /**
   * Set metadata for the current media (title, artist, artwork)
   * Called when scene changes to update OS media display
   *
   * @param {string} title - Scene title
   * @param {string} artist - Performer name(s)
   * @param {string} poster - Poster/screenshot URL
   */
  setMetadata(title, artist, poster) {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || "Unknown",
        artist: artist || "",
        artwork: [
          {
            src: poster || this.player.poster() || "",
            type: "image/jpeg",
          },
        ],
      });
    }
  }

  /**
   * Update the playback state (playing/paused) in the OS
   * @private
   */
  updatePlaybackState() {
    if ("mediaSession" in navigator) {
      const playbackState = this.player.paused() ? "paused" : "playing";
      navigator.mediaSession.playbackState = playbackState;
    }
  }

  /**
   * Set up MediaSession action handlers
   * Integrates with skipButtons plugin for playlist navigation
   * @private
   */
  setActionHandlers() {
    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.setActionHandler("play", () => {
      this.player.play();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      this.player.pause();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      // Use skipButtons plugin's forward handler (playlist integration)
      const skipButtons = this.player.skipButtons?.();
      if (skipButtons) {
        skipButtons.handleForward();
      }
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      // Use skipButtons plugin's backward handler (playlist integration)
      const skipButtons = this.player.skipButtons?.();
      if (skipButtons) {
        skipButtons.handleBackward();
      }
    });

    // Optional: seekbackward/seekforward for 10s skip via media keys
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      this.player.currentTime(Math.max(0, this.player.currentTime() - 10));
    });

    navigator.mediaSession.setActionHandler("seekforward", () => {
      this.player.currentTime(
        Math.min(this.player.duration(), this.player.currentTime() + 10)
      );
    });
  }

  dispose() {
    // Clear action handlers on dispose
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    }
    super.dispose();
  }
}

// Register the plugin with video.js
videojs.registerPlugin("mediaSession", MediaSessionPlugin);

export default MediaSessionPlugin;
