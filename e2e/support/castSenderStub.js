/*
 * A stand-in for Google's Cast sender script
 * (https://www.gstatic.com/cv/js/sender/v1/cast_sender.js), which a spec
 * serves in its place with page.route (casting.spec.ts). It runs in the page.
 * No test contacts Google or a real device.
 *
 * One Cast device, "Stub TV", is in range. The Cast button's
 * `requestSession()` (Chrome's device dialog) picks it, and the stub then
 * acts as a receiver: `loadMedia` records the request in
 * `window.__castStub.loads`, and the receiver plays from the request's
 * `currentTime`. Its position follows `Date.now()`, so a spec that controls
 * the page clock (`page.clock`) controls the TV.
 *
 * `window.__castStub` is the spec's handle: `loads` (what loadMedia got, as
 * plain objects), `finish()` (the receiver finishes its media), `state()`.
 */
(function () {
  "use strict";

  var DEVICE = "Stub TV";
  var DURATION = 600;

  var PlayerState = {
    IDLE: "IDLE",
    PLAYING: "PLAYING",
    PAUSED: "PAUSED",
    BUFFERING: "BUFFERING",
  };
  var IdleReason = {
    CANCELLED: "CANCELLED",
    INTERRUPTED: "INTERRUPTED",
    FINISHED: "FINISHED",
    ERROR: "ERROR",
  };
  var CastState = {
    NO_DEVICES_AVAILABLE: "NO_DEVICES_AVAILABLE",
    NOT_CONNECTED: "NOT_CONNECTED",
    CONNECTING: "CONNECTING",
    CONNECTED: "CONNECTED",
  };
  var SessionState = {
    SESSION_STARTED: "SESSION_STARTED",
    SESSION_RESUMED: "SESSION_RESUMED",
    SESSION_ENDED: "SESSION_ENDED",
  };
  var CastContextEventType = {
    CAST_STATE_CHANGED: "caststatechanged",
    SESSION_STATE_CHANGED: "sessionstatechanged",
  };
  var RemotePlayerEventType = {
    CURRENT_TIME_CHANGED: "currentTimeChanged",
    DURATION_CHANGED: "durationChanged",
    IS_PAUSED_CHANGED: "isPausedChanged",
    PLAYER_STATE_CHANGED: "playerStateChanged",
    MEDIA_INFO_CHANGED: "mediaInfoChanged",
  };

  function Emitter() {
    this.handlers = {};
  }
  Emitter.prototype.addEventListener = function (type, handler) {
    (this.handlers[type] = this.handlers[type] || []).push(handler);
  };
  Emitter.prototype.removeEventListener = function (type, handler) {
    this.handlers[type] = (this.handlers[type] || []).filter(function (h) {
      return h !== handler;
    });
  };
  Emitter.prototype.emit = function (type, event) {
    (this.handlers[type] || []).slice().forEach(function (handler) {
      handler(event || {});
    });
  };

  /* The receiver: what every RemotePlayer reads */
  var tv = {
    loaded: false,
    paused: true,
    state: null,
    base: 0,
    startedAt: 0,
    duration: 0,
    mediaSession: null,
    position: function () {
      if (!tv.loaded) return 0;
      if (tv.paused || tv.state === PlayerState.IDLE) return tv.base;
      var elapsed = (Date.now() - tv.startedAt) / 1000;
      return Math.min(tv.duration, tv.base + elapsed);
    },
    seekTo: function (seconds) {
      tv.base = seconds;
      tv.startedAt = Date.now();
    },
  };
  var controllers = [];
  function emitRemote(type) {
    controllers.forEach(function (controller) {
      controller.emit(type);
    });
  }

  function RemotePlayer() {}
  Object.defineProperties(RemotePlayer.prototype, {
    currentTime: {
      get: function () {
        return tv.position();
      },
      set: function (seconds) {
        tv.seekTo(seconds);
      },
    },
    duration: {
      get: function () {
        return tv.duration;
      },
    },
    isPaused: {
      get: function () {
        return tv.paused;
      },
    },
    isMediaLoaded: {
      get: function () {
        return tv.loaded;
      },
    },
    playerState: {
      get: function () {
        return tv.state;
      },
    },
  });

  function RemotePlayerController() {
    Emitter.call(this);
    controllers.push(this);
  }
  RemotePlayerController.prototype = Object.create(Emitter.prototype);
  RemotePlayerController.prototype.seek = function () {
    emitRemote(RemotePlayerEventType.CURRENT_TIME_CHANGED);
  };
  RemotePlayerController.prototype.playOrPause = function () {
    var position = tv.position();
    tv.paused = !tv.paused;
    tv.base = position;
    tv.startedAt = Date.now();
    tv.state = tv.paused ? PlayerState.PAUSED : PlayerState.PLAYING;
    emitRemote(RemotePlayerEventType.IS_PAUSED_CHANGED);
    emitRemote(RemotePlayerEventType.PLAYER_STATE_CHANGED);
  };

  var stub = { loads: [] };
  window.__castStub = stub;

  function CastSession() {}
  CastSession.prototype.getCastDevice = function () {
    return { friendlyName: DEVICE };
  };
  CastSession.prototype.getMediaSession = function () {
    return tv.mediaSession;
  };
  CastSession.prototype.loadMedia = function (request) {
    var info = request.media;
    stub.loads.push({
      url: info.contentId,
      contentUrl: info.contentUrl,
      contentType: info.contentType,
      currentTime: request.currentTime,
      autoplay: request.autoplay,
      customData: info.customData,
      activeTrackIds: request.activeTrackIds,
    });
    tv.loaded = true;
    tv.duration = DURATION;
    tv.paused = !request.autoplay;
    tv.state = request.autoplay ? PlayerState.PLAYING : PlayerState.PAUSED;
    tv.base = request.currentTime || 0;
    tv.startedAt = Date.now();
    tv.mediaSession = {
      media: info,
      idleReason: null,
      editTracksInfo: function () {},
    };
    emitRemote(RemotePlayerEventType.MEDIA_INFO_CHANGED);
    emitRemote(RemotePlayerEventType.DURATION_CHANGED);
    emitRemote(RemotePlayerEventType.IS_PAUSED_CHANGED);
    emitRemote(RemotePlayerEventType.PLAYER_STATE_CHANGED);
    return Promise.resolve(undefined);
  };

  function CastContext() {
    Emitter.call(this);
    this.castState = CastState.NOT_CONNECTED;
    this.session = null;
  }
  CastContext.prototype = Object.create(Emitter.prototype);
  CastContext.prototype.setOptions = function () {};
  CastContext.prototype.getCastState = function () {
    return this.castState;
  };
  CastContext.prototype.getCurrentSession = function () {
    return this.session;
  };
  /* Chrome's device dialog, where the user picks the one device */
  CastContext.prototype.requestSession = function () {
    var context = this;
    context.session = new CastSession();
    context.castState = CastState.CONNECTED;
    context.emit(CastContextEventType.CAST_STATE_CHANGED, {
      castState: context.castState,
    });
    context.emit(CastContextEventType.SESSION_STATE_CHANGED, {
      sessionState: SessionState.SESSION_STARTED,
      session: context.session,
    });
    return Promise.resolve(undefined);
  };
  var context = new CastContext();

  /* The receiver finishes its media, as at the end of a scene */
  stub.finish = function () {
    tv.base = tv.position();
    tv.state = PlayerState.IDLE;
    tv.mediaSession = Object.assign({}, tv.mediaSession, {
      idleReason: IdleReason.FINISHED,
    });
    emitRemote(RemotePlayerEventType.PLAYER_STATE_CHANGED);
  };
  stub.state = function () {
    return { position: tv.position(), state: tv.state, paused: tv.paused };
  };

  var GenericMediaMetadata = function () {};
  var MediaInfo = function (contentId, contentType) {
    this.contentId = contentId;
    this.contentType = contentType;
  };
  var Track = function (trackId, type) {
    this.trackId = trackId;
    this.type = type;
  };
  var LoadRequest = function (media) {
    this.media = media;
  };
  var EditTracksInfoRequest = function (activeTrackIds) {
    this.activeTrackIds = activeTrackIds;
  };
  var Image = function (url) {
    this.url = url;
  };

  window.chrome = window.chrome || {};
  window.chrome.cast = {
    AutoJoinPolicy: { ORIGIN_SCOPED: "origin_scoped" },
    media: {
      DEFAULT_MEDIA_RECEIVER_APP_ID: "CC1AD845",
      StreamType: { BUFFERED: "BUFFERED" },
      TrackType: { TEXT: "TEXT" },
      TextTrackType: { SUBTITLES: "SUBTITLES" },
      HlsSegmentFormat: { TS: "ts" },
      HlsVideoSegmentFormat: { MPEG2_TS: "mpeg2_ts" },
      PlayerState: PlayerState,
      IdleReason: IdleReason,
      Image: Image,
      GenericMediaMetadata: GenericMediaMetadata,
      Track: Track,
      MediaInfo: MediaInfo,
      EditTracksInfoRequest: EditTracksInfoRequest,
      LoadRequest: LoadRequest,
    },
  };
  window.cast = {
    framework: {
      CastContext: {
        getInstance: function () {
          return context;
        },
      },
      CastContextEventType: CastContextEventType,
      CastState: CastState,
      SessionState: SessionState,
      RemotePlayerEventType: RemotePlayerEventType,
      RemotePlayer: RemotePlayer,
      RemotePlayerController: RemotePlayerController,
    },
  };

  if (typeof window.__onGCastApiAvailable === "function") {
    window.__onGCastApiAvailable(true);
  }
})();
