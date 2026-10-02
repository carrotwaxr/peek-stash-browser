/**
 * The hierarchy expansion behind the tag, studio and collection filters
 * (item 34b), down to descendants and up to ancestors: a
 * ref with an instance expands within that instance's tree, a bare ref on
 * every allowed instance, and each descendant carries the instance it was
 * found on. One slim load per request covers every involved instance.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import type { FilterRef } from "../../types/parsedFilters.js";
import { expandRefs, expandRefsEach } from "../../utils/hierarchyUtils.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

const A = "xi-a";
const B = "xi-b";

const ref = (id: string, instanceId: string): FilterRef => ({
  id,
  instanceId,
});
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });

type TagRow = Awaited<ReturnType<typeof prisma.stashTag.findMany>>[number];
type StudioRow = Awaited<
  ReturnType<typeof prisma.stashStudio.findMany>
>[number];

const tag = (id: string, stashInstanceId: string, ...parents: string[]) =>
  partialRow<TagRow>({
    id,
    stashInstanceId,
    parentIds: parents.length === 0 ? null : JSON.stringify(parents),
  });
const studio = (id: string, stashInstanceId: string, parentId?: string) =>
  partialRow<StudioRow>({ id, stashInstanceId, parentId: parentId ?? null });

/**
 * xi-a: 284 > 285 > 286, 290 > 291, and 293 under both 285 and 291;
 * xi-b: 284 > 290 (the same id, another tree); 299 holds a broken list
 */
const TAGS = [
  tag("284", A),
  tag("285", A, "284"),
  tag("286", A, "285"),
  tag("290", A),
  tag("291", A, "290"),
  tag("293", A, "285", "291"),
  tag("284", B),
  tag("290", B, "284"),
  partialRow<TagRow>({ id: "299", stashInstanceId: B, parentIds: "not json" }),
];

type GroupLinkRow = Awaited<
  ReturnType<typeof prisma.groupRelation.findMany>
>[number];

/** A collection link; `gone` marks a deleted end ("containing" or "sub") */
const link = (
  containingId: string,
  subId: string,
  instanceId: string,
  gone?: "containing" | "sub"
) => ({
  row: partialRow<GroupLinkRow>({
    containingId,
    containingInstanceId: instanceId,
    subId,
    subInstanceId: instanceId,
  }),
  gone,
});

/**
 * xi-a: 10 contains 11, 11 contains 12, 20 contains 21 (21 deleted), 30
 * contains 31 (31 contains 30, a cycle), 40 (deleted) contains 41;
 * xi-b: 10 contains 13 (the same id, another tree)
 */
const GROUP_LINKS = [
  link("10", "11", A),
  link("11", "12", A),
  link("20", "21", A, "sub"),
  link("30", "31", A),
  link("31", "30", A),
  link("40", "41", A, "containing"),
  link("10", "13", B),
];

/** xi-a: 40 > 41 > 42; xi-b: 40 > 43 */
const STUDIOS = [
  studio("40", A),
  studio("41", A, "40"),
  studio("42", A, "41"),
  studio("40", B),
  studio("43", B, "40"),
];

