/**
 * A timestamp as a raw query returns it, as a Date. Prisma reads a DATETIME
 * column as a Date, but a computed or untyped column holding the same value
 * comes back as epoch milliseconds (a number, a bigint or text) or as date
 * text, so every reader of a raw timestamp goes through here.
 */

/** The timestamp as a Date; null when there is none or it cannot be read */
export function rawDate(
  value: Date | number | bigint | string | null | undefined
): Date | null {
  if (value === null || value === undefined) return null;
  const date =
    value instanceof Date
      ? value
      : typeof value === "string" && !/^-?\d+$/.test(value.trim())
        ? new Date(value)
        : new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
