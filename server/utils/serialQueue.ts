/**
 * A serial queue: units run one at a time, in arrival order, each after
 * every unit enqueued before it has settled. The writer queue (`dbWrite`),
 * the compute connection (`withComputeConnection`) and manual backups each
 * run through one.
 *
 * A unit that rejects releases the queue like one that resolves: the next
 * unit runs, and the rejection reaches only its own caller.
 *
 * Nesting: a unit runs inside an AsyncLocalStorage context, so a unit that
 * enqueues on its own queue, and would wait for itself forever, is caught.
 * In tests and development (NODE_ENV test or development, or the server
 * running from TypeScript source) it throws "<name> re-entered: <outer> ->
 * <inner>"; in production it logs that with logger.error and runs the inner
 * unit inline, inside the outer one, so a missed case costs a log line and
 * not a deadlock. Units on different queues do not see each other.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "./logger.js";

const env = process.env.NODE_ENV;
/** Throw on a nested unit (tests, development) rather than log and run inline. */
export const STRICT_NESTING =
  env !== "production" &&
  (env === "test" || env === "development" || import.meta.url.endsWith(".ts"));

export interface SerialQueueOptions {
  /** Names the queue in the nesting error: `<name> re-entered: <outer> -> <inner>` */
  name: string;
  /**
   * A unit that waited in the queue longer than this logs `waitWarning`
   * with `{ label, ms, behind }`, `behind` naming the unit that was running
   * when it arrived. No warning when unset.
   */
  waitWarnMs?: number;
  /** The wait warning's message */
  waitWarning?: string;
  /**
   * Wraps every queued unit (the writer's busy retries and hold warning).
   * A nested unit run inline in production is not wrapped: it runs as given.
   */
  wrap?: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
  /** Overrides STRICT_NESTING (tests of the production path) */
  strictNesting?: boolean;
}

export interface SerialQueue {
  /**
   * Runs `fn` as one unit: after every unit enqueued before it, and before
   * every unit enqueued after. `label` names it in the logs and in the
   * nesting error.
   */
  run<T>(label: string, fn: () => Promise<T>): Promise<T>;
}

export function createSerialQueue(options: SerialQueueOptions): SerialQueue {
  const { name, waitWarnMs, waitWarning, wrap } = options;
  const strict = options.strictNesting ?? STRICT_NESTING;
  const context = new AsyncLocalStorage<string>();
  // `tail` settles when the last enqueued unit has released, and `queued`
  // holds the labels from the running unit to the newest
  let tail: Promise<void> = Promise.resolve();
  const queued: string[] = [];

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const outer = context.getStore();
    if (outer !== undefined) {
      const message = `${name} re-entered: ${outer} -> ${label}`;
      if (strict) throw new Error(message);
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
      if (waitWarnMs !== undefined && ms > waitWarnMs) {
        logger.warn(waitWarning ?? `${name} waited for the queue`, {
          label,
          ms,
          behind,
        });
      }
      return await context.run(label, () => (wrap ? wrap(label, fn) : fn()));
    } finally {
      queued.shift();
      release();
    }
  }

  return { run };
}
