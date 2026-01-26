import archiver from "archiver";
import * as fs from "fs";
import * as path from "path";
import { Readable } from "stream";
import prisma from "../prisma/singleton.js";
import { downloadService } from "./DownloadService.js";
import { generateSceneNfo } from "../utils/nfoGenerator.js";
import { stashInstanceManager } from "./StashInstanceManager.js";
import { logger } from "../utils/logger.js";

/**
 * Service for creating zip archives of playlists.
 * Streams video files from Stash and includes NFO metadata files.
 */
export class PlaylistZipService {
  /**
   * Get the downloads directory path
   */
  private getDownloadsDir(): string {
    const configDir = process.env.CONFIG_DIR || "/app/data";
    return path.join(configDir, "downloads");
  }

  /**
   * Get the user's download directory path
   */
  private getUserDir(userId: number): string {
    return path.join(this.getDownloadsDir(), `user-${userId}`);
  }

  /**
   * Sanitize a filename by replacing invalid characters
   */
  private sanitizeFileName(name: string): string {
    if (!name || name.trim() === "") {
      return "download";
    }
    return name.trim().replace(/[<>:"/\\|?*]/g, "_");
  }

  /**
   * Generate M3U playlist content
   */
  private generateM3U(
    items: Array<{ title: string; duration: number | null; fileName: string }>
  ): string {
    let content = "#EXTM3U\n";

    for (const item of items) {
      const duration = item.duration ?? -1;
      content += `#EXTINF:${duration},${item.title}\n`;
      content += `${item.fileName}\n`;
    }

    return content;
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

    // Get the playlist with items
    const playlist = await prisma.playlist.findUnique({
      where: { id: download.playlistId },
      include: {
        items: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!playlist) {
      await downloadService.markFailed(downloadId, "Playlist not found");
      throw new Error(`Playlist not found: ${download.playlistId}`);
    }

    logger.info(`Starting playlist zip creation`, {
      downloadId,
      playlistId: playlist.id,
      playlistName: playlist.name,
      itemCount: playlist.items.length,
    });

    // Mark as processing
    await downloadService.updateProgress(downloadId, 0);

    // Ensure directories exist
    const userDir = this.getUserDir(download.userId);
    await fs.promises.mkdir(userDir, { recursive: true });

    const zipFileName = `download-${downloadId}.zip`;
    const zipFilePath = path.join(userDir, zipFileName);
    const playlistDirName = this.sanitizeFileName(playlist.name);

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

    try {
      // Pipe archive to file
      archive.pipe(output);

      // Process each playlist item
      const totalItems = playlist.items.length;
      let processedItems = 0;

      for (const item of playlist.items) {
        // Get scene with relations for NFO generation
        // Use findFirst since composite primary key [id, stashInstanceId] requires both fields for findUnique
        const scene = await prisma.stashScene.findFirst({
          where: { id: item.sceneId },
          include: {
            performers: {
              include: {
                performer: {
                  select: { name: true },
                },
              },
            },
            tags: {
              include: {
                tag: {
                  select: { name: true },
                },
              },
            },
          },
        });

        if (!scene) {
          logger.warn(`Scene not found, skipping`, { sceneId: item.sceneId });
          processedItems++;
          continue;
        }

        // Get studio name if scene has a studio
        let studioName: string | undefined;
        if (scene.studioId) {
          // Use findFirst since composite primary key [id, stashInstanceId] requires both fields for findUnique
          const studio = await prisma.stashStudio.findFirst({
            where: { id: scene.studioId },
            select: { name: true },
          });
          studioName = studio?.name;
        }

        const sceneTitle = scene.title || scene.id;
        const sanitizedTitle = this.sanitizeFileName(sceneTitle);
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
          rating100: scene.rating100,
          studioName,
          performerNames: scene.performers.map((p) => p.performer.name),
          tagNames: scene.tags.map((t) => t.tag.name),
          fileName: videoFileName,
        });

        // Add NFO to archive
        archive.append(nfoContent, {
          name: `${playlistDirName}/${nfoFileName}`,
        });

        // Stream video file from Stash
        const stashBaseUrl = stashInstanceManager.getBaseUrl();
        const apiKey = stashInstanceManager.getApiKey();
        const streamUrl = `${stashBaseUrl}/scene/${scene.id}/stream`;

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
        const nodeStream = Readable.fromWeb(
          response.body as import("stream/web").ReadableStream
        );
        archive.append(nodeStream, {
          name: `${playlistDirName}/${videoFileName}`,
        });

        // Track for M3U
        m3uItems.push({
          title: sceneTitle,
          duration: scene.duration,
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

      await downloadService.markFailed(downloadId, errorMessage);
      throw error;
    }
  }
}

export const playlistZipService = new PlaylistZipService();
