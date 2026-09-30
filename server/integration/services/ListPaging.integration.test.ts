/**
 * Paging through a sorted list never repeats or skips a row (L6), against
 * the real test SQLite database.
 *
 * Rows equal on every ORDER BY term come back in whatever order SQLite reads
 * them, and the page-1 and page-2 statements can read them differently (a
 * different LIMIT can change the plan), so a page boundary inside a tie
 * repeats one row and skips another. Every list's order ends with the
 * primary key, `x.id <dir>, x.stashInstanceId <dir>`, which makes it total:
 * each walk below, one row per page, lists exactly the unpaged order, and
 * each tie lists by id, then instance, in the sort's direction.
 *
 * On the access fixture's instances (helpers/accessFixture.ts: A and B
 * enabled and synced), plus:
 * - performers TIE_1 on A and on B and TIE_2 on A, all named "Paging Tie"
 *   with 5 scenes: equal on the count and the name, TIE_1 on two servers;
 *   the fixture's four performers have 0 scenes and other names, and every
 *   performer's birthdate is NULL
 * - scenes TIE_1 on A and on B and TIE_2 on A, all dated 2020-06-01; the
 *   fixture's five live scenes (SAME and GLOBAL on A and B, B_ONLY on B)
 *   have no date, so they tie on NULL
 * The random sort ties one id on two servers too: its value is the id's.
 */
import type { SortDirection } from "@peek/shared-types/filters/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type { ParsedListRequest } from "../../types/parsedFilters.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  seedAccessFixture,
} from "../helpers/accessFixture.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const { A, B } = FX;
const { SAME, GLOBAL, B_ONLY } = FX_ID;
const TIE_1 = "7702001";
const TIE_2 = "7702002";
const SEED = 424242;

/** Only the fixture's instances; no user, so no exclusions or per-user rows */
const OPTIONS = { userId: 0, allowedInstanceIds: [A, B] };

type Row = { id: string; instanceId: string };
const key = (row: Row) => `${row.id}@${row.instanceId}`;

/** The rows of `keys` in the order the list holds them */
const within = (list: string[], keys: string[]) =>
  list.filter((k) => keys.includes(k));

type Page = (
  page: number,
  perPage: number
) => Promise<{
  items: Row[];
  total: number | null;
}>;

/**
 * The unpaged order (one page of every row), and the same list walked one
 * row per page: equal when no page repeats or skips a row.
 */
async function walk(page: Page): Promise<{ all: string[]; walked: string[] }> {
  const whole = await page(1, 250);
  const total = must(whole.total, "the list's total");
  expect(total).toBe(whole.items.length);
  const walked: string[] = [];
  for (let n = 1; n <= total; n++) {
    const { items } = await page(n, 1);
    walked.push(...items.map(key));
  }
  return { all: whole.items.map(key), walked };
}

function sort<E extends "performer" | "scene">(
  entity: E,
  field: ParsedListRequest<E>["sort"]["field"],
  direction: SortDirection
) {
  return (page: number, perPage: number): ParsedListRequest<E> =>
    parsedListRequest(entity, {
      page,
      perPage,
      sort: { field, direction, seed: SEED },
    });
}

