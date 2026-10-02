/**
 * The entity pickers' search (item 41.1), against the real test SQLite
 * database: `findMinimalEntities` answers a `POST /library/<entities>/minimal`
 * request with one statement, `LIMIT`ed in SQL, in name order.
 *
 * On the access fixture's instances (helpers/accessFixture.ts: A and B
 * enabled and synced, OFF disabled), which reuse the same ids as two Stash
 * servers do. Added here, on A for each of the five types: "Mx 01" to
 * "Mx 60" (galleries by title); for performers "b lower" (a lower-case name
 * between "A-..." and "Mx ..." only when case is folded), "100% Real",
 * "snake_case" and "snakeXcase"; untitled galleries named by their file or
 * folder. A performer SAME on OFF. Aliases, descriptions and counts on a few
 * "Mx" rows.
 *
 * Users (their names start "access-it-", so clearAccessFixture deletes them):
 * - viewer: selects A and B; hides SAME@B and HIDDEN_A@A (performers), the
 *   tag VISIBLE_A on every instance (a legacy "" row); "Mx 03" is a
 *   restricted performer for them
 * - onlyA: selects A
 * - everyone: selects nothing, so sees every enabled instance
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { findMinimalEntities } from "../../services/MinimalEntityQuery.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { must } from "../../tests/helpers/must.js";
import type { MinimalEntity } from "../../types/api/index.js";
import type { MinimalKind } from "../../types/parsedFilters.js";
import { parseMinimalRequest } from "../../utils/listRequest.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { recordStatements } from "../helpers/statementRecorder.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const KINDS = [
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
] as const satisfies readonly MinimalKind[];

const MX_COUNT = 60;
/** "Mx 01" is 7790001, "Mx 60" is 7790060 */
const mxId = (n: number) => String(7790000 + n);
const mxName = (n: number) => `Mx ${String(n).padStart(2, "0")}`;

const P = {
  B_LOWER: "7790101",
  PERCENT: "7790102",
  SNAKE: "7790103",
  SNAKE_X: "7790104",
} as const;

const G = {
  BY_FILE: "7790201",
  BY_FOLDER: "7790202",
  FILE_AND_FOLDER: "7790203",
} as const;

async function createUser(username: string): Promise<number> {
  const user = await prisma.user.create({
    data: { username, password: "not-a-real-hash", role: "USER" },
  });
  return user.id;
}

async function select(userId: number, instanceIds: string[]): Promise<void> {
  await prisma.userStashInstance.createMany({
    data: instanceIds.map((instanceId) => ({ userId, instanceId })),
  });
}

async function seedPickers(): Promise<void> {
  const mx = Array.from({ length: MX_COUNT }, (_, i) => ({
    id: mxId(i + 1),
    stashInstanceId: FX.A,
    name: mxName(i + 1),
  }));
  await prisma.stashPerformer.createMany({
    data: [
      ...mx,
      { id: P.B_LOWER, stashInstanceId: FX.A, name: "b lower" },
      { id: P.PERCENT, stashInstanceId: FX.A, name: "100% Real" },
      { id: P.SNAKE, stashInstanceId: FX.A, name: "snake_case" },
      { id: P.SNAKE_X, stashInstanceId: FX.A, name: "snakeXcase" },
      { id: FX_ID.SAME, stashInstanceId: FX.OFF, name: "OFF-7700001" },
    ],
  });
  await prisma.stashStudio.createMany({ data: mx });
  await prisma.stashTag.createMany({ data: mx });
  await prisma.stashGroup.createMany({ data: mx });
  await prisma.stashGallery.createMany({
    data: [
      ...mx.map(({ name, ...row }) => ({ ...row, title: name })),
      {
        id: G.BY_FILE,
        stashInstanceId: FX.A,
        title: "",
        fileBasename: "Zeta Comic - 0001.cbz",
      },
      {
        id: G.BY_FOLDER,
        stashInstanceId: FX.A,
        folderPath: "/library/zzz/Alpha Folder",
      },
      {
        id: G.FILE_AND_FOLDER,
        stashInstanceId: FX.A,
        title: "",
        fileBasename: "Beta.zip",
        folderPath: "/library/aaa/Not This",
      },
    ],
  });

  const onA = (n: number) => ({
    where: { id_stashInstanceId: { id: mxId(n), stashInstanceId: FX.A } },
  });
  await prisma.stashPerformer.update({
    ...onA(7),
    data: { aliasList: JSON.stringify(["Zed Alias", "Other"]) },
  });
  await prisma.stashTag.update({
    ...onA(5),
    data: { aliases: JSON.stringify(["Tag Alias"]) },
  });
  await prisma.stashTag.update({
    ...onA(6),
    data: { description: "tag description words" },
  });
  await prisma.stashStudio.update({
    ...onA(4),
    data: { details: "studio details text" },
  });
  // Counts: 11 has scenes, 12 images, 13 galleries only
  await prisma.stashPerformer.update({ ...onA(11), data: { sceneCount: 2 } });
  await prisma.stashPerformer.update({ ...onA(12), data: { imageCount: 1 } });
  await prisma.stashPerformer.update({ ...onA(13), data: { galleryCount: 1 } });
}

