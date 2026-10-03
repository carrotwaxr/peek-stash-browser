/**
 * One Cast session as the Scene page sees it.
 *
 * `buildLoadRequest` turns the user's signed media link into what the Default
 * Media Receiver loads: every URL is the browser's own origin plus a signed
 * path, so the TV needs no cookie. `CastSessionController` listens to the
 * Cast framework for the player: a session start pauses the local player and
 * loads the scene on the receiver, the page's controls then drive the
 * receiver (through `castMiddleware`), and a session end hands the scene back
 * to the local player where the TV left it.
 */
import type { SceneMediaLinkResponse } from "@peek/shared-types";
import { makeCompositeKey } from "../../../utils/compositeKey";
import { getSceneTitle } from "../../../utils/format";
import type { Viewing } from "../activitySenders";
import { CastActivity } from "./castActivity";
import type { CastAwarePlayer, CastRemote } from "./castMiddleware";
import {
  type AddOrderedControl,
  type CastButtonControl,
  type CastControlsPlayer,
  type CastStatusControl,
  addCastButton,
  addCastStatus,
} from "./castPlugin";
import type { CastFramework } from "./castSdk";

export type CastMedia = typeof chrome.cast.media;

/** The scene fields a load request names */
export interface CastScene {
  id: string;
  instanceId: string;
  title?: string | null;
  files?: { basename?: string }[];
  performers?: { name?: string | null }[] | null;
}

/** Captions on the TV come through Peek's caption route, which serves WebVTT */
const CAPTION_TYPE = "text/vtt";

/**
 * Where a cast starts: the local player's position once it has played, else
 * the user's resume point for the scene, else the start.
 */
export function castStartTime({
  hasPlayed,
  localTime,
  resumeTime,
}: {
  hasPlayed: boolean;
  localTime: number;
  resumeTime: number | null | undefined;
}): number {
  if (hasPlayed) return Number.isFinite(localTime) ? localTime : 0;
  return resumeTime && resumeTime > 0 ? resumeTime : 0;
}

/**
 * The receiver's load request for `scene`, or null when the link offers no
 * source a Cast device plays. `customData.scene` is the scene as
 * `id:instanceId`, so a page joining the session later can tell whose media
 * is playing.
 */
export function buildLoadRequest(
  media: CastMedia,
  {
    link,
    origin,
    scene,
    startTime,
  }: {
    link: SceneMediaLinkResponse;
    origin: string;
    scene: CastScene;
    startTime: number;
  }
): chrome.cast.media.LoadRequest | null {
  const source = link.cast;
  if (!source) return null;

  const url = origin + source.url;
  const info = new media.MediaInfo(url, source.contentType);
  info.contentUrl = url;
  info.streamType = media.StreamType.BUFFERED;
  if (source.kind === "hls") {
    // Stash's HLS is MPEG-TS segments; the receiver would guess otherwise
    info.hlsSegmentFormat = media.HlsSegmentFormat.TS;
    info.hlsVideoSegmentFormat = media.HlsVideoSegmentFormat.MPEG2_TS;
  }

  const metadata = new media.GenericMediaMetadata();
  metadata.title = getSceneTitle(scene);
  const performers = (scene.performers ?? [])
    .map((performer) => performer.name)
    .filter(Boolean)
    .join(", ");
  if (performers) metadata.subtitle = performers;
  metadata.images = link.poster ? [new media.Image(origin + link.poster)] : [];
  info.metadata = metadata;

  info.tracks = link.captions.map((caption, index) => {
    const track = new media.Track(index + 1, media.TrackType.TEXT);
    track.trackContentId = origin + caption.url;
    track.trackContentType = CAPTION_TYPE;
    track.subtype = media.TextTrackType.SUBTITLES;
    track.name = caption.lang;
    track.language = caption.lang;
    return track;
  });
  info.customData = { scene: makeCompositeKey(scene.id, scene.instanceId) };

  const request = new media.LoadRequest(info);
  request.currentTime = startTime;
  request.autoplay = true;
  return request;
}

