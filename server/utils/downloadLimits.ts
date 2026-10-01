import type { NormalizedScene } from "../types/index.js";
import { logger } from "./logger.js";

const MIB = 1024n * 1024n;

/** The size cap on a playlist zip when MAX_PLAYLIST_DOWNLOAD_SIZE_MB is unset */
export const DEFAULT_MAX_PLAYLIST_MB = 10240;

/** Playlist zips a user may have pending or building at once */
export const MAX_ACTIVE_ZIPS_PER_USER = 3;

/** Free space a zip build leaves on the disk beyond its planned size */
export const DISK_MARGIN_BYTES = 1024n * MIB;

/** Zips built at once, server-wide */
export const ZIP_CONCURRENCY = 1;

/**
 * The size cap on a playlist zip, in bytes: MAX_PLAYLIST_DOWNLOAD_SIZE_MB
 * MiB. A value that is not a positive whole number is logged and the
 * 10240 MiB default used, so a typo never stops the server.
 */
export function maxPlaylistBytes(env: NodeJS.ProcessEnv = process.env): bigint {
  const raw = env.MAX_PLAYLIST_DOWNLOAD_SIZE_MB;
  if (raw === undefined) return BigInt(DEFAULT_MAX_PLAYLIST_MB) * MIB;
  const mb = raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isSafeInteger(mb) || mb <= 0) {
    logger.warn(
      `MAX_PLAYLIST_DOWNLOAD_SIZE_MB is not a positive whole number; using ${DEFAULT_MAX_PLAYLIST_MB}`,
      { value: raw }
    );
    return BigInt(DEFAULT_MAX_PLAYLIST_MB) * MIB;
  }
  return BigInt(mb) * MIB;
}

/** A size in bytes as whole MiB, rounded up */
export function toMiB(bytes: bigint): bigint {
  return (bytes + MIB - 1n) / MIB;
}

/**
 * The bytes a zip of these scenes is planned at: each scene's first file
 * as the cache knows it, a missing size counting 0. Each scene counts once
 * per (id, instance), as the list holds it.
 */
export function plannedZipBytes(scenes: readonly NormalizedScene[]): bigint {
  let total = 0n;
  for (const scene of scenes) {
    const size = scene.files[0]?.size;
    if (typeof size === "number" && Number.isFinite(size) && size > 0) {
      total += BigInt(Math.round(size));
    }
  }
  return total;
}
