import type { PrismaClient } from "@prisma/client";

/** Rows of `table` whose `parent` row is missing, per table and parent. */
export interface ForeignKeyViolation {
  table: string;
  parent: string;
  n: number;
}

/**
 * Every foreign key the database holds a row against without its parent,
 * counted per table and parent (`PRAGMA foreign_key_check`, grouped). Such
 * rows come from deletes run with foreign keys off: the sqlite3 CLI, or a
 * migration's table copies. Empty when the database is consistent.
 */
export async function findForeignKeyViolations(
  client: Pick<PrismaClient, "$queryRawUnsafe">
): Promise<ForeignKeyViolation[]> {
  const rows = await client.$queryRawUnsafe<
    Array<{ table: string; parent: string; n: bigint | number }>
  >(
    `SELECT "table", "parent", COUNT(*) AS "n" FROM pragma_foreign_key_check GROUP BY 1, 2 ORDER BY 1, 2`
  );
  return rows.map((row) => ({
    table: row.table,
    parent: row.parent,
    n: Number(row.n),
  }));
}