describe("expandRefs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stashTag.findMany.mockImplementation(((args: {
      where: { stashInstanceId: { in: string[] } };
    }) =>
      Promise.resolve(
        TAGS.filter((row) =>
          args.where.stashInstanceId.in.includes(row.stashInstanceId)
        )
      )) as never);
    mockPrisma.stashStudio.findMany.mockImplementation(((args: {
      where: { stashInstanceId: { in: string[] } };
    }) =>
      Promise.resolve(
        STUDIOS.filter((row) =>
          args.where.stashInstanceId.in.includes(row.stashInstanceId)
        )
      )) as never);
  });

  it("depth 0 returns the refs as they are and loads nothing", async () => {
    const refs = [ref("284", A), bare("290")];

    expect(await expandRefs("tag", refs, 0, [A, B])).toBe(refs);
    expect(mockPrisma.stashTag.findMany).not.toHaveBeenCalled();
  });

  it("loads each involved instance once, not once per ref, live rows only", async () => {
    await expandRefs("tag", [ref("284", A), ref("290", A), ref("284", B)], -1, [
      A,
      B,
    ]);

    expect(mockPrisma.stashTag.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.stashTag.findMany.mock.calls[0]?.[0]).toEqual({
      where: { stashInstanceId: { in: [A, B] }, deletedAt: null },
      select: { id: true, stashInstanceId: true, parentIds: true },
    });
  });

  it("a bare ref expands on every allowed instance, each descendant on its own", async () => {
    expect(await expandRefs("studio", [bare("40")], -1, [A, B])).toEqual([
      ref("40", A),
      ref("41", A),
      ref("42", A),
      ref("40", B),
      ref("43", B),
    ]);
    expect(mockPrisma.stashStudio.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.stashStudio.findMany.mock.calls[0]?.[0]).toEqual({
      where: { stashInstanceId: { in: [A, B] }, deletedAt: null },
      select: { id: true, stashInstanceId: true, parentId: true },
    });
  });

  it("depth 1 stops at children", async () => {
    expect(await expandRefs("tag", [ref("284", A)], 1, [A, B])).toEqual([
      ref("284", A),
      ref("285", A),
    ]);
  });

  it("two instances with the same tag id expand within their own trees", async () => {
    expect(await expandRefs("tag", [ref("284", A)], -1, [A, B])).toEqual([
      ref("284", A),
      ref("285", A),
      ref("286", A),
      ref("293", A),
    ]);
    expect(await expandRefs("tag", [ref("284", B)], -1, [A, B])).toEqual([
      ref("284", B),
      ref("290", B),
    ]);
  });

  it("only allowed instances are loaded; a ref on another instance stays as it is", async () => {
    expect(await expandRefs("tag", [ref("284", B)], -1, [A])).toEqual([
      ref("284", B),
    ]);
    expect(mockPrisma.stashTag.findMany).not.toHaveBeenCalled();

    expect(
      await expandRefs("tag", [ref("284", A), ref("284", B)], -1, [A])
    ).toEqual([
      ref("284", A),
      ref("285", A),
      ref("286", A),
      ref("293", A),
      ref("284", B),
    ]);
    expect(mockPrisma.stashTag.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.stashTag.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: { stashInstanceId: { in: [A] } },
    });
  });

  it("with no allowed instance nothing is loaded and the refs stay as they are", async () => {
    const refs = [bare("284")];

    expect(await expandRefs("tag", refs, -1, [])).toEqual(refs);
    expect(mockPrisma.stashTag.findMany).not.toHaveBeenCalled();
  });

  it("a descendant reached from two refs is listed once", async () => {
    expect(
      await expandRefs("tag", [ref("284", A), ref("290", A)], -1, [A])
    ).toEqual([
      ref("284", A),
      ref("285", A),
      ref("286", A),
      ref("293", A),
      ref("290", A),
      ref("291", A),
    ]);
  });

  it("a parent list that is not JSON makes the tag a root", async () => {
    expect(await expandRefs("tag", [ref("299", B)], -1, [B])).toEqual([
      ref("299", B),
    ]);
  });
});

describe("expandRefs upwards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stashTag.findMany.mockImplementation(((args: {
      where: { stashInstanceId: { in: string[] } };
    }) =>
      Promise.resolve(
        TAGS.filter((row) =>
          args.where.stashInstanceId.in.includes(row.stashInstanceId)
        )
      )) as never);
  });

  it("expands a tag's ancestors to the depth", async () => {
    const tags = [tag("1", A), tag("2", A, "1"), tag("3", A, "2")];
    mockPrisma.stashTag.findMany.mockResolvedValue(tags);

    expect(await expandRefs("tag", [ref("3", A)], 1, [A], "up")).toEqual([
      ref("3", A),
      ref("2", A),
    ]);
    expect(await expandRefs("tag", [ref("3", A)], -1, [A], "up")).toEqual([
      ref("3", A),
      ref("2", A),
      ref("1", A),
    ]);
  });

  it("walks a tag with two parents to both", async () => {
    expect(await expandRefs("tag", [ref("293", A)], -1, [A], "up")).toEqual([
      ref("293", A),
      ref("285", A),
      ref("291", A),
      ref("284", A),
      ref("290", A),
    ]);
  });

  it("walks a studio up to its parent", async () => {
    mockPrisma.stashStudio.findMany.mockResolvedValue([
      studio("40", A),
      studio("41", A, "40"),
      studio("42", A, "41"),
    ]);

    expect(await expandRefs("studio", [ref("42", A)], -1, [A], "up")).toEqual([
      ref("42", A),
      ref("41", A),
      ref("40", A),
    ]);
  });
});