/** The receiver as `castMiddleware` reads it */
export function remoteView(
  remote: cast.framework.RemotePlayer,
  controller: cast.framework.RemotePlayerController,
  mediaSession: () => chrome.cast.media.Media | null,
  media: CastMedia
): CastRemote {
  return {
    currentTime: () => remote.currentTime,
    duration: () => remote.duration,
    // Nothing loaded (still loading, or finished) is not playing
    paused: () => remote.isPaused || !remote.isMediaLoaded,
    ended: () =>
      remote.playerState === media.PlayerState.IDLE &&
      mediaSession()?.idleReason === media.IdleReason.FINISHED,
    seek(seconds) {
      remote.currentTime = seconds;
      controller.seek();
    },
    play() {
      if (remote.isPaused) controller.playOrPause();
    },
    pause() {
      if (!remote.isPaused) controller.playOrPause();
    },
  };
}

/** The player as the controller drives it (video.js types it `any`) */
export interface CastPlayer extends CastControlsPlayer, CastAwarePlayer {
  peekCastState?: string;
  pause(): void;
  currentTime(): number;
  currentTime(seconds: number): void;
  hasStarted(): boolean;
  trigger(event: string): void;
  tech(options: { IWillNotUseThisInPlugins: boolean }): {
    trigger(event: string): void;
  } | null;
  isDisposed(): boolean;
  /** The local tracker (absent where the plugin is not registered) */
  trackActivity?(): { setEnabled(enabled: boolean): void };
}

export interface CastSessionOptions {
  framework: CastFramework;
  media: CastMedia;
  player: CastPlayer;
  /**
   * The page now (it changes while the controller lives): its scene, the
   * user's resume point for that scene, and the scene's viewing (the local
   * tracker's senders, which the cast tracker shares)
   */
  page(): {
    scene: CastScene | null;
    resumeTime: number | null | undefined;
    viewing: { readonly current: Viewing | null };
    minimumPlayPercent: number;
  };
  /** The scene's signed media link (C2's query) */
  fetchLink(scene: CastScene): Promise<SceneMediaLinkResponse>;
  /** Tells the user something went wrong (a toast) */
  notify(message: string): void;
  /** Places the Cast button in the control bar's order */
  addOrderedControl: AddOrderedControl;
}

export const NO_CAST_SOURCE_MESSAGE =
  "This scene has no format a Cast device can play";
export const CAST_LINK_EXPIRED_MESSAGE =
  "Cast link expired, start casting again";

const deviceName = (session: cast.framework.CastSession | null) =>
  session?.getCastDevice().friendlyName ?? null;

/** The scene a session's media names in `customData.scene`, if any */
function sceneOfMedia(media: chrome.cast.media.Media | null): string | null {
  const customData = media?.media?.customData;
  if (typeof customData !== "object" || customData === null) return null;
  const scene = (customData as { scene?: unknown }).scene;
  return typeof scene === "string" ? scene : null;
}

/**
 * Ties one player to the Cast framework. `attach` adds the button, the
 * status line and every listener; `detach` removes them all.
 */
export class CastSessionController {
  private readonly context: cast.framework.CastContext;
  private readonly remote: cast.framework.RemotePlayer;
  private readonly controller: cast.framework.RemotePlayerController;
  private readonly view: CastRemote;
  private readonly remoteListeners: [string, () => void][];
  private button: CastButtonControl | null = null;
  private status: CastStatusControl | null = null;
  /** Records the TV's progress while attached */
  private tracker: CastActivity | null = null;
  private castState = "";
  /** The session this page follows; null while the local player plays */
  private attachedTo: cast.framework.CastSession | null = null;
  private lastRemoteTime = 0;
  private expiresAt = Number.POSITIVE_INFINITY;
  /** Bumped by each start and end, so a late answer to an old load is dropped */
  private loads = 0;

