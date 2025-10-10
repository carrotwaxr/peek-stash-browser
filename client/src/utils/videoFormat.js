/**
 * Video format compatibility detection utilities
 */

// Supported formats by modern browsers
const SUPPORTED_FORMATS = {
  // Container formats
  containers: ["mp4", "webm", "mov", "avi"],

  // Video codecs with browser support
  videoCodecs: {
    h264: ["mp4", "mov"], // H.264/AVC - widely supported
    h265: [], // H.265/HEVC - limited support, mainly Safari
    hevc: [], // Same as h265
    vp8: ["webm"], // VP8 - good support in WebM
    vp9: ["webm"], // VP9 - good support in WebM
    av1: ["mp4", "webm"], // AV1 - modern browsers
    mpeg4: ["mp4"], // MPEG-4 Part 2
    xvid: [], // XviD - not natively supported
    divx: [], // DivX - not natively supported
  },

  // Audio codecs with browser support
  audioCodecs: {
    aac: ["mp4", "mov"], // AAC - widely supported
    mp3: ["mp4", "mov"], // MP3 - widely supported
    opus: ["webm"], // Opus - good support in WebM
    vorbis: ["webm"], // Vorbis - WebM support
    ac3: [], // AC-3 - limited support
    eac3: [], // E-AC-3 - limited support
    dts: [], // DTS - not supported
    flac: ["mp4"], // FLAC - some support
  },
};

/**
 * Check if a video file can be directly played by the browser
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

  // Check container format
  if (!SUPPORTED_FORMATS.containers.includes(format?.toLowerCase())) {
    return {
      canDirectPlay: false,
      reason: `Container format '${format}' not supported`,
      fallbackRequired: true,
    };
  }

  // Check video codec
  const videoCodec = video_codec?.toLowerCase();
  const supportedContainers = SUPPORTED_FORMATS.videoCodecs[videoCodec];

  if (!supportedContainers || supportedContainers.length === 0) {
    return {
      canDirectPlay: false,
      reason: `Video codec '${video_codec}' not supported`,
      fallbackRequired: true,
    };
  }

  if (!supportedContainers.includes(format?.toLowerCase())) {
    return {
      canDirectPlay: false,
      reason: `Video codec '${video_codec}' not supported in '${format}' container`,
      fallbackRequired: true,
    };
  }

  // Check audio codec
  const audioCodec = audio_codec?.toLowerCase();
  const supportedAudioContainers = SUPPORTED_FORMATS.audioCodecs[audioCodec];

  if (!supportedAudioContainers || supportedAudioContainers.length === 0) {
    return {
      canDirectPlay: false,
      reason: `Audio codec '${audio_codec}' not supported`,
      fallbackRequired: true,
    };
  }

  if (!supportedAudioContainers.includes(format?.toLowerCase())) {
    return {
      canDirectPlay: false,
      reason: `Audio codec '${audio_codec}' not supported in '${format}' container`,
      fallbackRequired: true,
    };
  }

  // All checks passed
  return {
    canDirectPlay: true,
    reason: `Compatible: ${format}/${video_codec}/${audio_codec}`,
    fallbackRequired: false,
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
