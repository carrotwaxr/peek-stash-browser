import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  TOOLTIP_LIMIT,
  loadTooltipRelations,
} from "../../services/TooltipRelations.js";
import { entityKey, pairsJson } from "../../utils/entityRef.js";
import { toProxyUrl } from "../../utils/proxyUrl.js";
import { must } from "../helpers/must.js";
import { prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

/** Two instances' parents with the same id */
const A = { id: "1", instanceId: "inst-a" };
const B = { id: "1", instanceId: "inst-b" };

/** Answers each relation's statement by the related table it reads. */
function rowsByTable(rows: Partial<Record<string, unknown[]>>) {
  mockPrisma.$queryRawUnsafe.mockImplementation(
    prismaImpl((sql: string) => {
      const table = /JOIN (Stash\w+) x ON/.exec(sql)?.[1] ?? "";
      return rows[table] ?? [];
    })
  );
}

/** Every statement sent, as [sql, ...params]. */
function calls(): Array<[string, ...unknown[]]> {
  return mockPrisma.$queryRawUnsafe.mock.calls;
}

/** The statement that reads a related table. */
function statementFor(table: string): [string, ...unknown[]] {
  return must(
    calls().find(([sql]) => sql.includes(`JOIN ${table} x ON`)),
    `the ${table} statement`
  );
}

describe("loadTooltipRelations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowsByTable({});
  });

  it("sends nothing for an empty page", async () => {
    const relations = await loadTooltipRelations("studio", [], 7);

    expect(relations.size).toBe(0);
    expect(calls()).toHaveLength(0);
  });

  it.each([
    ["performer", 4],
    ["studio", 4],
    ["tag", 4],
    ["group", 3],
  ] as const)(
    "a page of %s cards sends one statement per relation (%i), binding the page's pairs once and the user",
    async (parentType, count) => {
      await loadTooltipRelations(parentType, [A, B, A], 7);

      expect(calls().map(([, parents, userId]) => [parents, userId])).toEqual(
        Array.from({ length: count }, () => [pairsJson([A, B]), 7])
      );
    }
  );

  it("every statement drives from the page and reads live entities on the parent's instance, less the user's exclusions", async () => {
    await loadTooltipRelations("performer", [A], 7);

    for (const [sql] of calls()) {
      expect(sql).toContain("FROM json_each(?)");
      expect(sql).toContain("FROM page pg\n  CROSS JOIN");
      expect(sql).toContain(
        "x.stashInstanceId = r.pinst AND x.deletedAt IS NULL"
      );
      expect(sql).toContain(
        "(e.instanceId = '' OR e.instanceId = x.stashInstanceId)"
      );
      expect(sql).toContain("WHERE e.id IS NULL");
    }
    // Studios and collections come through live scenes only
    expect(statementFor("StashStudio")[0]).toContain("s.deletedAt IS NULL");
    expect(statementFor("StashGroup")[0]).toContain("s.deletedAt IS NULL");
  });

  it("a studio's scenes are read by studio, with the instance kept off its index", async () => {
    await loadTooltipRelations("studio", [A], 7);

    expect(statementFor("StashGroup")[0]).toContain(
      "s.studioId = pg.pid AND +s.stashInstanceId = pg.pinst AND s.deletedAt IS NULL"
    );
  });

  it("capped relations bind TOOLTIP_LIMIT; own tags are listed whole and a studio's performers counted", async () => {
    await loadTooltipRelations("studio", [A], 7);

    const json = pairsJson([A]);
    const [tagSql, ...tagParams] = statementFor("StashTag");
    expect(tagParams).toEqual([json, 7, "tag"]);
    expect(tagSql).not.toContain("rn <= ?");

    const [performerSql, ...performerParams] = statementFor("StashPerformer");
    expect(performerParams).toEqual([json, 7, "performer"]);
    expect(performerSql).toContain("SELECT r.pid, r.pinst, COUNT(*) AS total");

    const [groupSql, ...groupParams] = statementFor("StashGroup");
    expect(groupParams).toEqual([json, 7, "group", TOOLTIP_LIMIT]);
    expect(groupSql).toContain("WHERE rn <= ?");
    expect(groupSql).toContain("ORDER BY r.weight DESC, x.name COLLATE NOCASE");
  });

  it("a tag's related entities are ordered by their size", async () => {
    await loadTooltipRelations("tag", [A], 7);

    expect(statementFor("StashPerformer")[0]).toContain(
      "ORDER BY x.sceneCount DESC, x.name COLLATE NOCASE, x.id"
    );
    expect(statementFor("StashGallery")[0]).toContain(
      "ORDER BY x.imageCount DESC"
    );
  });

  it("every parent starts with empty lists and zero totals", async () => {
    const relations = await loadTooltipRelations("studio", [A], 7);

    expect(relations.get(entityKey(A.id, A.instanceId))).toEqual({
      tags: [],
      groups: [],
      galleries: [],
      relation_totals: { performers: 0, groups: 0, galleries: 0 },
    });
  });

  it("rows become refs on their parent's instance, in order, with the parent's total", async () => {
    rowsByTable({
      StashStudio: [
        {
          pid: "1",
          pinst: "inst-b",
          id: "9",
          rn: 1n,
          total: 20n,
          name: "Studio 9",
          imagePath: "http://stash:9999/studio/9/image",
          favorite: true,
          parentId: "3",
        },
        {
          pid: "1",
          pinst: "inst-b",
          id: "8",
          rn: 2n,
          total: 20n,
          name: "Studio 8",
          imagePath: null,
          favorite: false,
          parentId: null,
        },
      ],
      StashGallery: [
        {
          pid: "1",
          pinst: "inst-a",
          id: "4",
          rn: 1n,
          total: 1n,
          title: "",
          folderPath: "/library/Holiday",
          fileBasename: null,
          coverPath: "http://stash:9999/image/5/thumbnail",
        },
      ],
      StashTag: [
        {
          pid: "1",
          pinst: "inst-a",
          id: "6",
          rn: 1n,
          total: 1n,
          name: "Tag 6",
          imagePath: null,
          favorite: false,
        },
      ],
    });

    const relations = await loadTooltipRelations("performer", [A, B], 7);

    const onB = must(relations.get(entityKey(B.id, B.instanceId)), "B's");
    expect(onB.studios).toEqual([
      {
        id: "9",
        instanceId: "inst-b",
        name: "Studio 9",
        image_path: toProxyUrl("http://stash:9999/studio/9/image", "inst-b"),
        favorite: true,
        parent_studio: { id: "3" },
      },
      {
        id: "8",
        instanceId: "inst-b",
        name: "Studio 8",
        image_path: null,
        favorite: false,
        parent_studio: null,
      },
    ]);
    expect(onB.relation_totals).toEqual({
      studios: 20,
      groups: 0,
      galleries: 0,
    });
    expect(onB.tags).toEqual([]);

    const onA = must(relations.get(entityKey(A.id, A.instanceId)), "A's");
    expect(onA.studios).toEqual([]);
    expect(onA.galleries).toEqual([
      {
        id: "4",
        instanceId: "inst-a",
        title: "Holiday",
        cover: toProxyUrl("http://stash:9999/image/5/thumbnail", "inst-a"),
      },
    ]);
    expect(onA.tags).toEqual([
      {
        id: "6",
        instanceId: "inst-a",
        name: "Tag 6",
        image_path: null,
        favorite: false,
      },
    ]);
    // Own tags are never counted
    expect(onA.relation_totals).toEqual({
      studios: 0,
      groups: 0,
      galleries: 1,
    });
  });

  it("a studio's performers are counted, not listed", async () => {
    rowsByTable({
      StashPerformer: [{ pid: "1", pinst: "inst-a", total: 15n }],
    });

    const relations = await loadTooltipRelations("studio", [A], 7);

    const onA = must(relations.get(entityKey(A.id, A.instanceId)), "A's");
    expect(onA.relation_totals.performers).toBe(15);
    expect(onA.performers).toBeUndefined();
  });

  it("a group's performers keep their disambiguation and gender, blanks as null", async () => {
    rowsByTable({
      StashPerformer: [
        {
          pid: "1",
          pinst: "inst-a",
          id: "2",
          rn: 1n,
          total: 1n,
          name: "Performer 2",
          disambiguation: "",
          gender: "FEMALE",
          imagePath: null,
          favorite: false,
          rating100: 80,
        },
      ],
    });

    const relations = await loadTooltipRelations("group", [A], 7);

    expect(
      must(relations.get(entityKey(A.id, A.instanceId)), "A's").performers
    ).toEqual([
      {
        id: "2",
        instanceId: "inst-a",
        name: "Performer 2",
        disambiguation: null,
        gender: "FEMALE",
        image_path: null,
        favorite: false,
        rating100: 80,
      },
    ]);
  });

  it("a row for a parent not on the page is left out", async () => {
    rowsByTable({
      StashGroup: [
        {
          pid: "2",
          pinst: "inst-a",
          id: "5",
          rn: 1n,
          total: 1n,
          name: "Group 5",
          frontImagePath: null,
          backImagePath: null,
        },
      ],
      StashPerformer: [{ pid: "2", pinst: "inst-a", total: 3n }],
    });

    const relations = await loadTooltipRelations("studio", [A], 7);

    expect([...relations.keys()]).toEqual([entityKey(A.id, A.instanceId)]);
    expect(
      must(relations.get(entityKey(A.id, A.instanceId)), "A's").groups
    ).toEqual([]);
  });
});