describeWithDb("Paging a sorted list (integration)", () => {
  beforeAll(async () => {
    await seedAccessFixture();
    const tie = (id: string, stashInstanceId: string) => ({
      id,
      stashInstanceId,
      name: "Paging Tie",
      sceneCount: 5,
    });
    // A before B, so reading order alone lists A first on a tie
    await prisma.stashPerformer.createMany({
      data: [tie(TIE_1, A), tie(TIE_2, A), tie(TIE_1, B)],
    });
    const dated = (id: string, stashInstanceId: string) => ({
      id,
      stashInstanceId,
      title: `Paging ${id}`,
      date: "2020-06-01",
    });
    await prisma.stashScene.createMany({
      data: [dated(TIE_1, A), dated(TIE_2, A), dated(TIE_1, B)],
    });
  });

  afterAll(async () => {
    await clearAccessFixture();
  });

  describe("two performers with the same name and scene count", () => {
    const performers =
      (
        field: ParsedListRequest<"performer">["sort"]["field"],
        direction: SortDirection
      ): Page =>
      (page, perPage) =>
        performerQueryBuilder.execute({
          ...OPTIONS,
          request: sort("performer", field, direction)(page, perPage),
        });
    const ties = [`${TIE_1}@${A}`, `${TIE_1}@${B}`, `${TIE_2}@${A}`];

    it.each([
      [
        "scene_count",
        "DESC",
        [`${TIE_2}@${A}`, `${TIE_1}@${B}`, `${TIE_1}@${A}`],
      ],
      [
        "scene_count",
        "ASC",
        [`${TIE_1}@${A}`, `${TIE_1}@${B}`, `${TIE_2}@${A}`],
      ],
      ["name", "DESC", [`${TIE_2}@${A}`, `${TIE_1}@${B}`, `${TIE_1}@${A}`]],
      ["name", "ASC", [`${TIE_1}@${A}`, `${TIE_1}@${B}`, `${TIE_2}@${A}`]],
      // A nullable column: every birthdate is NULL, then the name ties
      [
        "birthdate",
        "DESC",
        [`${TIE_2}@${A}`, `${TIE_1}@${B}`, `${TIE_1}@${A}`],
      ],
    ] as const)(
      "by %s %s page without repeating or skipping",
      async (field, direction, expected) => {
        const { all, walked } = await walk(performers(field, direction));

        expect(all).toHaveLength(7);
        expect(new Set(all).size).toBe(all.length);
        expect(walked).toEqual(all);
        expect(within(all, ties)).toEqual(expected);
      }
    );

    it("at a random sort, one id on two servers (one value) pages without repeating or skipping", async () => {
      const { all, walked } = await walk(performers("random", "DESC"));

      expect(walked).toEqual(all);
      expect(within(all, [`${TIE_1}@${A}`, `${TIE_1}@${B}`])).toEqual([
        `${TIE_1}@${B}`,
        `${TIE_1}@${A}`,
      ]);
    });
  });

  describe("scenes with one id on two instances and equal dates", () => {
    const scenes =
      (
        field: ParsedListRequest<"scene">["sort"]["field"],
        direction: SortDirection
      ): Page =>
      (page, perPage) =>
        sceneQueryBuilder.execute({
          ...OPTIONS,
          request: sort("scene", field, direction)(page, perPage),
        });
    const dated = [`${TIE_1}@${A}`, `${TIE_1}@${B}`, `${TIE_2}@${A}`];
    const undated = [
      `${SAME}@${A}`,
      `${SAME}@${B}`,
      `${GLOBAL}@${A}`,
      `${GLOBAL}@${B}`,
      `${B_ONLY}@${B}`,
    ];

    it("by date DESC page without repeating or skipping, NULL dates last", async () => {
      const { all, walked } = await walk(scenes("date", "DESC"));

      expect(all).toHaveLength(8);
      expect(new Set(all).size).toBe(all.length);
      expect(walked).toEqual(all);
      expect(within(all, dated)).toEqual([
        `${TIE_2}@${A}`,
        `${TIE_1}@${B}`,
        `${TIE_1}@${A}`,
      ]);
      expect(all.slice(3)).toEqual([...undated].reverse());
    });

    it("by date ASC page without repeating or skipping, NULL dates first", async () => {
      const { all, walked } = await walk(scenes("date", "ASC"));

      expect(walked).toEqual(all);
      expect(all.slice(0, 5)).toEqual(undated);
      expect(all.slice(5)).toEqual(dated);
    });

    it("at a random sort, one id on two servers (one value) pages without repeating or skipping", async () => {
      const { all, walked } = await walk(scenes("random", "DESC"));

      expect(walked).toEqual(all);
      for (const id of [TIE_1, SAME, GLOBAL]) {
        expect(within(all, [`${id}@${A}`, `${id}@${B}`])).toEqual([
          `${id}@${B}`,
          `${id}@${A}`,
        ]);
      }
    });
  });
});
