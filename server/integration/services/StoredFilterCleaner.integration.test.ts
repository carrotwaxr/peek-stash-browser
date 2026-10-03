/**
 * Data migration 009 against real SQLite: a user's saved presets and
 * carousel rules are cleaned against the filter contract, and a bare id from
 * before multi-instance support is tied to its instance only when exactly
 * one live entity of its type has it on an enabled instance.
 *
 * Seeds rows under made-up instances A and B (enabled) and C (disabled) with
 * the same ids, as StashSyncService.cleanup.integration.test.ts does, for a
 * user of its own; the migration's body runs for that user only, so the
 * shared admin's presets and carousels are never touched. The integration
 * server never runs data migrations, so the body is called directly.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { cleanStoredFilters } from "../../services/DataMigrationService.js";
import { resolveBareRefs } from "../../services/StoredFilterCleaner.js";
import { must } from "../../tests/helpers/must.js";

const A = "stored-filter-it-a";
const B = "stored-filter-it-b";
/** Disabled: its entities tie no bare id */
const C = "stored-filter-it-c";
const USERNAME = "stored_filter_it_user";

/** On A only */
const TAG_A_ONLY = "9140001";
/** On A and B */
const TAG_BOTH = "9140002";
/** Live on A, soft-deleted on B */
const TAG_LIVE_ON_A = "9140003";
/** On A and on the disabled C */
const TAG_A_AND_DISABLED = "9140004";
/** On no instance */
const TAG_NOWHERE = "9140005";
/** A studio on B only, under the id of the tag on A only */
const STUDIO_B_ONLY = TAG_A_ONLY;

let userId = 0;
let carouselId = "";

/** The rows as stored, byte for byte */
async function storedText(): Promise<{ presets: string; rules: string }> {
  const users = await prisma.$queryRawUnsafe<Array<{ presets: string }>>(
    `SELECT CAST(filterPresets AS TEXT) AS presets FROM "User" WHERE id = ?`,
    userId
  );
  const carousels = await prisma.$queryRawUnsafe<Array<{ rules: string }>>(
    `SELECT CAST(rules AS TEXT) AS rules FROM "UserCarousel" WHERE id = ?`,
    carouselId
  );
  return {
    presets: must(users[0], "the user's presets").presets,
    rules: must(carousels[0], "the carousel's rules").rules,
  };
}

async function removeRows(): Promise<void> {
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  const where = { stashInstanceId: { in: [A, B, C] } };
  await prisma.stashTag.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashInstance.deleteMany({ where: { id: { in: [A, B, C] } } });
}

