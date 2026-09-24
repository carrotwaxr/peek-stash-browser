/**
 * Unit tests for the integration suite's Stash guard (sweep item 83).
 *
 * The suite runs against the Stash replay (STASH_REPLAY=1) or a dedicated
 * test Stash. It refuses the production Stash (STASH_URL) unless
 * ALLOW_PROD_STASH=1 comes from the shell, so a value left in the root .env
 * can never opt in.
 */
import { describe, expect, it } from "vitest";
import {
  type StashTarget,
  StashTargetError,
  UNREACHABLE_STASH_URL,
  findDisallowedInstances,
  resolveStashTarget,
} from "../../../integration/helpers/stashTarget.js";

const PROD_URL = "http://prod-stash:6969/graphql";
const PROD_KEY = "prod-key";
const TEST_URL = "http://test-stash:6971/graphql";
const TEST_KEY = "test-key";

const prodOnly = { STASH_URL: PROD_URL, STASH_API_KEY: PROD_KEY };
const prodAndTest = {
  ...prodOnly,
  STASH_TEST_URL: TEST_URL,
  STASH_TEST_API_KEY: TEST_KEY,
};

/** The target as a live one, failing the test when it is the replay. */
function live(target: StashTarget) {
  if (target.mode !== "live") {
    throw new Error(`expected a live target, got ${target.mode}`);
  }
  return target;
}

describe("resolveStashTarget", () => {
  it("uses the test Stash when STASH_TEST_URL and STASH_TEST_API_KEY are set", () => {
    expect(resolveStashTarget(prodAndTest, {})).toEqual({
      mode: "live",
      source: "STASH_TEST",
      primary: { url: TEST_URL, apiKey: TEST_KEY },
      second: undefined,
    });
  });

  it("refuses STASH_URL alone and names the opt-in", () => {
    const run = () => resolveStashTarget(prodOnly, {});

    expect(run).toThrow(StashTargetError);
    expect(run).toThrow("ALLOW_PROD_STASH=1");
    expect(run).toThrow("STASH_TEST_URL");
  });

  it("uses STASH_URL when ALLOW_PROD_STASH=1 comes from the shell", () => {
    expect(resolveStashTarget(prodOnly, { ALLOW_PROD_STASH: "1" })).toEqual({
      mode: "live",
      source: "STASH_URL",
      primary: { url: PROD_URL, apiKey: PROD_KEY },
      second: undefined,
    });
    // Only the exact value "1" opts in
    expect(() =>
      resolveStashTarget(prodOnly, { ALLOW_PROD_STASH: "true" })
    ).toThrow(StashTargetError);
  });

  it("ignores ALLOW_PROD_STASH set in the .env file", () => {
    expect(() =>
      resolveStashTarget({ ...prodOnly, ALLOW_PROD_STASH: "1" }, {})
    ).toThrow(StashTargetError);
  });

  it("adds STASH_URL as the second instance only with the shell opt-in", () => {
    expect(
      live(resolveStashTarget(prodAndTest, { ALLOW_PROD_STASH: "1" })).second
    ).toEqual({ url: PROD_URL, apiKey: PROD_KEY });
    expect(
      live(resolveStashTarget({ ...prodAndTest, ALLOW_PROD_STASH: "1" }, {}))
        .second
    ).toBeUndefined();
  });

  it("refuses a STASH_TEST_URL that is STASH_URL", () => {
    const sameStash = {
      STASH_URL: "http://h:6969/graphql",
      STASH_API_KEY: PROD_KEY,
      STASH_TEST_URL: "http://h:6969/graphql/",
      STASH_TEST_API_KEY: TEST_KEY,
    };

    expect(() => resolveStashTarget(sameStash, {})).toThrow(StashTargetError);
    expect(() =>
      resolveStashTarget(sameStash, { ALLOW_PROD_STASH: "1" })
    ).toThrow(StashTargetError);
    expect(() =>
      resolveStashTarget(
        { ...sameStash, STASH_TEST_URL: "http://h:6969/graphql" },
        {}
      )
    ).toThrow("STASH_TEST_URL is the same Stash as STASH_URL");
  });

  it("treats an empty STASH_TEST_API_KEY as unset", () => {
    const emptyKey = { ...prodAndTest, STASH_TEST_API_KEY: "" };

    expect(() => resolveStashTarget(emptyKey, {})).toThrow(StashTargetError);
    expect(
      live(resolveStashTarget(emptyKey, { ALLOW_PROD_STASH: "1" })).source
    ).toBe("STASH_URL");
  });

  it("an empty shell value hides the .env value", () => {
    expect(() =>
      resolveStashTarget(prodAndTest, { STASH_TEST_URL: "" })
    ).toThrow("Integration tests need a test Stash");
  });

  it("STASH_REPLAY=1 in the shell or the .env selects replay, even with STASH_TEST_* set", () => {
    expect(resolveStashTarget(prodAndTest, { STASH_REPLAY: "1" })).toEqual({
      mode: "replay",
    });
    expect(
      resolveStashTarget({ ...prodAndTest, STASH_REPLAY: "1" }, {})
    ).toEqual({ mode: "replay" });
    expect(resolveStashTarget({}, { STASH_REPLAY: "1" })).toEqual({
      mode: "replay",
    });
    // Only "1" selects it, and an empty shell value hides the .env's
    expect(resolveStashTarget(prodAndTest, { STASH_REPLAY: "true" }).mode).toBe(
      "live"
    );
    expect(
      resolveStashTarget(
        { ...prodAndTest, STASH_REPLAY: "1" },
        { STASH_REPLAY: "" }
      ).mode
    ).toBe("live");
  });

  it("the refusal names npm run test:integration:replay", () => {
    expect(() => resolveStashTarget(prodOnly, {})).toThrow(
      "npm run test:integration:replay"
    );
  });
});

describe("findDisallowedInstances", () => {
  it("returns enabled rows whose URL is not allowed", () => {
    const rows = [
      { id: "test", url: TEST_URL, enabled: true },
      { id: "test-slash", url: `${TEST_URL}/`, enabled: true },
      { id: "prod", url: PROD_URL, enabled: true },
    ];

    expect(findDisallowedInstances(rows, [TEST_URL])).toEqual([
      { id: "prod", url: PROD_URL },
    ]);
  });

  it("ignores disabled rows and http://127.0.0.1:9/graphql", () => {
    const rows = [
      { id: "prod-disabled", url: PROD_URL, enabled: false },
      { id: "fixture", url: UNREACHABLE_STASH_URL, enabled: true },
    ];

    expect(UNREACHABLE_STASH_URL).toBe("http://127.0.0.1:9/graphql");
    expect(findDisallowedInstances(rows, [TEST_URL])).toEqual([]);
  });
});
