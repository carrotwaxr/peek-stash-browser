import videojs from "video.js";

/**
 * VolumeProgressFixPlugin
 *
 * Fixes the interaction conflict between the volume panel popup (vertical slider)
 * and the progress bar that sits above the control bar.
 *
 * Problem: When the volume slider popup appears on hover, it visually overlaps
 * the progress bar, but mouse events can still reach the progress bar underneath,
 * causing unintended seek behavior when adjusting volume.
 *
 * Solution: Disable pointer-events on the progress bar while the volume panel
 * is being interacted with.
 */
class VolumeProgressFixPlugin extends videojs.getPlugin("plugin") {
  constructor(player, options) {
    super(player, options);

    this.enabled = options?.enabled ?? true;
    this.volumePanel = null;
    this.progressControl = null;

    // Bind event handlers
    this.handleVolumeEnter = this.handleVolumeEnter.bind(this);
    this.handleVolumeLeave = this.handleVolumeLeave.bind(this);

    player.ready(() => {
      this.setup();
    });
  }

  setup() {
    if (!this.enabled) return;

    const controlBar = this.player.controlBar;
    if (!controlBar) return;

    // Get the volume panel and progress control elements
    this.volumePanel = controlBar.el().querySelector(".vjs-volume-panel");
    this.progressControl = controlBar.el().querySelector(".vjs-progress-control");

    // Also check parent (progress control is a sibling to control bar, not child)
    if (!this.progressControl) {
      this.progressControl = this.player
        .el()
        .querySelector(".vjs-progress-control");
    }

    if (!this.volumePanel || !this.progressControl) {
      return;
    }

    // Add event listeners for volume panel hover state
    this.volumePanel.addEventListener("mouseenter", this.handleVolumeEnter);
    this.volumePanel.addEventListener("mouseleave", this.handleVolumeLeave);

    // Also handle when actively dragging the volume slider
    this.volumePanel.addEventListener("mousedown", this.handleVolumeEnter);

    // Listen for mouseup on document to catch when dragging ends outside panel
    document.addEventListener("mouseup", this.handleVolumeLeave);
  }

  handleVolumeEnter() {
    if (!this.enabled || !this.progressControl) return;
    this.progressControl.style.pointerEvents = "none";
  }

  handleVolumeLeave() {
    if (!this.progressControl) return;
    this.progressControl.style.pointerEvents = "";
  }

  dispose() {
    // Clean up event listeners
    if (this.volumePanel) {
      this.volumePanel.removeEventListener("mouseenter", this.handleVolumeEnter);
      this.volumePanel.removeEventListener("mouseleave", this.handleVolumeLeave);
      this.volumePanel.removeEventListener("mousedown", this.handleVolumeEnter);
    }
    document.removeEventListener("mouseup", this.handleVolumeLeave);

    // Restore pointer events
    if (this.progressControl) {
      this.progressControl.style.pointerEvents = "";
    }

    super.dispose();
  }
}

// Register the plugin with video.js
videojs.registerPlugin("volumeProgressFix", VolumeProgressFixPlugin);

export default VolumeProgressFixPlugin;
