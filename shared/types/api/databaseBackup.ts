// shared/types/api/databaseBackup.ts
/**
 * Database backup API types: /api/admin/database/* (admins only).
 *
 * Backups stay on the data volume. Nothing streams one to the browser: a
 * backup holds every user's password hash and history, and the Stash API
 * keys.
 */

/**
 * What made a backup:
 * - `manual`: Create Backup in Settings → Backup;
 * - `preMigration`: the server, before applying a new version's migrations;
 * - `legacy`: `start.sh` before 3.4.0, before baselining an old database.
 */
export type DatabaseBackupKind = "manual" | "preMigration" | "legacy";

/** A backup file, as the server lists it. */
export interface DatabaseBackup {
  filename: string;
  kind: DatabaseBackupKind;
  /**
   * The version a pre-migration backup was taken before upgrading to; null
   * for the other kinds.
   */
  version: string | null;
  /** The file's full path on the server (in the data volume, in Docker). */
  path: string;
  size: number;
  /** The file's modification time, as an ISO timestamp. */
  createdAt: string;
}

/** GET /api/admin/database/backups: newest first. */
export interface ListDatabaseBackupsResponse {
  backups: DatabaseBackup[];
  /** The directory backups are written to and listed from. */
  directory: string;
}

/** POST /api/admin/database/backup */
export interface CreateDatabaseBackupResponse {
  backup: DatabaseBackup;
}

/** DELETE /api/admin/database/backups/:filename */
export interface DeleteDatabaseBackupResponse {
  ok: true;
}
