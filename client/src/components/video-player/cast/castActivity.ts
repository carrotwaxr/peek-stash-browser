/**
 * Watch progress while casting: the TV's counterpart of the trackActivity
 * plugin, in the lazy cast chunk.
 *
 * Once a second it reads the receiver's state. Played seconds are the wall
 * clock while the TV is PLAYING, never more than its position moved: paused
 * or buffering time counts nothing, a seek counts nothing, and a throttled
 * background tab whose timer fires minutes late counts only what the TV
 * played. Every 10 played seconds, and when the TV stops playing, it saves
 * the TV's position (0 once 98 % is reached) and the seconds played; past
 * `minimumPlayPercent` of the scene it counts the play. Everything goes
 * through the viewing it is given, the one the local tracker uses, so a play
 * counts once whichever tracker gets there. A hidden tab or a closing page
 * flushes with `keepalive`.
 */
import type { Viewing } from "../activitySenders";

export interface CastActivityOptions {
  remote: cast.framework.RemotePlayer;
  media: typeof chrome.cast.media;
  viewing: Viewing;
  minimumPlayPercent: number;
}

export class CastActivity {
  private timer: number | undefined;
  private at = 0;
  private loaded = false;
  private position = 0;
  private duration = 0;
  private wasPlaying = false;
  /** Seconds the TV played in this viewing, for the play count */
  private played = 0;
  /** Seconds played since the last save */
  private unsent = 0;

  constructor(private readonly options: CastActivityOptions) {}

  start() {
    this.sample();
    this.timer = window.setInterval(this.tick, 1000);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
  }

  /** Saves what was played since the last save and stops tracking */
  stop() {
    if (this.timer === undefined) return;
    window.clearInterval(this.timer);
    this.timer = undefined;
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pagehide", this.onPageHide);
    this.accrue();
    this.send();
  }

  private readonly tick = () => {
    this.accrue();
    if (this.unsent >= 10 || (!this.wasPlaying && this.unsent > 0)) {
      this.send();
    }
  };

  private readonly onVisibility = () => {
    if (document.visibilityState === "hidden") this.flush();
  };

  private readonly onPageHide = () => {
    this.flush();
  };

  private flush() {
    this.accrue();
    this.send({ keepalive: true });
  }

  private isPlaying() {
    const { remote, media } = this.options;
    return remote.playerState === media.PlayerState.PLAYING;
  }

  /**
   * Reads the TV now: the clock, whether it plays, and its position and
   * duration. The SDK clears the RemotePlayer when no media is loaded (before
   * a load, as the session ends), so the last loaded reading is kept then.
   */
  private sample() {
    const { remote } = this.options;
    this.at = Date.now();
    this.loaded = remote.isMediaLoaded;
    if (this.loaded) {
      this.position = remote.currentTime;
      this.duration = remote.duration;
    }
    this.wasPlaying = this.loaded && this.isPlaying();
  }

  /** Adds the seconds played since the last sample */
  private accrue() {
    const { at, position, loaded, wasPlaying } = this;
    this.sample();
    if (!loaded || !this.loaded || (!wasPlaying && !this.wasPlaying)) return;
    const seconds = Math.min(
      (this.at - at) / 1000,
      Math.max(0, this.position - position)
    );
    this.played += seconds;
    this.unsent += seconds;
  }

  private send(options?: { keepalive: true }) {
    const { viewing, minimumPlayPercent } = this.options;
    const { duration } = this;
    if (this.unsent <= 0 || !Number.isFinite(duration) || duration <= 0) {
      return;
    }
    if ((100 * this.played) / duration >= minimumPlayPercent) {
      void viewing.countPlay(options);
    }
    const resumeTime =
      (100 * this.position) / duration >= 98 ? 0 : this.position;
    void viewing.save(resumeTime, this.unsent, options);
    this.unsent = 0;
  }
}
