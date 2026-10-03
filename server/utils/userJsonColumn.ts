/**
 * Compare-and-set writes of the JSON settings stored on `User` (saved Views,
 * their defaults, pinned filters).
 *
 * A save reads a column, changes it and writes it back, and two saves of one
 * column (two tabs, a pin and a View) would otherwise overwrite each other.
 * The write names the text it read: `WHERE ... CAST(col AS TEXT) IS ?`. When
 * another save won in between, the update counts 0 rows and the save reads
 * again and reapplies its change to the newer value. Prisma's Json `equals`
 * on SQLite compares `JSON.stringify` text byte for byte and misses text
 * written in another format, so the comparison is on the raw text
 * (`.claude/rules/server-sql.md`, "Writes").
 *
 * A settings write, so it is autocommit, not a `dbWrite` unit. Raw SQL skips
 * Prisma's `@updatedAt`: the statement sets `updatedAt` itself, as epoch
 * milliseconds, the form Prisma stores (`typeof` integer in the database).
 */
import { ConflictError, NotFoundError } from "../middleware/errorHandler.js";
import prisma from "../prisma/singleton.js";
import { logger } from "./logger.js";

/** The `User` columns that hold settings JSON; the names go into SQL */
export const USER_JSON_COLUMNS = [
  "filterPresets",
  "defaultFilterPresets",
  "filterPins",
] as const;
export type UserJsonColumn = (typeof USER_JSON_COLUMNS)[number];

/** Reads and writes tried before the save answers 409 */
const ATTEMPTS = 3;

const isUserJsonColumn = (name: string): name is UserJsonColumn =>
  USER_JSON_COLUMNS.some((column) => column === name);

/** What each column holds, as the user knows it */
const COLUMN_LABELS: Record<UserJsonColumn, string> = {
  filterPresets: "Views",
  defaultFilterPresets: "default Views",
  filterPins: "pinned filters",
};

export interface UpdateUserJsonOptions {
  /**
   * A stored value that is not JSON reads as NULL, so the write replaces it
   * (a reset). Without it, such a value answers 409 and stays as it is.
   */
  readonly resetUnreadable?: boolean;
}

/**
 * A column's stored text parsed; NULL as `null`. Text that is not JSON
 * (written by hand, say) is logged and then, for a reset, `null`; otherwise
 * a 409 naming what the user cannot save, so no write builds on a value it
 * could not read.
 */
function parseColumn(
  userId: number,
  column: UserJsonColumn,
  text: string | null,
  resetUnreadable: boolean
): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    logger.warn("A stored settings column can't be read", {
      userId,
      column,
      reset: resetUnreadable,
    });
    if (resetUnreadable) return null;
    throw new ConflictError(
      `Your saved ${COLUMN_LABELS[column]} can't be read, so nothing was saved`
    );
  }
}

/**
 * Changes `columns` of one user's row: `mutate` gets their parsed values (NULL
 * as `null`; only the named columns are set) and returns the values to store
 * (`null` or `undefined` stores NULL), written in one statement. Retried on
 * a lost race up to 3 times with a fresh read; then a 409. A stored value
 * that is not JSON answers 409, unless `resetUnreadable` lets the write
 * replace it.
 *
 * @returns the values written
 */
export async function updateUserJson(
  userId: number,
  columns: readonly UserJsonColumn[],
  mutate: (
    values: Record<UserJsonColumn, unknown>
  ) => Record<UserJsonColumn, unknown>,
  { resetUnreadable = false }: UpdateUserJsonOptions = {}
): Promise<Record<UserJsonColumn, unknown>> {
  // The names are interpolated into the statement: check them at run time
  if (columns.length === 0 || !columns.every(isUserJsonColumn)) {
    throw new Error("updateUserJson: not a settings column");
  }
  const unique = [...new Set(columns)];

  const selected = unique
    .map((column) => `CAST("${column}" AS TEXT) AS "${column}"`)
    .join(", ");
  const assignments = [...unique.map((column) => `"${column}" = ?`)]
    .concat(`"updatedAt" = ?`)
    .join(", ");
  const guards = unique
    .map((column) => `CAST("${column}" AS TEXT) IS ?`)
    .join(" AND ");

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rows = await prisma.$queryRawUnsafe<
      Record<UserJsonColumn, string | null>[]
    >(`SELECT ${selected} FROM "User" WHERE "id" = ?`, userId);
    const row = rows[0];
    if (!row) throw new NotFoundError("User not found");

    const current = {
      filterPresets: null,
      defaultFilterPresets: null,
      filterPins: null,
    } as Record<UserJsonColumn, unknown>;
    for (const column of unique) {
      current[column] = parseColumn(
        userId,
        column,
        row[column],
        resetUnreadable
      );
    }

    const next = mutate(current);
    const nextText = unique.map((column) => {
      const value = next[column];
      return value === null || value === undefined
        ? null
        : JSON.stringify(value);
    });

    const changed = await prisma.$executeRawUnsafe(
      `UPDATE "User" SET ${assignments} WHERE "id" = ? AND ${guards}`,
      ...nextText,
      Date.now(),
      userId,
      ...unique.map((column) => row[column])
    );
    if (changed > 0) return next;
  }
  throw new ConflictError("Your settings changed while saving; try again");
}
