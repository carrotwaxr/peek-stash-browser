import * as fs from "fs";
import prisma from "../prisma/singleton.js";
import { dbWrite } from "../utils/dbWrite.js";
import { ZIP_CONCURRENCY, maxPlaylistBytes } from "../utils/downloadLimits.js";
import { zipPath } from "../utils/downloadPaths.js";
import { logger } from "../utils/logger.js";
import { playlistZipService } from "./PlaylistZipService.js";

/** Builds one download's zip; resolves once the build has settled */
export type BuildZip = (
  downloadId: number,
  signal: AbortSignal
) => Promise<void>;

/** Why a running build was aborted (`signal.reason`) */
export type BuildAbortReason = "cancelled" | "shutdown";

interface QueuedJob {
  downloadId: number;
  userId: number;
}

interface RunningJob {
  userId: number;
  controller: AbortController;
  done: Promise<void>;
}

/**
 * Playlist zips, built `concurrency` at a time (one by default) in the
 * order they were asked for. The queue lives in memory; the Download rows
 * are the durable state, and `recoverPendingDownloads` rebuilds it at
 * startup. A build is aborted with reason "cancelled" (`cancel`,
 * `cancelUser`) or "shutdown" (`stop`) through its signal.
 */
export class DownloadJobQueue {
  private readonly waiting: QueuedJob[] = [];
  private readonly running = new Map<number, RunningJob>();
  private stopped = false;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly build: BuildZip,
    private readonly concurrency = ZIP_CONCURRENCY
  ) {}

  /** Queues a build; an id already queued or running is left as it is */
  enqueue(downloadId: number, userId: number): void {
    if (this.stopped || this.isActive(downloadId)) return;
    this.waiting.push({ downloadId, userId });
    this.pump();
  }

  /** Whether the id is queued or being built */
  isActive(downloadId: number): boolean {
    return (
      this.running.has(downloadId) ||
      this.waiting.some((job) => job.downloadId === downloadId)
    );
  }

  /** Drops a queued id, or aborts its build and resolves once it settled */
  async cancel(downloadId: number): Promise<void> {
    this.dropWaiting((job) => job.downloadId === downloadId);
    const run = this.running.get(downloadId);
    if (!run) return;
    run.controller.abort("cancelled" satisfies BuildAbortReason);
    await run.done;
  }

  /** `cancel` for each of this user's queued and running ids */
  async cancelUser(userId: number): Promise<void> {
    this.dropWaiting((job) => job.userId === userId);
    const runs = [...this.running.values()].filter(
      (run) => run.userId === userId
    );
    for (const run of runs) {
      run.controller.abort("cancelled" satisfies BuildAbortReason);
    }
    await Promise.all(runs.map((run) => run.done));
  }

  /**
   * Starts nothing more and aborts the running builds for the shutdown;
   * resolves once they settled. Their rows stay PENDING or PROCESSING, for
   * the next start to resume.
   */
  async stop(): Promise<void> {
    this.stopped = true;
    this.waiting.length = 0;
    const runs = [...this.running.values()];
    for (const run of runs) {
      run.controller.abort("shutdown" satisfies BuildAbortReason);
    }
    await Promise.all(runs.map((run) => run.done));
    this.notifyIdle();
  }

  /** Resolves once nothing is queued or running (tests) */
  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  private isIdle(): boolean {
    return this.running.size === 0 && this.waiting.length === 0;
  }

  private notifyIdle(): void {
    if (!this.isIdle()) return;
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const resolve of waiters) resolve();
  }

  private dropWaiting(matches: (job: QueuedJob) => boolean): void {
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const job = this.waiting[i];
      if (job && matches(job)) this.waiting.splice(i, 1);
    }
    this.notifyIdle();
  }

  private pump(): void {
    while (!this.stopped && this.running.size < this.concurrency) {
      const job = this.waiting.shift();
      if (!job) return;
      this.start(job);
    }
  }

  private start({ downloadId, userId }: QueuedJob): void {
    const controller = new AbortController();
    const done = this.run(downloadId, controller.signal).finally(() => {
      this.running.delete(downloadId);
      this.pump();
      this.notifyIdle();
    });
    this.running.set(downloadId, { userId, controller, done });
  }

  /** One build; never rejects */
  private async run(downloadId: number, signal: AbortSignal): Promise<void> {
    // A microtask first, so the build starts after `start` recorded it
    await Promise.resolve();
    try {
      await this.build(downloadId, signal);
    } catch (error) {
      logger.error("Playlist zip build failed", {
        downloadId,
        error:
          error instanceof Error
            ? (error.stack ?? error.message)
            : String(error),
      });
    }
  }
}

/** The server's zip queue */
export const downloadJobQueue = new DownloadJobQueue((downloadId, signal) =>
  playlistZipService.createZip(downloadId, {
    signal,
    maxBytes: maxPlaylistBytes(),
  })
);

/**
 * Startup: the playlist zips a restart interrupted (PENDING or PROCESSING)
 * are built again, oldest first. Each goes back to PENDING at 0% and loses
 * its partial file. A zip this process already queued or is building (asked
 * for while the startup sync ran) is left alone.
 */
export async function recoverPendingDownloads(): Promise<void> {
  const rows = await prisma.download.findMany({
    where: { type: "PLAYLIST", status: { in: ["PENDING", "PROCESSING"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true },
  });
  const stale = rows.filter((row) => !downloadJobQueue.isActive(row.id));
  if (stale.length === 0) return;

  await dbWrite("downloads.recover", () =>
    prisma.download.updateMany({
      where: {
        id: { in: stale.map((row) => row.id) },
        status: { in: ["PENDING", "PROCESSING"] },
      },
      data: { status: "PENDING", progress: 0 },
    })
  );

  for (const row of stale) {
    // Queued since the read above: its build owns the file
    if (downloadJobQueue.isActive(row.id)) continue;
    await fs.promises
      .unlink(zipPath(row.userId, row.id))
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        )
          return;
        logger.warn("Could not remove an interrupted zip's partial file", {
          downloadId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    downloadJobQueue.enqueue(row.id, row.userId);
  }

  logger.info(`Resuming ${stale.length} interrupted playlist zip(s)`);
}
