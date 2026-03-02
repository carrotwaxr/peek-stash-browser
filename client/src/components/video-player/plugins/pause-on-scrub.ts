import videojs from "video.js";

/**
 * Pause on Scrub Plugin
 *
 * Prevents excessive network requests during seek bar scrubbing by deferring
 * the actual seek until the user stops scrubbing. This is especially important
 * for users with resource-intensive backends (e.g., cloud storage via WebDAV).
 *
 * The Problem:
 * - When scrubbing the seek bar, Video.js calls currentTime() for each position
 * - Each currentTime() triggers a seek, causing the browser to fetch new data
 * - This creates dozens of concurrent requests in seconds
 *
 * The Solution:
 * - Override player.currentTime() to intercept seek calls
 * - When player.scrubbing() is true, defer the seek
 * - When scrubbing ends, perform the final seek
 * - Resume playback after a short debounce if video was playing
 *
 * This matches behavior in YouTube, Netflix, and other major players.
 */
class PauseOnScrubPlugin extends videojs.getPlugin("plugin") {
  constructor(player, options = {}) {
    super(player, options);

    // Configuration
    this.resumeDelay = options.resumeDelay ?? 500; // ms to wait before resuming

    // State
    this.wasPlayingBeforeScrub = false;
    this.pendingSeekTime = null;
    this.resumeTimeout = null;
    this.originalCurrentTime = null;
    this.wasScrubbing = false;

    // Bind event handlers
    this.onTimeUpdate = this.onTimeUpdate.bind(this);

    // Override currentTime immediately
    this.installCurrentTimeOverride();

    // Listen to timeupdate to detect when scrubbing ends
    // This fires continuously and lets us detect the transition from scrubbing=true to false
    player.on("timeupdate", this.onTimeUpdate);
  }

  /**
   * Install the currentTime override to intercept seeks during scrubbing
   */
  installCurrentTimeOverride() {
    if (this.originalCurrentTime) return; // Already installed

    this.originalCurrentTime = this.player.currentTime.bind(this.player);
    const self = this;

    this.player.currentTime = function (time) {
      // If getting current time (no argument), always use original
      if (time === undefined) {
        return self.originalCurrentTime();
      }

      // Check if we're scrubbing using Video.js's state
      const isScrubbing = self.player.scrubbing();

      if (isScrubbing) {
        // Track that we started scrubbing (for detecting wasPlaying state)
        if (!self.wasScrubbing) {
          self.wasScrubbing = true;
          self.wasPlayingBeforeScrub = !self.player.paused() && !self.player.ended();
        }

        // During scrub: capture the time but don't actually seek
        self.pendingSeekTime = time;
        return time;
      }

      // Not scrubbing - pass through to original
      return self.originalCurrentTime(time);
    };
  }

  /**
   * Called on timeupdate - detect when scrubbing ends
   */
  onTimeUpdate() {
    // Detect transition from scrubbing to not scrubbing
    if (this.wasScrubbing && !this.player.scrubbing()) {
      this.finalizeScrub();
    }
  }

  /**
   * Finalize the scrub - seek to final position and resume if needed
   */
  finalizeScrub() {
    this.wasScrubbing = false;

    // Perform the actual seek if we have a pending time
    if (this.pendingSeekTime !== null) {
      const finalTime = this.pendingSeekTime;
      this.pendingSeekTime = null;
      this.originalCurrentTime(finalTime);
    }

    // Resume playback after debounce if we paused
    if (this.wasPlayingBeforeScrub) {
      // Clear any existing timeout
      if (this.resumeTimeout) {
        clearTimeout(this.resumeTimeout);
      }

      this.resumeTimeout = setTimeout(() => {
        this.player.play().catch(() => {
          // Ignore play errors (e.g., user paused manually)
        });
        this.wasPlayingBeforeScrub = false;
        this.resumeTimeout = null;
      }, this.resumeDelay);
    }
  }

  /**
   * Clean up when plugin is disposed
   */
  dispose() {
    // Restore original currentTime
    if (this.originalCurrentTime) {
      this.player.currentTime = this.originalCurrentTime;
      this.originalCurrentTime = null;
    }

    // Clear resume timeout
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
    }

    // Remove event listeners
    this.player.off("timeupdate", this.onTimeUpdate);

    super.dispose();
  }
}

// Register the plugin
videojs.registerPlugin("pauseOnScrub", PauseOnScrubPlugin);

export default PauseOnScrubPlugin;
