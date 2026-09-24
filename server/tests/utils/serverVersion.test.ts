/**
 * Unit tests for the server version and build date (item 84, TCI-18).
 *
 * The image runs `node backend/index.js` directly, so npm_package_version is
 * unset there. The version comes from the peek-server package.json found by
 * walking up from the module's own directory.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findServerVersion, getBuildDate } from "../../utils/serverVersion.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(testDir, "../..");

describe("serverVersion", () => {
  const tempDirs: string[] = [];

  const makeTempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-version-"));
    tempDirs.push(dir);
    return dir;
  };

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds the peek-server package.json above the module", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(serverDir, "package.json"), "utf8")
    ) as { version: string };

    expect(findServerVersion(path.join(serverDir, "utils"))).toBe(
      manifest.version
    );
  });

  it("walks up past directories without a peek-server package.json", () => {
    // The image layout: the module is at /app/backend/utils, the manifest at /app/package.json
    const root = makeTempDir();
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ name: "peek-server", version: "9.9.9" })
    );
    const start = path.join(root, "backend", "utils");
    fs.mkdirSync(start, { recursive: true });

    expect(findServerVersion(start)).toBe("9.9.9");
  });

  it("returns 'unknown' when no manifest is found", () => {
    const root = makeTempDir();
    const start = path.join(root, "a", "b", "c", "d", "e");
    fs.mkdirSync(start, { recursive: true });

    expect(findServerVersion(start)).toBe("unknown");
  });

  describe("getBuildDate", () => {
    const original = process.env.BUILD_DATE;

    beforeEach(() => {
      delete process.env.BUILD_DATE;
    });

    afterEach(() => {
      if (original === undefined) delete process.env.BUILD_DATE;
      else process.env.BUILD_DATE = original;
    });

    it("getBuildDate returns BUILD_DATE, or null when it is unset or empty", () => {
      expect(getBuildDate()).toBeNull();

      process.env.BUILD_DATE = "";
      expect(getBuildDate()).toBeNull();

      process.env.BUILD_DATE = "2026-09-23T12:00:00Z";
      expect(getBuildDate()).toBe("2026-09-23T12:00:00Z");
    });
  });
});
