import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * The server's version and build date (item 84, TCI-18).
 *
 * The image runs `node backend/index.js` directly, so npm_package_version is
 * unset there, and process.cwd() is wrong whenever the server starts from
 * another directory. The version comes from the first package.json named
 * peek-server above this module instead: `server/package.json` in dev and
 * tests, `/app/package.json` in the image (the module is in /app/backend/utils).
 */

const SERVER_PACKAGE_NAME = "peek-server";
const MAX_LEVELS_UP = 4;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export function findServerVersion(startDir: string = moduleDir): string {
  let dir = path.resolve(startDir);
  for (let level = 0; level <= MAX_LEVELS_UP; level++) {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, "package.json"), "utf8")
      ) as { name?: unknown; version?: unknown };
      if (
        manifest.name === SERVER_PACKAGE_NAME &&
        typeof manifest.version === "string"
      ) {
        return manifest.version;
      }
    } catch {
      // No readable package.json here; keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "unknown";
}

let cachedVersion: string | undefined;

export const getServerVersion = (): string =>
  (cachedVersion ??= findServerVersion());

/** The image's build date (the BUILD_DATE build arg), or null outside a release build */
export const getBuildDate = (): string | null => process.env.BUILD_DATE || null;
