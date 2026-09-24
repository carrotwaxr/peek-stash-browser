import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FATAL_EXIT_TIMEOUT_MS,
  handleUncaughtException,
  handleUnhandledRejection,
  installProcessHandlers,
} from "../../initializers/processHandlers.js";
import prisma from "../../prisma/singleton.js";
import { stashSyncService } from "../../services/StashSyncService.js";
import { logger } from "../../utils/logger.js";
import { objectContaining, stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";

vi.mock("../../prisma/singleton.js", () => ({
  default: {
    $disconnect: vi.fn(),
  },
}));

vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    abort: vi.fn(),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockDisconnect = vi.mocked(prisma.$disconnect);
const mockAbort = vi.mocked(stashSyncService.abort);
const mockLoggerError = vi.mocked(logger.error);

describe("processHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDisconnect.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs an unhandled rejection with its stack and keeps running", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const err = new Error("rejected boom");

    handleUnhandledRejection(err);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Unhandled promise rejection",
      objectContaining({ error: stringContaining("rejected boom") })
    );
    const context = must(mockLoggerError.mock.calls[0])[1] as { error: string };
    expect(err.stack).toBeDefined();
    expect(context.error).toContain(err.stack);
  });

  it("on an uncaught exception, aborts the sync, disconnects Prisma, then exits 1", async () => {
    const exit = vi.fn();

    handleUncaughtException(new Error("thrown boom"), exit);

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(mockLoggerError).toHaveBeenCalledWith(
      "Uncaught exception, shutting down",
      objectContaining({ error: stringContaining("thrown boom") })
    );
    expect(mockAbort).toHaveBeenCalled();
    expect(mockDisconnect).toHaveBeenCalled();
    const exitOrder = must(exit.mock.invocationCallOrder[0]);
    expect(mockAbort.mock.invocationCallOrder[0]).toBeLessThan(exitOrder);
    expect(mockDisconnect.mock.invocationCallOrder[0]).toBeLessThan(exitOrder);
  });

  it("exits 1 after FATAL_EXIT_TIMEOUT_MS when Prisma never disconnects", () => {
    vi.useFakeTimers();
    mockDisconnect.mockReturnValue(new Promise<void>(() => undefined));
    const exit = vi.fn();

    handleUncaughtException(new Error("stuck"), exit);

    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FATAL_EXIT_TIMEOUT_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  describe("installProcessHandlers", () => {
    const events = ["unhandledRejection", "uncaughtException"] as const;
    // process.listeners() is typed one event name at a time; the plain
    // EventEmitter signature takes either name from `events`.
    const emitter: NodeJS.EventEmitter = process;
    let before: Record<(typeof events)[number], readonly unknown[]>;

    beforeEach(() => {
      before = {
        unhandledRejection: process.listeners("unhandledRejection").slice(),
        uncaughtException: process.listeners("uncaughtException").slice(),
      };
    });

    afterEach(() => {
      for (const event of events) {
        for (const listener of emitter.listeners(event)) {
          if (!before[event].includes(listener)) {
            process.removeListener(
              event,
              listener as (...args: unknown[]) => void
            );
          }
        }
      }
    });

    it("installProcessHandlers registers one listener for each event", () => {
      installProcessHandlers();

      for (const event of events) {
        const added = emitter
          .listeners(event)
          .filter((listener) => !before[event].includes(listener));
        expect(added).toHaveLength(1);
      }
    });
  });
});
