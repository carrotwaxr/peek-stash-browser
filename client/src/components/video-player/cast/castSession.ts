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
 *
 * The cast follows the page's queue (C10): while attached, a queue step
 * (Next, Previous, a pick, the end of a scene) or a restart loads the new
 * scene on the TV. A route change to another scene (a link, Back or Forward)
 * does not: the page lets go, as a page opened on another scene than the
 * session's, and its Cast button or play loads its scene into the session. Each load names this tab
 * (`castSenderId`), and only the tab named by the playing media records it.
 * The page's captions menu drives the receiver's text tracks. When the TV
 * fails mid-scene (a link past its expiry, a scene hidden meanwhile) the page
 * stays on the cast, and play or the Cast button loads the scene again with
 * a new link where the TV stopped.
 */
import type { SceneMediaLinkResponse } from "@peek/shared-types";
import { makeCompositeKey } from "../../../utils/compositeKey";
import { getSceneTitle } from "../../../utils/format";
import type { Viewing } from "../activitySenders";
import { CastActivity } from "./castActivity";
import type { CastAwarePlayer, CastRemote } from "./castMiddleware";
import {
  type CastButtonControl,
  type CastControlsPlayer,
  type CastStatusControl,
  addCastButton,
  addCastStatus,
} from "./castPlugin";
import type { CastFramework } from "./castSdk";
import { castSenderId } from "./castSenderId";

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

/** A text track of the local player, as video.js describes it */
export interface LocalTextTrack {
  kind: string;
  language: string;
  mode: string;
  src?: string;
}

