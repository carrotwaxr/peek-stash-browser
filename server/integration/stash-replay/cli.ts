/**
 * The Stash replay as a standalone process (sweep item 83), for E2E and
 * local runs. From the repo root:
 *
 *   npm --prefix server run stash:replay -- --port 9100
 *
 * Readiness is GET http://localhost:9100/healthz. --port 0 picks a free port
 * and prints it. --host 0.0.0.0 lets a container reach the replay (default
 * 127.0.0.1). --library test (the default) serves the committed fixture,
 * fixture/library.json; --library second serves the second instance derived
 * from it, as multi-instance runs use it; --library-file <path> serves a
 * ReplayLibrary JSON file instead. --api-key defaults to FIXTURE_API_KEY
 * from fixture/manifest.ts. It closes on SIGINT and SIGTERM, and needs only
 * the server's npm ci: it imports graphql, Node built-ins and its own files.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { parseArgs } from "util";
import { FIXTURE_API_KEY } from "./fixture/manifest.js";
import {
  type ReplayLibrary,
  deriveSecondLibrary,
  parseReplayLibrary,
} from "./library.js";
import { startStashReplay } from "./server.js";

const USAGE =
  "Usage: npm run stash:replay -- --port <n> [--library test|second | --library-file <path>] [--api-key <key>] [--host <addr>]";

const FIXTURE_LIBRARY_FILE = fileURLToPath(
  new URL("./fixture/library.json", import.meta.url)
);

/**
 * The second instance's ids start after the test library's; item 34's PR
 * should set this to 0 (bare tag ids match every instance until then).
 */
const SECOND_ID_OFFSET = 100000;

function fail(message: string): never {
  process.stderr.write(`stash-replay: ${message}\n${USAGE}\n`);
  process.exit(2);
}

function readOptions() {
  try {
    return parseArgs({
      options: {
        port: { type: "string" },
        host: { type: "string", default: "127.0.0.1" },
        library: { type: "string" },
        "library-file": { type: "string" },
        "api-key": { type: "string" },
      },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

async function main(): Promise<void> {
  const options = readOptions();
  const port = Number(options.port);
  if (
    options.port === undefined ||
    options.port === "" ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535
  ) {
    fail("--port <n> is required (0 picks a free port)");
  }
  const file = options["library-file"];
  const which = options.library;
  if (file !== undefined && which !== undefined) {
    fail("use --library or --library-file, not both");
  }
  if (file === "") {
    fail("--library-file needs a path");
  }
  if (which !== undefined && which !== "test" && which !== "second") {
    fail("--library is test or second");
  }
  const apiKey = options["api-key"] ?? FIXTURE_API_KEY;
  if (apiKey === "") {
    fail("--api-key needs a key");
  }
  const host = options.host;

  const readLibrary = (source: string): ReplayLibrary =>
    parseReplayLibrary(
      JSON.parse(readFileSync(source, "utf8")) as unknown,
      source
    );
  let name: string;
  let library: ReplayLibrary;
  if (file !== undefined) {
    name = file;
    library = readLibrary(file);
  } else {
    name = which ?? "test";
    const test = readLibrary(FIXTURE_LIBRARY_FILE);
    // More than ten times the test library's scenes, as multi-instance asserts
    library =
      name === "second"
        ? deriveSecondLibrary(test, {
            idOffset: SECOND_ID_OFFSET,
            sceneCount: Math.max(200, 10 * test.entities.scene.length + 1),
          })
        : test;
  }
  const replay = await startStashReplay([
    { name, library, apiKey, port, host },
  ]);
  const listeningPort = /:(\d+)\/graphql$/.exec(
    replay.libraries[0]?.url ?? ""
  )?.[1];
  process.stdout.write(
    `stash-replay listening on http://${host}:${listeningPort ?? String(port)} (library ${name}: ${library.entities.scene.length} scenes)\n`
  );

  const stop = () => {
    replay.close().then(
      () => process.exit(0),
      (error: unknown) => {
        process.stderr.write(`stash-replay: close failed: ${String(error)}\n`);
        process.exit(1);
      }
    );
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `stash-replay: ${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exit(1);
});
