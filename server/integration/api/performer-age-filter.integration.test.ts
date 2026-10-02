import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import type { NumberCriterion } from "../../types/parsedFilters.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { expectRefused } from "../helpers/refused.js";
import { adminClient } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Performer Age Filter Integration Tests
 *
 * Tests age-related filters:
 * - age (current age based on birthdate)
 * - birthdate filters
 * - death_date filters
 * - birth_year/death_year
 * - Age at time of scene (performer_age on scene filter)
 */

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      birthdate?: string | null;
      death_date?: string | null;
      age?: number | null;
    }>;
    count: number;
  };
}

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      date?: string | null;
      performers?: Array<{
        id: string;
        name: string;
        birthdate?: string | null;
        age?: number | null;
      }>;
    }>;
    count: number;
  };
}

describe("Performer Age Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("performer age filter", () => {
    it("filters performers by age GREATER_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            age: {
              value: 25,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by age LESS_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            age: {
              value: 40,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by age BETWEEN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            age: {
              value: 20,
              value2: 35,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it.each(["IS_NULL", "NOT_NULL"])(
      "age %s is not a Peek filter: 400 naming the modifier",
      async (modifier) => {
        // Age is computed from the birthdate: filter on birthdate instead
        const response = await adminClient.post("/api/library/performers", {
          filter: { per_page: 50 },
          performer_filter: { age: { value: 0, modifier } },
        });

        expectRefused(response, ["performer_filter.age.modifier"]);
      }
    );
  });

  describe("birthdate filter", () => {
    it("filters performers by birthdate GREATER_THAN (born after)", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            birthdate: {
              value: "1990-01-01",
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by birthdate LESS_THAN (born before)", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            birthdate: {
              value: "2000-01-01",
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by birthdate BETWEEN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            birthdate: {
              value: "1985-01-01",
              value2: "1995-12-31",
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers with no birthdate (IS_NULL)", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            birthdate: {
              value: "",
              modifier: "IS_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("death_date filter", () => {
    it("filters deceased performers (death_date NOT_NULL)", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            death_date: {
              value: "",
              modifier: "NOT_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters living performers (death_date IS_NULL)", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            death_date: {
              value: "",
              modifier: "IS_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("performer_age on scenes", () => {
    it("filters scenes by performer age at time of scene", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            performer_age: {
              value: 25,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by performer age LESS_THAN", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            performer_age: {
              value: 30,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by performer age BETWEEN", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            performer_age: {
              value: 20,
              value2: 30,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("combined age and other filters", () => {
    it("combines performer age with tag filter on performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            age: {
              value: 25,
              modifier: "GREATER_THAN",
            },
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("combines performer age with favorite filter on performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            age: {
              value: 30,
              modifier: "LESS_THAN",
            },
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("combines performer_age on scenes with studio filter", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            performer_age: {
              value: 25,
              modifier: "GREATER_THAN",
            },
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });
});

/**
 * Performer Age by Stash's rule, on seeded rows: a scene matches when any
 * performer the viewer can see was in range on the scene's date; a scene
 * without a date never matches; a performer who has died keeps the age they
 * reached; a birthdate or scene date of a year, or a year and month, counts
 * from its first day (SQLite reads a bare `1995` as a Julian day).
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - pa-a performers: 7894001 born 2000-01-01, 7894002 born 1982-01-01,
 *   7894003 born 1950-01-01 died 1990-01-01, 7894004 born "1995",
 *   7894005 born "1995-06", 7894006 born 1990-06-01, 7894007 born 2000-01-01
 *   (hidden by the viewers below)
 * - pa-a scenes: 7894101 on 2022-06-01 with 1 and 2 (22 and 40); 7894102
 *   undated with 1; 7894103 on 2020-05-01 with 4; 7894104 on 2020-05-01 with
 *   5; 7894105 dated "2019" with 6; 7894106 on 2022-06-01 with 7 only;
 *   7894107 on 2022-06-01 with 7 and 2
 * - pa-b: performer 7894001 born 1960-01-01 and 7894007 born 2000-01-01;
 *   scene 7894101 on 2022-06-01 with 7894001 (62, never the pa-a performer's
 *   22) and scene 7894108 on 2022-06-01 with 7894007 (22: the pa-a hide does
 *   not reach it)
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Performer Age (seeded)", () => {
  const A = "pa-a";
  const B = "pa-b";
  const VIEWER = "pa-viewer";
  const ADMIN_VIEWER = "pa-admin-viewer";
  const OTHER = "pa-other";
  let viewerId = 0;
  let adminViewerId = 0;
  let otherId = 0;

  const performer = (
    id: string,
    instance: string,
    birthdate: string | null,
    deathDate: string | null = null
  ) => ({
    id,
    stashInstanceId: instance,
    name: `PA ${id} ${instance}`,
    birthdate,
    deathDate,
  });
  const scene = (id: string, instance: string, date: string | null) => ({
    id,
    stashInstanceId: instance,
    title: `PA ${id} ${instance}`,
    date,
  });
  const link = (
    sceneId: string,
    sceneInstanceId: string,
    performerId: string,
    performerInstanceId: string = sceneInstanceId
  ) => ({ sceneId, sceneInstanceId, performerId, performerInstanceId });

  async function removeRows(): Promise<void> {
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.stashPerformer.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.user.deleteMany({
      where: { username: { in: [VIEWER, ADMIN_VIEWER, OTHER] } },
    });
  }

  /** The scenes a performer_age filter lists for a viewer, as sorted keys */
  async function scenesFor(
    userId: number,
    criterion: NumberCriterion,
    applyExclusions = true
  ): Promise<string[]> {
    const { items, total } = await sceneQueryBuilder.execute({
      userId,
      applyExclusions,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("scene", {
        perPage: 50,
        filter: { performer_age: criterion },
      }),
    });
    expect(total).toBe(items.length);
    return items.map((s) => `${s.id}:${s.instanceId}`).sort();
  }

  /** The performers an age filter lists, as sorted keys */
  async function performersAged(criterion: NumberCriterion): Promise<string[]> {
    const { items } = await performerQueryBuilder.execute({
      userId: 0,
      applyExclusions: false,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("performer", {
        perPage: 50,
        filter: { age: criterion },
      }),
    });
    return items.map((p) => `${p.id}:${p.instanceId}`).sort();
  }

  const under = (value: number): NumberCriterion => ({
    modifier: "LESS_THAN",
    value,
  });
  const exactly = (value: number): NumberCriterion => ({
    modifier: "EQUALS",
    value,
  });

  beforeAll(async () => {
    await removeRows();
    const make = (username: string, role: "USER" | "ADMIN") =>
      prisma.user.create({
        data: { username, password: "not-a-real-hash", role },
      });
    viewerId = (await make(VIEWER, "USER")).id;
    adminViewerId = (await make(ADMIN_VIEWER, "ADMIN")).id;
    otherId = (await make(OTHER, "USER")).id;
    await prisma.stashPerformer.createMany({
      data: [
        performer("7894001", A, "2000-01-01"),
        performer("7894002", A, "1982-01-01"),
        performer("7894003", A, "1950-01-01", "1990-01-01"),
        performer("7894004", A, "1995"),
        performer("7894005", A, "1995-06"),
        performer("7894006", A, "1990-06-01"),
        performer("7894007", A, "2000-01-01"),
        performer("7894001", B, "1960-01-01"),
        performer("7894007", B, "2000-01-01"),
      ],
    });
    await prisma.stashScene.createMany({
      data: [
        scene("7894101", A, "2022-06-01"),
        scene("7894102", A, null),
        scene("7894103", A, "2020-05-01"),
        scene("7894104", A, "2020-05-01"),
        scene("7894105", A, "2019"),
        scene("7894106", A, "2022-06-01"),
        scene("7894107", A, "2022-06-01"),
        scene("7894101", B, "2022-06-01"),
        scene("7894108", B, "2022-06-01"),
      ],
    });
    await prisma.scenePerformer.createMany({
      data: [
        link("7894101", A, "7894001"),
        link("7894101", A, "7894002"),
        link("7894102", A, "7894001"),
        link("7894103", A, "7894004"),
        link("7894104", A, "7894005"),
        link("7894105", A, "7894006"),
        link("7894106", A, "7894007"),
        link("7894107", A, "7894007"),
        link("7894107", A, "7894002"),
        link("7894101", B, "7894001"),
        link("7894108", B, "7894007"),
      ],
    });
    // Both viewers hid performer 7894007 on pa-a only
    await prisma.userExcludedEntity.createMany({
      data: [viewerId, adminViewerId].map((userId) => ({
        userId,
        entityType: "performer",
        entityId: "7894007",
        instanceId: A,
        reason: "hidden",
      })),
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("a scene matches when any performer is in range at the scene's date", async () => {
    // Scene 7894101: performers aged 22 and 40; the oldest-performer rule
    // read 40 and left it out of "under 26"
    expect(await scenesFor(otherId, under(26), false)).toContain(
      "7894101:pa-a"
    );
    expect(await scenesFor(otherId, exactly(40), false)).toContain(
      "7894101:pa-a"
    );
    expect(await scenesFor(otherId, exactly(30), false)).not.toContain(
      "7894101:pa-a"
    );
  });

  it("an undated scene never matches", async () => {
    for (const criterion of [
      under(99),
      exactly(22),
      { modifier: "GREATER_THAN", value: 0 } as const,
      { modifier: "NOT_EQUALS", value: 5 } as const,
    ]) {
      expect(await scenesFor(otherId, criterion, false)).not.toContain(
        "7894102:pa-a"
      );
    }
  });

  it("a performer hidden by the viewer does not make a scene match", async () => {
    // 7894106 has only the hidden performer; 7894107 also has one aged 40
    expect(await scenesFor(viewerId, under(26))).toEqual([
      "7894101:pa-a",
      "7894103:pa-a",
      "7894104:pa-a",
      "7894108:pa-b",
    ]);
    // Without the viewer's exclusions the hidden performer counts
    expect(await scenesFor(otherId, under(26))).toEqual([
      "7894101:pa-a",
      "7894103:pa-a",
      "7894104:pa-a",
      "7894106:pa-a",
      "7894107:pa-a",
      "7894108:pa-b",
    ]);
  });

  it("the other viewers' hides never change what a viewer finds", async () => {
    expect(await scenesFor(otherId, exactly(22))).toEqual(
      await scenesFor(viewerId, exactly(22), false)
    );
  });

  it("a performer on the other instance with the same id never makes the scene match", async () => {
    // pa-a's 7894001 is 22, pa-b's is 62: pa-b's scene 7894101 is 62 only
    expect(await scenesFor(otherId, exactly(22))).not.toContain("7894101:pa-b");
    expect(await scenesFor(otherId, exactly(62))).toEqual(["7894101:pa-b"]);
    expect(await scenesFor(otherId, exactly(62))).not.toContain("7894101:pa-a");
  });

  it("an admin's own hidden performer does not make a scene match for that admin", async () => {
    expect(await scenesFor(adminViewerId, under(26))).toEqual([
      "7894101:pa-a",
      "7894103:pa-a",
      "7894104:pa-a",
      "7894108:pa-b",
    ]);
  });

  it("a hide on one instance leaves the other instance's performer counting", async () => {
    expect(await scenesFor(viewerId, exactly(22))).toContain("7894108:pa-b");
    expect(await scenesFor(viewerId, exactly(22))).not.toContain(
      "7894106:pa-a"
    );
  });

  it("a performer born `1995` is 25 on 2020-05-01, not 6,727", async () => {
    expect(await scenesFor(otherId, exactly(25))).toEqual(["7894103:pa-a"]);
    expect(
      await scenesFor(otherId, { modifier: "GREATER_THAN", value: 99 })
    ).toEqual([]);
  });

  it("a performer born `1995-06` is 24 on 2020-05-01", async () => {
    expect(await scenesFor(otherId, exactly(24))).toEqual(["7894104:pa-a"]);
  });

  it("a scene dated `2019` takes 2019-01-01", async () => {
    // Born 1990-06-01: 28 on 2019-01-01, not negative
    expect(await scenesFor(otherId, exactly(28))).toEqual(["7894105:pa-a"]);
  });

  it("a dead performer's age is their age at death", async () => {
    // Born 1950, died 1990: 40, whatever year it is now
    expect(await performersAged(exactly(40))).toContain("7894003:pa-a");
    expect(await performersAged(exactly(76))).not.toContain("7894003:pa-a");
  });

  it("age reads a `YYYY` and a `YYYY-MM` birthdate as the first day", async () => {
    const now = new Date();
    const year = now.getFullYear();
    const aged = (born: number, month: number) =>
      year - born - (now.getMonth() + 1 < month ? 1 : 0);
    expect(await performersAged(exactly(aged(1995, 1)))).toContain(
      "7894004:pa-a"
    );
    expect(await performersAged(exactly(aged(1995, 6)))).toContain(
      "7894005:pa-a"
    );
  });
});
