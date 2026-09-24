/**
 * runSchemaCatchup inspects an existing database through the sqlite3 CLI,
 * writing each query to a scratch file first. The scratch files go in tmp/
 * beside the database: outside the image /app/data is not writable, and a
 * server there (E2E, native development) failed to start on an existing
 * database.
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runSchemaCatchup } from "../../initializers/schemaCatchup.js";

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

describe("runSchemaCatchup", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "peek-catchup-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("writes its sqlite3 scratch files beside the database", async () => {
    // An empty file is an empty database: no tables, so nothing to catch up
    const dbPath = path.join(dataDir, "peek.db");
    writeFileSync(dbPath, "");

    await expect(runSchemaCatchup(dbPath)).resolves.toBeUndefined();
    expect(existsSync(path.join(dataDir, "tmp"))).toBe(true);
  });
});
