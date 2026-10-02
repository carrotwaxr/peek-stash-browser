import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type { DateCriterion, ParsedFilter } from "../../types/parsedFilters.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient, findTestInstanceId } from "../helpers/testClient.js";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const CHICAGO = "America/Chicago";
const IN_CHICAGO = { headers: { "X-Peek-Time-Zone": CHICAGO } };

/** The calendar day an instant falls on in a zone, as YYYY-MM-DD */
function localDay(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: string) =>
    must(
      parts.find((p) => p.type === type),
      type
    ).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * Scene Date Filters Integration Tests
 *
 * Tests the date-related filters:
 * - date: Filter by scene date (when the scene was filmed/released)
 * - created_at: Filter by when the scene was added to Stash
 * - updated_at: Filter by when the scene was last updated in Stash
 * - last_played_at: Filter by when the user last played the scene
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      instanceId: string;
      title?: string;
      date?: string;
      created_at?: string;
      updated_at?: string;
      last_played_at?: string;
    }>;
    count: number;
  };
}

describe("Scene Date Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("date filter (scene date)", () => {
    it("filters scenes by date GREATER_THAN", async () => {
      // Get scenes from 2020 onwards
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            date: {
              value: "2020-01-01",
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by date LESS_THAN", async () => {
      // Get scenes before 2020
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            date: {
              value: "2020-01-01",
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by date BETWEEN", async () => {
      // Get scenes from 2022
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            date: {
              value: "2022-01-01",
              value2: "2022-12-31",
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by date NOT_BETWEEN", async () => {
      // Get scenes NOT from 2022
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            date: {
              value: "2022-01-01",
              value2: "2022-12-31",
              modifier: "NOT_BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by date IS_NULL", async () => {
      // Get scenes without a date set
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            date: {
              modifier: "IS_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by date NOT_NULL", async () => {
      // Get scenes with a date set
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            date: {
              modifier: "NOT_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    /**
     * CRITICAL TEST: Date BETWEEN must exclude items with NULL dates
     *
     * This test ensures the Timeline feature works correctly - when a user
     * selects a time period like "January 2024", only items WITH dates
     * within that range should be shown. Items without dates should NOT
     * appear in the filtered results.
     */
    it("date BETWEEN excludes scenes with NULL dates", async () => {
      // First, count scenes with NULL dates
      const nullDatesResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 1 },
          scene_filter: {
            date: { modifier: "IS_NULL" },
          },
        }
      );

      const scenesWithNullDates = nullDatesResponse.data.findScenes.count;

      // If there are no scenes with null dates, skip this test
      if (scenesWithNullDates === 0) {
        console.log(
          "Skipping NULL date exclusion test - no scenes with NULL dates in test data"
        );
        return;
      }

      // Now get scenes with BETWEEN filter - use very wide range to include all dated scenes
      const betweenResponse = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 100 },
          scene_filter: {
            date: {
              value: "2000-01-01",
              value2: "2099-12-31",
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(betweenResponse.ok).toBe(true);

      // CRITICAL: No scene in the BETWEEN results should have a NULL date
      for (const scene of betweenResponse.data.findScenes.scenes) {
        expect(scene.date).not.toBeNull();
        expect(scene.date).toBeDefined();
        expect(scene.date).toBeTruthy();
      }
    });
  });

  describe("created_at filter", () => {
    it("filters scenes by created_at GREATER_THAN", async () => {
      // Get scenes added in the last year
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateStr = oneYearAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            created_at: {
              value: dateStr,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by created_at LESS_THAN", async () => {
      // Get scenes added more than a year ago
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      const dateStr = oneYearAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            created_at: {
              value: dateStr,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by created_at BETWEEN", async () => {
      // Get scenes added in the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const today = new Date();

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            created_at: {
              value: sixMonthsAgo.toISOString().split("T")[0],
              value2: today.toISOString().split("T")[0],
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("updated_at filter", () => {
    it("filters scenes by updated_at GREATER_THAN", async () => {
      // Get recently updated scenes
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const dateStr = oneMonthAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            updated_at: {
              value: dateStr,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by updated_at BETWEEN", async () => {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const today = new Date();

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            updated_at: {
              value: threeMonthsAgo.toISOString().split("T")[0],
              value2: today.toISOString().split("T")[0],
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("last_played_at filter", () => {
    it("filters scenes by last_played_at GREATER_THAN", async () => {
      // Get scenes played recently
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const dateStr = oneWeekAgo.toISOString().split("T")[0];

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            last_played_at: {
              value: dateStr,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      // May return 0 if user hasn't played any scenes recently
      expect(response.data.findScenes.count).toBeGreaterThanOrEqual(0);
    });

    it("filters scenes by last_played_at IS_NULL (never played)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            last_played_at: {
              modifier: "IS_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("filters scenes by last_played_at NOT_NULL (has been played)", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            last_played_at: {
              modifier: "NOT_NULL",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });
  });

  describe("combined date filters", () => {
    it("can combine date with created_at filter", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            date: {
              value: "2021-01-01",
              modifier: "GREATER_THAN",
            },
            created_at: {
              value: "2022-01-01",
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("can combine all date filters", async () => {
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 50 },
          scene_filter: {
            date: {
              value: "2020-01-01",
              modifier: "GREATER_THAN",
            },
            created_at: {
              value: oneYearAgo.toISOString().split("T")[0],
              modifier: "GREATER_THAN",
            },
            updated_at: {
              value: oneYearAgo.toISOString().split("T")[0],
              modifier: "GREATER_THAN",
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
 * One day rule (item 43): a `YYYY-MM-DD` bound is a whole day, BETWEEN
 * includes both ends, and created, updated and last-played days are the
 * viewer's, in the zone the request names (`X-Peek-Time-Zone`), UTC without
 * one.
 */
describe("Scene date filters: the viewer's day", () => {
  /** The newest created scene on the test instance, as "id:instance" */
  let scene: { ref: string; createdAt: string; date: string | null };

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    const instanceId = await findTestInstanceId();
    const response = await adminClient.post<FindScenesResponse>(
      "/api/library/scenes",
      {
        filter: { per_page: 250, sort: "created_at", direction: "DESC" },
        scene_filter: { date: { modifier: "NOT_NULL" } },
      }
    );
    expect(response.ok, JSON.stringify(response.data)).toBe(true);
    const found = must(
      response.data.findScenes.scenes.find(
        (s) => s.instanceId === instanceId && s.created_at
      ),
      "a dated scene with a created time on the test instance"
    );
    scene = {
      ref: `${found.id}:${found.instanceId}`,
      createdAt: must(found.created_at, "created_at"),
      date: found.date ?? null,
    };
  });

  async function listsScene(
    sceneFilter: Record<string, unknown>,
    options?: { headers: Record<string, string> }
  ): Promise<boolean> {
    const response = await adminClient.post<FindScenesResponse>(
      "/api/library/scenes",
      {
        filter: { per_page: 10 },
        scene_filter: {
          ids: { value: [scene.ref], modifier: "INCLUDES" },
          ...sceneFilter,
        },
      },
      options
    );
    expect(response.ok, JSON.stringify(response.data)).toBe(true);
    return response.data.findScenes.scenes.some(
      (s) => `${s.id}:${s.instanceId}` === scene.ref
    );
  }

  it("a same-day created range lists the scenes created that local day", async () => {
    const day = localDay(scene.createdAt, CHICAGO);
    expect(
      await listsScene(
        { created_at: { modifier: "BETWEEN", value: day, value2: day } },
        IN_CHICAGO
      )
    ).toBe(true);
    expect(
      await listsScene(
        { created_at: { modifier: "EQUALS", value: day } },
        IN_CHICAGO
      )
    ).toBe(true);
  });

  it("a request without a time zone reads the day in UTC", async () => {
    const day = localDay(scene.createdAt, "UTC");
    expect(
      await listsScene({
        created_at: { modifier: "BETWEEN", value: day, value2: day },
      })
    ).toBe(true);
  });

  it("one-sided created ranges include their own day, and After leaves it out", async () => {
    const day = localDay(scene.createdAt, CHICAGO);
    expect(
      await listsScene(
        { created_at: { modifier: "BETWEEN", value: day } },
        IN_CHICAGO
      )
    ).toBe(true);
    expect(
      await listsScene(
        { created_at: { modifier: "BETWEEN", value2: day } },
        IN_CHICAGO
      )
    ).toBe(true);
    expect(
      await listsScene(
        { created_at: { modifier: "GREATER_THAN", value: day } },
        IN_CHICAGO
      )
    ).toBe(false);
  });

  it("a From date alone includes its own day", async () => {
    const date = must(scene.date, "the scene's date");
    // A full date, or a year or month Stash keeps, read as its first day
    const first = `${date}-01-01`.slice(0, 10);
    expect(
      await listsScene({ date: { modifier: "BETWEEN", value: first } })
    ).toBe(true);
    expect(
      await listsScene({ date: { modifier: "BETWEEN", value2: first } })
    ).toBe(true);
    expect(
      await listsScene({
        date: { modifier: "BETWEEN", value: first, value2: first },
      })
    ).toBe(true);
  });

  it("a carousel answers a same-day created range like the scene list", async () => {
    const day = localDay(scene.createdAt, CHICAGO);
    const preview = await adminClient.post<{
      scenes: Array<{ id: string; instanceId: string }>;
    }>(
      "/api/carousels/preview",
      {
        rules: {
          ids: { value: [scene.ref], modifier: "INCLUDES" },
          created_at: { modifier: "BETWEEN", value: day, value2: day },
        },
        sort: "created_at",
        direction: "DESC",
      },
      IN_CHICAGO
    );
    expect(preview.ok, JSON.stringify(preview.data)).toBe(true);
    expect(preview.data.scenes.map((s) => `${s.id}:${s.instanceId}`)).toEqual([
      scene.ref,
    ]);
  });
});

/**
 * Seeded scenes on two made-up instances that reuse ids, read through the
 * builder in process:
 * - sdf-a 7896001: created 2021-10-13T03:00Z (22:00 on 12 Oct in Chicago,
 *   13 Oct in UTC), dated 2021-10-12
 * - sdf-a 7896002: created 2021-10-12T12:00Z, dated `2021` (its 1 January);
 *   the viewer last played it 2021-10-13T02:00Z (12 Oct in Chicago)
 * - sdf-a 7896003: no created time, no date
 * - sdf-a 7896004: created 2021-10-12T15:00Z, dated 2021-10-12, hidden by
 *   the viewer
 * - sdf-b 7896001: created 2021-10-20T12:00Z, dated 2021-10-20
 * Another user played sdf-a 7896001 on 12 Oct. Every seeded row and both
 * users are deleted before the file ends.
 */
describeWithDb("Scene date filters (seeded)", () => {
  const A = "sdf-a";
  const B = "sdf-b";
  const VIEWER = "scene-date-filters-viewer";
  const OTHER = "scene-date-filters-other";
  let viewerId = 0;

  const scene = (
    id: string,
    instance: string,
    createdAt: string | null,
    date: string | null
  ) => ({
    id,
    stashInstanceId: instance,
    title: `SDF ${id} ${instance}`,
    stashCreatedAt: createdAt === null ? null : new Date(createdAt),
    stashUpdatedAt: createdAt === null ? null : new Date(createdAt),
    date,
  });

  async function removeRows(): Promise<void> {
    await prisma.user.deleteMany({
      where: { username: { in: [VIEWER, OTHER] } },
    });
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
  }

  /** The scenes a filter lists for the viewer, as sorted "id:instance" keys */
  async function listed(
    filter: ParsedFilter<"scene">,
    options: { timeZone?: string; applyExclusions?: boolean } = {}
  ): Promise<string[]> {
    const { items, total } = await sceneQueryBuilder.execute({
      userId: viewerId,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("scene", { perPage: 50, filter }),
      ...options,
    });
    expect(total).toBe(items.length);
    return items.map((s) => `${s.id}:${s.instanceId}`).sort();
  }

  const created = (criterion: DateCriterion, timeZone = CHICAGO) =>
    listed({ created_at: criterion }, { timeZone });

  beforeAll(async () => {
    await removeRows();
    await prisma.stashScene.createMany({
      data: [
        scene("7896001", A, "2021-10-13T03:00:00Z", "2021-10-12"),
        scene("7896002", A, "2021-10-12T12:00:00Z", "2021"),
        scene("7896003", A, null, null),
        scene("7896004", A, "2021-10-12T15:00:00Z", "2021-10-12"),
        scene("7896001", B, "2021-10-20T12:00:00Z", "2021-10-20"),
      ],
    });
    const viewer = await prisma.user.create({
      data: { username: VIEWER, password: "x", role: "USER" },
    });
    viewerId = viewer.id;
    const other = await prisma.user.create({
      data: { username: OTHER, password: "x", role: "USER" },
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: viewerId,
        entityType: "scene",
        entityId: "7896004",
        instanceId: A,
        reason: "hidden",
      },
    });
    await prisma.watchHistory.createMany({
      data: [
        {
          userId: viewerId,
          instanceId: A,
          sceneId: "7896002",
          playCount: 1,
          lastPlayedAt: new Date("2021-10-13T02:00:00Z"),
        },
        {
          userId: other.id,
          instanceId: A,
          sceneId: "7896001",
          playCount: 1,
          lastPlayedAt: new Date("2021-10-12T18:00:00Z"),
        },
      ],
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  const OCT_12: DateCriterion = {
    modifier: "BETWEEN",
    value: "2021-10-12",
    value2: "2021-10-12",
  };

  it("a same-day created range is the viewer's local day", async () => {
    expect(await created(OCT_12)).toEqual(["7896001:sdf-a", "7896002:sdf-a"]);
    // 7896001 was created on 13 Oct in UTC
    expect(await created(OCT_12, "UTC")).toEqual(["7896002:sdf-a"]);
    expect(
      await created({ modifier: "EQUALS", value: "2021-10-13" }, "UTC")
    ).toEqual(["7896001:sdf-a"]);
  });

  it("a request with no time zone reads the day in UTC", async () => {
    expect(await listed({ created_at: OCT_12 })).toEqual(["7896002:sdf-a"]);
  });

  it("a match on one instance never pulls the other's row of the same id", async () => {
    expect(await created({ modifier: "EQUALS", value: "2021-10-20" })).toEqual([
      "7896001:sdf-b",
    ]);
    expect(
      await listed({ date: { modifier: "EQUALS", value: "2021-10-12" } })
    ).toEqual(["7896001:sdf-a"]);
  });

  it("a scene the viewer hid is never listed under a created-date range", async () => {
    // Without the viewer's exclusions it would match
    expect(
      await listed(
        { created_at: OCT_12 },
        { timeZone: CHICAGO, applyExclusions: false }
      )
    ).toContain("7896004:sdf-a");
    const forms: DateCriterion[] = [
      OCT_12,
      { modifier: "BETWEEN", value: "2021-10-01", value2: undefined },
      { modifier: "BETWEEN", value: undefined, value2: "2021-10-31" },
      { modifier: "EQUALS", value: "2021-10-12" },
      { modifier: "NOT_EQUALS", value: "2021-10-20" },
      { modifier: "NOT_BETWEEN", value: "2021-10-20", value2: "2021-10-21" },
      { modifier: "LESS_THAN", value: "2021-10-20" },
      { modifier: "GREATER_THAN", value: "2021-10-01" },
      { modifier: "NOT_NULL" },
    ];
    for (const form of forms) {
      expect(await created(form), form.modifier).not.toContain("7896004:sdf-a");
    }
    expect(
      await listed({ date: { modifier: "NOT_NULL" } }, { timeZone: CHICAGO })
    ).not.toContain("7896004:sdf-a");
  });

  it("a scene without a created time matches no comparison, negatives included", async () => {
    expect(
      await created({ modifier: "NOT_EQUALS", value: "2021-10-12" })
    ).toEqual(["7896001:sdf-b"]);
    expect(
      await created({
        modifier: "NOT_BETWEEN",
        value: "2021-10-12",
        value2: "2021-10-12",
      })
    ).toEqual(["7896001:sdf-b"]);
    expect(await created({ modifier: "IS_NULL" })).toEqual(["7896003:sdf-a"]);
  });

  it("one-sided ranges include their own day", async () => {
    expect(
      await created({
        modifier: "BETWEEN",
        value: "2021-10-20",
        value2: undefined,
      })
    ).toEqual(["7896001:sdf-b"]);
    expect(
      await created({
        modifier: "BETWEEN",
        value: undefined,
        value2: "2021-10-12",
      })
    ).toEqual(["7896001:sdf-a", "7896002:sdf-a"]);
  });

  it("a scene date range covers a `YYYY` date's 1 January, and From alone its own day", async () => {
    expect(
      await listed({
        date: {
          modifier: "BETWEEN",
          value: "2021-01-01",
          value2: "2021-01-01",
        },
      })
    ).toEqual(["7896002:sdf-a"]);
    expect(
      await listed({
        date: { modifier: "BETWEEN", value: "2021-10-12", value2: undefined },
      })
    ).toEqual(["7896001:sdf-a", "7896001:sdf-b"]);
  });

  it("last played is the viewer's own play, on the viewer's local day", async () => {
    expect(
      await listed({ last_played_at: OCT_12 }, { timeZone: CHICAGO })
    ).toEqual(["7896002:sdf-a"]);
    // In UTC the play was on 13 Oct; the other user's play on 12 Oct never counts
    expect(await listed({ last_played_at: OCT_12 })).toEqual([]);
  });
});
