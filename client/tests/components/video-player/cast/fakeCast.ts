/**
 * A fake Google Cast sender framework for the cast tests: CastContext,
 * RemotePlayer and RemotePlayerController as event emitters, and the
 * `chrome.cast.media` classes the load request is built from. Nothing here
 * contacts a device or Google.
 */
import { untrusted } from "@tests/helpers/untrusted";
import { vi } from "vitest";
import type { CastFramework } from "@/components/video-player/cast/castSdk";

type Handler = (event: never) => void;

/** Listeners by event type, counted so a test can see one per type */
class Emitter {
  readonly listeners = new Map<string, Set<Handler>>();

  addEventListener(type: string, handler: Handler) {
    const set = this.listeners.get(type) ?? new Set<Handler>();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: Handler) {
    this.listeners.get(type)?.delete(handler);
  }

  count(type: string) {
    return this.listeners.get(type)?.size ?? 0;
  }

  emit(type: string, event: unknown = {}) {
    for (const handler of [...(this.listeners.get(type) ?? [])]) {
      handler(event as never);
    }
  }
}

export const CAST_STATE = {
  NO_DEVICES_AVAILABLE: "NO_DEVICES_AVAILABLE",
  NOT_CONNECTED: "NOT_CONNECTED",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
};

export const SESSION_STATE = {
  SESSION_STARTED: "SESSION_STARTED",
  SESSION_RESUMED: "SESSION_RESUMED",
  SESSION_ENDED: "SESSION_ENDED",
};

export const REMOTE_EVENT = {
  CURRENT_TIME_CHANGED: "currentTimeChanged",
  DURATION_CHANGED: "durationChanged",
  IS_PAUSED_CHANGED: "isPausedChanged",
  PLAYER_STATE_CHANGED: "playerStateChanged",
};

export class FakeRemotePlayer {
  currentTime = 0;
  duration = 0;
  isPaused = false;
  isMediaLoaded = false;
  playerState: string | null = null;
}

export class FakeRemotePlayerController extends Emitter {
  readonly playOrPause = vi.fn();
  readonly seek = vi.fn();

  constructor(readonly player: FakeRemotePlayer) {
    super();
  }
}

export interface FakeMediaSession {
  media?: { customData?: unknown } | null;
  idleReason?: string | null;
}

export class FakeSession {
  mediaSession: FakeMediaSession | null = null;
  readonly loadMedia = vi.fn(
    (_request: unknown): Promise<string | undefined> =>
      Promise.resolve(undefined)
  );

  constructor(readonly friendlyName = "Living Room TV") {}

  getCastDevice() {
    return { friendlyName: this.friendlyName };
  }

  getMediaSession() {
    return this.mediaSession;
  }
}

export class FakeCastContext extends Emitter {
  castState = CAST_STATE.NOT_CONNECTED;
  session: FakeSession | null = null;
  readonly setOptions = vi.fn();
  readonly requestSession = vi.fn(() => Promise.resolve(undefined));

  getCastState() {
    return this.castState;
  }

  getCurrentSession() {
    return this.session;
  }

  /** The SDK's cast state change */
  setCastState(state: string) {
    this.castState = state;
    this.emit("caststatechanged", { castState: state });
  }

  /** A session starts on `session` (the user picked a device) */
  startSession(session: FakeSession) {
    this.session = session;
    this.setCastState(CAST_STATE.CONNECTED);
    this.emit("sessionstatechanged", {
      sessionState: SESSION_STATE.SESSION_STARTED,
      session,
    });
  }

  /** An existing session is joined (auto-join after a reload) */
  resumeSession(session: FakeSession) {
    this.session = session;
    this.setCastState(CAST_STATE.CONNECTED);
    this.emit("sessionstatechanged", {
      sessionState: SESSION_STATE.SESSION_RESUMED,
      session,
    });
  }

  endSession() {
    const session = this.session;
    this.session = null;
    this.setCastState(CAST_STATE.NOT_CONNECTED);
    this.emit("sessionstatechanged", {
      sessionState: SESSION_STATE.SESSION_ENDED,
      session,
    });
  }
}

/** `chrome.cast.media`: plain classes holding what they are given */
export const fakeMedia = {
  DEFAULT_MEDIA_RECEIVER_APP_ID: "CC1AD845",
  StreamType: { BUFFERED: "BUFFERED" },
  TrackType: { TEXT: "TEXT" },
  TextTrackType: { SUBTITLES: "SUBTITLES" },
  HlsSegmentFormat: { TS: "ts" },
  HlsVideoSegmentFormat: { MPEG2_TS: "mpeg2_ts" },
  PlayerState: { IDLE: "IDLE", PLAYING: "PLAYING" },
  IdleReason: { ERROR: "ERROR", FINISHED: "FINISHED" },
  Image: class {
    constructor(readonly url: string) {}
  },
  GenericMediaMetadata: class {
    title?: string;
    subtitle?: string;
    images?: unknown[];
  },
  Track: class {
    trackContentId?: string;
    trackContentType?: string;
    subtype?: string;
    name?: string;
    language?: string;
    constructor(
      readonly trackId: number,
      readonly type: string
    ) {}
  },
  MediaInfo: class {
    contentUrl?: string;
    streamType?: string;
    metadata?: unknown;
    tracks?: unknown[];
    customData?: unknown;
    hlsSegmentFormat?: string;
    hlsVideoSegmentFormat?: string;
    constructor(
      readonly contentId: string,
      readonly contentType: string
    ) {}
  },
  LoadRequest: class {
    autoplay?: boolean;
    currentTime?: number;
    activeTrackIds?: number[];
    constructor(readonly media: unknown) {}
  },
};

export type CastMedia = typeof chrome.cast.media;

/** The fake namespace typed as the SDK's, for the code under test */
export const castMedia = (): CastMedia => untrusted<CastMedia>(fakeMedia);

/** One fake framework: its context, and the remote player its code made */
export function fakeFramework() {
  const context = new FakeCastContext();
  const remotes: FakeRemotePlayer[] = [];
  const controllers: FakeRemotePlayerController[] = [];
  const framework = {
    CastContext: { getInstance: () => context },
    CastContextEventType: {
      CAST_STATE_CHANGED: "caststatechanged",
      SESSION_STATE_CHANGED: "sessionstatechanged",
    },
    CastState: CAST_STATE,
    SessionState: SESSION_STATE,
    RemotePlayerEventType: REMOTE_EVENT,
    RemotePlayer: class extends FakeRemotePlayer {
      constructor() {
        super();
        remotes.push(this);
      }
    },
    RemotePlayerController: class extends FakeRemotePlayerController {
      constructor(player: FakeRemotePlayer) {
        super(player);
        controllers.push(this);
      }
    },
  };
  return {
    framework: untrusted<CastFramework>(framework),
    context,
    /** The latest RemotePlayer the code made */
    remote: () => {
      const remote = remotes.at(-1);
      if (!remote) throw new Error("no RemotePlayer was made");
      return remote;
    },
    /** The latest RemotePlayerController the code made */
    controller: () => {
      const controller = controllers.at(-1);
      if (!controller) throw new Error("no RemotePlayerController was made");
      return controller;
    },
    remotes,
    controllers,
  };
}

export type FakeFramework = ReturnType<typeof fakeFramework>;
