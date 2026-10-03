/**
 * Ambient type declarations for Video.js and related packages.
 *
 * Video.js 7.x does not ship TypeScript declarations. These minimal declarations
 * silence tsc errors without changing any runtime behavior.
 */

// ---------------------------------------------------------------------------
// video.js
// ---------------------------------------------------------------------------
declare module "video.js" {
  /** Video.js player instance (opaque — use `any` to avoid modeling the full API). */
  type Player = any;
  type Component = any;
  type Plugin = any;

  interface VideoJsStatic {
    (element: any, options?: any, ready?: () => void): Player;

    // Class / plugin registries
    getComponent(name: string): any;
    getPlugin(name: string): any;
    registerComponent(name: string, comp: any): void;
    registerPlugin(name: string, plugin: any): void;

    // Middleware
    use(type: string, middleware: any): void;
    middleware: { TERMINATOR: symbol };

    // Utilities
    dom: {
      createEl(tagName?: string, props?: any, attrs?: any): any;
      getPointerPosition(el: any, event: any): { x: number; y: number };
    };
    browser: { IS_SAFARI: boolean; [key: string]: any };
    createTimeRanges(ranges: Array<[number, number]>): any;
    log: {
      level(lvl: string): void;
      (...args: any[]): void;
    };
  }

  const videojs: VideoJsStatic;
  export default videojs;
}

// ---------------------------------------------------------------------------
// Packages that ship no types
// ---------------------------------------------------------------------------
declare module "videojs-seek-buttons" {
  // Side-effect import only
}

// ---------------------------------------------------------------------------
// Google Cast sender framework (loaded from gstatic by video-player/cast/castSdk.ts)
// Only what Peek reads; the rest of the framework stays untyped.
// ---------------------------------------------------------------------------
declare namespace cast.framework {
  interface CastOptions {
    receiverApplicationId: string;
    autoJoinPolicy: string;
  }
  interface CastStateEventData {
    castState: string;
  }
  interface SessionStateEventData {
    sessionState: string;
    session: CastSession;
  }
  interface CastSession {
    getCastDevice(): { friendlyName: string };
    /** Resolves undefined once the receiver has the media, else an error code */
    loadMedia(
      request: chrome.cast.media.LoadRequest
    ): Promise<string | undefined>;
    getMediaSession(): chrome.cast.media.Media | null;
  }
  interface CastContext {
    setOptions(options: CastOptions): void;
    getCastState(): string;
    getCurrentSession(): CastSession | null;
    /** Opens Chrome's Cast dialog; rejects when the user closes it */
    requestSession(): Promise<string | undefined>;
    addEventListener(
      type: "caststatechanged",
      handler: (event: CastStateEventData) => void
    ): void;
    addEventListener(
      type: "sessionstatechanged",
      handler: (event: SessionStateEventData) => void
    ): void;
    removeEventListener(
      type: "caststatechanged",
      handler: (event: CastStateEventData) => void
    ): void;
    removeEventListener(
      type: "sessionstatechanged",
      handler: (event: SessionStateEventData) => void
    ): void;
  }
  const CastContext: { getInstance(): CastContext };
  const CastContextEventType: {
    CAST_STATE_CHANGED: "caststatechanged";
    SESSION_STATE_CHANGED: "sessionstatechanged";
  };
  const CastState: {
    NO_DEVICES_AVAILABLE: string;
    NOT_CONNECTED: string;
    CONNECTING: string;
    CONNECTED: string;
  };
  const SessionState: {
    SESSION_STARTED: string;
    SESSION_RESUMED: string;
    SESSION_ENDED: string;
  };
  const RemotePlayerEventType: {
    CURRENT_TIME_CHANGED: string;
    DURATION_CHANGED: string;
    IS_PAUSED_CHANGED: string;
    PLAYER_STATE_CHANGED: string;
    /** The receiver's media changed (a load from this or another sender) */
    MEDIA_INFO_CHANGED: string;
  };
  /** The receiver's state, kept current by its controller */
  class RemotePlayer {
    currentTime: number;
    duration: number;
    isPaused: boolean;
    isMediaLoaded: boolean;
    playerState: string | null;
  }
  class RemotePlayerController {
    constructor(player: RemotePlayer);
    addEventListener(type: string, handler: () => void): void;
    removeEventListener(type: string, handler: () => void): void;
    playOrPause(): void;
    /** Seeks the receiver to the RemotePlayer's `currentTime` */
    seek(): void;
  }
}

declare namespace chrome.cast {
  const AutoJoinPolicy: { ORIGIN_SCOPED: string };
}

declare namespace chrome.cast.media {
  const DEFAULT_MEDIA_RECEIVER_APP_ID: string;
  const StreamType: { BUFFERED: string };
  const TrackType: { TEXT: string };
  const TextTrackType: { SUBTITLES: string };
  const HlsSegmentFormat: { TS: string };
  const HlsVideoSegmentFormat: { MPEG2_TS: string };
  const PlayerState: { IDLE: string; PLAYING: string };
  const IdleReason: { ERROR: string; FINISHED: string };
  class Image {
    constructor(url: string);
    url: string;
  }
  class GenericMediaMetadata {
    title?: string;
    subtitle?: string;
    images?: Image[];
  }
  class Track {
    constructor(trackId: number, trackType: string);
    trackId: number;
    type: string;
    trackContentId?: string;
    trackContentType?: string;
    subtype?: string;
    name?: string;
    language?: string;
  }
  class MediaInfo {
    constructor(contentId: string, contentType: string);
    contentId: string;
    contentType: string;
    contentUrl?: string;
    streamType?: string;
    metadata?: GenericMediaMetadata;
    tracks?: Track[];
    customData?: unknown;
    hlsSegmentFormat?: string;
    hlsVideoSegmentFormat?: string;
  }
  class LoadRequest {
    constructor(mediaInfo: MediaInfo);
    media: MediaInfo;
    autoplay?: boolean;
    currentTime?: number;
    activeTrackIds?: number[];
  }
  /** Which of the media's tracks the receiver shows */
  class EditTracksInfoRequest {
    constructor(activeTrackIds?: number[]);
    activeTrackIds?: number[];
  }
  /** The receiver's media session */
  interface Media {
    media?: MediaInfo | null;
    idleReason?: string | null;
    editTracksInfo(
      request: EditTracksInfoRequest,
      onSuccess: () => void,
      onError: (error: unknown) => void
    ): void;
  }
}

interface Window {
  __onGCastApiAvailable?: (available: boolean) => void;
}
