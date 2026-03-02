/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
export const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return "-";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (KB/MB/GB)
 */
export const formatFileSize = (bytes) => {
  if (bytes === null || bytes === undefined || isNaN(bytes)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

/**
 * Format date string to locale date
 * @param {string} dateStr - ISO date string or YYYY-MM-DD
 * @returns {string} Formatted date string
 */
export const formatDate = (dateStr) => {
  if (!dateStr) {
    return "-";
  }

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString();
  } catch {
    return "-";
  }
};

/**
 * Calculate age from birthdate
 * @param {string} birthdate - ISO date string or YYYY-MM-DD
 * @returns {number|string} Age in years or "-" if invalid
 */
export const calculateAge = (birthdate) => {
  if (!birthdate) {
    return "-";
  }

  try {
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) {
      return "-";
    }

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  } catch {
    return "-";
  }
};
