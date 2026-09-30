/**
 * After an upgrade, a tab that stayed open asks for page chunks the new build
 * no longer has. A reload loads the new build; the guard keeps a chunk that
 * is really missing from reloading forever.
 */

const RELOAD_KEY = "peek-reloaded-for-update";
const RELOAD_WINDOW_MS = 10_000;

const CHUNK_MESSAGES = [
  "dynamically imported module", // Chromium and Firefox ("error loading ...")
  "Importing a module script failed", // Safari
];

/** Whether an error is a page chunk that failed to load */
export const isChunkLoadError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  return (
    error instanceof TypeError &&
    CHUNK_MESSAGES.some((message) => error.message.includes(message))
  );
};

/**
 * Reload the page unless it already reloaded for this reason in the last
 * 10 seconds. Returns true when it reloaded.
 */
export const reloadOnceForNewVersion = (): boolean => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    const now = Date.now();
    if (last && now - last < RELOAD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    // Storage is unavailable: never risk a reload loop
    return false;
  }
  window.location.reload();
  return true;
};
