import { ServiceUnavailableError } from "../middleware/errorHandler.js";
import { logger } from "./logger.js";

/**
 * The media proxy's queue for Stash's few connections.
 *
 * At most `maxActive` requests reach Stash at once. The rest wait by user:
 * a free slot goes to the next user in turn (round robin), and each user's
 * own requests go in the order they came (FIFO), so one person scrolling a
 * 250-card grid no longer queues ahead of everyone else. A waiting request
 * whose browser left (a closed page, the next page) leaves the queue at once.
 * The queue refuses a request with 503 when the user already has
 * `maxQueuedPerUser` waiting, when `maxQueued` wait in all, and when one has
 * waited `maxWaitMs`.
 */

/** A slot to Stash; `release` frees it, and only the first call counts. */
export type Acquired = { release: () => void };

/**
 * The parts of the browser's response the queue reads: Node marks it
 * `destroyed` and emits `close` when the browser's connection closes.
 */
export interface WaitingResponse {
  readonly destroyed: boolean;
  once(event: "close", listener: () => void): unknown;
  off(event: "close", listener: () => void): unknown;
}

export interface ProxyLimiterOptions {
  /** Requests at Stash at once */
  maxActive: number;
  /** Requests one user may have waiting */
  maxQueuedPerUser: number;
  /** Requests waiting in all */
  maxQueued: number;
  /** How long a request may wait before it is refused */
  maxWaitMs: number;
}

/** One waiting request. */
interface Entry {
  userId: number;
  res: WaitingResponse;
  resolve: (slot: Acquired | null) => void;
  onClose: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/** What the client reads when the queue refuses it. */
const BUSY_TEXT = "Media is busy, try again";

export class ProxyLimiter {
  readonly #options: ProxyLimiterOptions;
  #active = 0;
  #queued = 0;
  /**
   * Each user's waiting requests, oldest first. The Map's order is the turn
   * order: the user at the front is served next and then moves to the back,
   * and a user whose queue empties leaves it.
   */
  readonly #queues = new Map<number, Entry[]>();

  constructor(options: ProxyLimiterOptions) {
    this.#options = options;
  }

  get activeCount(): number {
    return this.#active;
  }

  get queuedCount(): number {
    return this.#queued;
  }

  /**
   * Resolves with a slot, or null when the client left while queued.
   * Rejects with ServiceUnavailableError (`retryAfterSeconds: 1`) when the
   * queue is full for this user or in all, or the request waited past
   * `maxWaitMs`, after one warn with the counts.
   */
  acquire(userId: number, res: WaitingResponse): Promise<Acquired | null> {
    if (res.destroyed) return Promise.resolve(null);
    if (this.#active < this.#options.maxActive) {
      return Promise.resolve(this.#grant());
    }

    const userQueue = this.#queues.get(userId) ?? [];
    if (
      userQueue.length >= this.#options.maxQueuedPerUser ||
      this.#queued >= this.#options.maxQueued
    ) {
      return Promise.reject(this.#refuse(userId, "full"));
    }

    return new Promise<Acquired | null>((resolve, reject) => {
      const entry: Entry = {
        userId,
        res,
        resolve,
        onClose: () => {
          this.#remove(entry);
          resolve(null);
        },
        timer: setTimeout(() => {
          // Logged while it still counts as queued
          const refusal = this.#refuse(userId, "timed out");
          this.#remove(entry);
          reject(refusal);
        }, this.#options.maxWaitMs),
      };
      entry.timer.unref();
      res.once("close", entry.onClose);
      userQueue.push(entry);
      if (!this.#queues.has(userId)) this.#queues.set(userId, userQueue);
      this.#queued++;
    });
  }

  /** Takes a slot now. */
  #grant(): Acquired {
    this.#active++;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.#active--;
        this.#serveNext();
      },
    };
  }

  /** Hands free slots to waiting requests, one user at a time in turn. */
  #serveNext(): void {
    while (this.#active < this.#options.maxActive) {
      const next = this.#queues.entries().next();
      if (next.done === true) return;
      const [userId, userQueue] = next.value;
      const entry = userQueue[0];
      if (entry === undefined) {
        this.#queues.delete(userId);
        continue;
      }
      this.#remove(entry);
      // Served: the user moves to the back of the turn order
      if (this.#queues.delete(userId)) this.#queues.set(userId, userQueue);
      entry.resolve(this.#grant());
    }
  }

  /** Takes `entry` out of the queue: its listener and its timer go with it. */
  #remove(entry: Entry): void {
    clearTimeout(entry.timer);
    entry.res.off("close", entry.onClose);
    const userQueue = this.#queues.get(entry.userId);
    const index = userQueue?.indexOf(entry) ?? -1;
    if (userQueue === undefined || index === -1) return;
    userQueue.splice(index, 1);
    this.#queued--;
    if (userQueue.length === 0) this.#queues.delete(entry.userId);
  }

  /** The refusal, logged once with the counts so real numbers show up. */
  #refuse(
    userId: number,
    reason: "full" | "timed out"
  ): ServiceUnavailableError {
    logger.warn(`Media proxy queue refused a request (${reason})`, {
      userId,
      activeCount: this.#active,
      queuedCount: this.#queued,
      userQueuedCount: this.#queues.get(userId)?.length ?? 0,
    });
    return new ServiceUnavailableError(BUSY_TEXT, { retryAfterSeconds: 1 });
  }
}

/**
 * The media proxy's one queue (`controllers/proxy.ts`).
 * - 6 at once, matching the keep-alive agents' `maxSockets`.
 * - 300 waiting per user: above one page's 250 cards plus sprites at the
 *   largest page size.
 * - 30 s wait: under nginx's 60 s `proxy_read_timeout` on `/api/proxy/*`, so
 *   Peek answers before nginx gives up.
 * - Each waiting request holds a closure and a response reference: 1,500
 *   are a few hundred KB at most.
 */
export const mediaProxyLimiter = new ProxyLimiter({
  maxActive: 6,
  maxQueuedPerUser: 300,
  maxQueued: 1500,
  maxWaitMs: 30_000,
});
