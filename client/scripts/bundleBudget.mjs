// Bundle size budgets and the check that applies them. Pure: no file access,
// so tests/scripts/bundleBudget.test.ts can feed it sizes directly.
// check-bundle-size.mjs measures dist/ and calls checkBudget.
//
// Sizes are in kB of 1,000 bytes, as Vite reports them.

/**
 * Budgets measured on 2026-10-01 after PR 8's bundle tasks (D1 to D4), each set
 * at the measured size plus about 5%. Before them the entry was 545 kB and the
 * first load 340 kB gzip.
 */
export const budgets = {
  // Every chunk not named below; Vite's own chunkSizeWarningLimit only warns.
  maxChunkKB: 500,
  // Named chunks with their own limit. Chunk names are the file name without
  // the content hash.
  chunkKB: {
    // 118.6 kB measured (861 before VR, crypto-js and localforage went).
    Scene: 125,
    // 621 kB measured: video.js with VHS (Peek plays HLS and DASH), which has
    // no smaller build.
    "video-vendor": 650,
    // 11.9 kB measured: react-hot-toast only. lucide-react is in no manual
    // chunk, so each chunk carries the icons it draws.
    "ui-vendor": 13,
    // 749.4 kB measured on 2026-10-03 (193.3 gzip): the lazy VR code,
    // vr/vrPlugin.ts with @blaineam/videojs-vr 3.3.0, which bundles three.js
    // and webvr-polyfill. Loaded only on VR scenes (vr/loadVr.ts); named in
    // vite.config.js's chunkFileNames.
    vr: 787,
    // 4.6 kB measured on 2026-10-03 (2.1 gzip), with the headset HUD's
    // wiring and VR giving way to casting and wireless targets: the VR
    // button, its menu and their logic (vr/vrUi.ts with vr/VrControls.ts),
    // loaded by useVrMode on VR scenes only, so the Scene chunk keeps none of
    // it. Named in vite.config.js's chunkFileNames.
    "vr-ui": 4.8,
  },
  // The entry chunk (the script index.html loads): the app shell, login and the
  // layout; every page, the setup wizard and the help dialog load on demand.
  // 121.1 kB measured (545 kB before D4).
  entryKB: 127,
  // Entry plus its modulepreloads, gzip. 126.8 kB measured (entry 38.6,
  // react-vendor 72.9 with react-dom/client, query-vendor 10.6, ui-vendor 4.7).
  firstLoadGzipKB: 133,
};

const kb = (bytes) => Math.round(bytes / 1000);

/**
 * @param {{ chunks: { name: string, size: number, gzip: number }[],
 *           entry: { name: string, size: number, gzip: number },
 *           firstLoad: { name: string, size: number, gzip: number }[] }} sizes
 *   sizes in bytes; `entry` is the chunk index.html loads (other chunks may
 *   share its name), `firstLoad` the entry plus its modulepreload chunks
 * @param {typeof budgets} limits
 * @returns {string[]} one line per violation; empty when within budget
 */
export function checkBudget({ chunks, entry, firstLoad }, limits) {
  const violations = [];

  for (const chunk of chunks) {
    const limit = limits.chunkKB[chunk.name] ?? limits.maxChunkKB;
    if (chunk.size > limit * 1000) {
      violations.push(
        `Chunk ${chunk.name} is ${kb(chunk.size)} kB, over its ${limit} kB limit`
      );
    }
  }

  if (entry.size > limits.entryKB * 1000) {
    violations.push(
      `Entry ${entry.name} is ${kb(entry.size)} kB, over its ${limits.entryKB} kB limit`
    );
  }

  const gzip = firstLoad.reduce((sum, chunk) => sum + chunk.gzip, 0);
  if (gzip > limits.firstLoadGzipKB * 1000) {
    violations.push(
      `First load is ${kb(gzip)} kB gzip (${firstLoad
        .map((chunk) => chunk.name)
        .join(", ")}), over its ${limits.firstLoadGzipKB} kB budget`
    );
  }

  return violations;
}

/**
 * Rollup's warnings that chunks import each other: a module and the barrel
 * re-exporting it in different chunks ("circular dependency between chunks"),
 * or manual chunks in a cycle ("Circular chunk: a -> b -> a"). Either may break
 * execution order; Vite prints them and builds anyway, so the check fails on
 * them.
 *
 * @param {string} log the build's output
 * @returns {string[]} the warning lines
 */
export function circularChunkWarnings(log) {
  return log
    .split("\n")
    .filter((line) =>
      /circular dependency between chunks|circular chunk:/i.test(line)
    );
}
