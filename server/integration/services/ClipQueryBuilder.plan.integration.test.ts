/**
 * Query plans of the clip list against real SQLite (S5), as SQLite makes
 * them for a large library (`largeLibraryPlanner`).
 *
 * The default list (live, generated, newest first) walks
 * `StashClip_browse_idx`, whose columns are the whole ORDER BY with the
 * primary key and then the columns the filters read before the scene
 * (the title, generated, the scene's key), and reads each clip's scene by
 * its key, so the page stops after its rows and sorts nothing. (With
 * statistics the count checks each scene live on
 * `StashScene_id_stashInstanceId_deletedAt_idx`, which holds `deletedAt`,
 * from the index alone.)
 * A scene tag reads each junction by its tag index, the inherited one too.
 * With statistics a studio drives from its own scenes (without them SQLite
 * walks the clips, so no plan here pins it). What the lists hold is pinned
 * by `ClipQueryBuilder.integration.test.ts`; the timings at 207k and 300k
 * clips are in the commit that added this file.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { parsedClipRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type {
  ClipListRequest,
  RefCriterion,
} from "../../types/parsedFilters.js";
import {
  type LargeLibraryPlanner,
  largeLibraryPlanner,
} from "../helpers/largeLibraryPlanner.js";
import { recordStatements } from "../helpers/statementRecorder.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const INSTANCE = "clip-plan-instance";

let planner: LargeLibraryPlanner;

/**
 * The clip's scene by its key: the primary key's index, or the key with
 * deletedAt (which the planner takes where statistics show it covers)
 */
const SCENE_BY_KEY =
  /^SEARCH s USING (COVERING )?INDEX (sqlite_autoindex_StashScene_1|StashScene_id_stashInstanceId_deletedAt_idx) \(id=\? AND stashInstanceId=\?\)$/;

const one = (id: string): RefCriterion => ({
  refs: [{ id, instanceId: INSTANCE }],
  modifier: "INCLUDES",
  depth: 0,
});

/** The page and count statements' plans for one clip list request */
async function plans(
  filter: ClipListRequest["filter"]
): Promise<{ page: string[]; count: string[] }> {
  const recorder = recordStatements();
  try {
    await clipQueryBuilder.execute({
      userId: 0,
      allowedInstanceIds: [INSTANCE],
      request: parsedClipRequest({ filter }),
    });
  } finally {
    recorder.restore();
  }
  const [page, count] = recorder.statements.filter((statement) =>
    statement.sql.includes("FROM StashClip c")
  );
  expect(must(count).sql).toContain("SELECT COUNT(*) AS total");
  return {
    page: await planner.planOf(must(page).sql, ...must(page).params),
    count: await planner.planOf(must(count).sql, ...must(count).params),
  };
}

describeWithDb("ClipQueryBuilder query plans", () => {
  beforeAll(async () => {
    planner = await largeLibraryPlanner();
  });

  afterAll(async () => {
    await planner.close();
  });

  it("the default clip list (live, generated, newest first) drives from StashClip and looks each scene up by its primary key, with no temp B-tree for ORDER BY", async () => {
    const { page, count } = await plans({ isGenerated: true });
    const shown = `page plan:\n${page.join("\n")}`;

    expect(must(page[0]), shown).toBe(
      "SEARCH c USING INDEX StashClip_browse_idx (deletedAt=?)"
    );
    expect(must(page[1]), shown).toMatch(SCENE_BY_KEY);
    expect(
      page.filter((line) => line.includes("TEMP B-TREE")),
      shown
    ).toEqual([]);

    // The count too reads each clip once and its scene by the key
    const counted = `count plan:\n${count.join("\n")}`;
    expect(must(count[0]), counted).toMatch(/^(SCAN|SEARCH) c\b/);
    expect(must(count[1]), counted).toMatch(SCENE_BY_KEY);
  });

  it("a scene tag filter reads SceneTag and SceneInheritedTag by their tag indexes as one list", async () => {
    const { page, count } = await plans({
      isGenerated: true,
      sceneTagIds: one("7"),
    });

    for (const plan of [page, count]) {
      const shown = plan.join("\n");
      expect(shown).toContain(
        "SEARCH st USING INDEX SceneTag_tagId_tagInstanceId_idx (tagId=? AND tagInstanceId=?)"
      );
      expect(shown).toContain(
        "SEARCH sit USING INDEX SceneInheritedTag_tagId_tagInstanceId_idx (tagId=? AND tagInstanceId=?)"
      );
      expect(shown).not.toContain("CORRELATED");
      expect(shown).not.toContain("VIRTUAL TABLE");
    }
  });
});
