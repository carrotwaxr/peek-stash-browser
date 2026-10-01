import archiver from "archiver";
import type { Archiver, EntryData } from "archiver";
import * as fs from "fs";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as WebReadableStream } from "stream/web";
import prisma from "../prisma/singleton.js";
import type { NormalizedScene } from "../types/index.js";
import {
  fileExtension,
  safeFileName,
  uniqueFileName,
} from "../utils/contentDisposition.js";
import { DISK_MARGIN_BYTES, plannedZipBytes } from "../utils/downloadLimits.js";
import {
  downloadsDir,
  userDownloadsDir,
  zipPath,
} from "../utils/downloadPaths.js";
import {
  NOTHING_FETCHED,
  NOTHING_TO_DOWNLOAD,
  NO_DISK_SPACE,
  NO_PLAYLIST_PERMISSION,
  PLAYLIST_NOT_FOUND,
  ZIP_FAILED,
  ZIP_TOO_LARGE,
} from "../utils/downloadReasons.js";
import { logger } from "../utils/logger.js";
import { generateSceneNfo } from "../utils/nfoGenerator.js";
import { StashTimeoutError, fetchFromStash } from "../utils/streamProxy.js";
import { downloadService } from "./DownloadService.js";
import { resolveUserPermissions } from "./PermissionService.js";
import { getPlaylistAccess } from "./PlaylistAccessService.js";
import { loadPlaylistItems } from "./PlaylistQueryService.js";
import {
  type StashCredentials,
  UnknownInstanceError,
  stashInstanceManager,
} from "./StashInstanceManager.js";
import { getUserAllowedInstanceIds } from "./UserInstanceService.js";

/** How long a zip waits on Stash for each scene's file */
export interface ZipStashTimeouts {
  /** Before the response headers (StashTimeoutError) */
  headersTimeoutMs: number;
  /** Between two chunks of the body, while the archive is reading */
  idleTimeoutMs: number;
}

const ZIP_STASH_TIMEOUTS: ZipStashTimeouts = {
  headersTimeoutMs: 60_000,
  idleTimeoutMs: 60_000,
};

/**
 * Service for creating zip archives of playlists.
 * Streams video files from Stash and includes NFO metadata files.
 *
 * The zip holds what the user who asked for it may see when it is built:
 * their exclusions and allowed instances, not the playlist owner's
 * (invariants 3 and 10). Each scene comes from the scene builder, so its NFO
 * names only live performers, tags and a studio that user may see, and
 * carries that user's rating, never Stash's.
 */
export class PlaylistZipService {
  private readonly timeouts: ZipStashTimeouts;

  constructor(timeouts: ZipStashTimeouts = ZIP_STASH_TIMEOUTS) {
    this.timeouts = timeouts;
  }

  /**
   * M3U playlist content: one #EXTINF line and one file line per item. A
   * line break in a title becomes a space, and a file line that would start
   * with "#" (a comment to players) is written as "./#...".
   */
  private generateM3U(
    items: Array<{ title: string; duration: number | null; fileName: string }>
  ): string {
    let content = "#EXTM3U\n";

    for (const item of items) {
      const duration = item.duration ?? -1;
      const title = item.title.replace(/[\r\n]+/g, " ");
      const file = item.fileName.startsWith("#")
        ? `./${item.fileName}`
        : item.fileName;
      content += `#EXTINF:${duration},${title}\n`;
      content += `${file}\n`;
    }

    return content;
  }

