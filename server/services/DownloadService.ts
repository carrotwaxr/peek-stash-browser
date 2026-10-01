import type { Download, DownloadStatus, DownloadType } from "@prisma/client";
import * as fs from "fs";
import { ForbiddenError, NotFoundError } from "../middleware/errorHandler.js";
import prisma from "../prisma/singleton.js";
import { fileExtension, safeFileName } from "../utils/contentDisposition.js";
import { zipPath } from "../utils/downloadPaths.js";
import { logger } from "../utils/logger.js";
import { emptyToNull } from "../utils/sqlHelpers.js";
import { getSceneFallbackTitle } from "../utils/titleUtils.js";

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
  instanceId: string;
  fileName: string;
  fileSize: bigint | null;
  filePath: string | null;
  progress: number;
  error: string | null;
  /** Playlist zips: scenes left out because they could not be fetched */
  skippedItems: number;
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
    sceneId: string,
    instanceId: string
  ): Promise<DownloadRecord> {
    // The scene on this instance, if not soft-deleted
    const scene = await prisma.stashScene.findFirst({
      where: { id: sceneId, stashInstanceId: instanceId, deletedAt: null },
      select: { id: true, title: true, filePath: true, fileSize: true },
    });

    if (!scene) {
      throw new Error("Scene not found");
    }

    // The title Peek shows (the title, else the file's name), else the id,
    // with the file's own extension
    const displayName =
      emptyToNull(scene.title) ?? getSceneFallbackTitle(scene.filePath);
    const fileName =
      safeFileName(displayName ?? sceneId) +
      fileExtension(scene.filePath, ".mp4");

    const download = await prisma.download.create({
      data: {
        userId,
        type: "SCENE",
        status: "COMPLETED",
        entityType: "scene",
        entityId: sceneId,
        instanceId,
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
    imageId: string,
    instanceId: string
  ): Promise<DownloadRecord> {
    // The image on this instance, if not soft-deleted
    const image = await prisma.stashImage.findFirst({
      where: { id: imageId, stashInstanceId: instanceId, deletedAt: null },
      select: { id: true, title: true, filePath: true, fileSize: true },
    });

    if (!image) {
      throw new Error("Image not found");
    }

    const fileName =
      safeFileName(emptyToNull(image.title) ?? imageId) +
      fileExtension(image.filePath, ".jpg");

    const download = await prisma.download.create({
      data: {
        userId,
        type: "IMAGE",
        status: "COMPLETED",
        entityType: "image",
        entityId: imageId,
        instanceId,
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

    const fileName = safeFileName(playlist.name) + ".zip";

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
   * This user's zip of this playlist still waiting or being built, if any
   * (the oldest).
   */
  async findActivePlaylistDownload(
    userId: number,
    playlistId: number
  ): Promise<Download | null> {
    return prisma.download.findFirst({
      where: {
        userId,
        type: "PLAYLIST",
        playlistId,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** How many of this user's zips are waiting or being built */
  async countActivePlaylistDownloads(userId: number): Promise<number> {
    return prisma.download.count({
      where: {
        userId,
        type: "PLAYLIST",
        status: { in: ["PENDING", "PROCESSING"] },
      },
    });
  }

  /**
   * Sets a FAILED download back to PENDING for a retry, in one conditional
   * update: false when the row is no longer FAILED (a retry already took it)
   * or is gone.
   */
  async requeueFailedDownload(downloadId: number): Promise<boolean> {
    const { count } = await prisma.download.updateMany({
      where: { id: downloadId, status: "FAILED" },
      data: { status: "PENDING", progress: 0, error: null, skippedItems: 0 },
    });
    return count > 0;
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
   * Update the progress of a download (for playlist zipping). This and the
   * two below report whether the row was written: false means it was
   * deleted, and the zip being built stops.
   */
  async updateProgress(downloadId: number, progress: number): Promise<boolean> {
    const { count } = await prisma.download.updateMany({
      where: { id: downloadId },
      data: { progress, status: "PROCESSING" },
    });
    return count > 0;
  }

  /**
   * Mark a download as completed with file path and 24h expiry, and how
   * many of a zip's scenes were left out because they could not be fetched.
   */
  async markCompleted(
    downloadId: number,
    filePath: string,
    fileSize: bigint,
    skippedItems: number
  ): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DOWNLOAD_EXPIRY_MS);

    const { count } = await prisma.download.updateMany({
      where: { id: downloadId },
      data: {
        status: "COMPLETED",
        progress: 100,
        filePath,
        fileSize,
        skippedItems,
        completedAt: now,
        expiresAt,
      },
    });
    return count > 0;
  }

  /**
   * Mark a download as failed with an error message.
   */
  async markFailed(downloadId: number, error: string): Promise<boolean> {
    const { count } = await prisma.download.updateMany({
      where: { id: downloadId },
      data: { status: "FAILED", error },
    });
    return count > 0;
  }

  /**
   * A download its owner may act on. 404 when there is none, 403 for
   * another user's.
   */
  async getOwnedDownload(
    downloadId: number,
    userId: number
  ): Promise<Download> {
    const download = await prisma.download.findUnique({
      where: { id: downloadId },
    });

    if (!download) {
      throw new NotFoundError("Download not found");
    }

    if (download.userId !== userId) {
      throw new ForbiddenError("Access denied");
    }

    return download;
  }

  /**
   * Delete a download record and, for a playlist zip, its file (the
   * finished one, or the partial one of a build in progress). Only the owner
   * can delete. The caller stops a build first (`downloadJobQueue.cancel`).
   */
  async deleteDownload(downloadId: number, userId: number): Promise<void> {
    const download = await this.getOwnedDownload(downloadId, userId);

    await prisma.download.delete({
      where: { id: downloadId },
    });

    if (download.type !== "PLAYLIST") return;
    const file = download.filePath ?? zipPath(userId, downloadId);
    await fs.promises.unlink(file).catch((error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return;
      logger.warn("Could not remove a deleted download's file", {
        downloadId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

export const downloadService = new DownloadService();
