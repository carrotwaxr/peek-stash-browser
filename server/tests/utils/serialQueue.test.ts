import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "../../utils/logger.js";
import { STRICT_NESTING, createSerialQueue } from "../../utils/serialQueue.js";

vi.mock("../../utils/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/** Lets every settled promise run its continuations. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** A promise that stays pending until `release()`. */
function held(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe("createSerialQueue", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();
  });

  it("runs units that arrive together one at a time, in arrival order", async () => {
    const queue = createSerialQueue({ name: "test" });
    const events: string[] = [];
    const first = held();

    const results = Promise.all([
      queue.run("first", async () => {
        events.push("first-start");
        await first.promise;
        events.push("first-end");
        return 1;
      }),
      queue.run("second", () => {
        events.push("second");
        return Promise.resolve(2);
      }),
      queue.run("third", () => {
        events.push("third");
        return Promise.resolve(3);
      }),
    ]);
    await flush();

    expect(events).toEqual(["first-start"]);

    first.release();
    await expect(results).resolves.toEqual([1, 2, 3]);
    expect(events).toEqual(["first-start", "first-end", "second", "third"]);
  });

  it("a unit that rejects or throws releases the queue, and only its caller sees the error", async () => {
    const queue = createSerialQueue({ name: "test" });

    const failed = queue.run("fails", () => Promise.reject(new Error("boom")));
    const next = queue.run("next", () => Promise.resolve("next"));
    await expect(failed).rejects.toThrow("boom");
    await expect(next).resolves.toBe("next");

    // A synchronous throw inside the unit, too
    await expect(
      queue.run("throws", () => {
        throw new Error("sync boom");
      })
    ).rejects.toThrow("sync boom");
    await expect(queue.run("after", () => Promise.resolve(1))).resolves.toBe(1);
  });

  it("a unit that enqueues on its own queue fails fast, naming both labels, and the queue is free again", async () => {
    expect(STRICT_NESTING).toBe(true);
    const queue = createSerialQueue({ name: "test" });
    const inner = vi.fn(() => Promise.resolve("inner"));

    await expect(
      queue.run("outer", () => queue.run("inner", inner))
    ).rejects.toThrow("test re-entered: outer -> inner");
    expect(inner).not.toHaveBeenCalled();

    // Deeper in the same async context, after an await, still caught
    await expect(
      queue.run("outer", async () => {
        await flush();
        return queue.run("later", inner);
      })
    ).rejects.toThrow("test re-entered: outer -> later");
    await expect(queue.run("next", () => Promise.resolve("ok"))).resolves.toBe(
      "ok"
    );
  });

  it("in production a nested unit is logged and runs inline, inside the outer one, without the wrapper", async () => {
    const wrapped: string[] = [];
    const queue = createSerialQueue({
      name: "test",
      strictNesting: false,
      wrap: (label, fn) => {
        wrapped.push(label);
        return fn();
      },
    });

    const result = await queue.run("outer", async () => {
      const inner = await queue.run("inner", () => Promise.resolve("inner"));
      return `outer(${inner})`;
    });

    expect(result).toBe("outer(inner)");
    expect(logger.error).toHaveBeenCalledExactlyOnceWith(
      "test re-entered: outer -> inner"
    );
    expect(wrapped).toEqual(["outer"]);
  });

  it("units on different queues do not count as nested", async () => {
    const a = createSerialQueue({ name: "a" });
    const b = createSerialQueue({ name: "b" });

    await expect(
      a.run("outer", () => b.run("inner", () => Promise.resolve("inner")))
    ).resolves.toBe("inner");
  });

  it("wrap runs around every queued unit", async () => {
    const calls: string[] = [];
    const queue = createSerialQueue({
      name: "test",
      wrap: async (label, fn) => {
        calls.push(`before ${label}`);
        const result = await fn();
        calls.push(`after ${label}`);
        return result;
      },
    });

    await expect(
      queue.run("unit", () => {
        calls.push("unit");
        return Promise.resolve("done");
      })
    ).resolves.toBe("done");
    expect(calls).toEqual(["before unit", "unit", "after unit"]);
  });

  it("warns, naming the running unit, when a unit waited longer than waitWarnMs", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const queue = createSerialQueue({
      name: "test",
      waitWarnMs: 1_000,
      waitWarning: "Test unit waited for the queue",
    });
    const first = held();

    const running = queue.run("slow", () => first.promise);
    const waiting = queue.run("quick", () => Promise.resolve("quick"));
    await flush();
    vi.advanceTimersByTime(1_001);
    first.release();
    await running;
    await expect(waiting).resolves.toBe("quick");

    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      "Test unit waited for the queue",
      { label: "quick", ms: 1_001, behind: "slow" }
    );
  });

  it("does not warn about waits without waitWarnMs, or within it", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const silent = createSerialQueue({ name: "silent" });
    const bounded = createSerialQueue({ name: "bounded", waitWarnMs: 1_000 });

    for (const queue of [silent, bounded]) {
      const first = held();
      const running = queue.run("slow", () => first.promise);
      const waiting = queue.run("quick", () => Promise.resolve());
      await flush();
      vi.advanceTimersByTime(queue === silent ? 60_000 : 1_000);
      first.release();
      await Promise.all([running, waiting]);
    }

    expect(logger.warn).not.toHaveBeenCalled();
  });
});
