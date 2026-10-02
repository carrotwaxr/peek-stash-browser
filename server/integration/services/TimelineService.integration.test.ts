/**
 * Timeline bars across instances (item 34b, UD-04; C12), against the real
 * test SQLite database, through the list builders' `periodCounts`.
 *
 * Two made-up instances reuse the same small ids, as two Stash servers do.
 * For each of scenes, galleries and images:
 * - tl-a: entity 1, dated 1901-02-10
 * - tl-b: entity 1, dated 1901-02-10, and entity 2, dated 1901-03-05
 * Every entity has performer 1, tag 1 and studio 1 of its own instance, and
 * every scene group 1 of its own instance. Scene 3 is on both instances on
 * its own date in each (2025-06-02 on tl-a, 2025-06-09 on tl-b), for the ISO
 * weeks; scene 2 on tl-b has a title and was created at 03:00 UTC on
 * 1990-01-01 (still 1989-12-31 in Los Angeles).
 *
 * An instance-qualified ref counts its own instance's entities only; a bare
 * ref counts that id on every instance; a bar counts (id, instance) pairs, so
 * the two entities 1 dated in February are two. The 1901 dates are where the
 * replay library has none. Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type DistributionItem,
  type Granularity,
  type TimelineEntityType,
  timelineService,
} from "../../services/TimelineService.js";
import { parseListRequest } from "../../utils/listRequest.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "tl-a";
const B = "tl-b";

/** No user has exclusions under this id */
const NO_USER = 0;

const USER = "timeline-it-user";
const RATER = "timeline-it-rater";
const OTHER_RATER = "timeline-it-other-rater";

/** Entity 1 on each instance and entity 2 on B, with their dates */
const ENTITIES = [
  { id: "1", instance: A, date: "1901-02-10" },
  { id: "1", instance: B, date: "1901-02-10" },
  { id: "2", instance: B, date: "1901-03-05" },
] as const;

const BOTH: DistributionItem[] = [
  { period: "1901-02", count: 2 },
  { period: "1901-03", count: 1 },
];
const ONLY_A: DistributionItem[] = [{ period: "1901-02", count: 1 }];
const ONLY_B: DistributionItem[] = [
  { period: "1901-02", count: 1 },
  { period: "1901-03", count: 1 },
];

/** A list request body's filter, as the client sends it */
type Body = Record<string, unknown>;

interface BarsOptions {
  readonly userId?: number;
  readonly allowed?: readonly string[];
  readonly granularity?: Granularity;
  readonly timeZone?: string;
  /** The period prefix kept, default the seeded months of 1901 */
  readonly prefix?: string;
}

/** A filter body naming one ref field, INCLUDES */
function including(field: string, value: string): Body {
  return { [field]: { value: [value], modifier: "INCLUDES" } };
}

/** The seeded bars of a list request (`<entity>_filter`, `filter.q`, `ids`) */
async function bars(
  entityType: TimelineEntityType,
  body: Body = {},
  options: BarsOptions = {}
): Promise<DistributionItem[]> {
  const userId = options.userId ?? NO_USER;
  const request = parseListRequest(entityType, body, { userId });
  const all = await timelineService.getDistribution(entityType, request, {
    userId,
    allowedInstanceIds: options.allowed ?? [A, B],
    timeZone: options.timeZone ?? "UTC",
    granularity: options.granularity ?? "months",
  });
  return all.filter((bar) => bar.period.startsWith(options.prefix ?? "1901-"));
}

/** The body filtering one entity type's list */
function filterOf(entityType: TimelineEntityType, filter: Body): Body {
  return { [`${entityType}_filter`]: filter };
}

