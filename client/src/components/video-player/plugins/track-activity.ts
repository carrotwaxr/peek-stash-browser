import videojs from "video.js";

const intervalSeconds = 1; // check every second
const sendInterval = 10; // send every 10 seconds

class TrackActivityPlugin extends videojs.getPlugin("plugin") {
  constructor(player) {
    super(player);

    this.totalPlayDuration = 0;
    this.currentPlayDuration = 0;
    this.minimumPlayPercent = 0;
    this.incrementPlayCount = () => Promise.resolve();
    this.saveActivity = () => Promise.resolve();

    this.enabled = false;
    this.playCountIncremented = false;
    this.intervalID = undefined;

    this.lastResumeTime = 0;
    this.lastDuration = 0;

    player.on("playing", () => {
      this.start();
    });

    player.on("waiting", () => {
      this.stop();
    });

    player.on("stalled", () => {
      this.stop();
    });

    player.on("pause", () => {
      this.stop();
    });

    player.on("dispose", () => {
      this.stop();
    });
  }

  start() {
    if (this.enabled && !this.intervalID) {
      this.intervalID = window.setInterval(() => {
        this.intervalHandler();
      }, intervalSeconds * 1000);
      this.lastResumeTime = this.player.currentTime();
      this.lastDuration = this.player.duration();
    }
  }

  stop() {
    if (this.intervalID) {
      window.clearInterval(this.intervalID);
      this.intervalID = undefined;
      this.sendActivity();
    }
  }

  reset() {
    this.stop();
    this.totalPlayDuration = 0;
    this.currentPlayDuration = 0;
    this.playCountIncremented = false;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
    } else if (!this.player.paused()) {
      this.start();
    }
  }

  intervalHandler() {
    if (!this.enabled || !this.player) return;

    this.lastResumeTime = this.player.currentTime();
    this.lastDuration = this.player.duration();

    this.totalPlayDuration += intervalSeconds;
    this.currentPlayDuration += intervalSeconds;
    if (this.totalPlayDuration % sendInterval === 0) {
      this.sendActivity();
    }
  }

  sendActivity() {
    if (!this.enabled) return;

    if (this.totalPlayDuration > 0) {
      let resumeTime = this.player?.currentTime() ?? this.lastResumeTime;
      const videoDuration = this.player?.duration() ?? this.lastDuration;

      // Guard against NaN/invalid values (can happen if player not ready)
      if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
        console.warn("[track-activity] Invalid video duration, skipping activity save");
        return;
      }
      if (!Number.isFinite(resumeTime)) {
        resumeTime = this.lastResumeTime || 0;
      }

      const percentCompleted = (100 / videoDuration) * resumeTime;
      const percentPlayed = (100 / videoDuration) * this.totalPlayDuration;

      if (
        !this.playCountIncremented &&
        percentPlayed >= this.minimumPlayPercent
      ) {
        this.incrementPlayCount();
        this.playCountIncremented = true;
      }

      // if video is 98% or more complete then reset resume_time
      if (percentCompleted >= 98) {
        resumeTime = 0;
      }

      this.saveActivity(resumeTime, this.currentPlayDuration);
      this.currentPlayDuration = 0;
    }
  }
}

// Register the plugin with video.js.
videojs.registerPlugin("trackActivity", TrackActivityPlugin);

export default TrackActivityPlugin;
