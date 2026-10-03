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
import { parseListRequest } from "../../utils/listRequest.js";
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
      const career = careerYearsSql("c.v", Y);
      const rows = await prisma.$queryRawUnsafe<{ years: bigint | null }[]>(
        `SELECT ${career.sql} AS years FROM (SELECT ? AS v) c`,
        ...career.params,
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

  it("a `YYYY` birthdate is in a range covering its 1 January", async () => {
    expect(
      await listed({
        birthdate: {
          modifier: "BETWEEN",
          value: "1995-01-01",
          value2: "1995-01-01",
        },
      })
    ).toEqual(["7895001:by-a"]);
    // A month is its first day; a From date alone includes its own day
    expect(
      await listed({
        birthdate: {
          modifier: "BETWEEN",
          value: "1995-06-01",
          value2: undefined,
        },
      })
    ).toEqual(["7895002:by-a"]);
    expect(
      await listed({ birthdate: { modifier: "EQUALS", value: "1980-01-01" } })
    ).toEqual(["7895001:by-b"]);
  });

  it("an age never reads thousands of years for a partial date", async () => {
    expect(
      await listed({ age: { modifier: "GREATER_THAN", value: 200 } })
    ).toEqual([]);
  });
});

/**
 * Performer parity (F14): studios with sub-studios, disambiguation, country,
 * circumcised, aliases, links, StashDB ids, the visible tag, image, gallery
 * and marker counts, "appears with" and favourite tags. Sent over the wire
 * parser into the builder for a viewer of their own, as the list route does.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - pf-a tags: 7899001 (the viewer's favourite), 7899002 under it, 7899003
 *   (a favourite the viewer hid), 7899004 (another user's favourite),
 *   7899005 (deleted). pf-b tag 7899001 (no one's favourite).
 * - pf-a studios: 7899201 with its child 7899202. pf-b studio 7899201.
 * - pf-a performers: 7899101 (every new text set; tags 2 and 3; 5 images of
 *   which the viewer cannot see 2; 2 galleries), 7899102 (tags 4 and 5),
 *   7899103 (nothing set; tag 3), 7899104 (hidden by the viewer, matching
 *   every text 7899101 matches). pf-b performers 7899101 (tag 1 of pf-b,
 *   the same StashDB id) and 7899102.
 * - Genders: pf-a 7899101 and 7899104 FEMALE, 7899102 MALE, 7899103 none;
 *   pf-b 7899101 MALE, 7899102 empty.
 * - pf-a scenes: 7899301 (studio 7899202; performers 1 and 2; a live clip,
 *   one the viewer hid, a deleted one), 7899302 (studio 7899201; performers
 *   1 and 3; a clip; hidden by the viewer), 7899303 (performers 2, 3 and 4).
 *   pf-b scene 7899301 (studio 7899201; performers 1 and 2; a clip).
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Performer parity filters (seeded)", () => {
  const A = "pf-a";
  const B = "pf-b";
  const VIEWER = "pf-viewer";
  const OTHER = "pf-other";
  let viewerId = 0;
  let otherId = 0;

  const [P1, P2, P3, P4] = ["7899101", "7899102", "7899103", "7899104"];
  const [S1, S2, S3] = ["7899301", "7899302", "7899303"];
  const STUDIO = "7899201";
  const STASHDB = "https://stashdb.org/graphql";
  const key = (id: string, instance: string) => `${id}:${instance}`;
  /** Every performer the viewer can see */
  const VISIBLE = [
    key(P1, A),
    key(P2, A),
    key(P3, A),
    key(P1, B),
    key(P2, B),
  ].sort();
  const without = (...keys: string[]) =>
    VISIBLE.filter((k) => !keys.includes(k));

  async function removeRows(): Promise<void> {
    const where = { stashInstanceId: { in: [A, B] } };
    await prisma.stashScene.deleteMany({ where });
    await prisma.stashStudio.deleteMany({ where });
    await prisma.stashPerformer.deleteMany({ where });
    await prisma.stashTag.deleteMany({ where });
    await prisma.user.deleteMany({
      where: { username: { in: [VIEWER, OTHER] } },
    });
  }

  /** The performers a wire `performer_filter` lists, as sorted keys */
  async function listed(
    filter: Record<string, unknown>,
    userId = viewerId
  ): Promise<string[]> {
    const request = parseListRequest(
      "performer",
      { filter: { per_page: 100 }, performer_filter: filter },
      { userId }
    );
    const { items, total } = await performerQueryBuilder.execute({
      userId,
      allowedInstanceIds: [A, B],
      request,
    });
    expect(total).toBe(items.length);
    return items.map((p) => key(p.id, p.instanceId)).sort();
  }

  beforeAll(async () => {
    await removeRows();
    const user = async (username: string) =>
      (
        await prisma.user.create({
          data: { username, password: "not-a-real-hash", role: "USER" },
        })
      ).id;
    viewerId = await user(VIEWER);
    otherId = await user(OTHER);

    const tag = (
      id: string,
      instance: string,
      parents: string[] = [],
      deletedAt: Date | null = null
    ) => ({
      id,
      stashInstanceId: instance,
      name: `PF tag ${id} ${instance}`,
      parentIds: JSON.stringify(parents),
      deletedAt,
    });
    await prisma.stashTag.createMany({
      data: [
        tag("7899001", A),
        tag("7899002", A, ["7899001"]),
        tag("7899003", A),
        tag("7899004", A),
        tag("7899005", A, [], new Date()),
        tag("7899001", B),
      ],
    });
    await prisma.stashStudio.createMany({
      data: [
        { id: STUDIO, stashInstanceId: A, name: "PF studio a" },
        {
          id: "7899202",
          stashInstanceId: A,
          name: "PF child a",
          parentId: STUDIO,
        },
        { id: STUDIO, stashInstanceId: B, name: "PF studio b" },
      ],
    });
    const stashIds = (id: string) =>
      JSON.stringify([{ endpoint: STASHDB, stash_id: id }]);
    await prisma.stashPerformer.createMany({
      data: [
        {
          id: P1,
          stashInstanceId: A,
          name: "PF one",
          disambiguation: "the first",
          country: "US",
          circumcised: "CUT",
          gender: "FEMALE",
          aliasList: JSON.stringify(["Alpha One", "A1"]),
          urls: JSON.stringify([
            "https://example.com/pf-one",
            "https://social.example/pf",
          ]),
          stashIds: stashIds("aaaa-1111"),
          imageCount: 5,
          galleryCount: 2,
        },
        {
          id: P2,
          stashInstanceId: A,
          name: "PF two",
          country: "DE",
          circumcised: "UNCUT",
          gender: "MALE",
          stashIds: "[]",
        },
        { id: P3, stashInstanceId: A, name: "PF three" },
        {
          id: P4,
          stashInstanceId: A,
          name: "PF four",
          disambiguation: "the first",
          country: "US",
          circumcised: "CUT",
          gender: "FEMALE",
          aliasList: JSON.stringify(["Alpha Four"]),
          urls: JSON.stringify(["https://example.com/pf-four"]),
          stashIds: stashIds("aaaa-1111"),
          imageCount: 3,
          galleryCount: 2,
        },
        {
          id: P1,
          stashInstanceId: B,
          name: "PF one b",
          gender: "MALE",
          stashIds: stashIds("aaaa-1111"),
          imageCount: 5,
        },
        { id: P2, stashInstanceId: B, name: "PF two b", gender: "" },
      ],
    });
    const performerTag = (performerId: string, tagId: string, inst = A) => ({
      performerId,
      performerInstanceId: inst,
      tagId,
      tagInstanceId: inst,
    });
    await prisma.performerTag.createMany({
      data: [
        performerTag(P1, "7899002"),
        performerTag(P1, "7899003"),
        performerTag(P2, "7899004"),
        performerTag(P2, "7899005"),
        performerTag(P3, "7899003"),
        performerTag(P4, "7899002"),
        performerTag(P1, "7899001", B),
      ],
    });
    await prisma.stashScene.createMany({
      data: [
        { id: S1, stashInstanceId: A, studioId: "7899202" },
        { id: S2, stashInstanceId: A, studioId: STUDIO },
        { id: S3, stashInstanceId: A },
        { id: S1, stashInstanceId: B, studioId: STUDIO },
      ],
    });
    const cast = (sceneId: string, performerId: string, inst = A) => ({
      sceneId,
      sceneInstanceId: inst,
      performerId,
      performerInstanceId: inst,
    });
    await prisma.scenePerformer.createMany({
      data: [
        cast(S1, P1),
        cast(S1, P2),
        cast(S2, P1),
        cast(S2, P3),
        cast(S3, P2),
        cast(S3, P3),
        cast(S3, P4),
        cast(S1, P1, B),
        cast(S1, P2, B),
      ],
    });
    const clip = (
      id: string,
      sceneId: string,
      inst = A,
      deletedAt: Date | null = null
    ) => ({
      id,
      stashInstanceId: inst,
      sceneId,
      sceneInstanceId: inst,
      seconds: 1,
      deletedAt,
    });
    await prisma.stashClip.createMany({
      data: [
        clip("7899401", S1),
        clip("7899402", S1),
        clip("7899403", S1, A, new Date()),
        clip("7899404", S2),
        clip("7899401", S1, B),
      ],
    });
    const excluded = (
      entityType: string,
      entityId: string,
      instanceId = A
    ) => ({
      userId: viewerId,
      entityType,
      entityId,
      instanceId,
      reason: "hidden",
    });
    await prisma.userExcludedEntity.createMany({
      data: [
        excluded("performer", P4),
        excluded("scene", S2),
        excluded("clip", "7899402"),
        excluded("tag", "7899003", ""),
      ],
    });
    await prisma.userExcludedContentCount.create({
      data: {
        userId: viewerId,
        entityType: "performer",
        entityId: P1,
        instanceId: A,
        images: 2,
      },
    });
    const favourite = (userId: number, tagId: string, instanceId = A) => ({
      userId,
      tagId,
      instanceId,
      favorite: true,
    });
    await prisma.tagRating.createMany({
      data: [
        favourite(viewerId, "7899001"),
        favourite(viewerId, "7899003"),
        favourite(otherId, "7899004"),
        favourite(otherId, "7899001", B),
      ],
    });
  });

  afterAll(removeRows);

  it("studios at depth -1 include the sub-studios' scenes; without a depth only the studio's own, and the viewer's hidden scene links nobody", async () => {
    const studio = `${STUDIO}:${A}`;
    expect(
      await listed({
        studios: { value: [studio], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([key(P1, A), key(P2, A)].sort());
    expect(
      await listed({ studios: { value: [studio], modifier: "INCLUDES" } })
    ).toEqual([]);
    expect(
      await listed({
        studios: { value: [`${STUDIO}:${B}`], modifier: "INCLUDES", depth: -1 },
      })
    ).toEqual([key(P1, B), key(P2, B)].sort());
    expect(
      await listed({
        studios: { value: [studio], modifier: "EXCLUDES", depth: -1 },
      })
    ).toEqual(without(key(P1, A), key(P2, A)));
  });

  it("disambiguation and country match the text; a hidden performer never shows", async () => {
    expect(
      await listed({ disambiguation: { value: "first", modifier: "INCLUDES" } })
    ).toEqual([key(P1, A)]);
    expect(await listed({ disambiguation: { modifier: "IS_NULL" } })).toEqual(
      without(key(P1, A))
    );
    expect(
      await listed({ country: { value: "us", modifier: "EQUALS" } })
    ).toEqual([key(P1, A)]);
    expect(
      await listed({ country: { value: "US", modifier: "NOT_EQUALS" } })
    ).toEqual(without(key(P1, A)));
  });

  it("circumcised takes any of its values, IS_NULL and NOT_NULL", async () => {
    expect(await listed({ circumcised: { value: ["CUT"] } })).toEqual([
      key(P1, A),
    ]);
    expect(await listed({ circumcised: { value: ["CUT", "UNCUT"] } })).toEqual(
      [key(P1, A), key(P2, A)].sort()
    );
    expect(await listed({ circumcised: { modifier: "IS_NULL" } })).toEqual(
      without(key(P1, A), key(P2, A))
    );
    expect(await listed({ circumcised: { modifier: "NOT_NULL" } })).toEqual(
      [key(P1, A), key(P2, A)].sort()
    );
  });

  it("gender takes any of its values or none of them, and IS_NULL and NOT_NULL; beta.7's EQUALS and NOT_EQUALS of one value read the same", async () => {
    // pf-a 7899101 FEMALE, 7899102 MALE, 7899103 none, 7899104 FEMALE but
    // hidden; pf-b 7899101 MALE, 7899102 an empty gender
    const females = [key(P1, A)];
    expect(await listed({ gender: { value: ["FEMALE"] } })).toEqual(females);
    expect(
      await listed({ gender: { value: "FEMALE", modifier: "EQUALS" } })
    ).toEqual(females);
    expect(
      await listed({
        gender: { value: ["FEMALE", "MALE"], modifier: "INCLUDES" },
      })
    ).toEqual([key(P1, A), key(P2, A), key(P1, B)].sort());
    // None of them keeps the performers without a gender, never the hidden one
    expect(
      await listed({ gender: { value: ["FEMALE"], modifier: "EXCLUDES" } })
    ).toEqual(without(key(P1, A)));
    expect(
      await listed({ gender: { value: "FEMALE", modifier: "NOT_EQUALS" } })
    ).toEqual(without(key(P1, A)));
    expect(
      await listed({ gender: { value: ["MALE"], modifier: "EXCLUDES" } })
    ).toEqual([key(P1, A), key(P3, A), key(P2, B)].sort());
    expect(await listed({ gender: { modifier: "IS_NULL" } })).toEqual(
      [key(P3, A), key(P2, B)].sort()
    );
    expect(await listed({ gender: { modifier: "NOT_NULL" } })).toEqual(
      [key(P1, A), key(P2, A), key(P1, B)].sort()
    );
  });

  it("aliases match one alias at a time, and IS_NULL lists the performers with none", async () => {
    expect(
      await listed({ aliases: { value: "alpha", modifier: "INCLUDES" } })
    ).toEqual([key(P1, A)]);
    expect(
      await listed({ aliases: { value: "a1", modifier: "EQUALS" } })
    ).toEqual([key(P1, A)]);
    // The list's JSON punctuation is never matched
    expect(
      await listed({ aliases: { value: '","', modifier: "INCLUDES" } })
    ).toEqual([]);
    expect(await listed({ aliases: { modifier: "IS_NULL" } })).toEqual(
      without(key(P1, A))
    );
  });

  it("url matches any of the performer's links", async () => {
    expect(
      await listed({ url: { value: "social.example", modifier: "INCLUDES" } })
    ).toEqual([key(P1, A)]);
    expect(
      await listed({ url: { value: "example.com", modifier: "EXCLUDES" } })
    ).toEqual(without(key(P1, A)));
    expect(await listed({ url: { modifier: "NOT_NULL" } })).toEqual([
      key(P1, A),
    ]);
  });

  it("stash_id EQUALS a StashDB id on any instance, IS_NULL and NOT_NULL", async () => {
    expect(
      await listed({ stash_id: { value: "AAAA-1111", modifier: "EQUALS" } })
    ).toEqual([key(P1, A), key(P1, B)].sort());
    expect(await listed({ stash_id: { modifier: "IS_NULL" } })).toEqual(
      without(key(P1, A), key(P1, B))
    );
    expect(await listed({ stash_id: { modifier: "NOT_NULL" } })).toEqual(
      [key(P1, A), key(P1, B)].sort()
    );
  });

  it("tag_count counts the live tags the viewer can see", async () => {
    // 7899101: tag 2 (tag 3 is hidden); 7899102: tag 4 (tag 5 is deleted)
    expect(
      await listed({ tag_count: { value: 1, modifier: "EQUALS" } })
    ).toEqual([key(P1, A), key(P2, A), key(P1, B)].sort());
    expect(
      await listed({ tag_count: { value: 0, modifier: "EQUALS" } })
    ).toEqual([key(P3, A), key(P2, B)].sort());
    expect(
      await listed({ tag_count: { value: 1, modifier: "GREATER_THAN" } })
    ).toEqual([]);
  });

  it("image_count and gallery_count are the counts the viewer sees", async () => {
    expect(
      await listed({ image_count: { value: 3, modifier: "EQUALS" } })
    ).toEqual([key(P1, A)]);
    expect(
      await listed({ image_count: { value: 5, modifier: "EQUALS" } })
    ).toEqual([key(P1, B)]);
    expect(
      await listed({ gallery_count: { value: 1, modifier: "GREATER_THAN" } })
    ).toEqual([key(P1, A)]);
  });

  it("marker_count counts the live clips the viewer can see in the scenes they can see", async () => {
    // 7899101 on pf-a: one live visible clip in 7899301; the hidden and the
    // deleted clip, and the clip of the hidden scene 7899302, do not count
    expect(
      await listed({ marker_count: { value: 1, modifier: "EQUALS" } })
    ).toEqual([key(P1, A), key(P2, A), key(P1, B), key(P2, B)].sort());
    expect(
      await listed({ marker_count: { value: 0, modifier: "EQUALS" } })
    ).toEqual([key(P3, A)]);
    expect(
      await listed({ marker_count: { value: 1, modifier: "GREATER_THAN" } })
    ).toEqual([]);
  });

  it("appears with lists the performers sharing a visible scene, never the performer itself", async () => {
    expect(await listed({ performers: { value: [`${P1}:${A}`] } })).toEqual([
      key(P2, A),
    ]);
    // 7899104 shares 7899303 but is hidden
    expect(await listed({ performers: { value: [`${P2}:${A}`] } })).toEqual(
      [key(P1, A), key(P3, A)].sort()
    );
    expect(
      await listed({
        performers: {
          value: [`${P1}:${A}`, `${P3}:${A}`],
          modifier: "INCLUDES_ALL",
        },
      })
    ).toEqual([key(P2, A)]);
    expect(
      await listed({
        performers: { value: [`${P1}:${A}`], modifier: "EXCLUDES" },
      })
    ).toEqual(without(key(P2, A)));
    // Excludes beside the values: with 7899102 but never with 7899103
    expect(
      await listed({
        performers: { value: [`${P2}:${A}`], excludes: [`${P3}:${A}`] },
      })
    ).toEqual([key(P1, A), key(P3, A)].sort());
    expect(await listed({ performers: { excludes: [`${P1}:${A}`] } })).toEqual(
      without(key(P2, A))
    );
    // The same id on the other instance is another performer
    expect(await listed({ performers: { value: [`${P1}:${B}`] } })).toEqual([
      key(P2, B),
    ]);
  });

  it("appears with a performer the viewer hid matches no one", async () => {
    expect(await listed({ performers: { value: [`${P4}:${A}`] } })).toEqual([]);
  });

  it("tag_favorite: a favourite tag or one under it; a hidden favourite, another user's and the same id on another instance never count", async () => {
    expect(await listed({ tag_favorite: true })).toEqual([key(P1, A)]);
    expect(await listed({ tag_favorite: false })).toEqual(without(key(P1, A)));
    // The other user's favourites are theirs: 7899004 on pf-a, 7899001 on pf-b
    expect(await listed({ tag_favorite: true }, otherId)).toEqual(
      [key(P2, A), key(P1, B)].sort()
    );
  });
});
