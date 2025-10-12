/**
 * Utility functions for data formatting and manipulation
 */

/**
 * Safely get a nested property from an object
 */
export function safeGet(obj, path, defaultValue = null) {
  if (!obj || !path) return defaultValue;

  const keys = path.split(".");
  let result = obj;

  for (const key of keys) {
    if (result && typeof result === "object" && key in result) {
      result = result[key];
    } else {
      return defaultValue;
    }
  }

  return result !== undefined ? result : defaultValue;
}

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
 * Format rating (0-100) to stars or percentage
 */
export function formatRating(rating, format = "percentage") {
  if (!rating && rating !== 0) return "Unrated";

  if (format === "stars") {
    const stars = Math.round((rating / 100) * 5);
    return "★".repeat(stars) + "☆".repeat(5 - stars);
  }

  return `${rating}%`;
}

/**
 * Truncate text to a maximum length
 */
export function truncateText(text, maxLength = 100, suffix = "...") {
  if (!text || text.length <= maxLength) return text || "";

  return text.substring(0, maxLength).trim() + suffix;
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(str) {
  if (!str) return "";

  return str.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Generate initials from a name
 */
export function getInitials(name) {
  if (!name) return "?";

  return name
    .split(" ")
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Extract scene data from API response
 */
export function extractScenes(response) {
  return safeGet(response, "findScenes.scenes", []);
}

/**
 * Extract performer data from API response
 */
export function extractPerformers(response) {
  return safeGet(response, "findPerformers.performers", []);
}

/**
 * Extract studio data from API response
 */
export function extractStudios(response) {
  return safeGet(response, "findStudios.studios", []);
}

/**
 * Extract tag data from API response
 */
export function extractTags(response) {
  return safeGet(response, "findTags.tags", []);
}

/**
 * Get total count from API response
 */
export function extractCount(response) {
  return (
    safeGet(response, "findScenes.count") ||
    safeGet(response, "findPerformers.count") ||
    safeGet(response, "findStudios.count") ||
    safeGet(response, "findTags.count") ||
    0
  );
}

/**
 * Sort array by multiple criteria
 */
export function multiSort(array, sortBy) {
  if (!Array.isArray(array) || !Array.isArray(sortBy)) return array;

  return [...array].sort((a, b) => {
    for (const { key, direction = "asc" } of sortBy) {
      const aVal = safeGet(a, key);
      const bVal = safeGet(b, key);

      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
    }
    return 0;
  });
}

/**
 * Debounce function execution
 */
export function debounce(func, delay) {
  let timeoutId;

  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Check if a value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value) {
  if (value == null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
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