  constructor(private readonly options: CastSessionOptions) {
    const { framework, media } = options;
    this.context = framework.CastContext.getInstance();
    this.remote = new framework.RemotePlayer();
    this.controller = new framework.RemotePlayerController(this.remote);
    this.view = remoteView(
      this.remote,
      this.controller,
      () => this.attachedTo?.getMediaSession() ?? null,
      media
    );
    const events = framework.RemotePlayerEventType;
    this.remoteListeners = [
      [events.CURRENT_TIME_CHANGED, this.onRemoteTime],
      [events.IS_PAUSED_CHANGED, this.onRemotePaused],
      [events.DURATION_CHANGED, this.onRemoteDuration],
      [events.PLAYER_STATE_CHANGED, this.onRemotePlayerState],
    ];
  }

  attach() {
    const { framework, player } = this.options;
    const events = framework.CastContextEventType;
    this.context.addEventListener(events.CAST_STATE_CHANGED, this.onCastState);
    this.context.addEventListener(
      events.SESSION_STATE_CHANGED,
      this.onSessionState
    );
    for (const [type, handler] of this.remoteListeners) {
      this.controller.addEventListener(type, handler);
    }
    this.button = addCastButton(
      player,
      this.requestSession,
      this.options.addOrderedControl
    );
    this.status = addCastStatus(player);
    this.setCastState(this.context.getCastState());

    // A session already live (joined after a reload, or this page opened
    // while casting) is followed when it plays this scene
    const session = this.context.getCurrentSession();
    if (session) this.resume(session);
  }

  detach() {
    const { framework, player } = this.options;
    const events = framework.CastContextEventType;
    this.context.removeEventListener(
      events.CAST_STATE_CHANGED,
      this.onCastState
    );
    this.context.removeEventListener(
      events.SESSION_STATE_CHANGED,
      this.onSessionState
    );
    for (const [type, handler] of this.remoteListeners) {
      this.controller.removeEventListener(type, handler);
    }
    this.loads += 1;
    const attached = this.attachedTo !== null;
    this.attachedTo = null;
    player.peekCastConnected = false;
    player.peekCastRemote = null;
    if (attached) this.track(false);
    if (!player.isDisposed()) {
      this.button?.remove();
      this.status?.remove();
    }
    this.button = null;
    this.status = null;
  }

  /** Opens Chrome's Cast dialog (pick a device, or stop casting) */
  private readonly requestSession = () => {
    // The dialog rejects when the user closes it: nothing to do
    this.context.requestSession().catch(() => {});
  };

  private readonly onCastState = (event: cast.framework.CastStateEventData) => {
    this.setCastState(event.castState);
  };

  private readonly onSessionState = (
    event: cast.framework.SessionStateEventData
  ) => {
    const states = this.options.framework.SessionState;
    switch (event.sessionState) {
      case states.SESSION_STARTED:
        void this.start(event.session);
        break;
      case states.SESSION_RESUMED:
        this.resume(event.session);
        break;
      case states.SESSION_ENDED:
        this.end();
        break;
    }
  };

  private readonly onRemoteTime = () => {
    if (!this.attachedTo) return;
    this.lastRemoteTime = this.remote.currentTime;
    this.options.player.trigger("timeupdate");
  };

  private readonly onRemotePaused = () => {
    if (!this.attachedTo) return;
    this.options.player.trigger(this.remote.isPaused ? "pause" : "play");
  };

  private readonly onRemoteDuration = () => {
    if (this.attachedTo) this.durationChanged();
  };

  private readonly onRemotePlayerState = () => {
    const session = this.attachedTo;
    if (!session) return;
    const { media } = this.options;
    if (
      this.remote.playerState === media.PlayerState.IDLE &&
      session.getMediaSession()?.idleReason === media.IdleReason.ERROR
    ) {
      this.options.notify(this.failureMessage(session));
    }
  };

  private setCastState(castState: string) {
    this.castState = castState;
    this.button?.setCastState(
      castState,
      deviceName(this.context.getCurrentSession())
    );
    this.publish();
  }

