/**
 * Utility functions for date formatting and manipulation
 */

/**
 * Format a date string for display
 */
export function formatDate(dateString, options = {}) {
  if (!dateString) return "Unknown";

  const defaultOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };

  try {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { ...defaultOptions, ...options });
  } catch {
    return "Invalid Date";
  }
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return "Unknown";

  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 7) {
      return formatDate(dateString);
    } else if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    } else if (diffMins > 0) {
      return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    } else {
      return "Just now";
    }
  } catch {
    return "Unknown";
  }
}