async function seed(): Promise<void> {
  const named = (instance: string) => ({
    id: "1",
    stashInstanceId: instance,
    name: `Timeline 1 ${instance}`,
  });
  await prisma.stashPerformer.createMany({ data: [named(A), named(B)] });
  await prisma.stashTag.createMany({ data: [named(A), named(B)] });
  await prisma.stashStudio.createMany({ data: [named(A), named(B)] });
  await prisma.stashGroup.createMany({ data: [named(A), named(B)] });

  const own = { studioId: "1" };
  await prisma.stashScene.createMany({
    data: [
      ...ENTITIES.map((e) => ({
        id: e.id,
        stashInstanceId: e.instance,
        date: e.date,
        ...own,
      })),
      { id: "3", stashInstanceId: A, date: "2025-06-02" },
      { id: "3", stashInstanceId: B, date: "2025-06-09" },
    ],
  });
  await prisma.stashScene.update({
    where: { id_stashInstanceId: { id: "2", stashInstanceId: B } },
    data: {
      title: "Timeline beach",
      stashCreatedAt: new Date(Date.UTC(1990, 0, 1, 3, 0, 0)),
    },
  });
  await prisma.stashGallery.createMany({
    data: ENTITIES.map((e) => ({
      id: e.id,
      stashInstanceId: e.instance,
      date: e.date,
      ...own,
      studioInstanceId: e.instance,
    })),
  });
  await prisma.stashImage.createMany({
    data: ENTITIES.map((e) => ({
      id: e.id,
      stashInstanceId: e.instance,
      date: e.date,
      ...own,
      studioInstanceId: e.instance,
    })),
  });

  await prisma.scenePerformer.createMany({
    data: ENTITIES.map((e) => ({
      sceneId: e.id,
      sceneInstanceId: e.instance,
      performerId: "1",
      performerInstanceId: e.instance,
    })),
  });
  await prisma.sceneTag.createMany({
    data: ENTITIES.map((e) => ({
      sceneId: e.id,
      sceneInstanceId: e.instance,
      tagId: "1",
      tagInstanceId: e.instance,
    })),
  });
  await prisma.sceneGroup.createMany({
    data: ENTITIES.map((e) => ({
      sceneId: e.id,
      sceneInstanceId: e.instance,
      groupId: "1",
      groupInstanceId: e.instance,
    })),
  });
  await prisma.galleryPerformer.createMany({
    data: ENTITIES.map((e) => ({
      galleryId: e.id,
      galleryInstanceId: e.instance,
      performerId: "1",
      performerInstanceId: e.instance,
    })),
  });
  await prisma.galleryTag.createMany({
    data: ENTITIES.map((e) => ({
      galleryId: e.id,
      galleryInstanceId: e.instance,
      tagId: "1",
      tagInstanceId: e.instance,
    })),
  });
  await prisma.imagePerformer.createMany({
    data: ENTITIES.map((e) => ({
      imageId: e.id,
      imageInstanceId: e.instance,
      performerId: "1",
      performerInstanceId: e.instance,
    })),
  });
  await prisma.imageTag.createMany({
    data: ENTITIES.map((e) => ({
      imageId: e.id,
      imageInstanceId: e.instance,
      tagId: "1",
      tagInstanceId: e.instance,
    })),
  });
}

/**
 * The junction rows go with their entities (ON DELETE CASCADE); galleries
 * and images before the studios they reference
 */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashGallery.deleteMany({ where });
  await prisma.stashImage.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.user.deleteMany({
    where: { username: { in: [USER, RATER, OTHER_RATER] } },
  });
}

/** Each entity type and the ref fields its timeline is filtered by */
const FILTERS: Array<[TimelineEntityType, string]> = [
  ["scene", "performers"],
  ["scene", "tags"],
  ["scene", "studios"],
  ["scene", "groups"],
  ["gallery", "performers"],
  ["gallery", "tags"],
  ["gallery", "studios"],
  ["image", "performers"],
  ["image", "tags"],
  ["image", "studios"],
];

