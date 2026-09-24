/**
 * The Stash replay as a standalone process (sweep item 83), for E2E and
 * local runs. From the repo root:
 *
 *   npm --prefix server run stash:replay -- --port 9100 \
 *     --library-file <library.json> --api-key <key>
 *
 * Readiness is GET http://localhost:9100/healthz. --port 0 picks a free port
 * and prints it. --host 0.0.0.0 lets a container reach the replay (default
 * 127.0.0.1). It closes on SIGINT and SIGTERM, and needs only the server's
 * npm ci: it imports graphql, Node built-ins and its own files.
 */
import { readFileSync } from "fs";
import { parseArgs } from "util";
import { parseReplayLibrary } from "./library.js";
import { startStashReplay } from "./server.js";

const USAGE =
  "Usage: npm run stash:replay -- --port <n> --library-file <path> --api-key <key> [--host <addr>]";

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
  if (file === undefined || file === "") {
    fail("--library-file <path> is required");
  }
  const apiKey = options["api-key"];
  if (apiKey === undefined || apiKey === "") {
    fail("--api-key <key> is required");
  }
  const host = options.host;

  const library = parseReplayLibrary(
    JSON.parse(readFileSync(file, "utf8")) as unknown,
    file
  );
  const replay = await startStashReplay([
    { name: file, library, apiKey, port, host },
  ]);
  const listeningPort = /:(\d+)\/graphql$/.exec(
    replay.libraries[0]?.url ?? ""
  )?.[1];
  process.stdout.write(
    `stash-replay listening on http://${host}:${listeningPort ?? String(port)} (library ${file}: ${library.entities.scene.length} scenes)\n`
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
