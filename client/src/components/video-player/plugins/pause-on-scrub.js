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
 * - Intercept scrubbing by hooking into the SeekBar component
 * - During scrub: only update the visual progress bar, don't actually seek
 * - On scrub end: perform a single seek to the final position
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
    this.isScrubbing = false;
    this.pendingSeekTime = null;
    this.resumeTimeout = null;
    this.originalCurrentTime = null;

    // Bind methods
    this.onSeekBarMouseDown = this.onSeekBarMouseDown.bind(this);
    this.onDocumentMouseUp = this.onDocumentMouseUp.bind(this);
    this.onSeekBarTouchStart = this.onSeekBarTouchStart.bind(this);
    this.onDocumentTouchEnd = this.onDocumentTouchEnd.bind(this);
    this.onSeekBarMouseMove = this.onSeekBarMouseMove.bind(this);

    // Initialize when player is ready
    player.ready(() => {
      this.setupEventListeners();
    });
  }

  /**
   * Set up event listeners on the seek bar
   */
  setupEventListeners() {
    const seekBar = this.player.controlBar?.progressControl?.seekBar;
    if (!seekBar) {
      // Retry if control bar isn't ready yet
      this.player.one("loadedmetadata", () => this.setupEventListeners());
      return;
    }

    const seekBarEl = seekBar.el();

    // Mouse events - capture phase to intercept before Video.js
    seekBarEl.addEventListener("mousedown", this.onSeekBarMouseDown, true);
    document.addEventListener("mouseup", this.onDocumentMouseUp);
    document.addEventListener("mousemove", this.onSeekBarMouseMove);

    // Touch events for mobile
    seekBarEl.addEventListener("touchstart", this.onSeekBarTouchStart, {
      passive: true,
      capture: true,
    });
    document.addEventListener("touchend", this.onDocumentTouchEnd);
    document.addEventListener("touchcancel", this.onDocumentTouchEnd);
    document.addEventListener("touchmove", this.onSeekBarMouseMove, {
      passive: true,
    });
  }

  /**
   * Called when user starts dragging the seek bar (mouse)
   */
  onSeekBarMouseDown(event) {
    // Only respond to left mouse button
    if (event.button !== 0) return;
    this.startScrubbing();
  }

  /**
   * Called when mouse moves (during scrub, intercept seeking)
   */
  onSeekBarMouseMove() {
    if (!this.isScrubbing) return;

    // During scrub, intercept currentTime calls to prevent actual seeking
    // Video.js will call currentTime() but we'll store it instead of executing
  }

  /**
   * Called when mouse button is released
   */
  onDocumentMouseUp() {
    if (this.isScrubbing) {
      this.stopScrubbing();
    }
  }

  /**
   * Called when user starts touching the seek bar (mobile)
   */
  onSeekBarTouchStart() {
    this.startScrubbing();
  }

  /**
   * Called when touch ends
   */
  onDocumentTouchEnd() {
    if (this.isScrubbing) {
      this.stopScrubbing();
    }
  }

  /**
   * Start scrubbing - intercept currentTime calls
   */
  startScrubbing() {
    // Clear any pending resume
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }

    // Store current playback state
    this.wasPlayingBeforeScrub = !this.player.paused() && !this.player.ended();
    this.isScrubbing = true;

    // Store the current time as fallback
    this.pendingSeekTime = this.player.currentTime();

    // Intercept currentTime setter to defer seeks
    // This is the key: we override currentTime() to capture but not execute seeks
    if (!this.originalCurrentTime) {
      this.originalCurrentTime = this.player.currentTime.bind(this.player);

      const self = this;
      this.player.currentTime = function (time) {
        if (time !== undefined && self.isScrubbing) {
          // During scrub: capture the time but don't seek
          self.pendingSeekTime = time;
          return time;
        }
        // Not scrubbing or getting time: use original
        return self.originalCurrentTime(time);
      };
    }

    // Pause if playing (reduces buffering during scrub)
    if (this.wasPlayingBeforeScrub) {
      this.player.pause();
    }
  }

  /**
   * Stop scrubbing - perform the deferred seek and optionally resume
   */
  stopScrubbing() {
    this.isScrubbing = false;

    // Restore original currentTime
    if (this.originalCurrentTime) {
      // Perform the actual seek to final position
      if (this.pendingSeekTime !== null) {
        this.originalCurrentTime(this.pendingSeekTime);
      }

      this.player.currentTime = this.originalCurrentTime;
      this.originalCurrentTime = null;
    }

    this.pendingSeekTime = null;

    // Resume playback after debounce if we paused
    if (this.wasPlayingBeforeScrub) {
      this.resumeTimeout = setTimeout(() => {
        if (!this.isScrubbing) {
          this.player.play().catch(() => {
            // Ignore play errors (e.g., if video ended during scrub)
          });
        }
        this.wasPlayingBeforeScrub = false;
        this.resumeTimeout = null;
      }, this.resumeDelay);
    }
  }

  /**
   * Clean up when plugin is disposed
   */
  dispose() {
    // Restore original currentTime if we modified it
    if (this.originalCurrentTime) {
      this.player.currentTime = this.originalCurrentTime;
      this.originalCurrentTime = null;
    }

    // Clear timeout
    if (this.resumeTimeout) {
      clearTimeout(this.resumeTimeout);
    }

    // Remove event listeners
    const seekBar = this.player.controlBar?.progressControl?.seekBar;
    if (seekBar) {
      const seekBarEl = seekBar.el();
      seekBarEl.removeEventListener("mousedown", this.onSeekBarMouseDown, true);
      seekBarEl.removeEventListener("touchstart", this.onSeekBarTouchStart, true);
    }
    document.removeEventListener("mouseup", this.onDocumentMouseUp);
    document.removeEventListener("mousemove", this.onSeekBarMouseMove);
    document.removeEventListener("touchend", this.onDocumentTouchEnd);
    document.removeEventListener("touchcancel", this.onDocumentTouchEnd);
    document.removeEventListener("touchmove", this.onSeekBarMouseMove);

    super.dispose();
  }
}

// Register the plugin
videojs.registerPlugin("pauseOnScrub", PauseOnScrubPlugin);

export default PauseOnScrubPlugin;
