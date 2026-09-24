import { Prisma } from "@prisma/client";
import prisma from "../prisma/singleton.js";
import { logger } from "./logger.js";

/**
 * Options for every interactive transaction on a history row: up to 10 s to
 * get a pool connection, up to 10 s to finish.
 */
export const HISTORY_TX = { maxWait: 10_000, timeout: 10_000 } as const;

/**
 * How long a history write keeps trying while another writer holds the
 * database: the exclusion recompute's write phase allows itself 30 s.
 */
export const HISTORY_LOCK_WAIT_MS = 30_000;

/** Pause between tries, so the writer holding the lock gets to run. */
export const HISTORY_RETRY_PAUSE_MS = 100;

/** SQLite reported the database busy, which Prisma surfaces as P1008. */
function isDatabaseBusy(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P1008"
  );
}

// Tail of the history write queue: one transaction at a time per process.
let tail: Promise<void> = Promise.resolve();

/**
 * Runs a read-then-write on a history row (watch history, image views) as
 * one interactive transaction, waiting for the database rather than failing
 * while another writer holds it.
 *
 * Prisma opens the transaction with BEGIN IMMEDIATE, and its SQLite driver
 * waits for the write lock inside the query engine, on one of the engine's
 * worker threads (one per CPU), for busy_timeout (5 s). Concurrent history
 * writes therefore queue here, in Node, and run one at a time: were they to
 * wait inside the engine, a few of them would occupy every worker thread,
 * the one holding the lock could not run its next statement, and they would
 * all time out on a small machine (P1008 "Operations timed out").
 *
 * A transaction that still finds the database busy, because a long writer
 * such as the exclusion recompute or a sync batch holds it, is tried again
 * until HISTORY_LOCK_WAIT_MS has passed. A busy failure means nothing was
 * committed, so `fn` runs again from the start; it must not keep state from
 * an earlier attempt. Any other error is thrown at once.
 */
export async function historyTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous; // never rejects: release() is the only way it settles
  try {
    const deadline = Date.now() + HISTORY_LOCK_WAIT_MS;
    for (let attempt = 1; ; attempt++) {
      try {
        return await prisma.$transaction(fn, HISTORY_TX);
      } catch (error) {
        if (!isDatabaseBusy(error) || Date.now() >= deadline) throw error;
        logger.warn("History write waiting for the database lock", {
          attempt,
        });
        await new Promise((resolve) =>
          setTimeout(resolve, HISTORY_RETRY_PAUSE_MS)
        );
      }
    }
  } finally {
    release();
  }
}
