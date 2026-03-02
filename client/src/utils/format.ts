/**
 * Utility functions for data formatting and manipulation
 */

/**
 * Format file size in bytes to human readable format
 */
export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format bit rate in bits per second to human readable format
 */
export function formatBitRate(bitsPerSecond) {
  if (!bitsPerSecond) return "0 bps";

  const mbps = bitsPerSecond / (1000 * 1000);
  if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;

  const kbps = bitsPerSecond / 1000;
  return `${kbps.toFixed(0)} Kbps`;
}

/**
 * Get scene display title - uses title if available, otherwise falls back to first file basename
 */
export function getSceneTitle(scene) {
  if (!scene) return "Unknown Scene";

  // Use title if it exists and is not empty
  if (scene.title && scene.title.trim()) {
    return scene.title.trim();
  }

  // Fallback to first file basename
  if (scene.files && scene.files.length > 0 && scene.files[0].basename) {
    return scene.files[0].basename.replace(/\.[^/.]+$/, ""); // Remove file extension
  }

  return "Unknown Scene";
}

/**
 * Get scene description, handling empty cases
 */
export function getSceneDescription(scene) {
  if (!scene || !scene.details) return "";
  return scene.details.trim();
}

/**
 * Format duration in seconds to human readable format (HH:MM:SS or MM:SS)
 */
export function formatDuration(seconds) {
  if (!seconds) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format duration in seconds to compact format for overlays (max 6 characters)
 * Examples: "32s", "1m15s", "45m12s", "2h03m"
 */
export function formatDurationCompact(seconds) {
  if (!seconds) return "0s";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  // Over 1 hour: show hours and minutes (e.g., "2h03m")
  if (hours > 0) {
    return `${hours}h${minutes.toString().padStart(2, "0")}m`;
  }

  // Over 1 minute: show minutes and seconds (e.g., "1m15s", "45m12s")
  if (minutes > 0) {
    return `${minutes}m${secs.toString().padStart(2, "0")}s`;
  }

  // Under 1 minute: show just seconds (e.g., "32s")
  return `${secs}s`;
}

/**
 * Format duration in seconds to human readable format (Xd Xh Xm)
 * Used for displaying total watch time and engagement stats
 * @param {number} seconds - Duration in seconds
 * @param {Object} options - Formatting options
 * @param {boolean} options.includeDays - Include days in output (default true)
 * @returns {string} Formatted duration string (e.g., "2d 5h 30m", "3h 45m", "12m")
 */
export function formatDurationHumanReadable(seconds, options = {}) {
  const { includeDays = true } = options;

  if (!seconds || seconds === 0) return "0m";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];

  if (includeDays && days > 0) {
    parts.push(`${days}d`);
  } else if (!includeDays && days > 0) {
    // Add days as hours when not including days
    const totalHours = days * 24 + hours;
    if (totalHours > 0) parts.push(`${totalHours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
    return parts.join(" ");
  }

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

/**
 * Extract filename from file path (basename without extension)
 * @param {string} filePath - Full file path
 * @returns {string|null} Filename without extension, or null if no path
 */
export function getFilenameFromPath(filePath) {
  if (!filePath) return null;
  const basename = filePath.split(/[\\/]/).pop() || filePath;
  return basename.replace(/\.[^/.]+$/, ""); // Remove extension
}

/**
 * Format video resolution to compact display format (e.g., "1080p", "720p", "4K")
 * @param {number} width - Video width in pixels
 * @param {number} height - Video height in pixels
 * @returns {string} Formatted resolution string
 */
export function formatResolution(width, height) {
  if (!width || !height) return "";

  // Common 4K resolutions
  if (height >= 2160) return "4K";

  // Common HD resolutions
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  if (height >= 360) return "360p";
  if (height >= 240) return "240p";

  // Fallback to height with 'p'
  return `${height}p`;
}