  /**
   * The playlist's scenes this user may see, in playlist order, read through
   * the playlist's one item read (the scene builder, a page of refs a call).
   * The request sizes a zip from these, and the build zips them.
   */
  async readDownloadableScenes(
    userId: number,
    playlistId: number
  ): Promise<NormalizedScene[]> {
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);
    const { items } = await loadPlaylistItems({
      userId,
      allowedInstanceIds,
      playlistId,
    });
    return items.map((item) => item.scene);
  }

  /**
   * Appends one entry and resolves once archiver has written it; rejects
   * with the zip's first error. Names are already safe, so archiver keeps
   * them as given and the `entry` event names this one.
   */
  private appendEntry(
    archive: Archiver,
    source: Readable | string,
    name: string,
    failed: Promise<never>
  ): Promise<void> {
    const written = new Promise<void>((resolve) => {
      const onEntry = (entry: EntryData): void => {
        if (entry.name !== name) return;
        archive.off("entry", onEntry);
        resolve();
      };
      archive.on("entry", onEntry);
    });
    archive.append(source, { name });
    return Promise.race([written, failed]);
  }

  /**
   * One scene's file from the Stash instance it lives on, or null when it
   * cannot be fetched now and is left out: its instance is no longer loaded
   * (disabled or deleted since the list was read), or Stash answers 404 or
   * 410 (deleted since the last sync). Any other refusal throws, and the
   * zip fails.
   */
  private async fetchScene(
    scene: NormalizedScene,
    signal: AbortSignal
  ): Promise<WebReadableStream | null> {
    let credentials: StashCredentials;
    try {
      credentials = stashInstanceManager.getCredentials(scene.instanceId);
    } catch (error) {
      if (!(error instanceof UnknownInstanceError)) throw error;
      logger.info(`Playlist zip leaves out a scene on an unloaded instance`, {
        sceneId: scene.id,
        instanceId: scene.instanceId,
      });
      return null;
    }
    const streamUrl = `${credentials.baseUrl}/scene/${scene.id}/stream`;

    logger.debug(`Fetching video from Stash`, {
      sceneId: scene.id,
      instanceId: scene.instanceId,
    });

    const { response, abort } = await fetchFromStash(streamUrl, {
      apiKey: credentials.apiKey,
      signal,
      headersTimeoutMs: this.timeouts.headersTimeoutMs,
    });

    if (response.status === 404 || response.status === 410) {
      await response.body?.cancel().catch(() => undefined);
      logger.info(`Playlist zip leaves out a scene Stash no longer has`, {
        sceneId: scene.id,
        instanceId: scene.instanceId,
        status: response.status,
      });
      return null;
    }
    if (!response.ok || !response.body) {
      abort.abort();
      throw new Error(
        `Failed to fetch video for scene ${scene.id}: ${response.status} ${response.statusText}`
      );
    }
    return response.body as WebReadableStream;
  }

  /**
   * What a build checks again when its turn comes, in order: the user may
   * still download playlists, may still open the playlist, it still holds a
   * scene they may see, within the size cap, and the disk has room for it
   * plus DISK_MARGIN_BYTES. The scenes and the playlist's name, or the fixed
   * reason the download fails with.
   */
  private async recheck(
    userId: number,
    playlistId: number,
    maxBytes: bigint
  ): Promise<
    { scenes: NormalizedScene[]; name: string } | { refused: string }
  > {
    if (!(await resolveUserPermissions(userId))?.canDownloadPlaylists) {
      return { refused: NO_PLAYLIST_PERMISSION };
    }
    if ((await getPlaylistAccess(playlistId, userId)).level === "none") {
      return { refused: PLAYLIST_NOT_FOUND };
    }
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { name: true },
    });
    if (!playlist) return { refused: PLAYLIST_NOT_FOUND };

    // Only the scenes the requester may see now, each on its own instance
    const scenes = await this.readDownloadableScenes(userId, playlistId);
    if (scenes.length === 0) return { refused: NOTHING_TO_DOWNLOAD };

    const planned = plannedZipBytes(scenes);
    if (planned > maxBytes) return { refused: ZIP_TOO_LARGE };

    // statfs needs the folder to exist: a fresh install has none yet
    await fs.promises.mkdir(userDownloadsDir(userId), { recursive: true });
    const disk = await fs.promises.statfs(downloadsDir());
    const free = BigInt(disk.bavail) * BigInt(disk.bsize);
    if (free < planned + DISK_MARGIN_BYTES) {
      logger.warn("Playlist zip refused: not enough free disk", {
        plannedBytes: planned.toString(),
        freeBytes: free.toString(),
      });
      return { refused: NO_DISK_SPACE };
    }

    return { scenes, name: playlist.name };
  }

  /**
   * Builds a download's zip, one entry at a time: each scene is fetched
   * only once the previous file is in the archive. Access is checked again
   * first (`recheck`); a refusal marks the download FAILED with its reason.
   * A scene that cannot be fetched now (Stash answers 404 or 410, or its
   * instance is no longer loaded) is left out and counted in
   * `skippedItems`; when that leaves nothing, the download fails with
   * NOTHING_FETCHED. Any other failure (Stash, the disk, the size cap,
   * `options.signal`) aborts the fetch, the archive and the file, removes
   * the partial file and marks the download FAILED with a fixed reason; it
   * never throws for one. An abort for "shutdown" or "cancelled", and a row
   * deleted meanwhile (a write that finds no row), remove the file and
   * write nothing.
   */
  async createZip(
    downloadId: number,
    options: { signal?: AbortSignal; maxBytes: bigint }
  ): Promise<void> {
    // Deleted since it was queued: nothing to build
    const download = await downloadService.getDownload(downloadId);
    if (!download) return;

    if (download.playlistId === null) {
      await downloadService.markFailed(downloadId, PLAYLIST_NOT_FOUND);
      return;
    }

    const checked = await this.recheck(
      download.userId,
      download.playlistId,
      options.maxBytes
    );
    if ("refused" in checked) {
      logger.info("Playlist zip refused when its turn came", {
        downloadId,
        reason: checked.refused,
      });
      await downloadService.markFailed(downloadId, checked.refused);
      return;
    }
    const { scenes, name: playlistName } = checked;

    // Stopped or cancelled while it was checked: the row is left as it is
    if (isQuietAbort(options.signal)) return;

    logger.info(`Starting playlist zip creation`, {
      downloadId,
      playlistId: download.playlistId,
      playlistName,
      itemCount: scenes.length,
    });

    // Mark as processing; no row means it was deleted
    if (!(await downloadService.updateProgress(downloadId, 0))) return;

    const zipFilePath = zipPath(download.userId, downloadId);
    const playlistDirName = safeFileName(playlistName);

    // The job's first error, from any part, aborts it: the Stash fetch (its
    // signal), and through `failed` the entry being awaited
    const job = new AbortController();
    const outside = options.signal;
    const onOutsideAbort = (): void => {
      job.abort(outside?.reason);
    };
    if (outside?.aborted) onOutsideAbort();
    outside?.addEventListener("abort", onOutsideAbort, { once: true });
    const failed = new Promise<never>((_resolve, reject) => {
      const onAbort = (): void => {
        reject(toError(job.signal.reason));
      };
      if (job.signal.aborted) onAbort();
      job.signal.addEventListener("abort", onAbort, { once: true });
    });
    // Read only through the races below; a failure with no entry awaited is
    // not an unhandled rejection
    failed.catch(() => undefined);
    const fail = (error: unknown): void => {
      job.abort(error);
    };

    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", {
      zlib: { level: 0 }, // No compression for video files (already compressed)
    });
    archive.on("warning", (warning) => {
      logger.warn("Playlist zip warning", {
        downloadId,
        error: describeError(warning),
      });
    });
    // pipeline listens for errors on both sides and destroys both on one;
    // these listeners make sure an error after it settles is never unhandled
    archive.on("error", fail);
    output.on("error", fail);
    const piped = pipeline(archive, output);
    piped.catch(fail);

    const progress = new ZipProgress(downloadId, scenes);
    const maxBytes = Number(options.maxBytes);
    let bytesWritten = 0;
    // The body being read, to cancel when the job fails
    let reading: Readable | null = null;
    let idleTimer: NodeJS.Timeout | undefined;

    // Track M3U items for playlist file
    const m3uItems: Array<{
      title: string;
      duration: number | null;
      fileName: string;
    }> = [];
    // Each scene's file names, so two same-title scenes get two entries
    const takenNames = new Set<string>();
    // Scenes left out because they could not be fetched
    let skipped = 0;

    try {
      for (const scene of scenes) {
        logger.debug(`Processing scene for zip`, {
          sceneId: scene.id,
          title: scene.title,
        });

        // Fetch first: a scene that cannot be fetched gets no NFO either
        const stashBody = await this.fetchScene(scene, job.signal);
        if (!stashBody) {
          skipped++;
          await progress.skipped(scene, bytesWritten);
          continue;
        }

        // The title Peek shows (the title, else the file name), else the id
        const sceneTitle = scene.title ?? scene.id;
        const sanitizedTitle = uniqueFileName(
          safeFileName(sceneTitle),
          takenNames
        );
        const videoFileName =
          sanitizedTitle + fileExtension(scene.files[0]?.path, ".mp4");
        const nfoFileName = `${sanitizedTitle}.nfo`;

        const nfoContent = generateSceneNfo({
          id: scene.id,
          title: scene.title,
          details: scene.details,
          date: scene.date,
          // The requester's rating; none of theirs writes none
          rating100: scene.rating,
          studioName: scene.studio?.name,
          performerNames: scene.performers.map((p) => p.name),
          tagNames: scene.tags.map((t) => t.name),
          fileName: videoFileName,
        });
        // The body is read only once the NFO is in; a failure meanwhile
        // cancels it with the job
        const body = Readable.fromWeb(stashBody);
        reading = body;
        body.on("error", fail);
        await this.appendEntry(
          archive,
          nfoContent,
          `${playlistDirName}/${nfoFileName}`,
          failed
        );

        // Count every byte on its way into the archive: the size cap, the
        // progress and the idle limit all read it
        const idleTimeoutMs = this.timeouts.idleTimeoutMs;
        const counter: Transform = new Transform({
          transform: (chunk: Buffer, _encoding, callback) => {
            armIdle();
            bytesWritten += chunk.length;
            if (bytesWritten > maxBytes) {
              callback(new ZipTooLargeError());
              return;
            }
            progress.bytes(bytesWritten).then(
              () => callback(null, chunk),
              (error: unknown) => callback(toError(error))
            );
          },
        });
        const armIdle = (): void => {
          clearTimeout(idleTimer);
          idleTimer = setTimeout(onIdle, idleTimeoutMs);
        };
        const onIdle = (): void => {
          // A paused body is the archive or the disk catching up, not a
          // silent Stash
          if (
            counter.writableNeedDrain ||
            counter.readableLength >= counter.readableHighWaterMark
          ) {
            armIdle();
            return;
          }
          fail(
            new StashTimeoutError(
              `Stash sent nothing for ${idleTimeoutMs} ms (scene ${scene.id})`
            )
          );
        };

        counter.on("error", fail);
        pipeline(body, counter).catch(fail);
        armIdle();

        await this.appendEntry(
          archive,
          counter,
          `${playlistDirName}/${videoFileName}`,
          failed
        );
        clearTimeout(idleTimer);
        reading = null;
        await progress.fileDone(bytesWritten);

        m3uItems.push({
          title: sceneTitle,
          duration: scene.files[0]?.duration ?? null,
          fileName: videoFileName,
        });

        logger.debug(`Scene added to zip`, { sceneId: scene.id });
      }

      if (m3uItems.length === 0) throw new NothingFetchedError();

      await this.appendEntry(
        archive,
        this.generateM3U(m3uItems),
        `${playlistDirName}/playlist.m3u`,
        failed
      );

      // Finalize the archive, and wait for the file to be written
      await Promise.race([archive.finalize(), failed]);
      await Promise.race([piped, failed]);

      const stats = await fs.promises.stat(zipFilePath);
      const completed = await downloadService.markCompleted(
        downloadId,
        zipFilePath,
        BigInt(stats.size),
        skipped
      );
      if (!completed) throw new RowGoneError();

      logger.info(`Playlist zip creation completed`, {
        downloadId,
        playlistId: download.playlistId,
        filePath: zipFilePath,
        fileSize: stats.size,
        skippedItems: skipped,
      });
    } catch (caught) {
      // The job's first error is the cause; a later one is its echo
      const error: unknown = job.signal.aborted ? job.signal.reason : caught;
      job.abort(error);
      clearTimeout(idleTimer);
      reading?.destroy();
      archive.abort();
      output.destroy();
      await piped.catch(() => undefined);
      await fs.promises.unlink(zipFilePath).catch(() => undefined);

      // The next start resumes a zip stopped for the shutdown; a cancelled
      // or deleted one is not built at all
      if (error === "shutdown" || error === "cancelled") {
        logger.info(`Playlist zip stopped`, { downloadId, reason: error });
        return;
      }
      if (error instanceof RowGoneError) {
        logger.info(`Playlist zip stopped: its download was deleted`, {
          downloadId,
        });
        return;
      }

      if (error instanceof NothingFetchedError) {
        logger.warn(`Playlist zip has no scene Stash could serve`, {
          downloadId,
          skippedItems: skipped,
        });
      } else {
        logger.error(`Playlist zip creation failed`, {
          downloadId,
          error: describeError(error),
        });
      }

      await downloadService.markFailed(downloadId, failureReason(error));
    } finally {
      outside?.removeEventListener("abort", onOutsideAbort);
    }
  }
}

