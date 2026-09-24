/**
 * Per-file audit of a replay run (sweep item 83), loaded as a setup file.
 *
 * globalSetup sets STASH_REPLAY_STATS_URL when the suite runs against the
 * Stash replay. The replay refuses mutations and requests it cannot answer,
 * and records both; this fails the test file during which a new entry
 * appeared, so the report names the file that wrote to Stash or asked for
 * something the fixture lacks. Live runs have no stats URL and skip it.
 */
import { afterAll, beforeAll, expect } from "vitest";

interface ReplayStats {
  mutations: string[];
  unsupported: string[];
}

const statsUrl = process.env.STASH_REPLAY_STATS_URL;

async function readStats(url: string): Promise<ReplayStats> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Stash replay stats: HTTP ${response.status} from ${url}`);
  }
  return (await response.json()) as ReplayStats;
}

if (statsUrl) {
  let before: ReplayStats = { mutations: [], unsupported: [] };

  beforeAll(async () => {
    before = await readStats(statsUrl);
  });

  afterAll(async () => {
    const after = await readStats(statsUrl);
    const mutations = after.mutations.slice(before.mutations.length);
    const unsupported = after.unsupported.slice(before.unsupported.length);

    expect(
      mutations,
      `Stash mutations sent during this file: ${JSON.stringify(mutations)}`
    ).toEqual([]);
    expect(
      unsupported,
      `requests the Stash replay cannot answer: ${JSON.stringify(unsupported)}`
    ).toEqual([]);
  });
}
