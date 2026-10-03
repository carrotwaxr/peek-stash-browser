/**
 * While a cast is attached, the local player answers for the receiver.
 *
 * Many callers drive the player (the control bar, the hotkeys, the seek and
 * skip buttons, pause-on-scrub, the media session, ClipList's `seekToTime`,
 * the player context's `isPlaying`), so the page reaches the receiver through
 * this one middleware rather than through each caller. While
 * `player.peekCastConnected`, the getters answer from the receiver, and seeks,
 * play and pause go to it and stop here: the paused local element never moves,
 * so it fetches no media and a piped transcode starts no local ffmpeg.
 *
 * It must be registered before `durationMiddleware` (`videoPlayerUtils.ts`
 * imports it first): setters run left to right, and a terminated seek never
 * reaches the offset handling that would reload the source. It stays out of
 * any lazy chunk: video.js picks middleware when a source is set, so a late
 * `videojs.use` would miss the source already playing.
 */
import videojs from "video.js";

/** The receiver as the page sees it (`CastSessionController` provides it) */
export interface CastRemote {
  currentTime(): number;
  duration(): number;
  paused(): boolean;
  ended(): boolean;
  seek(seconds: number): void;
  play(): void;
  pause(): void;
}

/** What the middleware reads on the player (`useCast` sets both) */
export interface CastAwarePlayer {
  peekCastConnected?: boolean;
  /**
   * The receiver while connected. While a session plays another scene than
   * the page's, a stand-in whose `play` loads the page's scene into it (only
   * `play` reads it then); null otherwise.
   */
  peekCastRemote?: CastRemote | null;
}

/** The part of the html5 tech this module guards */
interface SeekableTech {
  setCurrentTime(seconds: unknown): void;
}

const TERMINATOR = videojs.middleware.TERMINATOR;

/** Techs whose `setCurrentTime` already drops a terminated seek */
const guardedTechs = new WeakSet<SeekableTech>();

/**
 * video.js stops a terminated getter or mediator, but hands a setter's
 * TERMINATOR on to the tech, which would assign it to the element. The guard
 * drops it there, so a terminated seek leaves the element alone.
 */
function guardTech(tech: SeekableTech) {
  if (guardedTechs.has(tech)) return;
  guardedTechs.add(tech);
  const setCurrentTime = tech.setCurrentTime.bind(tech);
  tech.setCurrentTime = (seconds: unknown) => {
    if (seconds === TERMINATOR) return;
    setCurrentTime(seconds);
  };
}

export function castMiddleware(player: CastAwarePlayer) {
  const remote = () =>
    player.peekCastConnected ? (player.peekCastRemote ?? null) : null;

  return {
    setTech(tech: SeekableTech) {
      guardTech(tech);
    },

    currentTime(seconds: number) {
      return remote()?.currentTime() ?? seconds;
    },

    duration(seconds: number) {
      return remote()?.duration() ?? seconds;
    },

    paused(paused: boolean) {
      return remote()?.paused() ?? paused;
    },

    ended(ended: boolean) {
      return remote()?.ended() ?? ended;
    },

    setCurrentTime(seconds: number) {
      const receiver = remote();
      if (!receiver) return seconds;
      receiver.seek(seconds);
      return TERMINATOR;
    },

    callPlay(value: unknown) {
      // Connected, or a session playing another scene: never the local play
      const receiver = player.peekCastRemote;
      if (!receiver) return value;
      receiver.play();
      return TERMINATOR;
    },

    callPause(value: unknown) {
      const receiver = remote();
      if (!receiver) return value;
      receiver.pause();
      return TERMINATOR;
    },
  };
}

videojs.use("*", castMiddleware);