/** The zip passed its size cap while it was written */
class ZipTooLargeError extends Error {
  constructor() {
    super("The zip grew past the size cap");
    this.name = "ZipTooLargeError";
  }
}

/** The download's row was deleted while its zip was built */
class RowGoneError extends Error {
  constructor() {
    super("The download was deleted");
    this.name = "RowGoneError";
  }
}

/** An abort that writes nothing: the shutdown, or a cancel */
function isQuietAbort(signal: AbortSignal | undefined): boolean {
  return (
    signal?.aborted === true &&
    (signal.reason === "shutdown" || signal.reason === "cancelled")
  );
}

/** Every scene of a zip was left out: there is nothing to zip */
class NothingFetchedError extends Error {
  constructor() {
    super("None of the playlist's scenes could be fetched");
    this.name = "NothingFetchedError";
  }
}

/** The fixed reason a failed zip stores */
function failureReason(error: unknown): string {
  if (error instanceof ZipTooLargeError) return ZIP_TOO_LARGE;
  if (error instanceof NothingFetchedError) return NOTHING_FETCHED;
  return ZIP_FAILED;
}

/** How often, at most, progress is written while a file streams */
const PROGRESS_INTERVAL_MS = 2_000;

/**
 * A zip's progress: bytes written of the bytes planned (each scene's cached
 * file size), up to 95 (the rest is the finish), or files written of all
 * when no size is known. It is written when the whole percentage changes,
 * at most every 2 s while a file streams, and at the end of each file.
 */
