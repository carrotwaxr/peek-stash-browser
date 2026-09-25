/**
 * The one writer queue for the process: every database write that can hold
 * SQLite's write lock for more than a moment goes through here, one unit at
 * a time, in arrival order.
 *
 * The rule (server-sql.md, "Writes"): every transaction (batch or
 * interactive), every multi-row statement (`createMany`, `INSERT ... SELECT`,
 * a whole-table `UPDATE`, a chunked delete) and every single-row write on a
 * user path (ratings, favorites, O counts, plays, image views, hides, stats,
 * playlists, restrictions) is a `dbWrite` unit, and no unit holds the write
 * lock longer than DB_WRITE_HOLD_WARN_MS (1 s) on a 200k-scene library:
 * longer work is chunked (per sync batch, per user, per 5,000 rows) so user
 * writes interleave FIFO with it. A unit that breaks the bound is logged
 * with its label. Reads never queue: under WAL they wait only for a pool
 * connection and an engine worker, never for the writer. Single-row writes
 * off the user paths (settings, setup, groups, themes, carousels, downloads,
 * auth) stay autocommit: they take the lock inside the engine and wait up to
 * busy_timeout (5 s), which the 1 s bound keeps safe.
 *
 * Why a queue in Node and not the engine's own waiting: Prisma opens an
 * interactive transaction with BEGIN IMMEDIATE, and its SQLite driver waits
 * for the write lock inside the query engine, on one of the engine's worker
 * threads (one per CPU), for busy_timeout. Were concurrent writers to wait
 * there, a few of them would occupy every worker thread, the one holding the
 * lock could not run its next statement, and they would all time out on a
 * small machine (P1008). Here a waiting unit holds no pool connection and no
 * engine thread; on the probe (40 hides at once on a 16-CPU box) that turns
 * 32 failures into 40 commits.
 *
 * Nesting: a unit runs inside an AsyncLocalStorage context, and a `dbWrite`
 * called from within one would wait for itself. In tests and development
 * (NODE_ENV test or development, or the server running from TypeScript
 * source) it throws "dbWrite re-entered: <outer> -> <inner>"; in production
 * it runs inline with logger.error, so a missed case costs a log line and
 * not a deadlock. Inside a `dbWriteTransaction` callback, write through `tx`.
 * Never take the compute connection (`withComputeConnection`) inside a unit:
 * the order is always compute connection first, then the writer queue.
 *
 * Retries: a busy failure (an outside holder such as the sqlite3 CLI, or a
 * statement that outlived busy_timeout) means nothing was committed, so `fn`
 * runs again from the start until DB_WRITE_LOCK_WAIT_MS has passed; it must
 * not keep state between attempts. Any other error, the transaction's own
 * timeout (P2028) included, is thrown at once and the queue released.
 *
 * The queue is a Node mutex, not tied to a client: a unit may write through
 * the compute client too (D3 swaps a user's exclusions that way).
 */
import { Prisma } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";
import prisma from "../prisma/singleton.js";
import { logger } from "./logger.js";

/**
 * Options for every interactive transaction: up to 10 s to get a pool
 * connection, up to 10 s to finish (10x the 1 s unit bound).
 */
export const DB_WRITE_TX = { maxWait: 10_000, timeout: 10_000 } as const;

/**
 * How long a unit keeps trying while something outside the queue holds the
 * database (the sqlite3 CLI, a stuck connection).
 */
export const DB_WRITE_LOCK_WAIT_MS = 30_000;

/** Pause between tries, so the holder gets to finish. */
export const DB_WRITE_RETRY_PAUSE_MS = 100;

/** The rule: no unit holds the write lock longer than this. */
export const DB_WRITE_HOLD_WARN_MS = 1_000;

/** A unit that waited in the queue longer than this names what it waited on. */
export const DB_WRITE_QUEUE_WARN_MS = 10_000;

/** What `dbWriteTransaction` accepts over DB_WRITE_TX (transitional timeouts). */
export type DbWriteTxOptions = Partial<{
  maxWait: number;
  timeout: number;
  isolationLevel: Prisma.TransactionIsolationLevel;
}>;