describe("expandRefs over collections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.groupRelation.findMany.mockImplementation(((args: {
      where: {
        containingInstanceId: { in: string[] };
        subInstanceId: { in: string[] };
        containing: { deletedAt: null };
        sub: { deletedAt: null };
      };
    }) =>
      Promise.resolve(
        GROUP_LINKS.filter(
          ({ row, gone }) =>
            args.where.containingInstanceId.in.includes(
              row.containingInstanceId
            ) &&
            args.where.subInstanceId.in.includes(row.subInstanceId) &&
            gone === undefined
        ).map(({ row }) => row)
      )) as never);
  });

  it("expands a collection's sub-collections from GroupRelation", async () => {
    expect(await expandRefs("group", [ref("10", A)], -1, [A])).toEqual([
      ref("10", A),
      ref("11", A),
      ref("12", A),
    ]);
    expect(await expandRefs("group", [ref("12", A)], -1, [A], "up")).toEqual([
      ref("12", A),
      ref("11", A),
      ref("10", A),
    ]);
    expect(await expandRefs("group", [ref("10", A)], 1, [A])).toEqual([
      ref("10", A),
      ref("11", A),
    ]);
  });

  it("loads the links in one statement over the live collections of the instances", async () => {
    await expandRefs("group", [ref("10", A), bare("10")], -1, [A, B]);

    expect(mockPrisma.groupRelation.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.groupRelation.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        containingInstanceId: { in: [A, B] },
        subInstanceId: { in: [A, B] },
        containing: { deletedAt: null },
        sub: { deletedAt: null },
      },
    });
  });

  it("keeps each instance's tree apart", async () => {
    expect(await expandRefs("group", [ref("10", B)], -1, [A, B])).toEqual([
      ref("10", B),
      ref("13", B),
    ]);
    expect(await expandRefs("group", [bare("10")], -1, [A, B])).toEqual([
      ref("10", A),
      ref("11", A),
      ref("12", A),
      ref("10", B),
      ref("13", B),
    ]);
    expect(await expandRefs("group", [ref("13", A)], -1, [A, B], "up")).toEqual(
      [ref("13", A)]
    );
  });

  it("ends a cycle, listing each collection once", async () => {
    expect(await expandRefs("group", [ref("30", A)], -1, [A])).toEqual([
      ref("30", A),
      ref("31", A),
    ]);
    expect(await expandRefs("group", [ref("31", A)], -1, [A], "up")).toEqual([
      ref("31", A),
      ref("30", A),
    ]);
  });

  it("skips a deleted collection's links", async () => {
    expect(await expandRefs("group", [ref("20", A)], -1, [A])).toEqual([
      ref("20", A),
    ]);
    expect(await expandRefs("group", [ref("40", A)], -1, [A])).toEqual([
      ref("40", A),
    ]);
  });
});

describe("expandRefsEach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.stashTag.findMany.mockResolvedValue(TAGS);
  });

  it("keeps one group per selected ref, sharing one load", async () => {
    const groups = await expandRefsEach(
      "tag",
      [ref("284", A), bare("290")],
      -1,
      [A, B]
    );

    expect(groups).toEqual([
      [ref("284", A), ref("285", A), ref("286", A), ref("293", A)],
      [ref("290", A), ref("291", A), ref("293", A), ref("290", B)],
    ]);
    expect(mockPrisma.stashTag.findMany).toHaveBeenCalledTimes(1);
  });

  it("depth 0 is one group of each ref, unchanged", async () => {
    const refs = [ref("284", A), bare("290")];

    expect(await expandRefsEach("tag", refs, 0, [A, B])).toEqual([
      [refs[0]],
      [refs[1]],
    ]);
    expect(mockPrisma.stashTag.findMany).not.toHaveBeenCalled();
  });
});