/** The caption format a caption URL names (`type=srt`, `type=vtt`) */
const captionFormat = (url: string | undefined) =>
  /[?&]type=([^&#]*)/.exec(url ?? "")?.[1];

/**
 * The receiver's track ids for the local caption `caption` (none when the
 * page shows none): the track in its language and format, else the first in
 * its language.
 */
export function activeTrackIds(
  tracks: readonly chrome.cast.media.Track[],
  caption: LocalTextTrack | null
): number[] {
  if (!caption) return [];
  const inLanguage = tracks.filter(
    (track) => track.language === caption.language
  );
  const format = captionFormat(caption.src);
  const track =
    inLanguage.find(
      (candidate) => captionFormat(candidate.trackContentId) === format
    ) ?? inLanguage[0];
  return track ? [track.trackId] : [];
}

/** The caption or subtitle track the local player shows, if any */
function showingCaption(player: CastPlayer): LocalTextTrack | null {
  const tracks = player.textTracks();
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    if (
      track?.mode === "showing" &&
      (track.kind === "captions" || track.kind === "subtitles")
    ) {
      return track;
    }
  }
  return null;
}

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
 * is playing, and `customData.sender` the tab that loads it, the one that
 * records it. The captions the page shows (`caption`) show on the TV.
 */
export function buildLoadRequest(
  media: CastMedia,
  {
    link,
    origin,
    scene,
    startTime,
    sender,
    caption = null,
  }: {
    link: SceneMediaLinkResponse;
    origin: string;
    scene: CastScene;
    startTime: number;
    sender: string;
    caption?: LocalTextTrack | null;
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
  info.customData = {
    scene: makeCompositeKey(scene.id, scene.instanceId),
    sender,
  };

  const request = new media.LoadRequest(info);
  request.currentTime = startTime;
  request.autoplay = true;
  request.activeTrackIds = activeTrackIds(info.tracks, caption);
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
  /** Whether a plugin has been created on this player (video.js) */
  usingPlugin(name: string): boolean;
  /** VR's plugin: calling it creates it, so check `usingPlugin` first */
  peekVr?: () => { disable(): void };
  tech(options: { IWillNotUseThisInPlugins: boolean }): {
    trigger(event: string): void;
  } | null;
  isDisposed(): boolean;
  /** The local tracker (absent where the plugin is not registered) */
  trackActivity?(): { setEnabled(enabled: boolean): void };
  /** The local text tracks: the captions menu sets their modes */
  textTracks(): {
    readonly length: number;
    readonly [index: number]: LocalTextTrack | undefined;
    addEventListener(type: "change", handler: () => void): void;
    removeEventListener(type: "change", handler: () => void): void;
  };
}

export interface CastSessionOptions {
  framework: CastFramework;
  /** `chrome.cast.media` (the SDK's, unless a test hands one in) */
  media?: CastMedia;
  player: CastPlayer;
  /**
   * The page now (it changes while the controller lives): its scene, the
   * queue's restart count, the user's resume point for that scene, and the
   * scene's viewing (the local tracker's senders, which the cast tracker
   * shares)
   */
  page(): {
    scene: CastScene | null;
    restartCount?: number;
    /** Bumped by each queue step, never by a route change */
    queueSteps?: number;
    resumeTime: number | null | undefined;
    viewing: { readonly current: Viewing | null };
    minimumPlayPercent: number;
    /** What the end of a scene does: this tab's autoplay and repeat settings */
    autoplayNext: boolean;
    repeat: string;
    /** The queue's reducer (`NEXT_SCENE` steps it) */
    dispatch: (action: never) => void;
  };
  /**
   * The scene's signed media link (C2's query); `fresh` mints a new one
   * rather than reuse the cached link
   */
  fetchLink(
    scene: CastScene,
    options?: { fresh?: boolean }
  ): Promise<SceneMediaLinkResponse>;
  /** Tells the user something went wrong (a toast) */
  notify(message: string): void;
}

export const NO_CAST_SOURCE_MESSAGE =
  "This scene has no format a Cast device can play";
export const CAST_LINK_EXPIRED_MESSAGE = "Cast link expired";
/** Added to a receiver error's message: the page's play loads it again */
const RETRY_HINT = ": press play to try again";

const deviceName = (session: cast.framework.CastSession | null) =>
  session?.getCastDevice().friendlyName ?? null;

const asString = (value: unknown) => (typeof value === "string" ? value : null);

/**
 * What the session plays: the scene its `customData.scene` names (null for
 * media Peek did not load) and the tab that loaded it; null while nothing is
 * loaded
 */
function mediaOf(
  media: chrome.cast.media.Media | null
): { scene: string | null; sender: string | null } | null {
  const info = media?.media;
  if (!info) return null;
  const customData = (info.customData ?? {}) as {
    scene?: unknown;
    sender?: unknown;
  };
  return {
    scene: asString(customData.scene),
    sender: asString(customData.sender),
  };
}

/**
 * Ties one player to the Cast framework. `attach` adds the button, the
 * status line and every listener; `detach` removes them all; `update` hears
 * each render of the page, whose scene may have changed.
 */
export class CastSessionController {
  private readonly media: CastMedia;
  private readonly context: cast.framework.CastContext;
  private readonly remote: cast.framework.RemotePlayer;
  private readonly controller: cast.framework.RemotePlayerController;
  private readonly view: CastRemote;
  /**
   * What the player's play reaches while the session plays another scene
   * (`castMiddleware` calls it): this page's scene loads into the session
   */
  private readonly loader: CastRemote;
  private readonly remoteListeners: [string, () => void][];
  /** This tab, as the media it loads names it */
  private readonly sender = castSenderId();
  private button: CastButtonControl | null = null;
  private status: CastStatusControl | null = null;
  /** Records the TV's progress while media this tab loaded plays */
  private tracker: CastActivity | null = null;
  private castState = "";
  /** The session this page follows; null while the local player plays */
  private attachedTo: cast.framework.CastSession | null = null;
  /** This tab loaded the media playing, so it records it */
  private loadedHere = false;
  /** A load from this page is under way: the session still plays the last */
  private loading = false;
  /**
   * The receiver failed the media this page follows: play and the Cast
   * button load it again, with a new link, where the TV stopped
   */
  private errored = false;
  /** The page's scene and restart count when last seen */
  private seen = "";
  /** The page's queue steps when its scene or restart count last changed */
  private seenSteps = 0;
  /** The receiver's text tracks as last set, so a repeat is not sent */
  private sentTracks = "";
  private lastRemoteTime = 0;
  private expiresAt = Number.POSITIVE_INFINITY;
  /** Bumped by each load and end, so a late answer to an old load is dropped */
  private loads = 0;

  constructor(private readonly options: CastSessionOptions) {
    const { framework } = options;
    const media = options.media ?? chrome.cast.media;
    this.media = media;
    this.context = framework.CastContext.getInstance();
    this.remote = new framework.RemotePlayer();
    this.controller = new framework.RemotePlayerController(this.remote);
    const view = remoteView(
      this.remote,
      this.controller,
      () => this.attachedTo?.getMediaSession() ?? null,
      media
    );
    this.view = {
      ...view,
      play: () => {
        if (this.errored) this.retry();
        else view.play();
      },
    };
    this.loader = {
      ...this.view,
      play: () => {
        this.castHere();
      },
    };
    const events = framework.RemotePlayerEventType;
    this.remoteListeners = [
      [events.CURRENT_TIME_CHANGED, this.onRemoteTime],
      [events.IS_PAUSED_CHANGED, this.onRemotePaused],
      [events.DURATION_CHANGED, this.onRemoteDuration],
      [events.PLAYER_STATE_CHANGED, this.onRemotePlayerState],
      [events.MEDIA_INFO_CHANGED, this.onMediaInfo],
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
    player.textTracks().addEventListener("change", this.onTextTracks);
    this.button = addCastButton(player, this.onPress);
    this.status = addCastStatus(player);
    this.seen = this.pageMark();
    this.seenSteps = this.options.page().queueSteps ?? 0;
    this.castState = this.context.getCastState();

    // A session already live (joined after a reload, or this page opened
    // while casting) is followed when it plays this scene
    this.sync();
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
    this.loading = false;
    this.errored = false;
    const attached = this.attachedTo !== null;
    this.attachedTo = null;
    // The page goes and the TV plays on: what it played since the last save
    // goes in a request that outlives the page, and nothing records until a
    // page of this tab shows the cast scene again
    this.stopTracking({ keepalive: true });
    player.peekCastConnected = false;
    player.peekCastRemote = null;
    if (!player.isDisposed()) {
      player.textTracks().removeEventListener("change", this.onTextTracks);
      if (attached) player.trackActivity?.().setEnabled(true);
      this.button?.remove();
      this.status?.remove();
    }
    this.button = null;
    this.status = null;
  }

  /**
   * The page rendered. While attached, a new scene or a restart that a queue
   * step brought (the queue's controls, the playlist, the end of a scene, the
   * media keys, the VR HUD) loads that scene on the TV at its start; one a
   * route change brought (a link, Back or Forward) lets the page go, so the
   * Cast button or play casts it. A page that moves to the scene the TV
   * plays follows it. A step's scene lands renders after the step itself,
   * so the steps are compared at the scene change.
   */
  update() {
    const page = this.options.page();
    if (!this.button || !page.scene) return;
    const mark = this.pageMark();
    if (mark === this.seen) return;
    this.seen = mark;
    const steps = page.queueSteps ?? 0;
    const stepped = steps !== this.seenSteps;
    this.seenSteps = steps;
    // After the render's effects, which give the new scene its viewing
    queueMicrotask(() => {
      if (!this.button) return;
      const session = this.attachedTo;
      if (!session) {
        this.sync();
        return;
      }
      if (!stepped) {
        // The TV plays on; this page offers its own scene to it
        this.release();
        return;
      }
      // The TV goes on as it was: playing (or just finished), or paused
      const playing = !this.view.paused() || this.view.ended();
      void this.load(session, 0, playing);
    });
  }

  /** The page's scene as `id:instanceId`, or null while it loads */
  private pageKey() {
    const { scene } = this.options.page();
    return scene ? makeCompositeKey(scene.id, scene.instanceId) : null;
  }

  private pageMark() {
    return `${this.pageKey()}#${this.options.page().restartCount ?? 0}`;
  }

  /** The live session, when it plays another scene than this page's */
  private elsewhere() {
    const session = this.context.getCurrentSession();
    if (!session || this.attachedTo) return null;
    const playing = mediaOf(session.getMediaSession());
    return playing && playing.scene !== this.pageKey() ? session : null;
  }

  /**
   * Cast or play on a page whose scene the session does not play: this scene
   * loads into it. False when there is no such session.
   */
  private castHere() {
    const session = this.elsewhere();
    if (!session) return false;
    void this.start(session);
    return true;
  }

  /**
   * The Cast button: this scene into a session playing another, else
   * Chrome's Cast dialog (pick a device, or stop casting)
   */
  private readonly onPress = () => {
    if (this.errored) {
      this.retry();
      return;
    }
    if (this.castHere()) return;
    // The dialog rejects when the user closes it: nothing to do
    this.context.requestSession().catch(() => {});
  };

  private readonly onCastState = (event: cast.framework.CastStateEventData) => {
    this.castState = event.castState;
    this.refresh();
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
        this.sync();
        break;
      case states.SESSION_ENDED:
        this.end();
        break;
    }
  };

  private readonly onRemoteTime = () => {
    // A failed receiver keeps where it stopped, for the retry
    if (!this.attachedTo || this.errored) return;
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
    const { media } = this;
    if (this.remote.playerState !== media.PlayerState.IDLE) return;
    // The idle reason is on the media session: the RemotePlayer has none
    const reason = session.getMediaSession()?.idleReason;
    if (reason === media.IdleReason.ERROR) {
      if (this.loading || this.errored) return;
      // What the TV played is saved; the page stays on the cast
      this.errored = true;
      this.stopTracking();
      this.options.notify(this.failureMessage(session) + RETRY_HINT);
    } else if (reason === media.IdleReason.FINISHED) {
      this.finished(session);
    }
  };

  /**
   * The TV finished the scene. The local player never plays while attached,
   * so its `ended` never fires: repeat one loads the scene again, else with
   * autoplay the queue steps on (the reducer owns shuffle and repeat all) and
   * the page's scene change loads the next scene on the TV, which plays on
   * as the finished one was. Only the tab that loaded the media steps, so two
   * tabs on one scene do not step twice.
   */
  private finished(session: cast.framework.CastSession) {
    if (this.loading || !this.loadedHere) return;
    const { repeat, autoplayNext, dispatch } = this.options.page();
    if (repeat === "one") {
      void this.load(session, 0, true);
    } else if (autoplayNext) {
      dispatch({ type: "NEXT_SCENE", payload: { autoplay: true } } as never);
    }
  }

  /**
   * Play or the Cast button after a receiver error: the scene again, with a
   * new link (the old one may be past its expiry), where the TV stopped
   */
  private retry() {
    const session = this.attachedTo;
    if (!session || this.loading) return;
    void this.load(session, this.lastRemoteTime, true, { fresh: true });
  }

  /** Other media on the receiver (perhaps loaded from another tab) */
  private readonly onMediaInfo = () => {
    // Media loaded since a receiver error (another tab's load) plays again
    if (this.remote.isMediaLoaded) this.errored = false;
    this.sync();
  };

  /** The captions menu changed: the TV shows the same captions, or none */
  private readonly onTextTracks = () => {
    const session = this.attachedTo;
    if (!session || this.loading) return;
    const media = session.getMediaSession();
    if (!media?.media) return;
    const ids = activeTrackIds(
      media.media.tracks ?? [],
      showingCaption(this.options.player)
    );
    if (ids.join() === this.sentTracks) return;
    this.sentTracks = ids.join();
    media.editTracksInfo(
      new this.media.EditTracksInfoRequest(ids),
      () => {},
      (error) => console.warn("[CAST] Captions not changed:", error)
    );
  };

  /**
   * Follows what the session plays: a page on that scene attaches, and
   * records it when this tab loaded it; a page on another scene lets go
   */
  private sync() {
    if (!this.button || this.loading) return;
    const session = this.context.getCurrentSession();
    const playing = mediaOf(session?.getMediaSession() ?? null);
    const page = this.pageKey();
    if (!session || !playing || !page) {
      this.refresh();
      return;
    }
    if (playing.scene !== page) {
      // Another tab loaded another scene: the TV is not this page's now
      if (this.attachedTo) this.release();
      else this.refresh();
      return;
    }
    this.loadedHere = playing.sender === this.sender;
    if (this.attachedTo) {
      this.refresh();
    } else {
      this.lastRemoteTime = this.remote.currentTime;
      this.follow(session);
    }
    if (!this.loadedHere) this.stopTracking();
    else if (!this.tracker) this.startTracking();
  }

  /** The scene moves from the local player to the TV */
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
    // VR and the TV take turns on the player: VR goes first. Calling
    // `peekVr` creates the plugin, so only where it already exists.
    if (player.usingPlugin("peekVr")) player.peekVr?.().disable();
    this.expiresAt = Number.POSITIVE_INFINITY;
    this.loadedHere = true;
    this.follow(session);
    await this.load(session, startTime, true);
  }

  /**
   * Loads the page's scene on the receiver, as this tab's: the tracker of
   * the media it replaces saves what was played and stops, and once the TV
   * has the scene its own tracker starts
   */
  private async load(
    session: cast.framework.CastSession,
    startTime: number,
    autoplay: boolean,
    { fresh = false }: { fresh?: boolean } = {}
  ) {
    const { player } = this.options;
    const { scene } = this.options.page();
    if (!scene) return;
    this.stopTracking();
    this.loadedHere = true;
    this.loading = true;
    this.errored = false;
    this.refresh();

    this.loads += 1;
    const load = this.loads;
    try {
      const link = await this.options.fetchLink(scene, { fresh });
      if (load !== this.loads) return;
      this.expiresAt = Date.parse(link.expiresAt);
      const request = buildLoadRequest(this.media, {
        link,
        origin: window.location.origin,
        scene,
        startTime,
        sender: this.sender,
        caption: player.isDisposed() ? null : showingCaption(player),
      });
      if (!request) {
        this.fail(NO_CAST_SOURCE_MESSAGE);
        return;
      }
      request.autoplay = autoplay;
      this.sentTracks = String(request.activeTrackIds);
      const error = await session.loadMedia(request);
      if (load !== this.loads) return;
      if (error) {
        this.fail(this.failureMessage(session));
        return;
      }
      this.loading = false;
      this.sync();
    } catch {
      if (load !== this.loads) return;
      this.fail(this.failureMessage(session));
    }
  }

  /** The session ended: the local player takes the scene back, paused */
  private end() {
    this.loads += 1;
    this.loading = false;
    if (this.attachedTo) this.release(this.lastRemoteTime);
    else this.refresh();
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
    if (!player.isDisposed()) player.trackActivity?.().setEnabled(false);
    this.attachedTo = session;
    // Whatever tracks the receiver shows, the next captions change is sent
    this.sentTracks = "-";
    this.refresh();
    this.durationChanged();
  }

  /** Back to the local player, at `seekTo` when given, paused */
  private release(seekTo?: number) {
    const { player } = this.options;
    this.loading = false;
    this.errored = false;
    this.stopTracking();
    this.attachedTo = null;
    this.refresh();
    if (player.isDisposed()) return;
    player.pause();
    if (seekTo !== undefined) player.currentTime(seekTo);
    // Once the local player is paused where the TV left it
    player.trackActivity?.().setEnabled(true);
    // The control bar showed the receiver: it follows the local player again
    player.trigger("pause");
    player.trigger("timeupdate");
    this.durationChanged();
  }

  /**
   * Records the TV through the page's viewing (the local tracker's senders),
   * which is the scene the media names: `sync` starts it only then
   */
  private startTracking() {
    const { viewing, minimumPlayPercent } = this.options.page();
    if (!viewing.current) return;
    this.tracker = new CastActivity({
      remote: this.remote,
      media: this.media,
      viewing: viewing.current,
      minimumPlayPercent,
    });
    this.tracker.start();
  }

  private stopTracking(options?: { keepalive: true }) {
    this.tracker?.stop(options);
    this.tracker = null;
  }

  /**
   * The player's flags, the button and the status line as they are now:
   * attached, the player answers for the receiver; on a page the session
   * does not play, play loads this scene into it
   */
  private refresh() {
    const { player } = this.options;
    const session = this.attachedTo;
    const elsewhere = this.elsewhere();
    player.peekCastConnected = session !== null;
    player.peekCastRemote = session
      ? this.view
      : elsewhere
        ? this.loader
        : null;
    const device = deviceName(session ?? this.context.getCurrentSession());
    this.button?.setCastState(this.castState, device, !elsewhere);
    this.status?.show(session ? device : null, this.loadedHere);
    this.publish();
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
