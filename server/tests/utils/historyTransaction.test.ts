import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  HISTORY_LOCK_WAIT_MS,
  HISTORY_RETRY_PAUSE_MS,
  HISTORY_TX,
  historyTransaction,
} from "../../utils/historyTransaction.js";
import { logger } from "../../utils/logger.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);
vi.mock("../../utils/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);

/** What Prisma throws when SQLite reports the database busy. */
const busy = () =>
  new Prisma.PrismaClientKnownRequestError("Operations timed out after 5s", {
    code: "P1008",
    clientVersion: "test",
  });

/** Lets every settled promise run its continuations. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Fakes timers and the clock, leaving setImmediate real for `flush`. */
const useFakeClock = () =>
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

describe("historyTransaction", () => {
  afterEach(() => {
    vi.useRealTimers();
    mockPrisma.$transaction.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  it("runs the callback in an interactive transaction with the history options", async () => {
    const tx = vi.fn(() => Promise.resolve("counted"));

    await expect(historyTransaction(tx)).resolves.toBe("counted");

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(tx, HISTORY_TX);
    expect(tx).toHaveBeenCalledWith(mockPrisma);
  });

  it("runs writes that arrive together one at a time, in arrival order", async () => {
    const started: string[] = [];
    let finishFirst = () => {};
    const first = historyTransaction(async () => {
      started.push("first");
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      return "first";
    });
    const second = historyTransaction(() => {
      started.push("second");
      return Promise.resolve("second");
    });
    await flush();

    expect(started).toEqual(["first"]);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    finishFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([
      "first",
      "second",
    ]);
    expect(started).toEqual(["first", "second"]);
  });

  it("tries again when the database was busy, and returns the result", async () => {
    useFakeClock();
    mockPrisma.$transaction.mockRejectedValueOnce(busy());

    const result = historyTransaction(() => Promise.resolve("counted"));
    await flush();
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(HISTORY_RETRY_PAUSE_MS);
    await expect(result).resolves.toBe("counted");

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      "History write waiting for the database lock",
      { attempt: 1 }
    );
  });

  it("gives up with the busy error once the wait is over", async () => {
    useFakeClock();
    const error = busy();
    mockPrisma.$transaction.mockRejectedValue(error);

    const outcome = historyTransaction(() => Promise.resolve("never")).then(
      () => "resolved",
      (thrown: unknown) => thrown
    );
    await vi.advanceTimersByTimeAsync(
      HISTORY_LOCK_WAIT_MS + HISTORY_RETRY_PAUSE_MS
    );

    await expect(outcome).resolves.toBe(error);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(
      HISTORY_LOCK_WAIT_MS / HISTORY_RETRY_PAUSE_MS + 1
    );
  });

  it("throws any other error at once", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("Transaction API", {
      code: "P2028",
      clientVersion: "test",
    });
    mockPrisma.$transaction.mockRejectedValueOnce(error);

    await expect(
      historyTransaction(() => Promise.resolve("never"))
    ).rejects.toBe(error);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("runs the next write after one that failed", async () => {
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("constraint"));

    await expect(
      historyTransaction(() => Promise.resolve("lost"))
    ).rejects.toThrow("constraint");
    await expect(
      historyTransaction(() => Promise.resolve("next"))
    ).resolves.toBe("next");
  });
});
