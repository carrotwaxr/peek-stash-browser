/**
 * ImageQueryBuilder on the base builder (item 74), against the unit-test
 * SQLite database: rows under two made-up instances, each test on its own.
 *
 * The rating and O count a list filters, sorts and returns are the viewer's
 * own (ImageRating, ImageViewHistory), never Stash's (QUERIES-17). The tag
 * and studio filters honour depth, a studio EXCLUDES keeps images with no
 * studio (QUERIES-11), and each image's studio is its own instance's.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";
import prisma from "../../prisma/singleton.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import type { StudioRef } from "../../types/index.js";
import type {
  FilterRef,
  ParsedListRequest,
  RefCriterion,
} from "../../types/parsedFilters.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { arrayContaining, objectContaining } from "../helpers/matchers.js";
import { must } from "../helpers/must.js";

const testUserId = 9999;
const A = "test-instance-iqb";
const B = "test-instance-iqb-b";

// Numeric string ids, as Stash's are
const testImageIds: [string, string, string] = ["999001", "999002", "999003"];

const ref = (id: string, instanceId = A): FilterRef => ({ id, instanceId });
const bare = (id: string): FilterRef => ({ id, instanceId: undefined });
const criterion = (
  refs: FilterRef[],
  modifier: RefCriterion["modifier"] = "INCLUDES",
  depth = 0
): RefCriterion => ({ refs, modifier, depth });

/** One page for the test user on instance A, created_at DESC unless given */
async function run(
  overrides: Partial<ParsedListRequest<"image">> = {},
  options: { allowedInstanceIds?: string[]; applyExclusions?: boolean } = {}
) {
  const request = parsedListRequest("image", {
    sort: { field: "created_at", direction: "DESC", seed: undefined },
    ...overrides,
  });
  return imageQueryBuilder.execute({
    userId: testUserId,
    allowedInstanceIds: options.allowedInstanceIds ?? [A],
    ...(options.applyExclusions === undefined
      ? {}
      : { applyExclusions: options.applyExclusions }),
    request,
  });
}

/** The listed ids, in order */
const ids = (items: Array<{ id: string }>) => items.map((i) => i.id);