describeWithDb("TimelineService across instances (integration)", () => {
  beforeAll(async () => {
    await removeRows();
    await seed();
  });

  afterAll(async () => {
    await removeRows();
  });

  it.each(["scene", "gallery", "image"] as const)(
    "%s bars count both instances' entity 1 in February",
    async (entityType) => {
      expect(await bars(entityType)).toEqual(BOTH);
    }
  );

  it.each(["scene", "gallery", "image"] as const)(
    "%s: an entity on an instance outside the allowed list adds no bar",
    async (entityType) => {
      expect(await bars(entityType, {}, { allowed: [A] })).toEqual(ONLY_A);
      expect(await bars(entityType, {}, { allowed: [B] })).toEqual(ONLY_B);
    }
  );

  it.each(["scene", "gallery", "image"] as const)(
    "%s: an empty allowed list gives no bars",
    async (entityType) => {
      expect(await bars(entityType, {}, { allowed: [] })).toEqual([]);
    }
  );

  describe.each(FILTERS)("%s bars by %s", (entityType, field) => {
    it("1:tl-a counts tl-a's entity only", async () => {
      expect(
        await bars(entityType, filterOf(entityType, including(field, `1:${A}`)))
      ).toEqual(ONLY_A);
    });

    it("1:tl-b counts tl-b's two entities", async () => {
      expect(
        await bars(entityType, filterOf(entityType, including(field, `1:${B}`)))
      ).toEqual(ONLY_B);
    });

    it("a bare 1 counts every instance's entities", async () => {
      expect(
        await bars(entityType, filterOf(entityType, including(field, "1")))
      ).toEqual(BOTH);
    });
  });

  /** ISO weeks: Monday to Sunday, in the year of their Thursday */
  describe("weeks", () => {
    const weeks = (body: Body = {}) =>
      bars("scene", body, { granularity: "weeks", prefix: "2025-" });

    it("week periods are ISO weeks: a scene dated 2025-06-02 is in 2025-W23", async () => {
      expect(await weeks({ ids: [`3:${A}`] })).toEqual([
        { period: "2025-W23", count: 1 },
      ]);
    });

    it("two instances reusing a scene id each count their own scene on its own date", async () => {
      expect(await weeks()).toEqual([
        { period: "2025-W23", count: 1 },
        { period: "2025-W24", count: 1 },
      ]);
      expect(await weeks({ ids: [`3:${B}`] })).toEqual([
        { period: "2025-W24", count: 1 },
      ]);
      expect(await weeks({ ids: ["3"] })).toEqual(await weeks());
    });
  });

  it("the search text narrows the bars as it narrows the list", async () => {
    expect(await bars("scene", { filter: { q: "beach" } })).toEqual([
      { period: "1901-03", count: 1 },
    ]);
  });

  it("a created filter reads its day in the viewer's zone", async () => {
    const body = filterOf("scene", {
      created_at: { value: "1990-01-01", modifier: "EQUALS" },
    });
    expect(await bars("scene", body)).toEqual([
      { period: "1901-03", count: 1 },
    ]);
    expect(
      await bars("scene", body, { timeZone: "America/Los_Angeles" })
    ).toEqual([]);
    expect(
      await bars(
        "scene",
        filterOf("scene", {
          created_at: { value: "1989-12-31", modifier: "EQUALS" },
        }),
        { timeZone: "America/Los_Angeles" }
      )
    ).toEqual([{ period: "1901-03", count: 1 }]);
  });

  /** The viewer's own ratings only (invariant 6) */
  describe("a panel filter on the viewer's rating", () => {
    let raterId: number;
    let otherId: number;

    beforeAll(async () => {
      const make = (username: string) =>
        prisma.user.create({
          data: { username, password: "not-a-real-hash", role: "USER" },
        });
      raterId = (await make(RATER)).id;
      otherId = (await make(OTHER_RATER)).id;
      await prisma.sceneRating.createMany({
        data: [
          { userId: raterId, instanceId: A, sceneId: "1", rating: 80 },
          { userId: raterId, instanceId: B, sceneId: "1", rating: 20 },
          { userId: otherId, instanceId: B, sceneId: "2", rating: 90 },
        ],
      });
    });

    const highlyRated = filterOf("scene", {
      rating100: { value: 50, modifier: "GREATER_THAN" },
    });

    it("counts the viewer's rated scenes only", async () => {
      expect(await bars("scene", highlyRated, { userId: raterId })).toEqual(
        ONLY_A
      );
    });

    it("another user's rating never counts", async () => {
      expect(await bars("scene", highlyRated, { userId: otherId })).toEqual([
        { period: "1901-03", count: 1 },
      ]);
      expect(await bars("scene", highlyRated, { userId: NO_USER })).toEqual([]);
    });
  });

  describe("a user's exclusions", () => {
    let userId: number;

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          username: USER,
          password: "not-a-real-hash",
          role: "USER",
        },
      });
      userId = user.id;
      await prisma.userExcludedEntity.create({
        data: {
          userId,
          entityType: "scene",
          entityId: "1",
          instanceId: A,
          reason: "hidden",
        },
      });
    });

    it("an excluded scene leaves the bars; the other instance's same id stays", async () => {
      expect(await bars("scene", {}, { userId })).toEqual(ONLY_B);
    });

    it("the exclusion applies with a bare ref and with a pair", async () => {
      expect(
        await bars("scene", filterOf("scene", including("performers", "1")), {
          userId,
        })
      ).toEqual(ONLY_B);
      expect(
        await bars(
          "scene",
          filterOf("scene", including("performers", `1:${A}`)),
          { userId }
        )
      ).toEqual([]);
    });

    it("the exclusion applies under the negative and presence forms", async () => {
      const performers = (criterion: Body) =>
        bars("scene", filterOf("scene", { performers: criterion }), {
          userId,
        });
      expect(await performers({ modifier: "NOT_NULL" })).toEqual(ONLY_B);
      expect(
        await performers({ value: [`1:${B}`], modifier: "EXCLUDES" })
      ).toEqual([]);
      expect(await bars("scene", { ids: [`1:${A}`] }, { userId })).toEqual([]);
    });

    it("an every-instance exclusion leaves the id's bars on both instances", async () => {
      await prisma.userExcludedEntity.create({
        data: {
          userId,
          entityType: "scene",
          entityId: "1",
          instanceId: "",
          reason: "hidden",
        },
      });
      try {
        expect(await bars("scene", {}, { userId })).toEqual([
          { period: "1901-03", count: 1 },
        ]);
      } finally {
        await prisma.userExcludedEntity.deleteMany({
          where: { userId, instanceId: "" },
        });
      }
    });
  });
});
