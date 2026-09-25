import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  DB_WRITE_HOLD_WARN_MS,
  DB_WRITE_LOCK_WAIT_MS,
  DB_WRITE_QUEUE_WARN_MS,
  DB_WRITE_RETRY_PAUSE_MS,
  DB_WRITE_TX,
  dbWrite,
  dbWriteBatch,
  dbWriteTransaction,
  isDatabaseBusy,
} from "../../utils/dbWrite.js";
import { logger } from "../../utils/logger.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);
vi.mock("../../utils/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);

/** What Prisma throws when it could not get the database in time. */
const busy = () =>
  new Prisma.PrismaClientKnownRequestError("Operations timed out after 5s", {
    code: "P1008",
    clientVersion: "test",
  });

/** What Prisma throws when a statement hit SQLITE_BUSY after busy_timeout. */
const locked = () =>
  new Prisma.PrismaClientKnownRequestError(
    "Raw query failed. Code: `5`. Message: `database is locked`",
    { code: "P2010", clientVersion: "test", meta: { code: "5" } }
  );

/** Lets every settled promise run its continuations. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Fakes timers and the clock, leaving setImmediate real for `flush`. */
const useFakeClock = () =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

describe("dbWrite", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockPrisma.$transaction.mockReset();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.error).mockClear();
  });

  it("runs units that arrive together one at a time, in arrival order", async () => {
    const started: string[] = [];
    let finishFirst = () => {};
    const first = dbWrite("first", async () => {
      started.push("first");
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      return "first";
    });
    const second = dbWrite("second", () => {
      started.push("second");
      return Promise.resolve("second");
    });
    const third = dbWrite("third", () => {
      started.push("third");
      return Promise.resolve("third");
    });
    await flush();

    expect(started).toEqual(["first"]);

    finishFirst();
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      "first",
      "second",
      "third",
    ]);
    expect(started).toEqual(["first", "second", "third"]);
  });

  it("retries a unit that found the database busy (P1008) until DB_WRITE_LOCK_WAIT_MS", async () => {
    useFakeClock();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(busy())
      .mockResolvedValue("written");

    const result = dbWrite("rating.scene", fn);
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(DB_WRITE_RETRY_PAUSE_MS);
    await expect(result).resolves.toBe("written");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      "Database write waiting for the lock",
      { label: "rating.scene", attempt: 1 }
    );

    // Still busy when the wait is over: the busy error itself comes out
    const error = busy();
    const always = vi.fn<() => Promise<string>>().mockRejectedValue(error);
    const outcome = dbWrite("rating.scene", always).then(
      () => "resolved",
      (thrown: unknown) => thrown
    );
    await vi.advanceTimersByTimeAsync(
      DB_WRITE_LOCK_WAIT_MS + DB_WRITE_RETRY_PAUSE_MS
    );
    await expect(outcome).resolves.toBe(error);
    expect(always).toHaveBeenCalledTimes(
      DB_WRITE_LOCK_WAIT_MS / DB_WRITE_RETRY_PAUSE_MS + 1
    );
  });

  it("retries a statement that found the database locked (P2010 with SQLite code 5)", async () => {
    useFakeClock();
    const fn = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(locked())
      .mockResolvedValue(1);

    const result = dbWrite("imageCounts.performer", fn);
    await flush();
    await vi.advanceTimersByTimeAsync(DB_WRITE_RETRY_PAUSE_MS);

    await expect(result).resolves.toBe(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // A raw-query failure with another SQLite code is not the lock
    const other = new Prisma.PrismaClientKnownRequestError(
      "Raw query failed. Code: `1`. Message: `no such table`",
      { code: "P2010", clientVersion: "test", meta: { code: "1" } }
    );
    expect(isDatabaseBusy(other)).toBe(false);
    expect(isDatabaseBusy(locked())).toBe(true);
    expect(isDatabaseBusy(busy())).toBe(true);
  });

  it("throws any other error at once and releases the queue", async () => {
    // The transaction's own timeout (P2028) is not the lock: the unit ran
    // too long, and running it again would only repeat that
    const error = new Prisma.PrismaClientKnownRequestError(
      "Transaction already closed: A commit cannot be executed on an expired transaction",
      { code: "P2028", clientVersion: "test" }
    );
    const fn = vi.fn<() => Promise<never>>().mockRejectedValue(error);

    await expect(dbWrite("history.play", fn)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();

    await expect(
      dbWrite("history.play", () => Promise.resolve("next"))
    ).resolves.toBe("next");
    await expect(
      dbWrite("history.play", () => Promise.reject(new Error("constraint")))
    ).rejects.toThrow("constraint");
    await expect(
      dbWrite("history.play", () => Promise.resolve("after"))
    ).resolves.toBe("after");
  });

  it("warns with the label when a unit holds longer than DB_WRITE_HOLD_WARN_MS", async () => {
    useFakeClock();

    await dbWrite("exclusions.write", () => {
      vi.advanceTimersByTime(DB_WRITE_HOLD_WARN_MS + 500);
      return Promise.resolve();
    });
    expect(logger.warn).toHaveBeenCalledWith("Database write held the lock", {
      label: "exclusions.write",
      ms: DB_WRITE_HOLD_WARN_MS + 500,
    });

    vi.mocked(logger.warn).mockClear();
    await dbWrite("rating.scene", () => {
      vi.advanceTimersByTime(DB_WRITE_HOLD_WARN_MS - 1);
      return Promise.resolve();
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns, naming the running unit, when a unit waited in the queue longer than DB_WRITE_QUEUE_WARN_MS", async () => {
    useFakeClock();
    let finishFirst = () => {};
    const first = dbWrite("sync.scenes", async () => {
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
    });
    const second = dbWrite("rating.scene", () => Promise.resolve("rated"));
    await flush();

    vi.advanceTimersByTime(DB_WRITE_QUEUE_WARN_MS + 1);
    finishFirst();
    await first;
    await expect(second).resolves.toBe("rated");

    expect(logger.warn).toHaveBeenCalledWith(
      "Database write waited for the queue",
      {
        label: "rating.scene",
        ms: DB_WRITE_QUEUE_WARN_MS + 1,
        behind: "sync.scenes",
      }
    );
  });

  it("a unit that calls dbWrite inside itself fails fast", async () => {
    const inner = vi.fn(() => Promise.resolve("inner"));

    await expect(
      dbWrite("outer", () => dbWrite("inner", inner))
    ).rejects.toThrow("dbWrite re-entered: outer -> inner");
    expect(inner).not.toHaveBeenCalled();

    // The queue is free again, and the transaction forms are units too
    await expect(
      dbWriteTransaction("outer.tx", () =>
        dbWrite("inner", () => Promise.resolve())
      )
    ).rejects.toThrow("dbWrite re-entered: outer.tx -> inner");
    await expect(dbWrite("next", () => Promise.resolve("ok"))).resolves.toBe(
      "ok"
    );
  });

  it("dbWriteTransaction passes DB_WRITE_TX", async () => {
    const fn = vi.fn(() => Promise.resolve("counted"));

    await expect(dbWriteTransaction("history.o", fn)).resolves.toBe("counted");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(fn, DB_WRITE_TX);
    expect(fn).toHaveBeenCalledWith(mockPrisma);
    expect(DB_WRITE_TX).toEqual({ maxWait: 10_000, timeout: 10_000 });

    // A transitional timeout overrides only what it names
    await dbWriteTransaction("sync.clearInstance", fn, { timeout: 60_000 });
    expect(mockPrisma.$transaction).toHaveBeenLastCalledWith(fn, {
      maxWait: 10_000,
      timeout: 60_000,
    });
  });

  it("dbWriteBatch runs the array form", async () => {
    const ops = [
      mockPrisma.sceneRating.deleteMany({ where: { userId: 1 } }),
      mockPrisma.sceneRating.createMany({ data: [] }),
    ];
    mockPrisma.$transaction.mockResolvedValue([{ count: 2 }, { count: 0 }]);

    await expect(dbWriteBatch("stats.rebuild", ops)).resolves.toEqual([
      { count: 2 },
      { count: 0 },
    ]);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(ops);
  });
});
