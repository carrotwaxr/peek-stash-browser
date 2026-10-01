import videojs from "video.js";

const intervalSeconds = 1; // check every second
const sendInterval = 10; // send every 10 seconds

/** How a save or a play count is sent: `keepalive` outlives the page */
export interface SendOptions {
  keepalive?: boolean;
}

class TrackActivityPlugin extends videojs.getPlugin("plugin") {
  totalPlayDuration: number;
  currentPlayDuration: number;
  minimumPlayPercent: number;
  incrementPlayCount: (options?: SendOptions) => Promise<void>;
  saveActivity: (
    resumeTime: number,
    playDuration: number,
    options?: SendOptions
  ) => Promise<void>;
  enabled: boolean;
  playCountIncremented: boolean;
  intervalID: number | undefined;
  lastResumeTime: number;
  lastDuration: number;
  declare player: any;
  private readonly onVisibilityChange: () => void;
  private readonly onPageHide: () => void;

  constructor(player: any) {
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

    // The seconds played since the last save are lost when the tab goes to
    // the background (a phone may never come back) or the page closes, so
    // they are sent then, with a request that outlives the page.
    this.onVisibilityChange = () => {
      if (document.visibilityState === "hidden") this.flush(true);
    };
    this.onPageHide = () => {
      this.flush(true);
    };
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pagehide", this.onPageHide);

    player.on("dispose", () => {
      this.stop();
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      window.removeEventListener("pagehide", this.onPageHide);
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

  /**
   * Send what was played since the last save without stopping the
   * interval: the tab is hidden or the page is going away, and playback
   * (or the next show of the tab) goes on from here.
   */
  flush(keepalive: boolean) {
    if (this.currentPlayDuration <= 0) return;
    this.sendActivity(keepalive);
  }

  setEnabled(enabled: boolean) {
    if (!enabled) {
      // Stop first: it sends the partial interval, which needs `enabled`
      this.stop();
      this.enabled = false;
      return;
    }
    this.enabled = true;
    if (!this.player.paused()) {
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

  sendActivity(keepalive = false) {
    if (!this.enabled) return;
    // A request that outlives the page; a normal one has no extra argument
    const options: [SendOptions] | [] = keepalive ? [{ keepalive: true }] : [];

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
        void this.incrementPlayCount(...options);
        this.playCountIncremented = true;
      }

      // if video is 98% or more complete then reset resume_time
      if (percentCompleted >= 98) {
        resumeTime = 0;
      }

      void this.saveActivity(resumeTime, this.currentPlayDuration, ...options);
      this.currentPlayDuration = 0;
    }
  }
}

// Register the plugin with video.js.
videojs.registerPlugin("trackActivity", TrackActivityPlugin);

export default TrackActivityPlugin;
