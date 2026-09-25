/**
 * SQLite upkeep at the end of a sync run's post-sync steps and at shutdown:
 * fresh planner statistics, and the WAL moved into the database file.
 *
 * Neither ever throws: a failure costs a warning, never the sync or the
 * shutdown.
 */
import prisma from "../prisma/singleton.js";
import { dbWrite } from "./dbWrite.js";
import { logger } from "./logger.js";

/**
 * `PRAGMA optimize` with mask 0x10002: ANALYZE the tables that may benefit
 * (0x02), looking at every table rather than only those the connection
 * running it has queried (0x10000): Prisma pools connections, and the one
 * that runs this may have queried none. A table is analyzed when one of its
 * indexes has no statistics or its row count grew or shrank about 25-fold
 * since its last ANALYZE. On the prod copy that is 0.31 s the first time
 * (0.65 s with 200k scenes) and 0.2 ms after.
 */
export const OPTIMIZE_SQL = "PRAGMA optimize=0x10002";

/**
 * Refreshes the statistics the query planner picks indexes by
 * (`sqlite_stat1`, and `sqlite_stat4`: Prisma's SQLite is built with
 * STAT4), as one writer-queue unit named `label`, since it writes them.
 */
export async function refreshPlannerStatistics(label: string): Promise<void> {
  const started = Date.now();
  try {
    await dbWrite(label, () => prisma.$queryRawUnsafe(OPTIMIZE_SQL));
    logger.info("Planner statistics refreshed", {
      durationMs: Date.now() - started,
    });
  } catch (error) {
    logger.warn("PRAGMA optimize failed; the planner keeps its statistics", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Moves the WAL's pages into the database file and empties it. It holds the
 * write lock while it waits (up to busy_timeout, 5 s) for readers of older
 * pages, such as a recompute's snapshot, to finish; one that outlasts the
 * wait leaves it unfinished, which SQLite reports as busy. The sync and the
 * shutdown run it as a writer-queue unit, so writes wait in the queue
 * meanwhile.
 */
export async function checkpointWal(): Promise<void> {
  try {
    const [result] = await prisma.$queryRaw<
      Array<{
        busy: number | bigint;
        log: number | bigint;
        checkpointed: number | bigint;
      }>
    >`PRAGMA wal_checkpoint(TRUNCATE)`;
    if (result && Number(result.busy) !== 0) {
      logger.warn("WAL checkpoint could not finish: the database was busy", {
        walPages: Number(result.log),
        checkpointedPages: Number(result.checkpointed),
      });
    }
  } catch (error) {
    logger.warn("WAL checkpoint failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
