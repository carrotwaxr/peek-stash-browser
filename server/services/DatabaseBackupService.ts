/**
 * DatabaseBackupService
 *
 * Handles database backup operations:
 * - List existing backups
 * - Create new backups using VACUUM INTO
 * - Delete backup files
 */
import fs from "fs/promises";
import path from "path";
import { logger } from "../utils/logger.js";
import prisma from "../prisma/singleton.js";

const BACKUP_PATTERN = /^peek-stash-browser\.db\.backup-\d{8}-\d{6}$/;

export interface BackupInfo {
  filename: string;
  size: number;
  createdAt: Date;
}

class DatabaseBackupService {
  private getDataDir(): string {
    return process.env.CONFIG_DIR || "/app/data";
  }

  /**
   * List all backup files with metadata.
   * Returns sorted by date descending (newest first).
   */
  async listBackups(): Promise<BackupInfo[]> {
    const dataDir = this.getDataDir();

    let files: string[];
    try {
      files = await fs.readdir(dataDir);
    } catch (error) {
      logger.error("Failed to read backup directory", {
        dataDir,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const backupFiles = files.filter((f) => BACKUP_PATTERN.test(f));

    const backupPromises = backupFiles.map(async (filename) => {
      const filePath = path.join(dataDir, filename);
      try {
        const stat = await fs.stat(filePath);
        return {
          filename,
          size: stat.size,
          createdAt: stat.mtime,
        };
      } catch {
        // File was deleted between readdir and stat - skip it
        return null;
      }
    });

    const results = await Promise.all(backupPromises);
    const backups = results.filter((b): b is BackupInfo => b !== null);

    // Sort by date descending (newest first)
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return backups;
  }

  /**
   * Create a new backup using SQLite VACUUM INTO.
   * Returns info about the created backup.
   */
  async createBackup(): Promise<BackupInfo> {
    const dataDir = this.getDataDir();
    const timestamp = this.formatTimestamp(new Date());
    const filename = `peek-stash-browser.db.backup-${timestamp}`;
    const backupPath = path.join(dataDir, filename);

    logger.info(`Creating database backup: ${filename}`);

    // Use VACUUM INTO for atomic, consistent backup
    await prisma.$executeRawUnsafe(`VACUUM INTO '${backupPath}'`);

    const stat = await fs.stat(backupPath);

    logger.info(`Backup created successfully: ${filename} (${stat.size} bytes)`);

    return {
      filename,
      size: stat.size,
      createdAt: stat.mtime,
    };
  }

  /**
   * Delete a backup file.
   * Validates filename to prevent path traversal attacks.
   */
  async deleteBackup(filename: string): Promise<void> {
    // Security: validate filename matches expected pattern
    if (!BACKUP_PATTERN.test(filename)) {
      throw new Error("Invalid backup filename");
    }

    const dataDir = this.getDataDir();
    const filePath = path.join(dataDir, filename);

    logger.info(`Deleting backup: ${filename}`);
    await fs.unlink(filePath);
    logger.info(`Backup deleted: ${filename}`);
  }

  private formatTimestamp(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }
}

export const databaseBackupService = new DatabaseBackupService();
