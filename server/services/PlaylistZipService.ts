import archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import type { ReadableStream as WebReadableStream } from "stream/web";
import prisma from "../prisma/singleton.js";
import type { NormalizedScene } from "../types/index.js";
import { getConfigDir } from "../utils/configDir.js";
import { safeFileName, uniqueFileName } from "../utils/contentDisposition.js";
import {
  NOTHING_TO_DOWNLOAD,
  PLAYLIST_NOT_FOUND,
  ZIP_FAILED,
} from "../utils/downloadReasons.js";
import { logger } from "../utils/logger.js";
import { generateSceneNfo } from "../utils/nfoGenerator.js";
import { downloadService } from "./DownloadService.js";
import { loadPlaylistItems } from "./PlaylistQueryService.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import { getUserAllowedInstanceIds } from "./UserInstanceService.js";

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
  /**
   * Get the downloads directory path
   */
  private getDownloadsDir(): string {
    return path.join(getConfigDir(), "downloads");
  }

  /**
   * Get the user's download directory path
   */
  private getUserDir(userId: number): string {
    return path.join(this.getDownloadsDir(), `user-${userId}`);
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
   * the playlist's one item read (the scene builder, a page of refs a call)
   */
  private async readScenes(
    userId: number,
    playlistId: number
  ): Promise<NormalizedScene[]> {
    const allowedInstanceIds = await getUserAllowedInstanceIds(userId);
    const { items } = await loadPlaylistItems({
      userId,
      allowedInstanceIds,
      playlistId,
    });
    return items.flatMap((item) => (item.scene ? [item.scene] : []));
  }

  /**
   * Create a zip archive for a download
   */
  async createZip(downloadId: number): Promise<void> {
    // Get the download record
    const download = await downloadService.getDownload(downloadId);
    if (!download) {
      throw new Error(`Download not found: ${downloadId}`);
    }

    if (!download.playlistId) {
      throw new Error(`Download ${downloadId} has no associated playlist`);
    }

    // Get the playlist for its name
    const playlist = await prisma.playlist.findUnique({
      where: { id: download.playlistId },
    });

    if (!playlist) {
      await downloadService.markFailed(downloadId, PLAYLIST_NOT_FOUND);
      throw new Error(`Playlist not found: ${download.playlistId}`);
    }

    // Only the scenes the requester may see now, each on its own instance
    const scenes = await this.readScenes(download.userId, download.playlistId);
    if (scenes.length === 0) {
      await downloadService.markFailed(downloadId, NOTHING_TO_DOWNLOAD);
      return;
    }

    logger.info(`Starting playlist zip creation`, {
      downloadId,
      playlistId: playlist.id,
      playlistName: playlist.name,
      itemCount: scenes.length,
    });

    // Mark as processing
    await downloadService.updateProgress(downloadId, 0);

    // Ensure directories exist
    const userDir = this.getUserDir(download.userId);
    await fs.promises.mkdir(userDir, { recursive: true });

    const zipFileName = `download-${downloadId}.zip`;
    const zipFilePath = path.join(userDir, zipFileName);
    const playlistDirName = safeFileName(playlist.name);

    // Create write stream and archiver
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", {
      zlib: { level: 0 }, // No compression for video files (already compressed)
    });

    // Track M3U items for playlist file
    const m3uItems: Array<{
      title: string;
      duration: number | null;
      fileName: string;
    }> = [];
    // Each scene's file names, so two same-title scenes get two entries
    const takenNames = new Set<string>();

    try {
      // Pipe archive to file
      archive.pipe(output);

      // Process each scene
      const totalItems = scenes.length;
      let processedItems = 0;

      for (const scene of scenes) {
        // The title Peek shows (the title, else the file name), else the id
        const sceneTitle = scene.title ?? scene.id;
        const sanitizedTitle = uniqueFileName(
          safeFileName(sceneTitle),
          takenNames
        );
        const videoFileName = `${sanitizedTitle}.mp4`;
        const nfoFileName = `${sanitizedTitle}.nfo`;

        logger.debug(`Processing scene for zip`, {
          sceneId: scene.id,
          title: sceneTitle,
        });

        // Generate NFO content
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

        // Add NFO to archive
        archive.append(nfoContent, {
          name: `${playlistDirName}/${nfoFileName}`,
        });

        // Stream video file from the Stash instance the scene lives on. An
        // instance disabled or deleted since the list was read throws
        // UnknownInstanceError, and the download fails below.
        const { baseUrl, apiKey } = stashInstanceManager.getCredentials(
          scene.instanceId
        );
        const streamUrl = `${baseUrl}/scene/${scene.id}/stream`;

        logger.debug(`Fetching video from Stash`, {
          sceneId: scene.id,
          url: streamUrl,
        });

        const response = await fetch(streamUrl, {
          headers: {
            ApiKey: apiKey,
          },
        });

        if (!response.ok) {
          logger.error(`Failed to fetch video from Stash`, {
            sceneId: scene.id,
            status: response.status,
            statusText: response.statusText,
          });
          throw new Error(
            `Failed to fetch video for scene ${scene.id}: ${response.status} ${response.statusText}`
          );
        }

        if (!response.body) {
          throw new Error(`No response body for scene ${scene.id}`);
        }

        // Convert web stream to node stream and add to archive
        const nodeStream = Readable.fromWeb(response.body as WebReadableStream);
        archive.append(nodeStream, {
          name: `${playlistDirName}/${videoFileName}`,
        });

        // Track for M3U
        m3uItems.push({
          title: sceneTitle,
          duration: scene.files[0]?.duration ?? null,
          fileName: videoFileName,
        });

        // Update progress
        processedItems++;
        const progress = Math.floor((processedItems / totalItems) * 95); // Leave 5% for finalization
        await downloadService.updateProgress(downloadId, progress);

        logger.debug(`Scene added to zip`, {
          sceneId: scene.id,
          progress,
        });
      }

      // Add M3U playlist file
      const m3uContent = this.generateM3U(m3uItems);
      archive.append(m3uContent, {
        name: `${playlistDirName}/playlist.m3u`,
      });

      // Finalize the archive
      await archive.finalize();

      // Wait for the output stream to finish
      await new Promise<void>((resolve, reject) => {
        output.on("close", resolve);
        output.on("error", reject);
      });

      // Get final file size
      const stats = await fs.promises.stat(zipFilePath);
      const fileSize = BigInt(stats.size);

      // Mark as completed
      await downloadService.markCompleted(downloadId, zipFilePath, fileSize);

      logger.info(`Playlist zip creation completed`, {
        downloadId,
        playlistId: playlist.id,
        filePath: zipFilePath,
        fileSize: stats.size,
      });
    } catch (error) {
      // Clean up partial file on error
      try {
        await fs.promises.unlink(zipFilePath);
      } catch {
        // Ignore cleanup errors
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Playlist zip creation failed`, {
        downloadId,
        error: errorMessage,
      });

      await downloadService.markFailed(downloadId, ZIP_FAILED);
      throw error;
    }
  }
}

export const playlistZipService = new PlaylistZipService();
