import { test } from "@playwright/test";

/**
 * Names for everything a test creates (users, groups, playlists). They all
 * start with the run's prefix, so dev-stack teardown can find and delete
 * them, and they never collide with real data or another run's.
 */

/** `e2e-<runId>`: global setup sets E2E_RUN_ID, and workers inherit it */
export function runPrefix(): string {
  const runId = process.env.E2E_RUN_ID;
  if (!runId) {
    throw new Error(
      "E2E_RUN_ID is unset: global setup (e2e/global-setup.ts) sets it"
    );
  }
  return `e2e-${runId}`;
}

// Per worker process; the worker index keeps two workers' names apart
let n = 0;

/**
 * `e2e-<runId>-<purpose>-<worker>-<n>`, unique within the run. Call it inside
 * a test or hook (it reads test.info()), not at describe level.
 */
export function uniqueName(purpose: string): string {
  return `${runPrefix()}-${purpose}-${test.info().workerIndex}-${++n}`;
}