/**
 * SQLite reported the database busy. Prisma surfaces the engine's own
 * timeout as P1008, and a raw statement that hit SQLITE_BUSY (code 5) after
 * busy_timeout as P2010. P2028, the transaction's own timeout, is not the
 * lock: the unit ran too long, and running it again would repeat that.
 */
export function isDatabaseBusy(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code === "P1008") return true;
  if (error.code !== "P2010") return false;
  const code = error.meta?.code;
  return (
    code === "5" || code === 5 || /database is locked/i.test(error.message)
  );
}

const env = process.env.NODE_ENV;
/** Throw on a nested unit (tests, development) rather than log and run inline. */
const STRICT_NESTING =
  env !== "production" &&
  (env === "test" || env === "development" || import.meta.url.endsWith(".ts"));

/** The label of the unit the current async context runs inside, if any. */
const runningUnit = new AsyncLocalStorage<string>();

// The queue: `tail` settles when the last enqueued unit has released, and
// `queued` holds the labels from the running unit to the newest.
let tail: Promise<void> = Promise.resolve();
const queued: string[] = [];

const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function warnIfHeld(label: string, startedAt: number): void {
  const ms = Date.now() - startedAt;
  if (ms > DB_WRITE_HOLD_WARN_MS) {
    logger.warn("Database write held the lock", { label, ms });
  }
}

async function runWithRetry<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const deadline = Date.now() + DB_WRITE_LOCK_WAIT_MS;
  for (let attempt = 1; ; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await fn();
      warnIfHeld(label, startedAt);
      return result;
    } catch (error) {
      if (!isDatabaseBusy(error)) {
        warnIfHeld(label, startedAt);
        throw error;
      }
      if (Date.now() >= deadline) throw error;
      logger.warn("Database write waiting for the lock", { label, attempt });
      await pause(DB_WRITE_RETRY_PAUSE_MS);
    }
  }
}

/**
 * Runs `fn` as one write unit: after every unit enqueued before it, and
 * before every unit enqueued after. `label` names the unit in the logs
 * ("rating.scene", "sync.scenes.junctions"): keep it short and stable.
 */
export async function dbWrite<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  const outer = runningUnit.getStore();
  if (outer !== undefined) {
    const message = `dbWrite re-entered: ${outer} -> ${label}`;
    if (STRICT_NESTING) throw new Error(message);
    // The outer unit holds the queue: run inside it rather than wait forever
    logger.error(message);
    return fn();
  }

  const queuedAt = Date.now();
  const behind = queued[0];
  queued.push(label);
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous; // never rejects: release() is the only way it settles
  try {
    const ms = Date.now() - queuedAt;
    if (ms > DB_WRITE_QUEUE_WARN_MS) {
      logger.warn("Database write waited for the queue", {
        label,
        ms,
        behind,
      });
    }
    return await runningUnit.run(label, () => runWithRetry(label, fn));
  } finally {
    queued.shift();
    release();
  }
}

/**
 * An interactive transaction as one unit: `dbWrite(label, () =>
 * prisma.$transaction(fn, DB_WRITE_TX))`. `options` override DB_WRITE_TX for
 * the sync junction transactions still to be shortened; new code passes
 * none. Write through `tx` inside `fn`, never through `dbWrite`.
 */
export function dbWriteTransaction<T>(
  label: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: DbWriteTxOptions
): Promise<T> {
  const txOptions = options ? { ...DB_WRITE_TX, ...options } : DB_WRITE_TX;
  return dbWrite(label, () => prisma.$transaction(fn, txOptions));
}

/**
 * A batch transaction as one unit: `dbWrite(label, () =>
 * prisma.$transaction(ops))`. The statements are built before the unit
 * starts, so it makes no Node round trip while it holds the lock.
 */
export function dbWriteBatch<T extends Prisma.PrismaPromise<unknown>[]>(
  label: string,
  ops: [...T]
) {
  return dbWrite(label, () => prisma.$transaction(ops));
}
