/**
 * The Stash replay as a standalone process (sweep item 83), as E2E and local
 * runs start it: npm --prefix server run stash:replay -- --port <n> ...
 * Task INT-4 moves this test onto --library test and FIXTURE_API_KEY.
 */
import { type ChildProcess, spawn } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
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

      // tsx directly: npx and npm run keep sh -c in the chain, so SIGTERM never reaches tsx's exit code
      const replay = spawn(
        path.join(SERVER_DIR, "node_modules/.bin/tsx"),
        [
          "integration/stash-replay/cli.ts",
          "--port",
          "0",
          "--library-file",
          libraryFile,
          "--api-key",
          API_KEY,
        ],
        { cwd: SERVER_DIR, detached: true, stdio: ["ignore", "pipe", "pipe"] }
      );
      child = replay;

      const [line, origin] = await waitForOutput(
        replay,
        /stash-replay listening on (http:\/\/127\.0\.0\.1:\d+) \(library [^)]*library\.json: 4 scenes\)/,
        40_000
      );
      expect(line).toContain("listening on");
      expect(await waitForHealthy(`${String(origin)}/healthz`, 10_000)).toBe(
        200
      );

      const response = await fetch(`${String(origin)}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ApiKey: API_KEY },
        body: JSON.stringify({
          query: "query Version { version { version hash build_time } }",
        }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()) as unknown).toEqual({
        data: {
          version: {
            version: "v0.0.0-replay",
            hash: "00000000",
            build_time: "2000-01-01 00:00:00",
          },
        },
      });

      const exited = exitCode(replay, 5_000);
      replay.kill("SIGTERM");
      expect(await exited).toBe(0);
    }
  );
});