class ZipProgress {
  private readonly downloadId: number;
  private plannedBytes: number;
  private readonly totalFiles: number;
  private filesDone = 0;
  private written = 0;
  private writtenAt = Date.now();

  constructor(downloadId: number, scenes: NormalizedScene[]) {
    this.downloadId = downloadId;
    this.plannedBytes = scenes.reduce(
      (sum, scene) => sum + (scene.files[0]?.size ?? 0),
      0
    );
    this.totalFiles = scenes.length;
  }

  /** While a file streams: written if due */
  async bytes(bytesWritten: number): Promise<void> {
    if (Date.now() - this.writtenAt < PROGRESS_INTERVAL_MS) return;
    await this.write(this.percent(bytesWritten));
  }

  /** At the end of each file */
  async fileDone(bytesWritten: number): Promise<void> {
    this.filesDone++;
    await this.write(this.percent(bytesWritten));
  }

  /** A scene left out: its planned bytes will never come */
  async skipped(scene: NormalizedScene, bytesWritten: number): Promise<void> {
    this.plannedBytes -= scene.files[0]?.size ?? 0;
    this.filesDone++;
    await this.write(this.percent(bytesWritten));
  }

  private percent(bytesWritten: number): number {
    const share =
      this.plannedBytes > 0
        ? bytesWritten / this.plannedBytes
        : this.filesDone / this.totalFiles;
    return Math.min(95, Math.floor(share * 95));
  }

  private async write(percent: number): Promise<void> {
    if (percent <= this.written) return;
    this.written = percent;
    this.writtenAt = Date.now();
    if (!(await downloadService.updateProgress(this.downloadId, percent))) {
      throw new RowGoneError();
    }
  }
}

// The logger serialises Error to {}, so log the stack as a string.
function describeError(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export const playlistZipService = new PlaylistZipService();
