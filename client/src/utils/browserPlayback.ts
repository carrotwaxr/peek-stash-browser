/**
 * What this browser can decode, asked through `canPlayType`.
 *
 * The player puts Stash's Direct stream first only for a file the browser
 * can play (`buildPlayerSources`); for one it cannot, the transcodes go
 * first, so the scene starts without a failed attempt. `canPlayType`, not
 * `MediaSource.isTypeSupported`: Direct is a progressive file, not Media
 * Source Extensions. A codec with no mapping here answers null, and the
 * player keeps Stash's order for it.
 */
import { isDirectSource } from "../components/video-player/playerSources";

/** The codecs of a scene's file, as Stash reports them (ffprobe names) */
export interface CodecFile {
  video_codec?: string | null;
  audio_codec?: string | null;
}

/** The types to ask for each video codec; any one the browser plays will do */
const VIDEO_TYPES: Record<string, string[]> = {
  h264: ['video/mp4; codecs="avc1.640028"'],
  hevc: [
    'video/mp4; codecs="hvc1.1.6.L93.B0"',
    'video/mp4; codecs="hev1.1.6.L93.B0"',
  ],
  av1: ['video/mp4; codecs="av01.0.08M.08"'],
  vp9: [
    'video/webm; codecs="vp09.00.40.08"',
    'video/mp4; codecs="vp09.00.40.08"',
  ],
  vp8: ['video/webm; codecs="vp8"'],
  mpeg4: ['video/mp4; codecs="mp4v.20.9"'],
};
VIDEO_TYPES.h265 = VIDEO_TYPES.hevc ?? [];

/** The same for audio; an audio codec not listed leaves it to the video */
const AUDIO_TYPES: Record<string, string[]> = {
  aac: ['audio/mp4; codecs="mp4a.40.2"'],
  mp3: ["audio/mpeg"],
  opus: ['audio/webm; codecs="opus"', 'audio/mp4; codecs="opus"'],
  vorbis: ['audio/webm; codecs="vorbis"'],
  flac: ["audio/flac", 'audio/mp4; codecs="flac"'],
  ac3: ['audio/mp4; codecs="ac-3"'],
  eac3: ['audio/mp4; codecs="ec-3"'],
};

let probe: HTMLVideoElement | null = null;

/** Does the browser say it may play any of `types`? */
function playsAny(types: string[]): boolean {
  probe ??= document.createElement("video");
  const element = probe;
  return types.some((type) => element.canPlayType(type) !== "");
}

/** True or false for a mapped codec, null for one with no mapping */
function supports(
  table: Record<string, string[]>,
  codec: string | null | undefined
): boolean | null {
  const types = codec ? table[codec.toLowerCase()] : undefined;
  return types ? playsAny(types) : null;
}

/**
 * The codec of `file` this browser cannot play (video first), or null when
 * it can play both, or the video codec has no mapping
 */
export function undecodableCodec(file: CodecFile): string | null {
  const video = supports(VIDEO_TYPES, file.video_codec);
  if (video === null) return null;
  if (!video) return file.video_codec ?? null;
  return supports(AUDIO_TYPES, file.audio_codec) === false
    ? (file.audio_codec ?? null)
    : null;
}

/**
 * Can this browser decode `file`? Null when the video codec has no mapping
 * (keep Stash's order)
 */
export function canDecode(file: CodecFile): boolean | null {
  if (supports(VIDEO_TYPES, file.video_codec) === null) return null;
  return undecodableCodec(file) === null;
}

/**
 * The scene page's "Playback Method": how the player starts this scene on
 * this browser (the same choice as `buildPlayerSources`)
 */
export function describePlaybackMethod(scene: {
  sceneStreams?: Array<{ url: string }> | null;
  files?: CodecFile[] | null;
}): string {
  const streams = scene.sceneStreams ?? [];
  const file = scene.files?.[0];
  const codec = file ? undecodableCodec(file) : null;
  // No stream list: the player falls back to the Direct stream
  const offersDirect =
    streams.length === 0 || streams.some((s) => isDirectSource(s.url));
  const offersTranscode = streams.some((s) => !isDirectSource(s.url));
  if (offersDirect && (codec === null || !offersTranscode)) {
    return "Direct play";
  }
  return codec
    ? `Transcoded: this browser cannot play ${codec.toUpperCase()}`
    : "Transcoded";
}