describe("ImageQueryBuilder", () => {
  beforeEach(async () => {
    // Clean up any leftover data from previous failed runs
    await prisma.imageRating.deleteMany({ where: { userId: testUserId } });
    await prisma.imageViewHistory.deleteMany({ where: { userId: testUserId } });
    await prisma.userExcludedEntity.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.imageGallery.deleteMany({
      where: { imageId: { in: testImageIds } },
    });
    await prisma.imagePerformer.deleteMany({
      where: { imageId: { in: testImageIds } },
    });
    await prisma.imageTag.deleteMany({
      where: { imageId: { in: testImageIds } },
    });
    await prisma.stashImage.deleteMany({ where: { id: { in: testImageIds } } });
    await prisma.stashGallery.deleteMany({ where: { id: "gallery-1" } });
    await prisma.stashStudio.deleteMany({
      where: { id: { startsWith: "studio-" } },
    });
    await prisma.stashTag.deleteMany({ where: { id: { startsWith: "tag-" } } });
    await prisma.stashPerformer.deleteMany({
      where: { id: { startsWith: "perf-" } },
    });
    await prisma.user.deleteMany({ where: { id: testUserId } });

    await prisma.user.create({
      data: { id: testUserId, username: "test-iqb", password: "test" },
    });

    await prisma.stashImage.createMany({
      data: [
        {
          id: testImageIds[0],
          stashInstanceId: A,
          title: "Image One",
          stashCreatedAt: new Date("2024-01-01"),
        },
        {
          id: testImageIds[1],
          stashInstanceId: A,
          title: "Image Two",
          stashCreatedAt: new Date("2024-01-02"),
        },
        {
          id: testImageIds[2],
          stashInstanceId: A,
          title: "Image Three",
          stashCreatedAt: new Date("2024-01-03"),
        },
      ],
    });
  });

  afterEach(async () => {
    await prisma.stashImage.deleteMany({ where: { id: { in: testImageIds } } });
    await prisma.stashStudio.deleteMany({
      where: { id: { startsWith: "studio-" } },
    });
    await prisma.user.deleteMany({ where: { id: testUserId } });
  });

  describe("execute", () => {
    it("returns paginated images with total count", async () => {
      const result = await run({ perPage: 2 });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
      expect(must(result.items[0]).id).toBe(testImageIds[2]); // Most recent first
    });

    it("respects page parameter", async () => {
      const result = await run({ page: 2, perPage: 2 });

      expect(result.total).toBe(3);
      expect(ids(result.items)).toEqual([testImageIds[0]]);
    });

    it("returns instanceId on each image", async () => {
      const result = await run();

      expect(result.items).toHaveLength(3);
      for (const image of result.items) {
        expect(image.instanceId).toBe(A);
      }
    });

    it("each row carries the viewer's rating, favorite, O count and views, never Stash's", async () => {
      await prisma.stashImage.update({
        where: {
          id_stashInstanceId: { id: testImageIds[0], stashInstanceId: A },
        },
        data: {
          organized: true,
          rating100: 90,
          oCounter: 7,
          fileSize: 1234n,
          urls: '["https://example.test/i/1"]',
          pathThumbnail: "http://stash:9999/image/999001/thumbnail",
        },
      });
      await prisma.imageRating.create({
        data: {
          userId: testUserId,
          instanceId: A,
          imageId: testImageIds[1],
          rating: 40,
          favorite: true,
        },
      });
      await prisma.imageViewHistory.create({
        data: {
          userId: testUserId,
          instanceId: A,
          imageId: testImageIds[1],
          oCount: 2,
          viewCount: 3,
          lastViewedAt: new Date("2024-02-03T04:05:06.000Z"),
        },
      });

      const { items } = await run();
      const stashRated = must(
        items.find((i) => i.id === testImageIds[0]),
        "the image Stash rated"
      );
      const viewerRated = must(
        items.find((i) => i.id === testImageIds[1]),
        "the image the viewer rated"
      );

      expectTypeOf(stashRated.organized).toEqualTypeOf<boolean>();
      expectTypeOf(stashRated.urls).toEqualTypeOf<string[]>();
      expectTypeOf(stashRated.fileSize).toEqualTypeOf<number | null>();
      expectTypeOf(stashRated.rating100).toEqualTypeOf<number | null>();

      // Stash's rating 90 and O count 7 belong to the Stash user
      expect(stashRated).toMatchObject({
        rating100: null,
        favorite: false,
        oCounter: 0,
        viewCount: 0,
        lastViewedAt: null,
        organized: true,
        fileSize: 1234,
        urls: ["https://example.test/i/1"],
        stashCreatedAt: "2024-01-01T00:00:00.000Z",
      });
      expect(stashRated.paths.thumbnail).toMatch(/^\/api\/proxy\/stash\?/);
      expect(stashRated.paths.thumbnail).toContain(`instanceId=${A}`);
      expect(viewerRated).toMatchObject({
        rating100: 40,
        favorite: true,
        oCounter: 2,
        viewCount: 3,
        lastViewedAt: "2024-02-03T04:05:06.000Z",
        organized: false,
        urls: [],
      });
    });

    it("an empty allowed list returns no rows and count 0", async () => {
      const result = await run({}, { allowedInstanceIds: [] });

      expect(result).toEqual({ items: [], total: 0 });
    });

    it("a detail page's instance narrows the list to that instance", async () => {
      await prisma.stashImage.create({
        data: {
          id: testImageIds[0],
          stashInstanceId: B,
          title: "Image One on B",
        },
      });

      const both = await run(
        { filter: { ids: criterion([bare(testImageIds[0])]) } },
        { allowedInstanceIds: [A, B] }
      );
      const onB = await run(
        {
          filter: { ids: criterion([bare(testImageIds[0])]) },
          specificInstanceId: B,
        },
        { allowedInstanceIds: [A, B] }
      );

      expect(both.items.map((i) => i.instanceId).sort()).toEqual([A, B]);
      expect(onB.items.map((i) => [i.id, i.instanceId])).toEqual([
        [testImageIds[0], B],
      ]);
      expect(onB.total).toBe(1);
    });
  });

  describe("user data filters", () => {
    beforeEach(async () => {
      await prisma.imageRating.createMany({
        data: [
          {
            userId: testUserId,
            instanceId: A,
            imageId: testImageIds[0],
            rating: 80,
            favorite: true,
          },
          {
            userId: testUserId,
            instanceId: A,
            imageId: testImageIds[1],
            rating: 40,
            favorite: false,
          },
        ],
      });
      await prisma.imageViewHistory.createMany({
        data: [
          {
            userId: testUserId,
            instanceId: A,
            imageId: testImageIds[0],
            oCount: 5,
            viewCount: 10,
          },
          {
            userId: testUserId,
            instanceId: A,
            imageId: testImageIds[2],
            oCount: 2,
            viewCount: 3,
          },
        ],
      });
      // Stash's own rating on the image the viewer never rated, and its O
      // count on the image the viewer never viewed
      await prisma.stashImage.update({
        where: {
          id_stashInstanceId: { id: testImageIds[2], stashInstanceId: A },
        },
        data: { rating100: 90 },
      });
      await prisma.stashImage.update({
        where: {
          id_stashInstanceId: { id: testImageIds[1], stashInstanceId: A },
        },
        data: { oCounter: 9 },
      });
    });

    afterEach(async () => {
      await prisma.imageRating.deleteMany({ where: { userId: testUserId } });
      await prisma.imageViewHistory.deleteMany({
        where: { userId: testUserId },
      });
    });

    it("filters by favorite", async () => {
      const result = await run({ filter: { favorite: true } });

      expect(result.total).toBe(1);
      expect(ids(result.items)).toEqual([testImageIds[0]]);
    });

    it("filters by rating100 GREATER_THAN", async () => {
      const result = await run({
        filter: { rating100: { modifier: "GREATER_THAN", value: 50 } },
      });

      expect(result.total).toBe(1);
      expect(ids(result.items)).toEqual([testImageIds[0]]);
    });

    it("rating100 filters on the user's rating only: an unrated image with a Stash rating of 90 does not match GREATER_THAN 80", async () => {
      const result = await run({
        filter: { rating100: { modifier: "GREATER_THAN", value: 80 } },
      });

      expect(ids(result.items)).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("o_counter filters on the user's O count only: an image with a Stash O count of 9 and none of the viewer's does not match GREATER_THAN 3", async () => {
      const result = await run({
        filter: { o_counter: { modifier: "GREATER_THAN", value: 3 } },
      });

      expect(ids(result.items)).toEqual([testImageIds[0]]);
      expect(result.total).toBe(1);
    });

    it("the rating sort orders by the user's rating, an unrated image as 0", async () => {
      const result = await run({
        sort: { field: "rating", direction: "DESC", seed: undefined },
      });

      expect(ids(result.items)).toEqual([
        testImageIds[0],
        testImageIds[1],
        testImageIds[2],
      ]);
    });

    it("the O count sort orders by the user's O count", async () => {
      const result = await run({
        sort: { field: "o_counter", direction: "DESC", seed: undefined },
      });

      // 5, 2 and 0: 999002's Stash O count of 9 does not count
      expect(ids(result.items)).toEqual([
        testImageIds[0],
        testImageIds[2],
        testImageIds[1],
      ]);
    });
  });

  describe("entity filters", () => {
    beforeEach(async () => {
      await prisma.stashPerformer.createMany({
        data: [
          { id: "perf-1", stashInstanceId: A, name: "Performer One" },
          { id: "perf-2", stashInstanceId: A, name: "Performer Two" },
        ],
      });
      await prisma.stashTag.createMany({
        data: [
          { id: "tag-1", stashInstanceId: A, name: "Tag One" },
          { id: "tag-2", stashInstanceId: A, name: "Tag Two" },
          {
            id: "tag-1-child",
            stashInstanceId: A,
            name: "Tag One Child",
            parentIds: '["tag-1"]',
          },
        ],
      });
      await prisma.stashStudio.createMany({
        data: [
          { id: "studio-1", stashInstanceId: A, name: "Studio One" },
          // The same id on another server, with another name
          { id: "studio-1", stashInstanceId: B, name: "Studio One on B" },
          {
            id: "studio-1-child",
            stashInstanceId: A,
            name: "Studio One Child",
            parentId: "studio-1",
          },
        ],
      });
      await prisma.stashGallery.create({
        data: { id: "gallery-1", stashInstanceId: A, title: "Gallery One" },
      });

      await prisma.imagePerformer.createMany({
        data: [
          {
            imageId: testImageIds[0],
            imageInstanceId: A,
            performerId: "perf-1",
            performerInstanceId: A,
          },
          {
            imageId: testImageIds[1],
            imageInstanceId: A,
            performerId: "perf-2",
            performerInstanceId: A,
          },
        ],
      });
      await prisma.imageTag.createMany({
        data: [
          {
            imageId: testImageIds[0],
            imageInstanceId: A,
            tagId: "tag-1",
            tagInstanceId: A,
          },
          {
            imageId: testImageIds[1],
            imageInstanceId: A,
            tagId: "tag-2",
            tagInstanceId: A,
          },
          // 999003 holds a sub-tag of tag-1 and tag-2
          {
            imageId: testImageIds[2],
            imageInstanceId: A,
            tagId: "tag-1-child",
            tagInstanceId: A,
          },
          {
            imageId: testImageIds[2],
            imageInstanceId: A,
            tagId: "tag-2",
            tagInstanceId: A,
          },
        ],
      });
      await prisma.stashImage.update({
        where: {
          id_stashInstanceId: { id: testImageIds[0], stashInstanceId: A },
        },
        data: { studioId: "studio-1", studioInstanceId: A },
      });
      await prisma.stashImage.update({
        where: {
          id_stashInstanceId: { id: testImageIds[1], stashInstanceId: A },
        },
        data: { studioId: "studio-1-child", studioInstanceId: A },
      });
      await prisma.imageGallery.create({
        data: {
          imageId: testImageIds[0],
          imageInstanceId: A,
          galleryId: "gallery-1",
          galleryInstanceId: A,
        },
      });
    });

    afterEach(async () => {
      await prisma.imageGallery.deleteMany({});
      await prisma.imagePerformer.deleteMany({});
      await prisma.imageTag.deleteMany({});
      await prisma.stashGallery.deleteMany({ where: { id: "gallery-1" } });
      await prisma.stashTag.deleteMany({
        where: { id: { startsWith: "tag-" } },
      });
      await prisma.stashPerformer.deleteMany({
        where: { id: { startsWith: "perf-" } },
      });
    });

    it("filters by performer INCLUDES", async () => {
      const result = await run({
        filter: { performers: criterion([ref("perf-1")]) },
      });

      expect(result.total).toBe(1);
      expect(ids(result.items)).toEqual([testImageIds[0]]);
    });

    it("filters by tag INCLUDES", async () => {
      const result = await run({ filter: { tags: criterion([ref("tag-2")]) } });

      expect(result.total).toBe(2);
      expect(ids(result.items)).toEqual([testImageIds[2], testImageIds[1]]);
    });

    it("tags with depth -1 expands", async () => {
      const own = await run({ filter: { tags: criterion([ref("tag-1")]) } });
      const withSubTags = await run({
        filter: { tags: criterion([ref("tag-1")], "INCLUDES", -1) },
      });

      expect(ids(own.items)).toEqual([testImageIds[0]]);
      expect(ids(withSubTags.items)).toEqual([
        testImageIds[2],
        testImageIds[0],
      ]);
      expect(withSubTags.total).toBe(2);
    });

    it("tags INCLUDES_ALL with a depth needs each selected tag or one of its own sub-tags", async () => {
      const result = await run({
        filter: {
          tags: criterion([ref("tag-1"), ref("tag-2")], "INCLUDES_ALL", -1),
        },
      });

      // 999003 has tag-2 and a sub-tag of tag-1; 999001 lacks tag-2
      expect(ids(result.items)).toEqual([testImageIds[2]]);
    });

    it("filters by studio INCLUDES", async () => {
      const result = await run({
        filter: { studios: criterion([ref("studio-1")]) },
      });

      expect(result.total).toBe(1);
      expect(ids(result.items)).toEqual([testImageIds[0]]);
    });

    it("studios with depth -1 expands", async () => {
      const result = await run({
        filter: { studios: criterion([ref("studio-1")], "INCLUDES", -1) },
      });

      expect(ids(result.items)).toEqual([testImageIds[1], testImageIds[0]]);
    });

    it("studios EXCLUDES with an instance-aware value keeps images without a studio", async () => {
      const result = await run({
        filter: { studios: criterion([ref("studio-1")], "EXCLUDES") },
      });

      // 999003 has no studio; 999002's studio is another one
      expect(ids(result.items)).toEqual([testImageIds[2], testImageIds[1]]);
      expect(result.total).toBe(2);
    });

    it("filters by gallery INCLUDES", async () => {
      const result = await run({
        filter: { galleries: criterion([ref("gallery-1")]) },
      });

      expect(result.total).toBe(1);
      expect(ids(result.items)).toEqual([testImageIds[0]]);
    });

    it("each image names its own instance's studio, as a studio ref (no favorite of Stash's)", async () => {
      const { items } = await run();
      const image = must(items.find((i) => i.id === testImageIds[0]));

      expect(image.studio).toEqual({
        id: "studio-1",
        instanceId: A,
        name: "Studio One",
        image_path: null,
        parent_studio: null,
      });
      expect(must(items.find((i) => i.id === testImageIds[1])).studio).toEqual(
        objectContaining<StudioRef>({
          id: "studio-1-child",
          parent_studio: { id: "studio-1" },
        })
      );
      expect(
        must(items.find((i) => i.id === testImageIds[2])).studio
      ).toBeNull();
    });

    it("each image lists its performers, tags and galleries", async () => {
      const { items } = await run();
      const image = must(items.find((i) => i.id === testImageIds[0]));
      const three = must(items.find((i) => i.id === testImageIds[2]));

      expect(image.performers.map((p) => [p.id, p.instanceId, p.name])).toEqual(
        [["perf-1", A, "Performer One"]]
      );
      expect(image.tags.map((t) => t.name)).toEqual(["Tag One"]);
      expect(image.galleries).toEqual([
        { id: "gallery-1", instanceId: A, title: "Gallery One", cover: null },
      ]);
      expect(three.tags.map((t) => t.name).sort()).toEqual([
        "Tag One Child",
        "Tag Two",
      ]);
      expect(three.performers).toEqual([]);
    });
  });

  describe("search and ID filters", () => {
    it("filters by search query", async () => {
      const result = await run({ q: "Two" });

      expect(result.total).toBe(1);
      expect(ids(result.items)).toEqual([testImageIds[1]]);
    });

    it("filters by IDs", async () => {
      const result = await run({
        filter: {
          ids: criterion([bare(testImageIds[0]), bare(testImageIds[2])]),
        },
      });

      expect(result.total).toBe(2);
      expect(ids(result.items).sort()).toEqual(
        [testImageIds[0], testImageIds[2]].sort()
      );
    });

    it("ids with an instance read that instance's row", async () => {
      await prisma.stashImage.create({
        data: { id: testImageIds[0], stashInstanceId: B, title: "On B" },
      });

      const result = await run(
        { filter: { ids: criterion([ref(testImageIds[0], B)]) } },
        { allowedInstanceIds: [A, B] }
      );

      expect(result.items.map((i) => [i.id, i.instanceId])).toEqual([
        [testImageIds[0], B],
      ]);
      expect(result.total).toBe(1);
    });
  });

  describe("exclusion filtering", () => {
    beforeEach(async () => {
      // Exclude 999002 for the test user
      await prisma.userExcludedEntity.create({
        data: {
          userId: testUserId,
          entityType: "image",
          entityId: "999002",
          reason: "hidden",
        },
      });
    });

    afterEach(async () => {
      await prisma.userExcludedEntity.deleteMany({
        where: { userId: testUserId },
      });
    });

    it("excludes images when applyExclusions is true (default)", async () => {
      const result = await run();

      expect(result.total).toBe(2);
      expect(ids(result.items)).not.toContain("999002");
    });

    it("includes all images when applyExclusions is false", async () => {
      const result = await run({}, { applyExclusions: false });

      expect(result.total).toBe(3);
      expect(ids(result.items)).toContain("999002");
    });

    it("the count query with exclusions applied counts rows, not distinct composite ids", async () => {
      // 999002 also has an instance-specific row beside the global one, and
      // 999001 a rating and a view row: none of them may count an image twice
      await prisma.userExcludedEntity.create({
        data: {
          userId: testUserId,
          entityType: "image",
          entityId: "999002",
          instanceId: A,
          reason: "cascade",
        },
      });
      await prisma.imageRating.create({
        data: {
          userId: testUserId,
          instanceId: A,
          imageId: "999001",
          rating: 60,
        },
      });
      await prisma.imageViewHistory.create({
        data: {
          userId: testUserId,
          instanceId: A,
          imageId: "999001",
          viewCount: 1,
        },
      });

      const statements = await recording(() => run());

      const count = must(
        statements.find((s) => /SELECT COUNT\(\*\) AS total/i.test(s.sql)),
        "the count statement"
      );
      expect(count.sql).not.toMatch(/COUNT\(DISTINCT/);
      const result = await run();
      expect(result.total).toBe(2);
      expect(ids(result.items).sort()).toEqual(["999001", "999003"]);
    });
  });

  describe("the statement", () => {
    it("joins the viewer's rating and views on (id, instance) and binds the random seed, never in the text", async () => {
      const statements = await recording(() =>
        run({ sort: { field: "random", direction: "ASC", seed: 4242 } })
      );

      const page = must(statements[0], "the page statement");
      expect(page.sql).toContain(
        "LEFT JOIN ImageRating r ON i.id = r.imageId AND i.stashInstanceId = r.instanceId AND r.userId = ?"
      );
      expect(page.sql).toContain(
        "LEFT JOIN ImageViewHistory v ON i.id = v.imageId AND i.stashInstanceId = v.instanceId AND v.userId = ?"
      );
      expect(page.sql).not.toContain("4242");
      expect(page.params.filter((p) => p === 4242)).toHaveLength(3);
      // Stash's rating and O count are not even selected
      expect(page.sql).not.toContain("i.rating100");
      expect(page.sql).not.toContain("i.oCounter");
    });

    it("drives each relation from the page's (id, instance) pairs", async () => {
      // A studio to look up; the lookup runs only when a row names one
      await prisma.stashStudio.create({
        data: { id: "studio-9", stashInstanceId: A, name: "Studio Nine" },
      });
      await prisma.stashImage.update({
        where: {
          id_stashInstanceId: { id: testImageIds[0], stashInstanceId: A },
        },
        data: { studioId: "studio-9", studioInstanceId: A },
      });

      const statements = await recording(() => run());

      const relations = statements.slice(2);
      expect(relations).toHaveLength(4);
      for (const statement of relations) {
        expect(statement.sql).toContain("json_each(?)");
        expect(statement.sql).toContain("CROSS JOIN");
      }
      const pageJson = must(
        relations.find((s) => s.sql.includes("ImageTag")),
        "the tag statement"
      ).params[0];
      expect(JSON.parse(String(pageJson))).toEqual(
        arrayContaining([[testImageIds[0], A]])
      );
    });
  });

  describe("random sort", () => {
    const random = (seed: number, direction: "ASC" | "DESC" = "ASC") =>
      run({ sort: { field: "random", direction, seed } });

    it("returns stable ordering with same seed", async () => {
      const result1 = await random(12345);
      const result2 = await random(12345);

      expect(ids(result1.items)).toEqual(ids(result2.items));
    });

    it("returns different ordering with different seeds", async () => {
      const result1 = await random(11111111);
      const result2 = await random(99999999);

      expect(result1.items.length).toBeGreaterThanOrEqual(2);
      expect(result2.items.length).toBeGreaterThanOrEqual(2);
      expect(ids(result1.items).join(",")).not.toEqual(
        ids(result2.items).join(",")
      );
    });

    it("reverses order when direction changes with same seed", async () => {
      const ascResult = await random(12345678, "ASC");
      const descResult = await random(12345678, "DESC");

      expect(ascResult.items.length).toBeGreaterThanOrEqual(2);
      expect(ids(ascResult.items)).toEqual(ids(descResult.items).reverse());
    });
  });

  describe("sort direction", () => {
    it("coerces a hostile direction to DESC instead of running it", async () => {
      // abs() of the minimum 64-bit integer overflows, so SQLite raises
      // "integer overflow" if this text ever reaches the query.
      const result = await run({
        sort: {
          field: "created_at",
          direction: "ASC, (SELECT abs(-9223372036854775808))" as never,
          seed: undefined,
        },
      });

      expect(ids(result.items)).toEqual(["999003", "999002", "999001"]);
    });
  });
});

/** The raw statements, with their parameters, that `fn` ran */
async function recording(
  fn: () => Promise<unknown>
): Promise<Array<{ sql: string; params: unknown[] }>> {
  // vi.spyOn cannot wrap the Prisma client's methods (it installs a stub
  // that swallows the query), so the recorder goes in by hand
  const original = prisma.$queryRawUnsafe.bind(prisma);
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  prisma.$queryRawUnsafe = <T = unknown>(
    query: string,
    ...values: unknown[]
  ) => {
    statements.push({ sql: query, params: values });
    return original<T>(query, ...values);
  };
  try {
    await fn();
  } finally {
    prisma.$queryRawUnsafe = original;
  }
  return statements;
}