describe("data migration 009: stored presets and carousel rules", () => {
  beforeAll(async () => {
    await removeRows();
    for (const [index, id] of [A, B, C].entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: "http://127.0.0.1:9/graphql",
          apiKey: "fixture-key",
          enabled: id !== C,
          priority: 940 + index,
          firstSyncedAt: new Date(),
        },
      });
    }
    await prisma.stashTag.createMany({
      data: [
        { id: TAG_A_ONLY, stashInstanceId: A, name: "Only A" },
        { id: TAG_BOTH, stashInstanceId: A, name: "Both A" },
        { id: TAG_BOTH, stashInstanceId: B, name: "Both B" },
        { id: TAG_LIVE_ON_A, stashInstanceId: A, name: "Live A" },
        {
          id: TAG_LIVE_ON_A,
          stashInstanceId: B,
          name: "Deleted B",
          deletedAt: new Date(),
        },
        { id: TAG_A_AND_DISABLED, stashInstanceId: A, name: "A, C" },
        { id: TAG_A_AND_DISABLED, stashInstanceId: C, name: "C, A" },
      ],
    });
    await prisma.stashStudio.create({
      data: { id: STUDIO_B_ONLY, stashInstanceId: B, name: "Only B" },
    });

    const user = await prisma.user.create({
      data: {
        username: USERNAME,
        password: "not-a-real-hash",
        role: "USER",
        filterPresets: {
          image: [
            {
              id: "image-preset",
              name: "To Review",
              filters: {
                studioIdsModifier: "EXCLUDES",
                studioIds: [STUDIO_B_ONLY],
                tagIds: [TAG_A_ONLY, TAG_BOTH],
                tagIdsModifier: "EXCLUDES",
                notAFilter: 1,
              },
              sort: "created_at",
              direction: "ASC",
              viewMode: "wall",
              perPage: 500,
            },
          ],
          clip: [
            {
              id: "clip-preset",
              name: "test",
              filters: { sceneTagIds: [TAG_LIVE_ON_A] },
              sort: "duration",
              direction: "DESC",
            },
          ],
          // 9b: a View with a group, and beta.7's one gender
          performer: [
            {
              id: "performer-view",
              name: "Fave Ladies",
              filters: {
                gender: "FEMALE",
                g1: "any",
                "g1.tagIds": [TAG_A_ONLY, TAG_BOTH],
                "g1.6.nope": 1,
              },
              sort: "rating",
              direction: "DESC",
            },
          ],
        },
      },
    });
    userId = user.id;
    const carousel = await prisma.userCarousel.create({
      data: {
        userId,
        title: "Goddesses",
        rules: {
          tags: {
            value: [TAG_A_AND_DISABLED, TAG_NOWHERE],
            modifier: "INCLUDES_ALL",
          },
          not_a_field: true,
        },
        sort: "bogus",
        direction: "DESC",
      },
    });
    carouselId = carousel.id;
  });

  afterAll(removeRows);

  it("resolves a bare id only where one live entity of its type has it on an enabled instance", async () => {
    const tags = await resolveBareRefs("tag", [
      TAG_A_ONLY,
      TAG_BOTH,
      TAG_LIVE_ON_A,
      TAG_A_AND_DISABLED,
      TAG_NOWHERE,
      TAG_A_ONLY,
    ]);
    const studios = await resolveBareRefs("studio", [STUDIO_B_ONLY]);

    expect(Object.fromEntries(tags)).toEqual({
      [TAG_A_ONLY]: A,
      [TAG_LIVE_ON_A]: A,
      [TAG_A_AND_DISABLED]: A,
    });
    expect(Object.fromEntries(studios)).toEqual({ [STUDIO_B_ONLY]: B });
  });

  it("a bare tag id on one instance becomes id:instance, in a group's picker too; one on both instances stays bare", async () => {
    const summary = await cleanStoredFilters([userId]);

    const user = must(
      await prisma.user.findUnique({
        where: { id: userId },
        select: { filterPresets: true },
      }),
      "the user"
    );
    expect(user.filterPresets).toEqual({
      image: [
        {
          id: "image-preset",
          name: "To Review",
          filters: {
            studioIdsModifier: "EXCLUDES",
            studioIds: [`${STUDIO_B_ONLY}:${B}`],
            tagIds: [`${TAG_A_ONLY}:${A}`, TAG_BOTH],
            tagIdsModifier: "EXCLUDES",
          },
          sort: "created_at",
          direction: "ASC",
          viewMode: "wall",
          perPage: 250,
        },
      ],
      clip: [
        {
          id: "clip-preset",
          name: "test",
          filters: { sceneTagIds: [`${TAG_LIVE_ON_A}:${A}`] },
          sort: "duration",
          direction: "DESC",
        },
      ],
      performer: [
        {
          id: "performer-view",
          name: "Fave Ladies",
          filters: {
            gender: ["FEMALE"],
            g1: "any",
            "g1.tagIds": [`${TAG_A_ONLY}:${A}`, TAG_BOTH],
          },
          sort: "rating",
          direction: "DESC",
        },
      ],
    });
    const carousel = must(
      await prisma.userCarousel.findUnique({ where: { id: carouselId } }),
      "the carousel"
    );
    expect(carousel.rules).toEqual({
      tags: {
        value: [`${TAG_A_AND_DISABLED}:${A}`, TAG_NOWHERE],
        modifier: "INCLUDES_ALL",
      },
    });
    expect([carousel.sort, carousel.direction]).toEqual(["random", "DESC"]);
    expect(summary).toEqual({
      users: 1,
      presets: 3,
      carousels: 1,
      droppedKeys: {
        "image.notAFilter": 1,
        "performer.g1.6.nope": 1,
        "carousel.not_a_field": 1,
      },
      refsRewritten: 5,
      refsLeftBare: 3,
      skipped: 0,
    });
  });

  it("a second run changes nothing", async () => {
    const before = await storedText();

    const summary = await cleanStoredFilters([userId]);

    expect(await storedText()).toEqual(before);
    expect(summary).toEqual({
      users: 0,
      presets: 0,
      carousels: 0,
      droppedKeys: {},
      refsRewritten: 0,
      refsLeftBare: 3,
      skipped: 0,
    });
  });
});
