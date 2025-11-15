/**
 * Codec detection utility for determining browser streamability
 * Based on Stash's IsStreamable logic from pkg/ffmpeg/browser.go
 */

/**
 * Browser-compatible video codecs
 * Based on broad browser support (Chrome, Firefox, Safari, Edge)
 */
const STREAMABLE_VIDEO_CODECS = new Set([
  "h264",
  "hevc", // Safari and some browsers with hardware support
  "vp8",
  "vp9",
  "av1", // Modern browsers
]);

/**
 * Browser-compatible audio codecs
 */
const STREAMABLE_AUDIO_CODECS = new Set([
  "aac",
  "mp3",
  "opus",
  "vorbis",
]);

/**
 * Containers that browsers can directly stream via HTML5 video
 */
const STREAMABLE_CONTAINERS = new Set([
  "mp4",
  "m4v",
  "mov",
  "webm",
]);

export interface StreamabilityResult {
  isStreamable: boolean;
  reasons: string[];
  videoCodec?: string;
  audioCodec?: string;
  container?: string;
}

/**
 * Normalize codec names to handle variations
 * Examples: "H264" -> "h264", "H.264" -> "h264", "AAC LC" -> "aac"
 */
function normalizeCodec(codec: string | undefined | null): string {
  if (!codec) return "";

  // Convert to lowercase and remove common separators
  let normalized = codec.toLowerCase().replace(/[.\s_-]/g, "");

  // Handle common variations
  if (normalized.startsWith("h264") || normalized === "avc" || normalized === "avc1") {
    return "h264";
  }
  if (normalized.startsWith("h265") || normalized === "hevc" || normalized === "hvc1") {
    return "hevc";
  }
  if (normalized.startsWith("aac")) {
    return "aac";
  }
  // Only normalize MPEG audio codecs to mp3, not video codecs like mpeg4
  if (normalized === "mpeg" || normalized.includes("mpegaudio") || normalized.includes("mp3")) {
    return "mp3";
  }

  return normalized;
}

/**
 * Extract container from file path
 */
function getContainer(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";

  // Normalize container names
  if (ext === "m4v") return "mp4"; // M4V is essentially MP4
  if (ext === "mov") return "mp4"; // MOV can often be streamed like MP4

  return ext;
}

/**
 * Check if a video file is streamable in browsers without transcoding
 *
 * @param videoCodec - Video codec name (e.g., "h264", "hevc")
 * @param audioCodec - Audio codec name (e.g., "aac", "mp3")
 * @param filePath - File path (used to determine container)
 * @returns StreamabilityResult with isStreamable flag and reasons
 */
export function isVideoStreamable(
  videoCodec: string | undefined | null,
  audioCodec: string | undefined | null,
  filePath: string
): StreamabilityResult {
  const reasons: string[] = [];
  const container = getContainer(filePath);
  const normalizedVideo = normalizeCodec(videoCodec);
  const normalizedAudio = normalizeCodec(audioCodec);

  // Check container
  if (!STREAMABLE_CONTAINERS.has(container)) {
    reasons.push(`Container '${container}' not browser-compatible`);
  }

  // Check video codec
  if (!normalizedVideo) {
    reasons.push("Video codec not detected");
  } else if (!STREAMABLE_VIDEO_CODECS.has(normalizedVideo)) {
    reasons.push(`Video codec '${normalizedVideo}' not browser-compatible`);
  }

  // Check audio codec (optional - some videos might not have audio)
  if (normalizedAudio && !STREAMABLE_AUDIO_CODECS.has(normalizedAudio)) {
    reasons.push(`Audio codec '${normalizedAudio}' not browser-compatible`);
  }

  const isStreamable = reasons.length === 0;

  return {
    isStreamable,
    reasons,
    videoCodec: normalizedVideo || undefined,
    audioCodec: normalizedAudio || undefined,
    container,
  };
}

/**
 * Check if a scene from Stash API is streamable
 *
 * @param scene - Scene object from Stash with file information
 * @returns StreamabilityResult
 */
export function isSceneStreamable(scene: {
  files?: Array<{
    video_codec?: string | null;
    audio_codec?: string | null;
    path?: string;
  }>;
  path?: string;
}): StreamabilityResult {
  // Use first file's codec info (scenes typically have one primary file)
  const file = scene.files?.[0];
  const filePath = file?.path || scene.path || "";

  if (!file) {
    return {
      isStreamable: false,
      reasons: ["No file information available"],
    };
  }

  return isVideoStreamable(file.video_codec, file.audio_codec, filePath);
}
