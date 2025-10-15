/**
 * Video format compatibility detection utilities
 * Uses runtime browser capability detection for better accuracy
 */

// Codec to MIME type mapping for browser testing
const CODEC_MIME_TYPES = {
  // Video codecs
  h264: "avc1.42E01E", // H.264 baseline profile
  h265: "hev1.1.6.L93.B0", // H.265/HEVC main profile
  hevc: "hev1.1.6.L93.B0", // Same as h265
  vp8: "vp8",
  vp9: "vp09.00.10.08", // VP9 profile 0
  av1: "av01.0.05M.08", // AV1 main profile
  mpeg4: "mp4v.20.9", // MPEG-4 Part 2

  // Audio codecs
  aac: "mp4a.40.2", // AAC-LC
  mp3: "mp3",
  opus: "opus",
  vorbis: "vorbis",
  flac: "flac",
  ac3: "ac-3",
  eac3: "ec-3",
};

// Container to MIME type mapping
const CONTAINER_MIME_TYPES = {
  mp4: "video/mp4",
  mov: "video/mp4", // MOV uses MP4 structure
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

// Cache for codec support tests
const codecSupportCache = new Map();

/**
 * Test if browser can play a specific codec combination
 * @param {string} container - Container format (mp4, webm, etc.)
 * @param {string} videoCodec - Video codec name
 * @param {string} audioCodec - Audio codec name
 * @returns {boolean}
 */
function testCodecSupport(container, videoCodec, audioCodec) {
  const cacheKey = `${container}/${videoCodec}/${audioCodec}`;

  if (codecSupportCache.has(cacheKey)) {
    return codecSupportCache.get(cacheKey);
  }

  const containerMime = CONTAINER_MIME_TYPES[container?.toLowerCase()];
  if (!containerMime) {
    codecSupportCache.set(cacheKey, false);
    return false;
  }

  const videoMime = CODEC_MIME_TYPES[videoCodec?.toLowerCase()];
  const audioMime = CODEC_MIME_TYPES[audioCodec?.toLowerCase()];

  // Test with video element
  const video = document.createElement("video");

  // Build codec string
  let mimeType = containerMime;
  const codecs = [];

  if (videoMime) codecs.push(videoMime);
  if (audioMime) codecs.push(audioMime);

  if (codecs.length > 0) {
    mimeType += `; codecs="${codecs.join(", ")}"`;
  }

  const canPlay = video.canPlayType(mimeType);
  const supported = canPlay === "probably" || canPlay === "maybe";

  console.log(
    `Codec test: ${mimeType} = ${canPlay} (${supported ? "✓" : "✗"})`
  );

  codecSupportCache.set(cacheKey, supported);
  return supported;
}

/**
 * Check if a video file can be directly played by the browser
 * Uses runtime browser capability detection instead of static lists
 * @param {Object} file - The file object from the scene
 * @returns {Object} - { canDirectPlay: boolean, reason: string, fallbackRequired: boolean }
 */
export function canDirectPlayVideo(file) {
  if (!file) {
    return {
      canDirectPlay: false,
      reason: "No file provided",
      fallbackRequired: true,
    };
  }

  const { format, video_codec, audio_codec } = file;

  // Always allow common web formats - let the browser decide
  const commonFormats = ["mp4", "webm", "mov"];
  if (commonFormats.includes(format?.toLowerCase())) {
    // Test actual codec support
    const supported = testCodecSupport(format, video_codec, audio_codec);

    if (supported) {
      return {
        canDirectPlay: true,
        reason: `Browser reports support: ${format}/${video_codec}/${audio_codec}`,
        fallbackRequired: false,
      };
    } else {
      // Browser says it can't play this codec combination
      // But we still return true and let runtime error handling deal with it
      // This allows for cases where canPlayType is conservative but playback works
      return {
        canDirectPlay: true,
        reason: `Attempting direct play: ${format}/${video_codec}/${audio_codec} (may need fallback)`,
        fallbackRequired: true, // Signal that fallback might be needed
      };
    }
  }

  // Uncommon container formats - attempt direct play anyway
  // Modern browsers are better at this than we can statically determine
  return {
    canDirectPlay: true,
    reason: `Attempting direct play: ${format}/${video_codec}/${audio_codec} (uncommon format)`,
    fallbackRequired: true,
  };
}

/**
 * Get the best file for direct play from a list of files
 * @param {Array} files - Array of file objects
 * @returns {Object|null} - The best file for direct play, or null if none are compatible
 */
export function getBestDirectPlayFile(files) {
  if (!files || files.length === 0) return null;

  // Score files based on compatibility and quality
  const scoredFiles = files.map((file) => {
    const compatibility = canDirectPlayVideo(file);
    let score = 0;

    if (compatibility.canDirectPlay) {
      score += 100; // Base score for compatibility

      // Prefer higher resolution
      if (file.height >= 1080) score += 30;
      else if (file.height >= 720) score += 20;
      else if (file.height >= 480) score += 10;

      // Prefer better codecs
      if (file.video_codec?.toLowerCase() === "h264") score += 15;
      if (file.audio_codec?.toLowerCase() === "aac") score += 5;

      // Prefer mp4 container
      if (file.format?.toLowerCase() === "mp4") score += 10;
    }

    return { file, compatibility, score };
  });

  // Sort by score (highest first) and return the best compatible file
  const bestFile = scoredFiles
    .filter((item) => item.compatibility.canDirectPlay)
    .sort((a, b) => b.score - a.score)[0];

  return bestFile ? bestFile.file : null;
}

/**
 * Check if browser supports Media Source Extensions for HLS/DASH
 * @returns {boolean}
 */
export function supportsMSE() {
  return (
    "MediaSource" in window &&
    MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')
  );
}
