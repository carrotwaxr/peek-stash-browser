/**
 * Which Stash the integration suite may talk to (sweep item 83).
 *
 * STASH_REPLAY=1 runs it against the Stash replay (stash-replay/), a
 * synthetic copy of the test Stash that globalSetup starts in-process.
 * Otherwise it runs against a dedicated test Stash (STASH_TEST_URL and
 * STASH_TEST_API_KEY). It uses the production Stash (STASH_URL), as the
 * primary instance or as multi-instance's second one, only when
 * ALLOW_PROD_STASH=1 comes from the shell: a value in the root .env never
 * opts in.
 */

export interface StashEndpoint {
  url: string;
  apiKey: string;
}

export type StashTarget =
  | { mode: "replay" }
  | {
      mode: "live";
      source: "STASH_TEST" | "STASH_URL";
      primary: StashEndpoint;
      second?: StashEndpoint;
    };

export class StashTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StashTargetError";
  }
}

/** The access fixture's made-up instances point here; nothing listens. */
export const UNREACHABLE_STASH_URL = "http://127.0.0.1:9/graphql";

const REFUSAL =
  "Integration tests need a test Stash: set STASH_TEST_URL and STASH_TEST_API_KEY in the root .env. They will not use STASH_URL unless you run with ALLOW_PROD_STASH=1 in the shell (the suite only reads from Stash today, but nothing stops a future test from writing). Or run npm run test:integration:replay to use the recorded Stash.";

type Env = Record<string, string | undefined>;

function normalizeStashUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

/** True when both URLs name the same Stash endpoint (origin and path). */
export function sameStash(a: string, b: string): boolean {
  return normalizeStashUrl(a) === normalizeStashUrl(b);
}

/** The host of a Stash URL, for logs and errors that must not print keys. */
export function stashHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(unparsable URL)";
  }
}

/**
 * Picks the Stash the suite runs against. `fileEnv` is the parsed root .env,
 * `shellEnv` is process.env captured before the .env loaded. A key present in
 * the shell wins even when empty (dotenv's rule); a value counts only when
 * non-empty. STASH_REPLAY=1, from either, selects the replay before anything
 * else. ALLOW_PROD_STASH counts only from the shell, as exactly "1".
 */
export function resolveStashTarget(fileEnv: Env, shellEnv: Env): StashTarget {
  const read = (key: string): string | undefined => {
    const value = key in shellEnv ? shellEnv[key] : fileEnv[key];
    return value ? value : undefined;
  };
  if (read("STASH_REPLAY") === "1") {
    return { mode: "replay" };
  }
  const allowProd = shellEnv.ALLOW_PROD_STASH === "1";

  const stashUrl = read("STASH_URL");
  const stashApiKey = read("STASH_API_KEY");
  const prod =
    stashUrl && stashApiKey
      ? { url: stashUrl, apiKey: stashApiKey }
      : undefined;

  const testUrl = read("STASH_TEST_URL");
  const testApiKey = read("STASH_TEST_API_KEY");
  if (testUrl && testApiKey) {
    if (stashUrl && sameStash(testUrl, stashUrl)) {
      throw new StashTargetError(
        `STASH_TEST_URL is the same Stash as STASH_URL (${stashHost(testUrl)}). Point STASH_TEST_URL at a separate test Stash.`
      );
    }
    return {
      mode: "live",
      source: "STASH_TEST",
      primary: { url: testUrl, apiKey: testApiKey },
      second: allowProd ? prod : undefined,
    };
  }

  if (allowProd && prod) {
    return {
      mode: "live",
      source: "STASH_URL",
      primary: prod,
      second: undefined,
    };
  }

  throw new StashTargetError(REFUSAL);
}

/**
 * Enabled instance rows whose URL is none of `allowedUrls`. Rows pointing at
 * UNREACHABLE_STASH_URL (the access fixture's) never receive a request.
 */
export function findDisallowedInstances(
  rows: Array<{ id: string; url: string; enabled: boolean }>,
  allowedUrls: string[]
): Array<{ id: string; url: string }> {
  return rows
    .filter(
      (row) =>
        row.enabled &&
        !sameStash(row.url, UNREACHABLE_STASH_URL) &&
        !allowedUrls.some((allowed) => sameStash(row.url, allowed))
    )
    .map(({ id, url }) => ({ id, url }));
}
