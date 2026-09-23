/**
 * Integration tests for sort-direction handling in the image and clip query
 * builders (item 3).
 *
 * Both builders splice the sort direction into ORDER BY. These tests run
 * against the real test SQLite database with a hostile direction whose
 * subquery overflows (abs() of the minimum 64-bit integer), so SQLite raises
 * "integer overflow" if the text ever reaches the query.
 *
 * Rows are seeded under a made-up stashInstanceId so the real sync and other
 * tests never touch them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const TEST_INSTANCE = "sortdir-it-instance";
const TEST_USER_ID = 999999;
const HOSTILE_DIRECTION = "ASC, (SELECT abs(-9223372036854775808))";

async function clearTestRows(): Promise<void> {
  await prisma.stashClip.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashScene.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
  await prisma.stashImage.deleteMany({
    where: { stashInstanceId: TEST_INSTANCE },
  });
}

describeWithDb("Query builder sort direction (integration)", () => {
  beforeAll(async () => {
    await clearTestRows();

    await prisma.stashImage.createMany({
      data: [
        {
          id: "1",
          stashInstanceId: TEST_INSTANCE,
          stashCreatedAt: new Date("2024-01-01"),
        },
        {
          id: "2",
          stashInstanceId: TEST_INSTANCE,
          stashCreatedAt: new Date("2024-01-02"),
        },
        {
          id: "3",
          stashInstanceId: TEST_INSTANCE,
          stashCreatedAt: new Date("2024-01-03"),
        },
      ],
    });

    await prisma.stashScene.create({
      data: { id: "1", stashInstanceId: TEST_INSTANCE },
    });

    await prisma.stashClip.createMany({
      data: [
        {
          id: "1",
          stashInstanceId: TEST_INSTANCE,
          sceneId: "1",
          sceneInstanceId: TEST_INSTANCE,
          seconds: 0,
          isGenerated: true,
          stashCreatedAt: new Date("2024-01-01"),
        },
        {
          id: "2",
          stashInstanceId: TEST_INSTANCE,
          sceneId: "1",
          sceneInstanceId: TEST_INSTANCE,
          seconds: 10,
          isGenerated: true,
          stashCreatedAt: new Date("2024-01-02"),
        },
      ],
    });
  });

  afterAll(async () => {
    await clearTestRows();
  });

  it("image builder ignores a hostile direction", async () => {
    const result = await imageQueryBuilder.execute({
      userId: TEST_USER_ID,
      sort: "created_at",
      sortDirection: HOSTILE_DIRECTION as never,
      page: 1,
      perPage: 10,
      allowedInstanceIds: [TEST_INSTANCE],
    });

    expect(result.images.map((i) => i.id)).toEqual(["3", "2", "1"]);
  });

  it("clip builder ignores a hostile direction", async () => {
    const result = await clipQueryBuilder.getClips({
      userId: TEST_USER_ID,
      sortBy: "stashCreatedAt",
      sortDir: HOSTILE_DIRECTION as never,
      allowedInstanceIds: [TEST_INSTANCE],
    });

    expect(result.clips.map((c) => c.id)).toEqual(["2", "1"]);
  });
});
