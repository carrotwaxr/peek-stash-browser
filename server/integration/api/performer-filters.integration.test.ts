import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type {
  NumberCriterion,
  ParsedFilter,
  ParsedListRequest,
} from "../../types/parsedFilters.js";
import { careerYearsSql } from "../../utils/sqlClauses.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { adminClient } from "../helpers/testClient.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Performer Filters Integration Tests
 *
 * Tests performer-specific filters:
 * - favorite filter
 * - gender filter
 * - tags filter (INCLUDES, INCLUDES_ALL, EXCLUDES)
 * - studios filter (performers in scenes from studio)
 * - rating100 filter
 * - o_counter filter
 * - play_count filter
 * - scene_count filter
 * - name/aliases text search
 * - career_length filter and sort, weight and measurements sorts (seeded)
 */

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      gender?: string | null;
      favorite?: boolean;
      rating100?: number | null;
      scene_count?: number;
      o_counter?: number;
      play_count?: number;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

describe("Performer Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("favorite filter", () => {
    it("filters favorite performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.favorite).toBe(true);
      }
    });

    it("filters non-favorite performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            favorite: false,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("gender filter", () => {
    it("filters by gender EQUALS FEMALE", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            gender: {
              value: "FEMALE",
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.gender).toBe("FEMALE");
      }
    });

    it("filters by gender EQUALS MALE", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            gender: {
              value: "MALE",
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.gender).toBe("MALE");
      }
    });

    it("filters by gender NOT_EQUALS", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            gender: {
              value: "MALE",
              modifier: "NOT_EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.gender).not.toBe("MALE");
      }
    });
  });

  describe("tags filter", () => {
    it("filters performers by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
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

    it("filters performers by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers by multiple tags with INCLUDES_ALL", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            tags: {
              value: [
                TEST_ENTITIES.tagWithEntities,
                TEST_ENTITIES.restrictableTag,
              ],
              modifier: "INCLUDES_ALL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("scenes filter", () => {
    it("filters performers appearing in specific scene with INCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            scenes: {
              value: [TEST_ENTITIES.sceneWithRelations],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });

    it("filters performers excluding specific scene with EXCLUDES", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            scenes: {
              value: [TEST_ENTITIES.sceneWithRelations],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters performers who appear in scenes from studio", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.count).toBeGreaterThan(0);
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            rating100: {
              value: 70,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            rating100: {
              value: 50,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            rating100: {
              value: 50,
              value2: 80,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("o_counter filter", () => {
    it("filters by o_counter GREATER_THAN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            o_counter: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by o_counter EQUALS zero", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            o_counter: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("play_count filter", () => {
    it("filters by play_count GREATER_THAN (watched performers)", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            play_count: {
              value: 0,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters by play_count EQUALS zero (unwatched performers)", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            play_count: {
              value: 0,
              modifier: "EQUALS",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("scene_count filter", () => {
    it("filters performers with many scenes", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            scene_count: {
              value: 10,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers with few scenes", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            scene_count: {
              value: 5,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("filters performers with scene_count BETWEEN", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            scene_count: {
              value: 5,
              value2: 20,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("text search (q parameter)", () => {
    it("searches performers by name", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 50,
            q: "a",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines gender and favorite filters", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            gender: {
              value: "FEMALE",
              modifier: "EQUALS",
            },
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      for (const performer of response.data.findPerformers.performers) {
        expect(performer.gender).toBe("FEMALE");
        expect(performer.favorite).toBe(true);
      }
    });

    it("combines scene_count and rating filters", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            scene_count: {
              value: 5,
              modifier: "GREATER_THAN",
            },
            rating100: {
              value: 60,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("combines tags and studios filters", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 50 },
          performer_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts performers by name ASC", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 50,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by scene_count DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 50,
            sort: "scene_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by rating100 DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 50,
            sort: "rating100",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });
  });
});

/**
 * Career Length is the years between the first and last year of Stash's
 * free-text career field (`careerYearsSql`, the legacy `parseCareerLength`'s
 * forms): "YYYY -" and "YYYY - present|current|now" count to the current
 * year, "YYYY - YYYY" to the end year; "- YYYY" and any other text give no
 * value. The values are computed from the current year, as SQLite's `now`.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - cl-a: 7892001 "<Y-10> -" (10 years), 7892002 "<Y-16> - <Y-8>" (8),
 *   7892003 "- <Y-6>" (none), 7892004 "<Y-11>-present" (11), 7892005 with
 *   no career text
 * - cl-b: 7892001 "<Y-9> -" (9)
 * Each carries a weight and measurements for the two sorts; 7892001 and
 * 7892004 on cl-a have a height. A number filter never matches a performer
 * without a value, only IS_NULL does. Every seeded row is deleted before the
 * file ends.
 */
describeWithDb(
  "Performer career length, weight and measurements (seeded)",
  () => {
    const A = "cl-a";
    const B = "cl-b";
    const Y = new Date().getUTCFullYear();

    const performer = (
      id: string,
      instance: string,
      careerLength: string | null,
      weightKg: number | null,
      measurements: string | null,
      heightCm: number | null = null
    ) => ({
      id,
      stashInstanceId: instance,
      name: `CL ${id} ${instance}`,
      careerLength,
      weightKg,
      measurements,
      heightCm,
    });

    async function removeRows(): Promise<void> {
      await prisma.stashPerformer.deleteMany({
        where: { stashInstanceId: { in: [A, B] } },
      });
    }

    /** The performers a request lists, as "id:instance" keys in its order */
    async function listed(
      overrides: Partial<ParsedListRequest<"performer">>
    ): Promise<string[]> {
      const { items, total } = await performerQueryBuilder.execute({
        userId: 0,
        applyExclusions: false,
        allowedInstanceIds: [A, B],
        request: parsedListRequest("performer", { perPage: 50, ...overrides }),
      });
      expect(total).toBe(items.length);
      return items.map((p) => `${p.id}:${p.instanceId}`);
    }

    const careerFilter = async (criterion: NumberCriterion) =>
      (await listed({ filter: { career_length: criterion } })).sort();

    const numberFilter = async (
      field: "weight" | "height",
      criterion: NumberCriterion
    ) => (await listed({ filter: { [field]: criterion } })).sort();

    const sortedBy = (
      field: "career_length" | "weight" | "measurements",
      direction: "ASC" | "DESC"
    ) => listed({ sort: { field, direction, seed: undefined } });

    beforeAll(async () => {
      await removeRows();
      await prisma.stashPerformer.createMany({
        data: [
          performer("7892001", A, `${Y - 10} -`, 60, "34b-24-34", 170),
          performer("7892002", A, `${Y - 16} - ${Y - 8}`, 80, "36D-26-36"),
          performer("7892003", A, `- ${Y - 6}`, null, null),
          performer("7892004", A, `${Y - 11}-present`, 70, "34C-24-34", 160),
          performer("7892005", A, null, null, null),
          performer("7892001", B, `${Y - 9} -`, 65, "30A-20-30"),
        ],
      });
    });

    afterAll(async () => {
      await removeRows();
    });

    it(`career_length BETWEEN 8 and 10 matches "${Y - 10} -" and "${Y - 16} - ${Y - 8}", not "- ${Y - 6}" or "${Y - 11}-present"`, async () => {
      expect(
        await careerFilter({ modifier: "BETWEEN", value: 8, value2: 10 })
      ).toEqual(["7892001:cl-a", "7892001:cl-b", "7892002:cl-a"]);
    });

    it("career_length compares each instance's own text, and a performer without a value never matches", async () => {
      expect(
        await careerFilter({ modifier: "GREATER_THAN", value: 9 })
      ).toEqual(["7892001:cl-a", "7892004:cl-a"]);
      expect(await careerFilter({ modifier: "LESS_THAN", value: 10 })).toEqual([
        "7892001:cl-b",
        "7892002:cl-a",
      ]);
      expect(await careerFilter({ modifier: "NOT_EQUALS", value: 10 })).toEqual(
        ["7892001:cl-b", "7892002:cl-a", "7892004:cl-a"]
      );
    });

    it("career_length IS_NULL lists the performers without a value", async () => {
      expect(await careerFilter({ modifier: "IS_NULL" })).toEqual([
        "7892003:cl-a",
        "7892005:cl-a",
      ]);
    });

    it("weight at most 60 leaves out performers with no weight", async () => {
      expect(
        await numberFilter("weight", {
          modifier: "BETWEEN",
          value: undefined,
          value2: 60,
        })
      ).toEqual(["7892001:cl-a"]);
      expect(
        await numberFilter("weight", { modifier: "LESS_THAN", value: 66 })
      ).toEqual(["7892001:cl-a", "7892001:cl-b"]);
      expect(
        await numberFilter("weight", {
          modifier: "NOT_BETWEEN",
          value: 61,
          value2: 79,
        })
      ).toEqual(["7892001:cl-a", "7892002:cl-a"]);
      expect(
        await numberFilter("weight", {
          modifier: "BETWEEN",
          value: 70,
          value2: undefined,
        })
      ).toEqual(["7892002:cl-a", "7892004:cl-a"]);
    });

    it("height NOT_NULL lists only performers with a height", async () => {
      expect(await numberFilter("height", { modifier: "NOT_NULL" })).toEqual([
        "7892001:cl-a",
        "7892004:cl-a",
      ]);
      // The same id on cl-b has none
      expect(await numberFilter("height", { modifier: "IS_NULL" })).toEqual([
        "7892001:cl-b",
        "7892002:cl-a",
        "7892003:cl-a",
        "7892005:cl-a",
      ]);
      expect(
        await numberFilter("height", { modifier: "NOT_EQUALS", value: 170 })
      ).toEqual(["7892004:cl-a"]);
    });

    it("sort career_length ASC puts unknown last, and DESC too", async () => {
      const unknown = ["7892003:cl-a", "7892005:cl-a"];
      const ascending = await sortedBy("career_length", "ASC");
      expect(ascending.slice(0, 4)).toEqual([
        "7892002:cl-a",
        "7892001:cl-b",
        "7892001:cl-a",
        "7892004:cl-a",
      ]);
      expect(ascending.slice(4).sort()).toEqual(unknown);

      const descending = await sortedBy("career_length", "DESC");
      expect(descending.slice(0, 4)).toEqual([
        "7892004:cl-a",
        "7892001:cl-a",
        "7892001:cl-b",
        "7892002:cl-a",
      ]);
      expect(descending.slice(4).sort()).toEqual(unknown);
    });

    it("sorts by weight, heaviest first", async () => {
      expect((await sortedBy("weight", "DESC")).slice(0, 4)).toEqual([
        "7892002:cl-a",
        "7892004:cl-a",
        "7892001:cl-b",
        "7892001:cl-a",
      ]);
    });

    it("sorts by measurements ignoring case", async () => {
      const withMeasurements = new Set([
        "7892001:cl-a",
        "7892002:cl-a",
        "7892004:cl-a",
        "7892001:cl-b",
      ]);
      expect(
        (await sortedBy("measurements", "ASC")).filter((key) =>
          withMeasurements.has(key)
        )
      ).toEqual([
        "7892001:cl-b",
        "7892001:cl-a",
        "7892004:cl-a",
        "7892002:cl-a",
      ]);
    });

    it.each([
      [`${Y - 5} -`, 5],
      [`${Y - 5}-`, 5],
      [`  ${Y - 3} -  `, 3],
      [`${Y - 5} - present`, 5],
      [`${Y - 5}-Present`, 5],
      [`${Y - 5} - current`, 5],
      [`${Y - 5} - NOW`, 5],
      [`${Y - 12} - ${Y - 2}`, 10],
      [`${Y - 12}-${Y - 2}`, 10],
      [`${Y - 5} - ${Y - 5}`, 0],
      [`${Y - 12} \u2013 ${Y - 2}`, 10],
      [`${Y - 12}\u2014`, 12],
      [`${Y - 2} - ${Y + 1}`, 3],
      [`- ${Y - 6}`, null],
      [`${Y - 2} - ${Y - 12}`, null],
      [`${Y - 2} - ${Y + 2}`, null],
      [`${Y + 1} -`, null],
      ["1899 -", null],
      ["1900 - 1910", null],
      [`${Y - 12} - ${Y - 2} - ${Y}`, null],
      [`${Y - 5}`, null],
      ["5 years", null],
      ["Performer 100001 career_length", null],
      ["", null],
      [null, null],
    ])("careerYearsSql(%j) is %j", async (text, years) => {
      const rows = await prisma.$queryRawUnsafe<{ years: bigint | null }[]>(
        `SELECT ${careerYearsSql("c.v")} AS years FROM (SELECT ? AS v) c`,
        text
      );
      const value = must(rows[0], "the expression's row").years;
      expect(value === null ? null : Number(value)).toBe(years);
    });
  }
);

/**
 * Birth year and age on partial birthdates, on seeded performers. Stash
 * keeps a year alone as text (`1995`), which SQLite reads as a Julian day;
 * it counts from its 1 January.
 *
 * Two made-up instances reuse the same id, as two Stash servers do:
 * - by-a: 7895001 born "1995", 7895002 born "1995-06", 7895003 born
 *   1995-03-15, 7895004 born 1990-01-01
 * - by-b: 7895001 born 1980-01-01
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Performer birth year and age, partial dates (seeded)", () => {
  const A = "by-a";
  const B = "by-b";

  const performer = (id: string, instance: string, birthdate: string) => ({
    id,
    stashInstanceId: instance,
    name: `BY ${id} ${instance}`,
    birthdate,
  });

  async function removeRows(): Promise<void> {
    await prisma.stashPerformer.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
  }

  async function listed(filter: ParsedFilter<"performer">): Promise<string[]> {
    const { items } = await performerQueryBuilder.execute({
      userId: 0,
      applyExclusions: false,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("performer", { perPage: 50, filter }),
    });
    return items.map((p) => `${p.id}:${p.instanceId}`).sort();
  }

  beforeAll(async () => {
    await removeRows();
    await prisma.stashPerformer.createMany({
      data: [
        performer("7895001", A, "1995"),
        performer("7895002", A, "1995-06"),
        performer("7895003", A, "1995-03-15"),
        performer("7895004", A, "1990-01-01"),
        performer("7895001", B, "1980-01-01"),
      ],
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("birth_year 1995 lists a performer born `1995`, and `1995-06`", async () => {
    expect(
      await listed({ birth_year: { modifier: "EQUALS", value: 1995 } })
    ).toEqual(["7895001:by-a", "7895002:by-a", "7895003:by-a"]);
  });

  it("age reads a `YYYY` birthdate as its 1 January", async () => {
    const now = new Date();
    const year = now.getFullYear();
    // Born 1995-01-01: a birthday already passed this year, every day of it
    expect(
      await listed({ age: { modifier: "EQUALS", value: year - 1995 } })
    ).toContain("7895001:by-a");
    // Born 1995-06-01 and 1995-03-15 have had their birthday from the month on
    const month = now.getMonth() + 1;
    expect(
      await listed({
        age: { modifier: "EQUALS", value: year - 1995 - (month < 6 ? 1 : 0) },
      })
    ).toContain("7895002:by-a");
  });

  it("an age never reads thousands of years for a partial date", async () => {
    expect(
      await listed({ age: { modifier: "GREATER_THAN", value: 200 } })
    ).toEqual([]);
  });
});