describeWithDb("findMinimalEntities (integration)", () => {
  let viewer: number;
  let onlyA: number;
  let everyone: number;

  /**
   * The request as the parser gives it (reject mode), answered for the user
   * on their allowed instances, as requirePickerReady resolves them
   */
  async function find(
    userId: number,
    entity: MinimalKind,
    body: object
  ): Promise<MinimalEntity[]> {
    return findMinimalEntities(
      { id: userId, role: "USER" },
      parseMinimalRequest(entity, body, { userId }),
      await getUserAllowedInstanceIds(userId)
    );
  }

  const names = (rows: readonly MinimalEntity[]) => rows.map((r) => r.name);
  const refs = (rows: readonly MinimalEntity[]) =>
    rows.map((r) => `${r.id}:${r.instanceId}`);

  beforeAll(async () => {
    await seedAccessFixture();
    await seedPickers();

    viewer = await createUser("access-it-min-viewer");
    await select(viewer, [FX.A, FX.B]);
    await hideFor(viewer, "performer", FX_ID.SAME, FX.B);
    await hideFor(viewer, "performer", FX_ID.HIDDEN_A, FX.A);
    await hideFor(viewer, "tag", FX_ID.VISIBLE_A, "");
    await prisma.userExcludedEntity.create({
      data: {
        userId: viewer,
        entityType: "performer",
        entityId: mxId(3),
        instanceId: FX.A,
        reason: "restricted",
      },
    });

    onlyA = await createUser("access-it-min-only-a");
    await select(onlyA, [FX.A]);

    everyone = await createUser("access-it-min-everyone");
  }, 60000);

  afterAll(async () => {
    await clearAccessFixture();
  }, 60000);

  it.each(KINDS)(
    "returns at most per_page rows in name order, for each of the five types (%s)",
    async (entity) => {
      const all = await find(onlyA, entity, { filter: { per_page: 100 } });
      // Every row is on A, in name order with case folded
      expect(all.every((r) => r.instanceId === FX.A)).toBe(true);
      const sorted = [...names(all)].sort((a, b) => {
        const x = a.toLowerCase();
        const y = b.toLowerCase();
        return x < y ? -1 : x > y ? 1 : 0;
      });
      expect(names(all)).toEqual(sorted);
      expect(all.length).toBeGreaterThan(MX_COUNT);

      const five = await find(onlyA, entity, { filter: { per_page: 5 } });
      expect(names(five)).toEqual(names(all).slice(0, 5));

      // 50 when the request names no page size
      expect(await find(onlyA, entity, {})).toHaveLength(50);
    }
  );

  it("folds case in the name order", async () => {
    const rows = await find(onlyA, "performer", { filter: { per_page: 6 } });

    expect(names(rows)).toEqual([
      "100% Real",
      "A-7700001",
      "A-7700005",
      "A-7700006",
      "b lower",
      "Mx 01",
    ]);
  });

  it("matches q against name and aliases, and a literal % or _ in q", async () => {
    // A performer's alias, whatever its case
    expect(
      names(await find(onlyA, "performer", { filter: { q: "zed al" } }))
    ).toEqual(["Mx 07"]);
    // A tag's alias
    expect(
      names(await find(onlyA, "tag", { filter: { q: "TAG ALIAS" } }))
    ).toEqual(["Mx 05"]);
    // A studio's details and a tag's description are not searched
    expect(
      await find(onlyA, "studio", { filter: { q: "details text" } })
    ).toEqual([]);
    expect(
      await find(onlyA, "tag", { filter: { q: "description words" } })
    ).toEqual([]);
    // % and _ are the characters themselves
    expect(
      names(await find(onlyA, "performer", { filter: { q: "%" } }))
    ).toEqual(["100% Real"]);
    expect(
      names(await find(onlyA, "performer", { filter: { q: "e_c" } }))
    ).toEqual(["snake_case"]);
    // A name part matches anywhere in the name
    expect(names(await find(onlyA, "group", { filter: { q: "x 1" } }))).toEqual(
      [
        "Mx 10",
        "Mx 11",
        "Mx 12",
        "Mx 13",
        "Mx 14",
        "Mx 15",
        "Mx 16",
        "Mx 17",
        "Mx 18",
        "Mx 19",
      ]
    );
  });

  it("the performer picker does not match the alias list's JSON punctuation", async () => {
    // Mx 07 has the aliases ["Zed Alias","Other"] and Mx 05 (a tag) ["Tag Alias"]
    for (const q of ['"', "[", "]", ",", '"]']) {
      expect(await find(onlyA, "performer", { filter: { q } })).toEqual([]);
      expect(await find(onlyA, "tag", { filter: { q } })).toEqual([]);
    }
    // An alias is still found whole or in part
    expect(
      names(await find(onlyA, "performer", { filter: { q: "ther" } }))
    ).toEqual(["Mx 07"]);
    expect(names(await find(onlyA, "tag", { filter: { q: "g ali" } }))).toEqual(
      ["Mx 05"]
    );
  });

  it("leaves out hidden and restricted entities", async () => {
    // SAME@B and HIDDEN_A@A are hidden; SAME@A and VISIBLE_A@A are not
    expect(
      refs(await find(viewer, "performer", { filter: { q: "-7700" } }))
    ).toEqual([`${FX_ID.SAME}:${FX.A}`, `${FX_ID.VISIBLE_A}:${FX.A}`]);
    // "Mx 03" is restricted
    expect(
      names(await find(viewer, "performer", { filter: { q: "Mx 0" } }))
    ).toEqual([
      "Mx 01",
      "Mx 02",
      "Mx 04",
      "Mx 05",
      "Mx 06",
      "Mx 07",
      "Mx 08",
      "Mx 09",
    ]);
    // A legacy "" row hides the tag on every instance
    expect(
      await find(viewer, "tag", { filter: { q: FX_ID.VISIBLE_A } })
    ).toEqual([]);
    // Another user's hides do not apply
    expect(
      refs(await find(onlyA, "performer", { filter: { q: "-7700" } }))
    ).toEqual([
      `${FX_ID.SAME}:${FX.A}`,
      `${FX_ID.HIDDEN_A}:${FX.A}`,
      `${FX_ID.VISIBLE_A}:${FX.A}`,
    ]);
  });

  it("leaves out entities on a disabled, first-syncing or unselected instance (B's same id with a selection of A only)", async () => {
    const same = { filter: { q: FX_ID.SAME } };

    // OFF is disabled: its SAME never shows
    expect(refs(await find(everyone, "performer", same))).toEqual([
      `${FX_ID.SAME}:${FX.A}`,
      `${FX_ID.SAME}:${FX.B}`,
    ]);

    // B on its first sync shows to nobody
    await prisma.stashInstance.update({
      where: { id: FX.B },
      data: { firstSyncedAt: null },
    });
    try {
      expect(refs(await find(everyone, "performer", same))).toEqual([
        `${FX_ID.SAME}:${FX.A}`,
      ]);
    } finally {
      await prisma.stashInstance.update({
        where: { id: FX.B },
        data: { firstSyncedAt: new Date() },
      });
    }

    // A selection of A only
    for (const entity of KINDS) {
      expect(refs(await find(onlyA, entity, same))).toEqual([
        `${FX_ID.SAME}:${FX.A}`,
      ]);
    }
  });

  it("ids resolves composite refs, skips the ones the user can't see, and a bare id matches every visible instance", async () => {
    const resolved = await find(viewer, "performer", {
      ids: [
        `${FX_ID.SAME}:${FX.A}`,
        // Hidden by the viewer
        `${FX_ID.SAME}:${FX.B}`,
        `${FX_ID.HIDDEN_A}:${FX.A}`,
        // Restricted for the viewer
        `${mxId(3)}:${FX.A}`,
        `${mxId(10)}:${FX.A}`,
        // On an instance the viewer does not see
        `${FX_ID.SAME}:${FX.OFF}`,
      ],
    });
    expect(refs(resolved)).toEqual([
      `${FX_ID.SAME}:${FX.A}`,
      `${mxId(10)}:${FX.A}`,
    ]);

    // A bare id: that id on every instance the user sees, not on OFF
    expect(
      refs(await find(everyone, "performer", { ids: [FX_ID.SAME] }))
    ).toEqual([`${FX_ID.SAME}:${FX.A}`, `${FX_ID.SAME}:${FX.B}`]);
    // For each type
    for (const entity of KINDS) {
      expect(
        refs(await find(onlyA, entity, { ids: [`${mxId(20)}:${FX.A}`] }))
      ).toEqual([`${mxId(20)}:${FX.A}`]);
    }
  });

  it("count_filter keeps its OR semantics", async () => {
    const mx = (body: object) =>
      find(onlyA, "performer", { filter: { q: "Mx 1" }, ...body });

    expect(names(await mx({ count_filter: { min_scene_count: 1 } }))).toEqual([
      "Mx 11",
    ]);
    expect(
      names(
        await mx({ count_filter: { min_scene_count: 1, min_image_count: 1 } })
      )
    ).toEqual(["Mx 11", "Mx 12"]);
    expect(
      names(
        await mx({
          count_filter: {
            min_scene_count: 1,
            min_image_count: 1,
            min_gallery_count: 1,
          },
        })
      )
    ).toEqual(["Mx 11", "Mx 12", "Mx 13"]);
    // A count the type does not have (performers have no performer count) filters nothing
    expect(await mx({ count_filter: { min_performer_count: 1 } })).toHaveLength(
      10
    );
  });

  it("a gallery without a title is named by its file, then its folder", async () => {
    const rows = await find(onlyA, "gallery", { filter: { per_page: 100 } });
    const named = names(rows);

    // The file's name without its extension, else the folder's own name
    expect(named).toContain("Zeta Comic - 0001");
    expect(named).toContain("Alpha Folder");
    expect(named).toContain("Beta");
    expect(named).not.toContain("Not This");
    // Ordered by those names, as shown
    expect(named.indexOf("Alpha Folder")).toBeLessThan(named.indexOf("Beta"));
    expect(named.indexOf("Beta")).toBeLessThan(named.indexOf("Mx 01"));
    expect(named[named.length - 1]).toBe("Zeta Comic - 0001");
    // Searched by those names: not the folder's parents or the extension
    expect(
      names(await find(onlyA, "gallery", { filter: { q: "alpha" } }))
    ).toEqual(["Alpha Folder"]);
    expect(await find(onlyA, "gallery", { filter: { q: "library" } })).toEqual(
      []
    );
    expect(await find(onlyA, "gallery", { filter: { q: ".cbz" } })).toEqual([]);
  });

  it("one statement per request", async () => {
    const request = parseMinimalRequest(
      "performer",
      {
        filter: { q: "mx", per_page: 1000 },
        ids: [`${mxId(1)}:${FX.A}`, mxId(2)],
        count_filter: { min_scene_count: 0 },
      },
      { userId: viewer }
    );
    const instanceIds = await getUserAllowedInstanceIds(viewer);
    const recorder = recordStatements();
    let rows: MinimalEntity[] = [];
    try {
      rows = await findMinimalEntities(
        { id: viewer, role: "USER" },
        request,
        instanceIds
      );
    } finally {
      recorder.restore();
    }

    expect(names(rows)).toEqual(["Mx 01", "Mx 02"]);
    // One raw read: the instances are the request's
    expect(recorder.statements).toHaveLength(1);
    // Its LIMIT is the page size, held to 100
    const { params } = must(recorder.statements[0], "the statement");
    expect(params[params.length - 1]).toBe(100);
  });
});
