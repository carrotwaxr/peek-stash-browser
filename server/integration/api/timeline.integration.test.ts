import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  guestClient,
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
   * a performer's or studio's page filters by the pair
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
    let instanceId: string;

    /** `id:instanceId` as the query string carries it */
    const pair = (id: string, instance: string): string =>
      encodeURIComponent(`${id}:${instance}`);

    beforeAll(async () => {
      instanceId = await selectTestInstanceOnly();
    });

    afterAll(async () => {
      await selectAllInstances();
    });

    async function distribution(
      entityType: string,
      query: string
    ): Promise<DistributionResponse["distribution"]> {
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
      "%s bars by %s: the bare id returns the same bars as the pair",
      async (entityType, filter, id) => {
        const bare = await distribution(entityType, `${filter}=${id}`);
        const composite = await distribution(
          entityType,
          `${filter}=${pair(id, instanceId)}`
        );
        expect(bare.length).toBeGreaterThan(0);
        expect(composite).toEqual(bare);
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
