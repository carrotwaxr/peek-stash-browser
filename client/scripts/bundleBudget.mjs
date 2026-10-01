// Bundle size budgets and the check that applies them. Pure: no file access,
// so tests/scripts/bundleBudget.test.ts can feed it sizes directly.
// check-bundle-size.mjs measures dist/ and calls checkBudget.
//
// Sizes are in kB of 1,000 bytes, as Vite reports them.

/**
 * Budgets measured on 2026-10-01 (v3.4.0-beta.6 plus PR 8's first tasks), each
 * set at the measured size plus 5%. Later PR 8 tasks (D2 to D4) tighten them.
 */
export const budgets = {
  // Vite's own chunkSizeWarningLimit, which only warns; this fails the build.
  maxChunkKB: 1000,
  // Named chunks with their own limit. Chunk names are the file name without
  // the content hash.
  chunkKB: {
    // 117 kB measured (861 before VR, crypto-js and localforage went).
    Scene: 123,
    // 621 kB measured: video.js with VHS (Peek plays HLS and DASH), which has
    // no smaller build.
    "video-vendor": 650,
    // 11.9 kB measured: react-hot-toast only. lucide-react is in no manual
    // chunk, so each chunk carries the icons it draws.
    "ui-vendor": 13,
  },
  // Entry plus its modulepreloads, gzip. 198.4 kB measured (entry 165.7,
  // react-vendor 17.4, query-vendor 10.6, ui-vendor 4.7; was 340.8 with every
  // lucide icon in ui-vendor), set at 208.
  firstLoadGzipKB: 208,
};

const kb = (bytes) => Math.round(bytes / 1000);

/**
 * @param {{ chunks: { name: string, size: number, gzip: number }[],
 *           firstLoad: { name: string, size: number, gzip: number }[] }} sizes
 *   sizes in bytes; `firstLoad` is the entry plus its modulepreload chunks
 * @param {typeof budgets} limits
 * @returns {string[]} one line per violation; empty when within budget
 */
export function checkBudget({ chunks, firstLoad }, limits) {
  const violations = [];

  for (const chunk of chunks) {
    const limit = limits.chunkKB[chunk.name] ?? limits.maxChunkKB;
    if (chunk.size > limit * 1000) {
      violations.push(
        `Chunk ${chunk.name} is ${kb(chunk.size)} kB, over its ${limit} kB limit`
      );
    }
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
