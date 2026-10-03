import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import {
  type Granularity,
  timelineService,
} from "../../services/TimelineService.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import { wholeDaySql } from "../../utils/sqlClauses.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { expectRefused } from "../helpers/refused.js";
import {
  TestClient,
  adminClient,
  findTestInstanceId,
  guestClient,
  restoreInstanceSelection,
  selectAllInstances,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

interface DistributionResponse {
  distribution: Array<{
    period: string;
    count: number;
  }>;
}

describe("Timeline API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("GET /api/timeline/:entityType/distribution", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.get(
        "/api/timeline/scene/distribution"
      );
      expect(response.status).toBe(401);
    });

    it("returns distribution for scenes with default granularity", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/scene/distribution"
      );
      expect(response.ok).toBe(true);
      expect(response.data.distribution).toBeDefined();
      expect(Array.isArray(response.data.distribution)).toBe(true);
    });

    it("returns distribution for galleries", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/gallery/distribution?granularity=years"
      );
      expect(response.ok).toBe(true);
      expect(response.data.distribution).toBeDefined();
    });

    it("returns distribution for images", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/image/distribution?granularity=days"
      );
      expect(response.ok).toBe(true);
      expect(response.data.distribution).toBeDefined();
    });

    it("returns 400 for invalid entity type", async () => {
      const response = await adminClient.get(
        "/api/timeline/invalid/distribution"
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid granularity", async () => {
      const response = await adminClient.get(
        "/api/timeline/scene/distribution?granularity=invalid"
      );
      expect(response.status).toBe(400);
    });

    it("distribution items have period and count", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/scene/distribution?granularity=months"
      );
      expect(response.ok).toBe(true);

      // The library has dated scenes
      const item = must(response.data.distribution[0], "a distribution item");
      expect(item.period).toBeDefined();
      expect(typeof item.period).toBe("string");
      expect(item.count).toBeDefined();
      expect(typeof item.count).toBe("number");
    });
  });

  /**
   * The detail pages send "id:instanceId" (item 34b, UD-04): the timeline on
   * a performer's or studio's page filters by the pair. A bare id matches the
   * entity with that id on every instance; the second library of a
   * multi-instance run reuses the test library's ids, so there the bare id's
   * bars count both libraries
   */
  describe("filters by instance-qualified id", () => {
    /** An instance no server has: its composite ids must match nothing */
    const OTHER_INSTANCE = "timeline-other-instance";
    /** Each entity type's filter and a subject with dated entities */
    const CASES = [
      ["scene", "performerId", TEST_ENTITIES.performerWithScenes],
      ["scene", "studioId", TEST_ENTITIES.studioWithScenes],
      ["image", "performerId", TEST_ENTITIES.performerWithScenes],
    ] as const;
    type Bars = DistributionResponse["distribution"];
    let instanceId: string;
    /** Every configured instance: the test one, and the second if added */
    let instanceIds: string[];

    /** `id:instanceId` as the query string carries it */
    const pair = (id: string, instance: string): string =>
      encodeURIComponent(`${id}:${instance}`);

    /** Bars added period by period, in period order as the server sends them */
    const sumBars = (lists: Bars[]): Bars => {
      const counts = new Map<string, number>();
      for (const { period, count } of lists.flat()) {
        counts.set(period, (counts.get(period) ?? 0) + count);
      }
      return [...counts]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([period, count]) => ({ period, count }));
    };

    const total = (bars: Bars): number =>
      bars.reduce((sum, bar) => sum + bar.count, 0);

    beforeAll(async () => {
      instanceId = await findTestInstanceId();
      const instances = await adminClient.get<{
        instances: Array<{ id: string }>;
      }>("/api/setup/stash-instances");
      expect(instances.ok).toBe(true);
      instanceIds = instances.data.instances.map((i) => i.id);
      // Every instance selected, so a bare id means all of them
      await selectAllInstances();
    });

    afterAll(restoreInstanceSelection);

    async function distribution(
      entityType: string,
      query: string
    ): Promise<Bars> {
      const path = `/api/timeline/${entityType}/distribution?granularity=years&${query}`;
      const response = await adminClient.get<DistributionResponse>(path);
      expect(response.status, path).toBe(200);
      return response.data.distribution;
    }

    it("GET /api/timeline/scene/distribution?performerId=<id>:<instance> returns bars", async () => {
      const bars = await distribution(
        "scene",
        `performerId=${pair(TEST_ENTITIES.performerWithScenes, instanceId)}`
      );
      expect(bars.length).toBeGreaterThan(0);
    });

    it.each(CASES)(
      "%s bars by %s: each pair counts its own instance, the bare id every instance",
      async (entityType, filter, id) => {
        const bare = await distribution(entityType, `${filter}=${id}`);
        const own = await distribution(
          entityType,
          `${filter}=${pair(id, instanceId)}`
        );
        const others = await Promise.all(
          instanceIds
            .filter((other) => other !== instanceId)
            .map((other) =>
              distribution(entityType, `${filter}=${pair(id, other)}`)
            )
        );
        expect(own.length).toBeGreaterThan(0);
        // With one instance configured, the bare id's bars are the pair's
        expect(bare).toEqual(sumBars([own, ...others]));
        // The pair leaves out another instance's entity with the same id: the
        // bare id counts more exactly when another instance has matching rows
        expect(
          total(bare) > total(own),
          `bare ${total(bare)}, pair ${total(own)}`
        ).toBe(others.some((bars) => bars.length > 0));
      }
    );

    // A gallery page's Images and Scenes tabs: the fixture's galleries hold
    // only undated images and scenes, so their bars are empty where the
    // library's are not (an ignored filter would answer the library's)
    it.each([
      ["image", TEST_ENTITIES.galleryWithImages],
      ["scene", TEST_ENTITIES.galleryWithScenes],
    ] as const)(
      "%s bars by galleryId count the gallery's own, not the library's",
      async (entityType, id) => {
        const library = await distribution(entityType, "");
        const gallery = await distribution(
          entityType,
          `galleryId=${pair(id, instanceId)}`
        );
        expect(library.length).toBeGreaterThan(0);
        expect(gallery).toEqual([]);
      }
    );

    it.each(CASES)(
      "%s bars by %s on another instance are empty",
      async (entityType, filter, id) => {
        const bars = await distribution(
          entityType,
          `${filter}=${pair(id, OTHER_INSTANCE)}`
        );
        expect(bars).toEqual([]);
      }
    );
  });

  /**
   * The bars count what the viewer's selected, synced instances hold (item
   * 35): the second library reuses the test library's ids, so a total that
   * includes it differs from the test instance's own
   */
  describe("counts only the viewer's instances", () => {
    const path = "/api/timeline/scene/distribution?granularity=years";
    type Bars = DistributionResponse["distribution"];

    const total = (bars: Bars): number =>
      bars.reduce((sum, bar) => sum + bar.count, 0);

    async function scenesBars(): Promise<Bars> {
      const response = await adminClient.get<DistributionResponse>(path);
      expect(response.status).toBe(200);
      return response.data.distribution;
    }

    afterAll(restoreInstanceSelection);

    it("with only the test instance selected, the scene bars' total is the test instance's dated live scenes", async () => {
      const instanceId = await selectTestInstanceOnly();
      const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*) AS n FROM StashScene
         WHERE stashInstanceId = ? AND deletedAt IS NULL
           AND ${wholeDaySql("date")} LIKE '____-__-__' AND date NOT LIKE '-%'`,
        instanceId
      );
      const expected = Number(must(rows[0], "a count row").n);
      expect(expected).toBeGreaterThan(0);

      expect(total(await scenesBars())).toBe(expected);
    });

    it("a second instance on its first sync adds no bar", async () => {
      const instanceId = await selectTestInstanceOnly();
      const testOnly = await scenesBars();

      const instances = await prisma.stashInstance.findMany({
        where: { id: { not: instanceId } },
        select: { id: true, firstSyncedAt: true },
      });
      const second = must(instances[0], "a second instance");
      await selectAllInstances();
      await prisma.stashInstance.update({
        where: { id: second.id },
        data: { firstSyncedAt: null },
      });
      try {
        expect(await scenesBars()).toEqual(testOnly);
      } finally {
        await prisma.stashInstance.update({
          where: { id: second.id },
          data: { firstSyncedAt: second.firstSyncedAt },
        });
      }
    });

    it.each(["performerId", "tagId", "studioId", "groupId"])(
      "a malformed %s answers 400 naming it",
      async (filter) => {
        const response = await adminClient.get(
          `${path}&${filter}=not%20an%20id`
        );
        expectRefused(response, [filter]);
      }
    );

    it("a repeated performerId answers 400 naming it", async () => {
      const response = await adminClient.get(
        `${path}&performerId=1&performerId=2`
      );
      expectRefused(response, ["performerId"]);
    });
  });
  /**
   * The bars count what the list shows (C12, UD-09): the POST takes the
   * list's own request (`filter: { q }`, `<entity>_filter`, `ids`) plus
   * `granularity`, and counts through the list builder, so a bar's total is
   * the grid's for the same body (the grid's dated rows: every replay date
   * is a whole day, so NOT_NULL on `date` is the bars' rows)
   */
  describe("POST /api/timeline/:entityType/distribution", () => {
    type Bars = DistributionResponse["distribution"];
    let instanceId: string;

    const total = (bars: Bars): number =>
      bars.reduce((sum, bar) => sum + bar.count, 0);

    async function bars(
      body: Record<string, unknown>,
      client: TestClient = adminClient,
      headers: Record<string, string> = {}
    ): Promise<Bars> {
      const response = await client.post<DistributionResponse>(
        "/api/timeline/scene/distribution",
        { granularity: "years", ...body },
        { headers }
      );
      expect(response.status, JSON.stringify(response.data)).toBe(200);
      return response.data.distribution;
    }

    /** The scene grid's total for the same body, its dated rows */
    async function gridTotal(
      body: { filter?: object; scene_filter?: object; ids?: string[] },
      client: TestClient = adminClient,
      headers: Record<string, string> = {}
    ): Promise<number> {
      const response = await client.post<{ findScenes: { count: number } }>(
        "/api/library/scenes",
        {
          ...body,
          filter: { ...body.filter, per_page: 1 },
          scene_filter: {
            ...body.scene_filter,
            date: { modifier: "NOT_NULL" },
          },
        },
        { headers }
      );
      expect(response.status, JSON.stringify(response.data)).toBe(200);
      return response.data.findScenes.count;
    }

    beforeAll(async () => {
      instanceId = await findTestInstanceId();
      await selectAllInstances();
    });

    afterAll(restoreInstanceSelection);

    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post(
        "/api/timeline/scene/distribution",
        {}
      );
      expect(response.status).toBe(401);
    });

    it("a tag page's bars count scenes that inherit the tag", async () => {
      const tag = `${TEST_ENTITIES.tagWithEntities}:${instanceId}`;
      const body = {
        scene_filter: { tags: { value: [tag], modifier: "INCLUDES" } },
      };
      // The tag's dated scenes all hold it by inheritance (from a performer,
      // studio or collection): the old bars, on SceneTag alone, were 0
      const direct = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*) AS n FROM SceneTag st
         JOIN StashScene s ON s.id = st.sceneId AND s.stashInstanceId = st.sceneInstanceId
         WHERE st.tagId = ? AND st.tagInstanceId = ? AND s.deletedAt IS NULL
           AND s.date LIKE '____-__-__'`,
        TEST_ENTITIES.tagWithEntities,
        instanceId
      );
      const inherited = total(await bars(body));

      expect(inherited).toBe(await gridTotal(body));
      expect(inherited).toBeGreaterThan(
        Number(must(direct[0], "a count row").n)
      );
    });

    it("the bars apply a panel filter and the search text", async () => {
      const body = {
        filter: { q: "10002" },
        scene_filter: { rating100: { modifier: "IS_NULL" } },
      };
      const filtered = total(await bars(body));

      expect(filtered).toBe(await gridTotal(body));
      expect(filtered).toBeGreaterThan(0);
      expect(filtered).toBeLessThan(total(await bars({})));
    });

    it("the bars read a created filter's days in the viewer's zone, as the list does", async () => {
      // A dated scene created late enough in a UTC day that Los Angeles
      // still has the day before
      const rows = await prisma.$queryRawUnsafe<
        Array<{ id: string; created: bigint | number }>
      >(
        `SELECT id, CAST(stashCreatedAt AS INTEGER) AS created FROM StashScene
         WHERE stashInstanceId = ? AND deletedAt IS NULL
           AND date LIKE '____-__-__' AND stashCreatedAt IS NOT NULL
         ORDER BY id`,
        instanceId
      );
      const dayIn = (ms: number, timeZone: string): string =>
        new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(ms));
      const scene = rows.find(
        (row) =>
          dayIn(Number(row.created), "UTC") !==
          dayIn(Number(row.created), "America/Los_Angeles")
      );
      expect(
        scene,
        "a scene created on different days in UTC and Los Angeles"
      ).toBeDefined();
      const { id, created } = must(scene, "the scene");
      const day = dayIn(Number(created), "UTC");
      const body = {
        ids: [`${id}:${instanceId}`],
        scene_filter: { created_at: { value: day, modifier: "EQUALS" } },
      };
      const la = { "X-Peek-Time-Zone": "America/Los_Angeles" };

      expect(total(await bars(body))).toBe(1);
      expect(await gridTotal(body)).toBe(1);
      expect(total(await bars(body, adminClient, la))).toBe(0);
      expect(await gridTotal(body, adminClient, la)).toBe(0);
    });

    it("the GET with tagId gives the same bars as the POST with scene_filter.tags", async () => {
      const tag = `${TEST_ENTITIES.tagWithEntities}:${instanceId}`;
      const response = await adminClient.get<DistributionResponse>(
        `/api/timeline/scene/distribution?granularity=years&tagId=${encodeURIComponent(tag)}`
      );
      expect(response.status).toBe(200);
      const viaPost = await bars({
        scene_filter: { tags: { value: [tag], modifier: "INCLUDES" } },
      });

      expect(viaPost.length).toBeGreaterThan(0);
      expect(response.data.distribution).toEqual(viaPost);
    });

    it("the GET with no entity parameter gives the unfiltered bars", async () => {
      const response = await adminClient.get<DistributionResponse>(
        "/api/timeline/scene/distribution?granularity=years"
      );
      expect(response.status).toBe(200);
      expect(response.data.distribution).toEqual(await bars({}));
    });

    it("a disabled instance's scenes are not counted", async () => {
      await selectTestInstanceOnly();
      const testOnly = await bars({});
      await selectAllInstances();
      const all = await bars({});
      const second = must(
        await prisma.stashInstance.findFirst({
          where: { id: { not: instanceId } },
          select: { id: true, enabled: true },
        }),
        "a second instance"
      );
      // The second library has dated scenes, so it adds to the bars
      expect(total(all)).toBeGreaterThan(total(testOnly));

      await prisma.stashInstance.update({
        where: { id: second.id },
        data: { enabled: false },
      });
      try {
        expect(await bars({})).toEqual(testOnly);
      } finally {
        await prisma.stashInstance.update({
          where: { id: second.id },
          data: { enabled: second.enabled },
        });
      }
    });

    it("an unknown granularity answers 400 naming it", async () => {
      const response = await adminClient.post(
        "/api/timeline/scene/distribution",
        { granularity: "fortnights" }
      );
      expectRefused(response, ["granularity"]);
    });

    it("an unknown filter field answers the list parser's 400 naming its path", async () => {
      const response = await adminClient.post(
        "/api/timeline/scene/distribution",
        { scene_filter: { nope: { value: 1 } } }
      );
      expectRefused(response, ["scene_filter.nope"]);
    });

    /** A throwaway viewer who hides one dated scene (invariant 3) */
    describe("the bars skip excluded scenes", () => {
      const username = "timeline_hide_user";
      const password = "timeline_password_123";
      const viewer = new TestClient();
      let userId: number | undefined;

      beforeAll(async () => {
        const created = await adminClient.post<{ user?: { id: number } }>(
          "/api/user/create",
          { username, password, role: "USER" }
        );
        expect(created.ok, JSON.stringify(created.data)).toBe(true);
        userId = must(created.data.user, "the created user").id;
        await viewer.login(username, password);
      });

      afterAll(async () => {
        if (userId !== undefined)
          await adminClient.delete(`/api/user/${userId}`);
      });

      it("a hidden scene leaves its year's bar and the grid alike", async () => {
        const dated = must(
          await prisma.stashScene.findFirst({
            where: {
              stashInstanceId: instanceId,
              deletedAt: null,
              date: { not: null },
            },
            select: { id: true, date: true },
            orderBy: { id: "asc" },
          }),
          "a dated scene"
        );
        const year = must(dated.date, "its date").slice(0, 4);
        const before = await bars({}, viewer);
        expect(total(before)).toBe(await gridTotal({}, viewer));

        const hidden = await viewer.post("/api/user/hidden-entities", {
          entityType: "scene",
          entityId: dated.id,
          instanceId,
        });
        expect(hidden.ok, JSON.stringify(hidden.data)).toBe(true);

        const after = await bars({}, viewer);
        const countIn = (list: Bars) =>
          list.find((bar) => bar.period === year)?.count ?? 0;
        expect(total(after)).toBe(total(before) - 1);
        expect(countIn(after)).toBe(countIn(before) - 1);
        expect(total(after)).toBe(await gridTotal({}, viewer));
        // Filtered by the scene's own id, nothing is left
        expect(
          await bars({ ids: [`${dated.id}:${instanceId}`] }, viewer)
        ).toEqual([]);
      }, 30_000);
    });
  });

  /**
   * Partial dates (`YYYY`, `YYYY-MM`) as the grid places them: on their
   * first day. Seeded under a made-up instance and counted in process; every
   * row is deleted.
   */
  describe("the bars place partial dates on their first day, as the grid does", () => {
    const INSTANCE = "tl-partial";
    const DATES: Record<string, string> = {
      "1": "2019",
      "2": "2019-03",
      "3": "2019-03-15",
      "4": "2019-01-01",
    };
    const options = {
      userId: 0,
      allowedInstanceIds: [INSTANCE],
      timeZone: "UTC",
    };

    beforeAll(async () => {
      await prisma.stashScene.createMany({
        data: Object.entries(DATES).map(([id, date]) => ({
          id,
          stashInstanceId: INSTANCE,
          date,
        })),
      });
    });

    afterAll(async () => {
      await prisma.stashScene.deleteMany({
        where: { stashInstanceId: INSTANCE },
      });
    });

    const barsBy = (granularity: Granularity) =>
      timelineService.getDistribution("scene", parsedListRequest("scene"), {
        ...options,
        granularity,
      });

    const gridOn = (day: string) =>
      sceneQueryBuilder.count({
        ...options,
        applyExclusions: false,
        request: parsedListRequest("scene", {
          filter: { date: { modifier: "EQUALS", value: day } },
        }),
      });

    it("a YYYY and a YYYY-MM date each count in their first day's bar", async () => {
      expect(await barsBy("years")).toEqual([{ period: "2019", count: 4 }]);
      expect(await barsBy("months")).toEqual([
        { period: "2019-01", count: 2 },
        { period: "2019-03", count: 2 },
      ]);
      expect(await barsBy("days")).toEqual([
        { period: "2019-01-01", count: 2 },
        { period: "2019-03-01", count: 1 },
        { period: "2019-03-15", count: 1 },
      ]);
    });

    it("each day's bar counts what that day's grid lists", async () => {
      for (const bar of await barsBy("days")) {
        expect(await gridOn(bar.period), bar.period).toBe(bar.count);
      }
    });
  });
});
