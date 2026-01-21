import prisma from "../prisma/singleton.js";
import type { Download, DownloadType, DownloadStatus } from "@prisma/client";

/** 24 hours in milliseconds for download expiry */
const DOWNLOAD_EXPIRY_MS = 24 * 60 * 60 * 1000;

export interface DownloadRecord {
  id: number;
  userId: number;
  type: DownloadType;
  status: DownloadStatus;
  playlistId: number | null;
  entityType: string | null;
  entityId: string | null;
  fileName: string;
  fileSize: bigint | null;
  filePath: string | null;
  progress: number;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}

export class DownloadService {
  /**
   * Create a download record for a scene (direct file download).
   * These are marked as COMPLETED immediately since there's no processing.
   */
  async createSceneDownload(
    userId: number,
    sceneId: string
  ): Promise<DownloadRecord> {
    const scene = await prisma.stashScene.findUnique({
      where: { id: sceneId },
      select: { id: true, title: true, filePath: true, fileSize: true },
    });

    if (!scene) {
      throw new Error("Scene not found");
    }

    // Use title, or filename from path, or sceneId as fallback
    let displayName = scene.title;
    if (!displayName && scene.filePath) {
      // Extract filename without extension from path
      const pathParts = scene.filePath.split("/");
      const fileWithExt = pathParts[pathParts.length - 1];
      displayName = fileWithExt.replace(/\.[^/.]+$/, ""); // Remove extension
    }
    const fileName = this.sanitizeFileName(displayName || sceneId) + ".mp4";

    const download = await prisma.download.create({
      data: {
        userId,
        type: "SCENE",
        status: "COMPLETED",
        entityType: "scene",
        entityId: sceneId,
        fileName,
        fileSize: scene.fileSize,
        progress: 100,
        completedAt: new Date(),
      },
    });

    return download as DownloadRecord;
  }

  /**
   * Create a download record for an image (direct file download).
   * These are marked as COMPLETED immediately since there's no processing.
   */
  async createImageDownload(
    userId: number,
    imageId: string
  ): Promise<DownloadRecord> {
    const image = await prisma.stashImage.findUnique({
      where: { id: imageId },
      select: { id: true, title: true, fileSize: true },
    });

    if (!image) {
      throw new Error("Image not found");
    }

    const fileName = this.sanitizeFileName(image.title || imageId) + ".jpg";

    const download = await prisma.download.create({
      data: {
        userId,
        type: "IMAGE",
        status: "COMPLETED",
        entityType: "image",
        entityId: imageId,
        fileName,
        fileSize: image.fileSize,
        progress: 100,
        completedAt: new Date(),
      },
    });

    return download as DownloadRecord;
  }

  /**
   * Create a download record for a playlist zip.
   * These start as PENDING and will be processed by PlaylistZipService.
   */
  async createPlaylistDownload(
    userId: number,
    playlistId: number
  ): Promise<DownloadRecord> {
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { id: true, name: true, items: { select: { sceneId: true } } },
    });

    if (!playlist) {
      throw new Error("Playlist not found");
    }

    const fileName = this.sanitizeFileName(playlist.name) + ".zip";

    const download = await prisma.download.create({
      data: {
        userId,
        type: "PLAYLIST",
        status: "PENDING",
        playlistId,
        fileName,
        progress: 0,
      },
    });

    return download as DownloadRecord;
  }

  /**
   * Calculate the total file size of all scenes in a playlist.
   */
  async calculatePlaylistSize(playlistId: number): Promise<bigint> {
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      select: { items: { select: { sceneId: true } } },
    });

    if (!playlist || playlist.items.length === 0) {
      return BigInt(0);
    }

    const sceneIds = playlist.items.map((item) => item.sceneId);
    const scenes = await prisma.stashScene.findMany({
      where: { id: { in: sceneIds } },
      select: { fileSize: true },
    });

    let totalSize = BigInt(0);
    for (const scene of scenes) {
      if (scene.fileSize) {
        totalSize += scene.fileSize;
      }
    }

    return totalSize;
  }

  /**
   * Get a download by ID.
   */
  async getDownload(downloadId: number): Promise<Download | null> {
    return prisma.download.findUnique({
      where: { id: downloadId },
    });
  }

  /**
   * Get all downloads for a user, sorted by creation date descending.
   */
  async getUserDownloads(
    userId: number,
    limit: number = 20
  ): Promise<Download[]> {
    return prisma.download.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Update the progress of a download (for playlist zipping).
   */
  async updateProgress(
    downloadId: number,
    progress: number
  ): Promise<Download> {
    return prisma.download.update({
      where: { id: downloadId },
      data: { progress, status: "PROCESSING" },
    });
  }

  /**
   * Mark a download as completed with file path and 24h expiry.
   */
  async markCompleted(
    downloadId: number,
    filePath: string,
    fileSize: bigint
  ): Promise<Download> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DOWNLOAD_EXPIRY_MS);

    return prisma.download.update({
      where: { id: downloadId },
      data: {
        status: "COMPLETED",
        progress: 100,
        filePath,
        fileSize,
        completedAt: now,
        expiresAt,
      },
    });
  }

  /**
   * Mark a download as failed with an error message.
   */
  async markFailed(downloadId: number, error: string): Promise<Download> {
    return prisma.download.update({
      where: { id: downloadId },
      data: { status: "FAILED", error },
    });
  }

  /**
   * Delete a download record. Only the owner can delete.
   */
  async deleteDownload(downloadId: number, userId: number): Promise<void> {
    const download = await prisma.download.findUnique({
      where: { id: downloadId },
      select: { id: true, userId: true },
    });

    if (!download) {
      throw new Error("Download not found");
    }

    if (download.userId !== userId) {
      throw new Error("Not authorized to delete this download");
    }

    await prisma.download.delete({
      where: { id: downloadId },
    });
  }

  /**
   * Sanitize a filename by removing invalid characters.
   */
  private sanitizeFileName(name: string): string {
    if (!name || name.trim() === "") {
      return "download";
    }

    // Remove or replace invalid characters for filenames
    return name
      .trim()
      .replace(/[<>:"/\\|?*]/g, "_");
  }
}

export const downloadService = new DownloadService();
