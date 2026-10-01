import * as path from "path";
import { getConfigDir } from "./configDir.js";

/** Where playlist zips are written: `<CONFIG_DIR>/downloads` */
export function downloadsDir(): string {
  return path.join(getConfigDir(), "downloads");
}

/** One user's zips: `<CONFIG_DIR>/downloads/user-<id>` */
export function userDownloadsDir(userId: number): string {
  return path.join(downloadsDir(), `user-${userId}`);
}

/** A playlist download's zip file */
export function zipPath(userId: number, downloadId: number): string {
  return path.join(userDownloadsDir(userId), `download-${downloadId}.zip`);
}
