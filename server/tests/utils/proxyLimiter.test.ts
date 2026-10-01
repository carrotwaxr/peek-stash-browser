/**
 * The media proxy's queue: a few requests reach Stash at once, the rest wait
 * their turn by user (round robin, FIFO within a user), a waiting request
 * whose browser left goes at once, and the queue refuses past its caps or its
 * wait limit. Pure: no HTTP; a stand-in response emits `close`.
 */
import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableError } from "../../middleware/errorHandler.js";
import { logger } from "../../utils/logger.js";
import { type Acquired, ProxyLimiter } from "../../utils/proxyLimiter.js";
import { objectContaining, stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const SIZES = {
  maxActive: 6,
  maxQueuedPerUser: 300,
  maxQueued: 1500,
  maxWaitMs: 30_000,
};

/** The parts of a response the limiter reads: `destroyed` and `close`. */
class StandInRes extends EventEmitter {
  destroyed = false;

  /** The browser left: Node marks the response destroyed, then emits close. */
  clientCloses(): void {
    this.destroyed = true;
    this.emit("close");
  }
}

/** Where an acquire stands, read without awaiting it. */
interface Tracked {
  settled: boolean;
  slot: Acquired | null | undefined;
  error: unknown;
}

function track(promise: Promise<Acquired | null>): Tracked {
  const tracked: Tracked = {
    settled: false,
    slot: undefined,
    error: undefined,
  };
  promise.then(
    (slot) => {
      tracked.settled = true;
      tracked.slot = slot;
    },
    (error: unknown) => {
      tracked.settled = true;
      tracked.error = error;
    }
  );
  return tracked;
}

/** Lets resolved acquires run their callbacks (setImmediate is not faked). */
const flush = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

/** `count` slots for `userId`, taken at once. */
async function holdSlots(
  limiter: ProxyLimiter,
  userId: number,
  count: number
): Promise<Acquired[]> {
  const slots: Acquired[] = [];
  for (let i = 0; i < count; i++) {
    const slot = await limiter.acquire(userId, new StandInRes());
    slots.push(must(slot, `slot ${i}`));
  }
  return slots;
}

describe("ProxyLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(logger, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("the first 6 acquire at once; the 7th waits until one releases", async () => {
    const limiter = new ProxyLimiter(SIZES);
    const held = await holdSlots(limiter, 1, 6);
    expect(limiter.activeCount).toBe(6);

    const res = new StandInRes();
    const seventh = track(limiter.acquire(1, res));
    await flush();
    expect(seventh.settled).toBe(false);
    expect(limiter.queuedCount).toBe(1);

    must(held[0]).release();
    await flush();

    expect(seventh.slot).not.toBeNull();
    expect(seventh.slot).toBeDefined();
    expect(limiter.activeCount).toBe(6);
    expect(limiter.queuedCount).toBe(0);
    // Served: its close listener is gone with it
    expect(res.listenerCount("close")).toBe(0);
  });

  it("with user A holding 40 queued and user B 2, B's requests are served in turn with A's (round robin by user, FIFO within a user)", async () => {
    const limiter = new ProxyLimiter(SIZES);
    const A = 1;
    const B = 2;
    const free = await holdSlots(limiter, A, 6);

    const served: string[] = [];
    const queue = (userId: number, label: string) => {
      void limiter.acquire(userId, new StandInRes()).then((slot) => {
        served.push(label);
        free.push(must(slot, label));
      });
    };
    for (let i = 0; i < 40; i++) queue(A, `A${i}`);
    queue(B, "B0");
    queue(B, "B1");
    expect(limiter.queuedCount).toBe(42);

    // Six slots free, one at a time
    for (let i = 0; i < 6; i++) {
      must(free.shift()).release();
      await flush();
    }

    // B does not wait behind A's 40: the two users alternate until B is done
    expect(served).toEqual(["A0", "B0", "A1", "B1", "A2", "A3"]);
    expect(limiter.queuedCount).toBe(36);
    expect(limiter.activeCount).toBe(6);
  });

  it("a queued request whose client closes leaves the queue at once: queuedCount drops before any slot frees", async () => {
    const limiter = new ProxyLimiter(SIZES);
    await holdSlots(limiter, 1, 6);
    const res = new StandInRes();
    const queued = track(limiter.acquire(1, res));
    expect(limiter.queuedCount).toBe(1);

    res.clientCloses();

    // At once, with every slot still held
    expect(limiter.queuedCount).toBe(0);
    expect(limiter.activeCount).toBe(6);
    expect(res.listenerCount("close")).toBe(0);
    await flush();
    expect(queued.slot).toBeNull();

    // Its wait limit no longer runs: nothing is refused later
    await vi.advanceTimersByTimeAsync(SIZES.maxWaitMs + 1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("a user's 301st queued request is refused as full while other users still queue", async () => {
    const limiter = new ProxyLimiter(SIZES);
    await holdSlots(limiter, 1, 6);
    for (let i = 0; i < 300; i++) track(limiter.acquire(1, new StandInRes()));
    expect(limiter.queuedCount).toBe(300);

    const res = new StandInRes();
    const refused = limiter.acquire(1, res);
    await expect(refused).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(refused).rejects.toMatchObject({
      statusCode: 503,
      errorType: "SERVICE_UNAVAILABLE",
      retryAfterSeconds: 1,
    });
    expect(limiter.queuedCount).toBe(300);
    expect(res.listenerCount("close")).toBe(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      stringContaining("queue"),
      objectContaining({
        userId: 1,
        activeCount: 6,
        queuedCount: 300,
        userQueuedCount: 300,
      })
    );

    // Another user still queues
    const other = track(limiter.acquire(2, new StandInRes()));
    await flush();
    expect(other.settled).toBe(false);
    expect(limiter.queuedCount).toBe(301);
  });

  it("the 1,501st queued request overall is refused as full", async () => {
    const limiter = new ProxyLimiter(SIZES);
    await holdSlots(limiter, 1, 6);
    for (let user = 1; user <= 5; user++) {
      for (let i = 0; i < 300; i++) {
        track(limiter.acquire(user, new StandInRes()));
      }
    }
    expect(limiter.queuedCount).toBe(1500);

    await expect(limiter.acquire(6, new StandInRes())).rejects.toBeInstanceOf(
      ServiceUnavailableError
    );
    expect(limiter.queuedCount).toBe(1500);
    expect(logger.warn).toHaveBeenCalledWith(
      stringContaining("queue"),
      objectContaining({ userId: 6, queuedCount: 1500, userQueuedCount: 0 })
    );
  });

  it("a request queued longer than 30 s is refused as timed out and leaves the queue", async () => {
    const limiter = new ProxyLimiter(SIZES);
    const held = await holdSlots(limiter, 1, 6);
    const res = new StandInRes();
    const queued = track(limiter.acquire(1, res));

    await vi.advanceTimersByTimeAsync(SIZES.maxWaitMs - 1);
    expect(queued.settled).toBe(false);
    expect(limiter.queuedCount).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(queued.error).toBeInstanceOf(ServiceUnavailableError);
    expect(queued.error).toMatchObject({ retryAfterSeconds: 1 });
    expect(limiter.queuedCount).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
    expect(logger.warn).toHaveBeenCalledWith(
      stringContaining("queue"),
      objectContaining({ userId: 1, activeCount: 6, userQueuedCount: 1 })
    );

    // A freed slot serves nobody: the refused request is gone
    must(held[0]).release();
    expect(limiter.activeCount).toBe(5);
  });

  it("release is idempotent", async () => {
    const limiter = new ProxyLimiter(SIZES);
    const held = await holdSlots(limiter, 1, 6);
    const first = track(limiter.acquire(1, new StandInRes()));
    const second = track(limiter.acquire(1, new StandInRes()));

    const slot = must(held[0]);
    slot.release();
    slot.release();
    await flush();

    // One release, one queued request served
    expect(first.slot).toBeDefined();
    expect(second.settled).toBe(false);
    expect(limiter.activeCount).toBe(6);
    expect(limiter.queuedCount).toBe(1);

    // Down to none, and never below
    const lone = new ProxyLimiter(SIZES);
    const only = must(await lone.acquire(1, new StandInRes()));
    only.release();
    only.release();
    expect(lone.activeCount).toBe(0);
  });
});