  /** A new session: the scene moves from the local player to the TV */
  private async start(session: cast.framework.CastSession) {
    const { player } = this.options;
    const { scene, resumeTime } = this.options.page();
    if (!scene || player.isDisposed()) return;

    const startTime = castStartTime({
      hasPlayed: player.hasStarted(),
      localTime: player.currentTime(),
      resumeTime,
    });
    player.pause();
    this.expiresAt = Number.POSITIVE_INFINITY;
    this.follow(session);

    this.loads += 1;
    const load = this.loads;
    try {
      const link = await this.options.fetchLink(scene);
      if (load !== this.loads) return;
      this.expiresAt = Date.parse(link.expiresAt);
      const request = buildLoadRequest(this.options.media, {
        link,
        origin: window.location.origin,
        scene,
        startTime,
      });
      if (!request) {
        this.fail(NO_CAST_SOURCE_MESSAGE);
        return;
      }
      const error = await session.loadMedia(request);
      if (load !== this.loads) return;
      if (error) this.fail(this.failureMessage(session));
    } catch {
      if (load !== this.loads) return;
      this.fail(this.failureMessage(session));
    }
  }

  /** A session joined later: followed only when it plays this scene */
  private resume(session: cast.framework.CastSession) {
    const { scene } = this.options.page();
    if (!scene) return;
    const playing = sceneOfMedia(session.getMediaSession());
    if (playing !== makeCompositeKey(scene.id, scene.instanceId)) return;
    this.lastRemoteTime = this.remote.currentTime;
    this.follow(session);
  }

  /** The session ended: the local player takes the scene back, paused */
  private end() {
    this.loads += 1;
    if (!this.attachedTo) return;
    this.release(this.lastRemoteTime);
  }

  private fail(message: string) {
    this.options.notify(message);
    this.release();
  }

  /**
   * The sender cannot see the receiver's HTTP status, so a link past its
   * expiry is taken to be why a load or playback failed
   */
  private failureMessage(session: cast.framework.CastSession) {
    if (Date.now() >= this.expiresAt) return CAST_LINK_EXPIRED_MESSAGE;
    const device = deviceName(session);
    return device
      ? `Couldn't play this scene on ${device}`
      : "Couldn't play this scene on the Cast device";
  }

  private follow(session: cast.framework.CastSession) {
    const { player } = this.options;
    // Before the flags: the local tracker's last save reads the local player
    this.track(true);
    this.attachedTo = session;
    player.peekCastConnected = true;
    player.peekCastRemote = this.view;
    this.status?.show(deviceName(session));
    this.publish();
    this.durationChanged();
  }

  /** Back to the local player, at `seekTo` when given, paused */
  private release(seekTo?: number) {
    const { player } = this.options;
    this.attachedTo = null;
    player.peekCastConnected = false;
    player.peekCastRemote = null;
    this.status?.show(null);
    this.publish();
    if (player.isDisposed()) {
      this.track(false);
      return;
    }
    player.pause();
    if (seekTo !== undefined) player.currentTime(seekTo);
    // Once the local player is paused where the TV left it
    this.track(false);
    // The control bar showed the receiver: it follows the local player again
    player.trigger("pause");
    player.trigger("timeupdate");
    this.durationChanged();
  }

  /**
   * While attached the cast tracker records the TV's progress through the
   * page's viewing and the local tracker is off (the player answers for the
   * TV then); otherwise the local tracker is on again.
   */
  private track(attached: boolean) {
    const { player, media } = this.options;
    this.tracker?.stop();
    this.tracker = null;
    const { viewing, minimumPlayPercent } = this.options.page();
    if (attached && viewing.current) {
      this.tracker = new CastActivity({
        remote: this.remote,
        media,
        viewing: viewing.current,
        minimumPlayPercent,
      });
      this.tracker.start();
    }
    if (!player.isDisposed()) player.trackActivity?.().setEnabled(!attached);
  }

  /** `player.peekCastState` and `peek:caststate` for the player's readers */
  private publish() {
    const { player } = this.options;
    if (player.isDisposed()) return;
    player.peekCastState = this.castState;
    player.trigger("peek:caststate");
  }

  /** The player reads its duration again, through the middleware */
  private durationChanged() {
    const { player } = this.options;
    if (player.isDisposed()) return;
    player.tech({ IWillNotUseThisInPlugins: true })?.trigger("durationchange");
  }
}
