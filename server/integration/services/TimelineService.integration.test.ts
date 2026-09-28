/**
 * Timeline bars across instances (item 34b, UD-04), against the real test
 * SQLite database.
 *
 * Two made-up instances reuse the same small ids, as two Stash servers do.
 * For each of scenes, galleries and images:
 * - tl-a: entity 1, dated 1901-02-10
 * - tl-b: entity 1, dated 1901-02-10, and entity 2, dated 1901-03-05
 * Every entity has performer 1, tag 1 and studio 1 of its own instance, and
 * every scene group 1 of its own instance.
 *
 * An instance-qualified ref counts its own instance's entities only; a bare
 * ref counts that id on every instance; a bar counts (id, instance) pairs, so
 * the two entities 1 dated in February are two. The dates are in 1901, where
 * the replay library has none. Every seeded row is deleted before the file
 * ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  type DistributionItem,
  type TimelineEntityType,
  type TimelineFilters,
  timelineService,
} from "../../services/TimelineService.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "tl-a";
const B = "tl-b";

/** No user has exclusions under this id */
const NO_USER = 0;

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

/** The seeded bars: the months of 1901 */
async function bars(
  entityType: TimelineEntityType,
  filters?: TimelineFilters,
  userId = NO_USER
): Promise<DistributionItem[]> {
  const all = await timelineService.getDistribution(
    entityType,
    userId,
    "months",
    filters
  );
  return all.filter((bar) => bar.period.startsWith("1901-"));
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
    data: ENTITIES.map((e) => ({
      id: e.id,
      stashInstanceId: e.instance,
      date: e.date,
      ...own,
    })),
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
  await prisma.user.deleteMany({ where: { username: "timeline-it-user" } });
}

/** Each entity type and the filters it has */
const FILTERS: Array<[TimelineEntityType, keyof TimelineFilters]> = [
  ["scene", "performerId"],
  ["scene", "tagId"],
  ["scene", "studioId"],
  ["scene", "groupId"],
  ["gallery", "performerId"],
  ["gallery", "tagId"],
  ["gallery", "studioId"],
  ["image", "performerId"],
  ["image", "tagId"],
  ["image", "studioId"],
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

  describe.each(FILTERS)("%s bars by %s", (entityType, filter) => {
    it("1:tl-a counts tl-a's entity only", async () => {
      expect(await bars(entityType, { [filter]: `1:${A}` })).toEqual(ONLY_A);
    });

    it("1:tl-b counts tl-b's two entities", async () => {
      expect(await bars(entityType, { [filter]: `1:${B}` })).toEqual(ONLY_B);
    });

    it("a bare 1 counts every instance's entities", async () => {
      expect(await bars(entityType, { [filter]: "1" })).toEqual(BOTH);
    });
  });

  describe("a user's exclusions", () => {
    let userId: number;

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          username: "timeline-it-user",
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
      expect(await bars("scene", undefined, userId)).toEqual(ONLY_B);
    });

    it("the exclusion applies with a bare ref and with a pair", async () => {
      expect(await bars("scene", { performerId: "1" }, userId)).toEqual(ONLY_B);
      expect(await bars("scene", { performerId: `1:${A}` }, userId)).toEqual(
        []
      );
    });
  });
});
