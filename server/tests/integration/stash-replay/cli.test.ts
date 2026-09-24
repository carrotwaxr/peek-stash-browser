/**
 * The Stash replay as a standalone process (sweep item 83), as E2E and local
 * runs start it: npm --prefix server run stash:replay -- --port <n> ...,
 * serving the committed fixture (--library test or second) or a library
 * file.
 */
import { type ChildProcess, spawn } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIXTURE_API_KEY,
  FIXTURE_PATHS,
} from "../../../integration/stash-replay/generate.js";
import {
  deriveSecondLibrary,
  parseReplayLibrary,
} from "../../../integration/stash-replay/library.js";
import { fixtureLibrary } from "./fixtureLibrary.js";

const SERVER_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const API_KEY = "cli-test-key";

let child: ChildProcess | undefined;
let tempDir: string | undefined;

afterEach(() => {
  // The replay must not outlive the test: tsx and node share the process
  // group started with `detached`
  if (child?.pid !== undefined) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // Already gone
    }
  }
  child = undefined;
  if (tempDir !== undefined) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

/** Resolves with the first stdout match of `pattern`, or rejects on exit. */
function waitForOutput(
  proc: ChildProcess,
  pattern: RegExp,
  timeoutMs: number
): Promise<RegExpExecArray> {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(
        new Error(`no ${String(pattern)} within ${timeoutMs} ms: ${output}`)
      );
    }, timeoutMs);
    const onData = (chunk: Buffer) => {
      output += chunk.toString();
      const match = pattern.exec(output);
      if (match) {
        clearTimeout(timer);
        resolve(match);
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(
        new Error(
          `exited with ${String(code)} before ${String(pattern)}: ${output}`
        )
      );
    });
  });
}

async function waitForHealthy(url: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(url);
      if (response.status === 200) {
        return response.status;
      }
    } catch {
      // Not listening yet
    }
    if (Date.now() > deadline) {
      throw new Error(`${url} did not answer 200 within ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Starts the CLI with tsx directly, in its own process group. */
function startReplay(args: string[]): ChildProcess {
  // tsx directly: npx and npm run keep sh -c in the chain, so SIGTERM never reaches tsx's exit code
  const replay = spawn(
    path.join(SERVER_DIR, "node_modules/.bin/tsx"),
    ["integration/stash-replay/cli.ts", ...args],
    { cwd: SERVER_DIR, detached: true, stdio: ["ignore", "pipe", "pipe"] }
  );
  child = replay;
  return replay;
}

/** POSTs a query to the replay at `origin` and returns the status and body. */
async function query(
  origin: string,
  apiKey: string,
  document: string
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${origin}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ApiKey: apiKey },
    body: JSON.stringify({ query: document }),
  });
  const body: unknown =
    response.status === 200 ? await response.json() : await response.text();
  return { status: response.status, body };
}

const VERSION_QUERY = "query Version { version { version hash build_time } }";
const REPLAY_VERSION = {
  data: {
    version: {
      version: "v0.0.0-replay",
      hash: "00000000",
      build_time: "2000-01-01 00:00:00",
    },
  },
};

function exitCode(
  proc: ChildProcess,
  timeoutMs: number
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`still running ${timeoutMs} ms after SIGTERM`));
    }, timeoutMs);
    proc.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe("stash-replay CLI", () => {
  it(
    "serves a library file on --port 0 with --api-key and exits 0 on SIGTERM",
    { timeout: 60_000 },
    async () => {
      tempDir = mkdtempSync(path.join(tmpdir(), "stash-replay-cli-"));
      const libraryFile = path.join(tempDir, "library.json");
      writeFileSync(libraryFile, JSON.stringify(fixtureLibrary()));

      const replay = startReplay([
        "--port",
        "0",
        "--library-file",
        libraryFile,
        "--api-key",
        API_KEY,
      ]);

      const [line, origin] = await waitForOutput(
        replay,
        /stash-replay listening on (http:\/\/127\.0\.0\.1:\d+) \(library [^)]*library\.json: 4 scenes\)/,
        40_000
      );
      expect(line).toContain("listening on");
      expect(await waitForHealthy(`${String(origin)}/healthz`, 10_000)).toBe(
        200
      );

      expect(await query(String(origin), API_KEY, VERSION_QUERY)).toEqual({
        status: 200,
        body: REPLAY_VERSION,
      });

      const exited = exitCode(replay, 5_000);
      replay.kill("SIGTERM");
      expect(await exited).toBe(0);
    }
  );

  it(
    "--library test with no --api-key answers Version under FIXTURE_API_KEY",
    { timeout: 60_000 },
    async () => {
      const replay = startReplay(["--port", "0", "--library", "test"]);

      const [, origin] = await waitForOutput(
        replay,
        /stash-replay listening on (http:\/\/127\.0\.0\.1:\d+) \(library test: 36 scenes\)/,
        40_000
      );
      expect(
        await query(String(origin), FIXTURE_API_KEY, VERSION_QUERY)
      ).toEqual({ status: 200, body: REPLAY_VERSION });
      expect(
        (await query(String(origin), "some-other-key", VERSION_QUERY)).status
      ).toBe(401);
    }
  );

  it(
    "--library second serves deriveSecondLibrary's scene count",
    { timeout: 60_000 },
    async () => {
      const test = parseReplayLibrary(
        JSON.parse(
          readFileSync(path.join(FIXTURE_PATHS.outDir, "library.json"), "utf8")
        ),
        "library.json"
      );
      const scenes = test.entities.scene.length;
      const expected = deriveSecondLibrary(test, {
        idOffset: 100000,
        sceneCount: Math.max(200, 10 * scenes + 1),
      }).entities.scene.length;
      expect(expected).toBeGreaterThan(10 * scenes);

      const replay = startReplay(["--port", "0", "--library", "second"]);
      const [, origin] = await waitForOutput(
        replay,
        new RegExp(
          `stash-replay listening on (http://127\\.0\\.0\\.1:\\d+) \\(library second: ${expected} scenes\\)`
        ),
        40_000
      );
      expect(
        await query(
          String(origin),
          FIXTURE_API_KEY,
          "query FindScenes { findScenes(filter: { per_page: 0 }) { count } }"
        )
      ).toEqual({
        status: 200,
        body: { data: { findScenes: { count: expected } } },
      });
    }
  );
});
