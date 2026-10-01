import { formatDate } from "../../utils/date";
import { formatDuration, formatFileSize } from "../../utils/format";

// The table's cells share the app's formatters; an empty cell shows a dash.
export { formatDate, formatDuration, formatFileSize };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Calculate age from birthdate
 * @param {string} birthdate - ISO date string or YYYY-MM-DD
 * @returns {number|string} Age in years or "-" if invalid
 */
export const calculateAge = (birthdate: string | null | undefined) => {
  if (!birthdate) {
    return "-";
  }

  try {
    // A date-only birthdate is a calendar day: read its own year, month and
    // day, not the local midnight it parses to (the day before west of UTC).
    const dateOnly = DATE_ONLY.exec(birthdate);
    const birth = dateOnly
      ? {
          year: Number(dateOnly[1]),
          month: Number(dateOnly[2]) - 1,
          day: Number(dateOnly[3]),
        }
      : (() => {
          const parsed = new Date(birthdate);
          return {
            year: parsed.getFullYear(),
            month: parsed.getMonth(),
            day: parsed.getDate(),
          };
        })();
    if (isNaN(birth.year)) {
      return "-";
    }

    const today = new Date();
    let age = today.getFullYear() - birth.year;
    const monthDiff = today.getMonth() - birth.month;

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.day)) {
      age--;
    }

    return age;
  } catch {
    return "-";
  }
};
