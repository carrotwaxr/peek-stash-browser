/**
 * The server brings a database up to date with one `prisma migrate deploy`,
 * run against a real SQLite file in a sandbox (never the suite's database).
 */
import type * as childProcessModule from "child_process";
import { execFile } from "child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listMigrationFolders,
  migrateDatabase,
  readMigrationPlan,
} from "../../initializers/migrations.js";
import { must } from "../../tests/helpers/must.js";
import {
  type MigrationSandbox,
  PRISMA_DIR,
  createDatabaseAt,
} from "../helpers/migrationSandbox.js";

// Child processes run for real; the spy counts the Prisma CLI starts
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof childProcessModule>();
  return { ...actual, execFile: vi.fn(actual.execFile) };
});

const FOLDERS = listMigrationFolders(PRISMA_DIR);

describe("migrateDatabase", () => {
  let sandbox: MigrationSandbox | undefined;

  afterEach(async () => {
    await sandbox?.remove();
    sandbox = undefined;
  });

  it("a database one migration behind gets that migration in one deploy", async () => {
    const newest = must(
      FOLDERS[FOLDERS.length - 1],
      "the newest migration folder"
    );
    const current = await createDatabaseAt(
      must(FOLDERS[FOLDERS.length - 2], "the second newest migration folder")
    );
    sandbox = current;
    const before = await readMigrationPlan(current.client, PRISMA_DIR);
    expect(before.pending).toEqual([newest]);
    vi.mocked(execFile).mockClear();

    const result = await migrateDatabase({
      client: current.client,
      databaseUrl: current.url,
      prismaDir: PRISMA_DIR,
    });

    expect(result.applied).toEqual([newest]);
    expect(vi.mocked(execFile)).toHaveBeenCalledOnce();
    const after = await readMigrationPlan(current.client, PRISMA_DIR);
    expect(after.pending).toEqual([]);
    expect(after.applied).toEqual(FOLDERS);
    expect(after.unfinished).toEqual([]);
  });

  it("an up-to-date database starts no Prisma CLI", async () => {
    const current = await createDatabaseAt(
      must(FOLDERS[FOLDERS.length - 1], "the newest migration folder")
    );
    sandbox = current;
    vi.mocked(execFile).mockClear();

    const result = await migrateDatabase({
      client: current.client,
      databaseUrl: current.url,
      prismaDir: PRISMA_DIR,
    });

    expect(result.applied).toEqual([]);
    expect(result.plan.applied).toEqual(FOLDERS);
    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
  });
});
