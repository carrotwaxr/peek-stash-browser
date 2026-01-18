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
}

export const databaseBackupService = new DatabaseBackupService();
