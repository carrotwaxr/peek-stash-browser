/**
 * Utility functions for date formatting and manipulation
 */

/**
 * Format a date string for display
 * For date-only strings (YYYY-MM-DD), formats directly without timezone conversion
 * since these are publication dates, not moments in time.
 */
export function formatDate(dateString, options = {}) {
  if (!dateString) return "Unknown";

  try {
    // For date-only strings (YYYY-MM-DD), format directly without Date object
    // to avoid timezone issues - publication dates don't have timezones
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split("-").map(Number);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return `${monthNames[month - 1]} ${day}, ${year}`;
    }

    // For timestamps with time/timezone, use standard Date parsing
    const defaultOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { ...defaultOptions, ...options });
  } catch {
    return "Invalid Date";
  }
}

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 * For publication dates (YYYY-MM-DD), calculates days difference without timezone issues.
 */
export function formatRelativeTime(dateString) {
  if (!dateString) return "Unknown";

  try {
    // For date-only strings, calculate days difference directly
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split("-").map(Number);
      const now = new Date();
      // Create "today" as just the date components to compare apples to apples
      const todayYear = now.getFullYear();
      const todayMonth = now.getMonth() + 1;
      const todayDay = now.getDate();

      // Calculate days since epoch for both dates (simple day count comparison)
      const dateEpochDays = Math.floor(Date.UTC(year, month - 1, day) / 86400000);
      const todayEpochDays = Math.floor(Date.UTC(todayYear, todayMonth - 1, todayDay) / 86400000);
      const diffDays = todayEpochDays - dateEpochDays;

      if (diffDays > 7 || diffDays < 0) {
        return formatDate(dateString);
      } else if (diffDays === 0) {
        return "Today";
      } else if (diffDays === 1) {
        return "Yesterday";
      } else {
        return `${diffDays} days ago`;
      }
    }

    // For timestamps with time/timezone, use standard relative time
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
