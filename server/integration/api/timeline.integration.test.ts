import { beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient, guestClient } from "../helpers/testClient.js";

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
});
