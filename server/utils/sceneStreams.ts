/**
 * Scene stream lists, built from Stash's own per-scene choices.
 *
 * Stash's sceneStreams URLs carry the Stash API key, so Peek stores only the
 * decisions behind them (Direct, MKV and the resolution tiers) and builds
 * keyless Peek proxy paths in Stash's order. These rules mirror
 * GetSceneStreamPaths in Stash's internal/manager/scene.go.
 */
import type { SceneStream } from "../types/index.js";

export const STREAM_RESOLUTIONS = [
  "ORIGINAL",
  "FOUR_K",
  "FULL_HD",
  "STANDARD_HD",
  "STANDARD",
  "LOW",
] as const;
export type StreamResolution = (typeof STREAM_RESOLUTIONS)[number];

export interface StashStreamOptions {
  direct: boolean;
  mkv: boolean;
  resolutions: StreamResolution[];
}

/** Stash's label suffix for each tier ("MP4 Low (240p)"). */
const LABEL_SUFFIX: Record<StreamResolution, string> = {
  ORIGINAL: "",
  FOUR_K: " 4K (2160p)",
  FULL_HD: " Full HD (1080p)",
  STANDARD_HD: " HD (720p)",
  STANDARD: " Standard (480p)",
  LOW: " Low (240p)",
};

/** The shorter side a file needs before Stash offers a tier. */
const TIER_MIN_SIDE: Record<Exclude<StreamResolution, "ORIGINAL">, number> = {
  FOUR_K: 1920,
  FULL_HD: 1080,
  STANDARD_HD: 720,
  STANDARD: 480,
  LOW: 240,
};

const TRANSCODE_FORMATS = [
  { label: "MP4", file: "stream.mp4", mime: "video/mp4" },
  { label: "WEBM", file: "stream.webm", mime: "video/webm" },
  { label: "HLS", file: "stream.m3u8", mime: "application/vnd.apple.mpegurl" },
  { label: "DASH", file: "stream.mpd", mime: "application/dash+xml" },
] as const;

type Container = "mp4" | "matroska" | "webm";

const CONTAINER_BY_EXTENSION: Record<string, Container> = {
  mp4: "mp4",
  m4v: "mp4",
  mov: "mp4",
  mkv: "matroska",
  webm: "webm",
};

/** The container a file's extension names, undefined when Stash cannot direct-play it. */
function containerOf(path: string | null): Container | undefined {
  const extension = path?.match(/\.([^./\\]+)$/)?.[1]?.toLowerCase();
  return extension ? CONTAINER_BY_EXTENSION[extension] : undefined;
}

/** Audio codecs a browser plays in each container (Stash's browser.go). */
const VALID_AUDIO: Record<Container, string[]> = {
  mp4: ["aac", "mp3", "opus"],
  matroska: ["aac", "mp3", "vorbis", "opus"],
  webm: ["vorbis", "opus"],
};

/** Stash's decisions, read from sceneStreams labels ("Direct stream", "MKV", "MP4", "MP4 4K (2160p)", ...). */
export function summarizeStashStreams(labels: string[]): StashStreamOptions {
  const present = new Set(labels);
  // Stash appends every tier to all four formats together, so MP4 speaks for all.
  return {
    direct: present.has("Direct stream"),
    mkv: present.has("MKV"),
    resolutions: STREAM_RESOLUTIONS.filter((r) =>
      present.has(`MP4${LABEL_SUFFIX[r]}`)
    ),
  };
}

/** The stored stream choices and file fields a scene's stream list is built from. */
export interface SceneStreamSource {
  streamDirect: boolean | null;
  streamMkv: boolean | null;
  streamResolutions: string | null;
  filePath: string | null;
  fileAudioCodec: string | null;
  fileWidth: number | null;
  fileHeight: number | null;
}

/**
 * A scene's stream options: the choices Stash recorded at sync (Direct, MKV,
 * resolution tiers) when all three are stored, else Stash's rules applied to
 * the cached file fields (rows synced before the columns existed).
 */
export function streamOptionsOf(source: SceneStreamSource): StashStreamOptions {
  const { streamDirect, streamMkv, streamResolutions } = source;
  if (streamDirect != null && streamMkv != null && streamResolutions != null) {
    return {
      direct: streamDirect,
      mkv: streamMkv,
      resolutions: streamResolutions
        .split(",")
        .filter((r): r is StreamResolution =>
          (STREAM_RESOLUTIONS as readonly string[]).includes(r)
        ),
    };
  }
  return inferStashStreamOptions({
    path: source.filePath,
    audioCodec: source.fileAudioCodec,
    width: source.fileWidth,
    height: source.fileHeight,
  });
}

