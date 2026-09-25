/**
 * Settings → Backup over HTTP (item 70).
 *
 * Backups are admin-only, named after the database file, listed with their
 * kind and full path, and two made in the same second both succeed. Delete
 * takes only a backup's name. There is no download route.
 */
import fs from "fs";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { getDatabaseBaseName } from "../../services/DatabaseBackupService.js";
import { must } from "../../tests/helpers/must.js";
import type {
  CreateDatabaseBackupResponse,
  DatabaseBackup,
  ListDatabaseBackupsResponse,
} from "../../types/api/databaseBackup.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient } from "../helpers/testClient.js";

describe("Database backups (integration)", () => {
  let reader: { id: number; client: TestClient } | undefined;
  const made: string[] = [];

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    reader = await createApiUser("backup_it_reader", "backup_it_pass_1");
  }, 60000);

  afterAll(async () => {
    for (const filename of made) {
      await adminClient.delete(
        `/api/admin/database/backups/${encodeURIComponent(filename)}`
      );
    }
    if (reader) await adminClient.delete(`/api/user/${reader.id}`);
  }, 60000);

  async function listBackups(): Promise<ListDatabaseBackupsResponse> {
    const res = await adminClient.get<ListDatabaseBackupsResponse>(
      "/api/admin/database/backups"
    );
    expect(res.status).toBe(200);
    return res.data;
  }

  it("two backups in the same second are both made, listed with their kind and path, and deleted", async () => {
    const base = await getDatabaseBaseName(prisma);
    const created = await Promise.all([
      adminClient.post<CreateDatabaseBackupResponse>(
        "/api/admin/database/backup"
      ),
      adminClient.post<CreateDatabaseBackupResponse>(
        "/api/admin/database/backup"
      ),
    ]);
    const backups: DatabaseBackup[] = created.map((res) => {
      expect(res.status).toBe(200);
      return res.data.backup;
    });
    made.push(...backups.map((backup) => backup.filename));

    const { directory, backups: listed } = await listBackups();
    for (const backup of backups) {
      expect(backup.filename).toMatch(
        new RegExp(`^${base.replace(/\./g, "\\.")}\\.backup-\\d{8}-\\d{6}`)
      );
      expect(backup.kind).toBe("manual");
      expect(backup.version).toBeNull();
      expect(backup.path).toBe(path.join(directory, backup.filename));
      // A finished SQLite database file
      const header = fs.readFileSync(backup.path).subarray(0, 16).toString();
      expect(header).toBe("SQLite format 3\0");
      expect(listed.map((row) => row.filename)).toContain(backup.filename);
    }
    expect(new Set(backups.map((backup) => backup.filename)).size).toBe(2);

    for (const backup of backups) {
      const res = await adminClient.delete(
        `/api/admin/database/backups/${encodeURIComponent(backup.filename)}`
      );
      expect(res.status).toBe(200);
      expect(fs.existsSync(backup.path)).toBe(false);
    }
    made.length = 0;
    const after = (await listBackups()).backups.map((row) => row.filename);
    for (const backup of backups) {
      expect(after).not.toContain(backup.filename);
    }
  });

  it("a non-admin gets 403", async () => {
    const client = must(reader).client;
    const list = await client.get("/api/admin/database/backups");
    expect(list.status).toBe(403);
    const create = await client.post("/api/admin/database/backup");
    expect(create.status).toBe(403);

    const { backups } = await listBackups();
    const before = backups.length;
    const remove = await client.delete(
      "/api/admin/database/backups/peek-stash-browser.db.backup-20260118-104532"
    );
    expect(remove.status).toBe(403);
    expect((await listBackups()).backups).toHaveLength(before);
  });

  it("a filename outside the patterns gets 400", async () => {
    const base = await getDatabaseBaseName(prisma);
    for (const filename of [
      base,
      `${base}-wal`,
      `${base}.backup-20260118-104532-wal`,
      `${base}.backup-20260924-101112-pre-3.5.0-journal`,
      ".jwt-secret",
      `../${base}`,
      "..%2F..%2Fetc%2Fpasswd",
    ]) {
      const res = await adminClient.delete<{ error?: string }>(
        `/api/admin/database/backups/${encodeURIComponent(filename)}`
      );
      expect(res.status, filename).toBe(400);
    }
  });
});
