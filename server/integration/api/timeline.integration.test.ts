import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  findTestInstanceId,
  guestClient,
  selectAllInstances,
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
    /** The admin's instance selection before this block, put back after it */
    let savedSelection: string[];

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
      const selection = await adminClient.get<{
        selectedInstanceIds: string[];
      }>("/api/user/stash-instances");
      expect(selection.ok).toBe(true);
      savedSelection = selection.data.selectedInstanceIds;
      // Every instance selected, so a bare id means all of them
      await selectAllInstances();
    });

    afterAll(async () => {
      await adminClient.put("/api/user/stash-instances", {
        instanceIds: savedSelection,
      });
    });

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
});