/** Stash's rules from cached file fields, for rows synced before the columns existed. */
export function inferStashStreamOptions(file: {
  path: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
}): StashStreamOptions {
  const container = containerOf(file.path);
  const audio = (file.audioCodec ?? "").toLowerCase();
  const direct =
    container !== undefined &&
    (audio === "" || VALID_AUDIO[container].includes(audio));

  const shorterSide = Math.min(file.width ?? 0, file.height ?? 0);
  const resolutions = STREAM_RESOLUTIONS.filter(
    (r) =>
      r === "ORIGINAL" || shorterSide <= 0 || TIER_MIN_SIDE[r] <= shorterSide
  );

  return { direct, mkv: container === "matroska", resolutions };
}

export function buildSceneStreams(
  sceneId: string,
  instanceId: string,
  options: StashStreamOptions
): SceneStream[] {
  const base = `/api/scene/${encodeURIComponent(sceneId)}/proxy-stream`;
  const stream = (
    file: string,
    mime: string,
    label: string,
    resolution?: StreamResolution
  ): SceneStream => {
    const params = new URLSearchParams();
    if (resolution) params.set("resolution", resolution);
    params.set("instanceId", instanceId);
    return { url: `${base}/${file}?${params}`, mime_type: mime, label };
  };

  const streams: SceneStream[] = [];
  if (options.direct) {
    streams.push(stream("stream", "video/mp4", "Direct stream"));
  }
  if (options.mkv) {
    streams.push(stream("stream.mkv", "video/mp4", "MKV"));
  }
  for (const format of TRANSCODE_FORMATS) {
    for (const resolution of STREAM_RESOLUTIONS) {
      if (!options.resolutions.includes(resolution)) continue;
      streams.push(
        stream(
          format.file,
          format.mime,
          `${format.label}${LABEL_SUFFIX[resolution]}`,
          resolution
        )
      );
    }
  }
  return streams;
}

/** The file fields the cast source rule reads. */
export interface CastFile {
  filePath: string | null;
  fileVideoCodec: string | null;
  fileAudioCodec: string | null;
  fileWidth: number | null;
  fileHeight: number | null;
}

export interface CastSource {
  kind: "direct" | "hls";
  contentType: string;
  /** The HLS tier; absent for Direct. */
  resolution?: StreamResolution;
}

/** What a Cast receiver decodes straight from the file, by container. */
const CAST_DIRECT: Record<
  "mp4" | "webm",
  { contentType: string; video: string[]; audio: string[] }
> = {
  mp4: {
    contentType: "video/mp4",
    video: ["h264"],
    audio: ["aac", "mp3"],
  },
  webm: {
    contentType: "video/webm",
    video: ["vp8", "vp9"],
    audio: ["opus", "vorbis"],
  },
};

/** Older Chromecasts decode H.264 only up to 1080p (the shorter side). */
const CAST_DIRECT_MAX_SIDE = 1080;

/** The HLS tier a receiver is given, first offered wins. */
const CAST_HLS_ORDER: StreamResolution[] = [
  "FULL_HD",
  "STANDARD_HD",
  "STANDARD",
  "LOW",
  "ORIGINAL",
  "FOUR_K",
];

const CAST_HLS_CONTENT_TYPE = "application/x-mpegurl";

/**
 * The one source a Cast receiver is given: Direct when Stash offers it and
 * the file's container and codecs play on a receiver as they are, else HLS
 * at the first offered tier, else null. The content type comes from the
 * container, never from the file's MIME type (`.mov` says
 * `video/quicktime`, and its H.264 plays as `video/mp4`).
 */
export function chooseCastSource(
  options: StashStreamOptions,
  file: CastFile
): CastSource | null {
  const container = containerOf(file.filePath);
  if (options.direct && (container === "mp4" || container === "webm")) {
    const rule = CAST_DIRECT[container];
    const video = (file.fileVideoCodec ?? "").toLowerCase();
    const audio = (file.fileAudioCodec ?? "").toLowerCase();
    // A file with no recorded size is not known to fit a receiver: HLS
    const { fileWidth, fileHeight } = file;
    if (
      rule.video.includes(video) &&
      (audio === "" || rule.audio.includes(audio)) &&
      fileWidth &&
      fileHeight &&
      Math.min(fileWidth, fileHeight) <= CAST_DIRECT_MAX_SIDE
    ) {
      return { kind: "direct", contentType: rule.contentType };
    }
  }
  const resolution = CAST_HLS_ORDER.find((r) =>
    options.resolutions.includes(r)
  );
  if (resolution) {
    return { kind: "hls", contentType: CAST_HLS_CONTENT_TYPE, resolution };
  }
  return null;
}
