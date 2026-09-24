/**
 * The directory Peek keeps its own files in: database backups, download zips
 * and the session secret. `CONFIG_DIR`, or the image's data volume
 * `/app/data` when the variable is unset or empty.
 */
export function getConfigDir(): string {
  const dir = process.env.CONFIG_DIR;
  return dir === undefined || dir === "" ? "/app/data" : dir;
}
