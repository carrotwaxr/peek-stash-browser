// Checks the built client (dist/) against the size budgets in bundleBudget.mjs.
// Run after `npm run build`: `npm run check:bundle`. Exits 1 on a violation.
// With `--log <file>` (the build's output, as CI saves it) it also fails on a
// circular dependency between chunks.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import {
  budgets,
  checkBudget,
  circularChunkWarnings,
} from "./bundleBudget.mjs";

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist"
);
const assets = path.join(dist, "assets");

// "react-vendor-C-yc2-f6.js" -> "react-vendor": Vite ends a name with a dash
// and 8 hash characters, which may include dashes themselves.
const chunkName = (file) => file.replace(/-[\w-]{8}\.js$/, "");

function measure(file) {
  const content = fs.readFileSync(path.join(assets, file));
  return {
    name: chunkName(file),
    size: content.length,
    gzip: zlib.gzipSync(content).length,
  };
}

const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const firstLoadFiles = [
  ...html.matchAll(
    /<script[^>]*\ssrc="\/assets\/([^"]+\.js)"|<link[^>]*rel="modulepreload"[^>]*href="\/assets\/([^"]+\.js)"/g
  ),
].map((match) => match[1] ?? match[2]);

const entryFile = html.match(/<script[^>]*\ssrc="\/assets\/([^"]+\.js)"/)?.[1];
if (!entryFile) throw new Error("dist/index.html loads no entry script");

const files = fs.readdirSync(assets).filter((file) => file.endsWith(".js"));
const chunks = files.map(measure);
const entry = measure(entryFile);
const firstLoad = firstLoadFiles.map(measure);

const kb = (bytes) => (bytes / 1000).toFixed(1).padStart(8);
console.log("chunk".padEnd(36) + "     min kB    gzip kB");
for (const chunk of [...chunks].sort((a, b) => b.size - a.size).slice(0, 12)) {
  console.log(chunk.name.padEnd(36) + kb(chunk.size) + " " + kb(chunk.gzip));
}
const total = firstLoad.reduce(
  (sum, chunk) => ({
    size: sum.size + chunk.size,
    gzip: sum.gzip + chunk.gzip,
  }),
  { size: 0, gzip: 0 }
);
console.log(
  "first load".padEnd(36) +
    kb(total.size) +
    " " +
    kb(total.gzip) +
    `  (${firstLoad.map((chunk) => chunk.name).join(", ")})`
);

console.log("entry".padEnd(36) + kb(entry.size) + " " + kb(entry.gzip));

const violations = checkBudget({ chunks, entry, firstLoad }, budgets);

const logIndex = process.argv.indexOf("--log");
if (logIndex !== -1) {
  const logFile = process.argv[logIndex + 1];
  if (!logFile) throw new Error("--log needs the build log's path");
  violations.push(
    ...circularChunkWarnings(fs.readFileSync(logFile, "utf8")).map(
      (line) => `Build warned: ${line}`
    )
  );
}
if (violations.length > 0) {
  console.error("\nBundle budget exceeded:");
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log("\nBundle within budget.");
