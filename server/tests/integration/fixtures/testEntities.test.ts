/**
 * Unit tests for the integration suite's entity ids (sweep item 83).
 *
 * One manifest serves both modes: a replay run (STASH_REPLAY=1) uses the
 * fixture's ids, a live run against the test Stash the source ids, which
 * are the fixture's minus FIXTURE_ID_OFFSET.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FIXTURE_ID_OFFSET,
  TEST_ENTITIES as MANIFEST_ENTITIES,
} from "../../../integration/stash-replay/fixture/manifest.js";

/** testEntities.ts reads STASH_REPLAY when it loads, so load it afresh. */
async function loadTestEntities() {
  vi.resetModules();
  const module = await import("../../../integration/fixtures/testEntities.js");
  return module.TEST_ENTITIES;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TEST_ENTITIES", () => {
  it("with STASH_REPLAY=1 the ids are the manifest's", async () => {
    vi.stubEnv("STASH_REPLAY", "1");

    expect(await loadTestEntities()).toEqual(MANIFEST_ENTITIES);
  });

  it("without it each id drops FIXTURE_ID_OFFSET, and an empty value stays empty", async () => {
    vi.stubEnv("STASH_REPLAY", undefined);

    const entities = await loadTestEntities();

    expect(MANIFEST_ENTITIES.sceneWithRelations).toBe("100003");
    expect(entities.sceneWithRelations).toBe("3");
    expect(MANIFEST_ENTITIES.inheritedTagFromPerformerOrStudio).toBe("");
    expect(entities.inheritedTagFromPerformerOrStudio).toBe("");
    expect(entities).toEqual(
      Object.fromEntries(
        Object.entries(MANIFEST_ENTITIES).map(([key, id]) => [
          key,
          id === "" ? "" : String(Number(id) - FIXTURE_ID_OFFSET),
        ])
      )
    );
  });
});
