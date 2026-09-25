import {
  type IncomingMessage,
  type RequestListener,
  type Server,
  createServer,
  get as httpGet,
} from "http";
import type { AddressInfo } from "net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { objectContaining, stringContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../prisma/computeClient.js", () => ({
  disconnectComputeClient: vi.fn(),
}));

vi.mock("../../services/StashSyncService.js", () => ({
  stashSyncService: {
    abort: vi.fn(),
    whenIdle: vi.fn(),
  },
}));

vi.mock("../../services/SyncScheduler.js", () => ({
  syncScheduler: {
    stop: vi.fn(),
  },
}));

vi.mock("../../initializers/database.js", () => ({
  whenMigrationsSettled: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

/**
 * processHandlers with fresh module state (a shutdown in progress is kept
 * per module) and its mocked dependencies, each answering as when all goes
 * well.
 */
async function load() {
  vi.resetModules();
  const handlers = await import("../../initializers/processHandlers.js");
  const prisma = vi.mocked(
    (await import("../../prisma/singleton.js")).default,
    true
  );
  const { disconnectComputeClient } = vi.mocked(
    await import("../../prisma/computeClient.js"),
    true
  );
  const { stashSyncService: sync } = vi.mocked(
    await import("../../services/StashSyncService.js"),
    true
  );
  const { syncScheduler: scheduler } = vi.mocked(
    await import("../../services/SyncScheduler.js"),
    true
  );
  const { whenMigrationsSettled } = vi.mocked(
    await import("../../initializers/database.js"),
    true
  );
  const { logger } = vi.mocked(await import("../../utils/logger.js"), true);

  prisma.$disconnect.mockResolvedValue(undefined);
  prisma.$queryRaw.mockResolvedValue([{ busy: 0, log: 0, checkpointed: 0 }]);
  disconnectComputeClient.mockResolvedValue(undefined);
  sync.whenIdle.mockResolvedValue(undefined);
  whenMigrationsSettled.mockResolvedValue(undefined);

  return {
    ...handlers,
    prisma,
    disconnectComputeClient,
    sync,
    scheduler,
    whenMigrationsSettled,
    logger,
  };
}

/** A promise that stays pending until `release()`. */
function held(): { promise: Promise<void>; release: () => void } {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const never = () => new Promise<never>(() => undefined);

/** The order of a mock's `n`th call among every mock's calls. */
function callOrder(mock: { invocationCallOrder: number[] }, n = 0) {
  return must(mock.invocationCallOrder[n], `call ${n}`);
}

const servers: Server[] = [];

async function listening(
  handler: RequestListener = (_req, res) => res.end("ok")
): Promise<Server> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve())
  );
  return server;
}

describe("processHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const server of servers.splice(0)) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("logs an unhandled rejection with its stack and keeps running", async () => {
    const { handleUnhandledRejection, logger } = await load();
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const err = new Error("rejected boom");

    handleUnhandledRejection(err);

    expect(exitSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Unhandled promise rejection",
      objectContaining({ error: stringContaining("rejected boom") })
    );
    const context = must(logger.error.mock.calls[0])[1] as { error: string };
    expect(err.stack).toBeDefined();
    expect(context.error).toContain(err.stack);
  });

  it("on an uncaught exception, aborts the sync, disconnects Prisma, then exits 1", async () => {
    const { handleUncaughtException, logger, sync, prisma } = await load();
    const exit = vi.fn();

    handleUncaughtException(new Error("thrown boom"), exit);

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(logger.error).toHaveBeenCalledWith(
      "Uncaught exception, shutting down",
      objectContaining({ error: stringContaining("thrown boom") })
    );
    expect(sync.abort).toHaveBeenCalled();
    expect(prisma.$disconnect).toHaveBeenCalled();
    const exitOrder = callOrder(exit.mock);
    expect(callOrder(sync.abort.mock)).toBeLessThan(exitOrder);
    expect(callOrder(prisma.$disconnect.mock)).toBeLessThan(exitOrder);
  });

  it("an uncaught exception also disconnects the compute client", async () => {
    const { handleUncaughtException, disconnectComputeClient } = await load();
    const exit = vi.fn();

    handleUncaughtException(new Error("thrown boom"), exit);

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(disconnectComputeClient).toHaveBeenCalledOnce();
    expect(callOrder(disconnectComputeClient.mock)).toBeLessThan(
      callOrder(exit.mock)
    );
  });

  it("exits 1 after FATAL_EXIT_TIMEOUT_MS when Prisma never disconnects", async () => {
    const { handleUncaughtException, FATAL_EXIT_TIMEOUT_MS, prisma } =
      await load();
    vi.useFakeTimers();
    prisma.$disconnect.mockReturnValue(never());
    const exit = vi.fn();

    handleUncaughtException(new Error("stuck"), exit);

    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FATAL_EXIT_TIMEOUT_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  describe("gracefulShutdown", () => {
    it("SIGTERM closes the server, stops the scheduler, aborts the sync, waits for it, checkpoints the WAL, disconnects both clients and exits 0", async () => {
      const m = await load();
      const server = await listening();
      const close = vi.spyOn(server, "close");
      m.registerHttpServer(server);
      const exit = vi.fn();

      await m.gracefulShutdown("SIGTERM", exit);

      expect(exit).toHaveBeenCalledExactlyOnceWith(0);
      expect(server.listening).toBe(false);
      const checkpoint = must(m.prisma.$queryRaw.mock.calls[0])[0];
      expect("sql" in checkpoint ? checkpoint.sql : checkpoint.join("?")).toBe(
        "PRAGMA wal_checkpoint(TRUNCATE)"
      );
      // Stop what starts syncs, abort the running one, stop taking requests
      // (then abort whatever a request still running started), wait for the
      // migrations and the sync, checkpoint, disconnect both clients, exit
      const disconnects = [
        callOrder(m.prisma.$disconnect.mock),
        callOrder(m.disconnectComputeClient.mock),
      ];
      const steps = [
        callOrder(m.scheduler.stop.mock),
        callOrder(m.sync.abort.mock, 0),
        callOrder(close.mock),
        callOrder(m.sync.abort.mock, 1),
        callOrder(m.whenMigrationsSettled.mock),
        callOrder(m.sync.whenIdle.mock),
        callOrder(m.prisma.$queryRaw.mock),
        Math.min(...disconnects),
        Math.max(...disconnects),
        callOrder(exit.mock),
      ];
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
      expect(m.logger.info).toHaveBeenCalledWith(
        stringContaining("Shutdown complete (")
      );
    });

    it("closes connections still open after the grace period (a video stream)", async () => {
      const m = await load();
      // Answers with headers and a first chunk, then never ends
      const server = await listening((_req, res) => {
        res.writeHead(200);
        res.write("first chunk");
      });
      const closeAll = vi.spyOn(server, "closeAllConnections");
      m.registerHttpServer(server);
      const { port } = server.address() as AddressInfo;
      const response = await new Promise<IncomingMessage>((resolve, reject) => {
        httpGet(`http://127.0.0.1:${port}/`, resolve).on("error", reject);
      });
      response.on("error", () => undefined);
      response.resume();
      const exit = vi.fn();
      const started = performance.now();

      await m.gracefulShutdown("SIGTERM", exit);

      expect(performance.now() - started).toBeGreaterThanOrEqual(
        m.CONNECTION_GRACE_MS - 50
      );
      expect(closeAll).toHaveBeenCalledOnce();
      expect(server.listening).toBe(false);
      expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    });

    it("exits 1 at 8 s when the sync never goes idle", async () => {
      const m = await load();
      vi.useFakeTimers();
      m.sync.whenIdle.mockReturnValue(never());
      const exit = vi.fn();

      void m.gracefulShutdown("SIGTERM", exit);

      expect(m.SHUTDOWN_DEADLINE_MS).toBe(8000);
      await vi.advanceTimersByTimeAsync(m.SHUTDOWN_DEADLINE_MS - 1);
      expect(m.sync.whenIdle).toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(exit).toHaveBeenCalledExactlyOnceWith(1);
      expect(m.prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it("a second signal during shutdown exits 1 at once", async () => {
      const m = await load();
      vi.useFakeTimers();
      m.sync.whenIdle.mockReturnValue(never());
      const exit = vi.fn();

      void m.gracefulShutdown("SIGTERM", exit);
      await vi.advanceTimersByTimeAsync(0);
      expect(exit).not.toHaveBeenCalled();
      await m.gracefulShutdown("SIGINT", exit);

      expect(exit).toHaveBeenCalledExactlyOnceWith(1);
    });

    it("a signal during migrations waits for them to settle", async () => {
      const m = await load();
      const migrations = held();
      m.whenMigrationsSettled.mockReturnValue(migrations.promise);
      const exit = vi.fn();

      // Startup has not reached the server yet: none is registered
      const shutdown = m.gracefulShutdown("SIGTERM", exit);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(m.isShuttingDown()).toBe(true);
      expect(m.sync.whenIdle).not.toHaveBeenCalled();
      expect(m.prisma.$queryRaw).not.toHaveBeenCalled();
      expect(m.prisma.$disconnect).not.toHaveBeenCalled();
      expect(exit).not.toHaveBeenCalled();

      migrations.release();
      await shutdown;

      expect(callOrder(m.sync.whenIdle.mock)).toBeGreaterThan(
        callOrder(m.whenMigrationsSettled.mock)
      );
      expect(m.prisma.$disconnect).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    });

    it.each([
      ["busy", () => [{ busy: 1, log: 12, checkpointed: 4 }]],
      ["failing", () => Promise.reject(new Error("database is locked"))],
    ])(
      "a %s WAL checkpoint is logged and the shutdown goes on",
      async (_kind, answer) => {
        const m = await load();
        m.prisma.$queryRaw.mockImplementation(
          prismaImpl<typeof m.prisma.$queryRaw>(answer)
        );
        const exit = vi.fn();

        await m.gracefulShutdown("SIGTERM", exit);

        expect(m.logger.warn).toHaveBeenCalledWith(
          stringContaining("WAL checkpoint"),
          objectContaining({})
        );
        expect(m.prisma.$disconnect).toHaveBeenCalledOnce();
        expect(exit).toHaveBeenCalledExactlyOnceWith(0);
      }
    );
  });

  describe("installProcessHandlers", () => {
    const events = [
      "unhandledRejection",
      "uncaughtException",
      "SIGTERM",
      "SIGINT",
    ] as const;
    // process.listeners() is typed one event name at a time; the plain
    // EventEmitter signature takes any name from `events`.
    const emitter: NodeJS.EventEmitter = process;
    let before: Map<string, readonly unknown[]>;

    beforeEach(() => {
      before = new Map(
        events.map((event) => [event, emitter.listeners(event).slice()])
      );
    });

    afterEach(() => {
      for (const event of events) {
        for (const listener of emitter.listeners(event)) {
          if (!must(before.get(event)).includes(listener)) {
            emitter.removeListener(
              event,
              listener as (...args: unknown[]) => void
            );
          }
        }
      }
    });

    it("installProcessHandlers registers one listener for each event, SIGTERM and SIGINT included", async () => {
      const { installProcessHandlers } = await load();

      installProcessHandlers();

      for (const event of events) {
        const added = emitter
          .listeners(event)
          .filter((listener) => !must(before.get(event)).includes(listener));
        expect(added, event).toHaveLength(1);
      }
    });
  });
});
