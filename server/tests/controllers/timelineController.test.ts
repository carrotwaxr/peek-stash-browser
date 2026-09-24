// server/tests/controllers/timelineController.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDateDistribution } from "../../controllers/timelineController.js";
import { timelineService } from "../../services/TimelineService.js";
import { reqFor, resFor, testUser } from "../helpers/controllerTestUtils.js";

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getDefaultConfig: vi.fn().mockReturnValue({
      id: "test-instance",
      name: "Test Stash",
      url: "http://localhost:9999/graphql",
      apiKey: "test-api-key",
    }),
    getAllConfigs: vi.fn().mockReturnValue([]),
    loadFromDatabase: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../services/TimelineService.js", () => ({
  timelineService: {
    getDistribution: vi.fn(),
  },
}));

describe("timelineController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDateDistribution", () => {
    it("returns distribution for valid entity type and granularity", async () => {
      const mockDistribution = [
        { period: "2024-01", count: 47 },
        { period: "2024-02", count: 12 },
      ];
      vi.mocked(timelineService.getDistribution).mockResolvedValue(
        mockDistribution
      );

      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: { granularity: "months" },
        user: testUser({ id: 1 }),
      });

      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      expect(timelineService.getDistribution).toHaveBeenCalledWith(
        "scene",
        1,
        "months",
        undefined
      );
      expect(res.json).toHaveBeenCalledWith({ distribution: mockDistribution });
    });

    it("defaults granularity to months if not provided", async () => {
      vi.mocked(timelineService.getDistribution).mockResolvedValue([]);

      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: {},
        user: testUser({ id: 1 }),
      });

      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      expect(timelineService.getDistribution).toHaveBeenCalledWith(
        "scene",
        1,
        "months",
        undefined
      );
    });

    it("returns 400 for invalid entity type", async () => {
      const req = reqFor(getDateDistribution, {
        params: { entityType: "invalid" },
        query: { granularity: "months" },
        user: testUser({ id: 1 }),
      });

      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid entity type" });
    });

    it("returns 400 for invalid granularity", async () => {
      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: { granularity: "invalid" },
        user: testUser({ id: 1 }),
      });

      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid granularity" });
    });

    it("returns 500 when service throws an error", async () => {
      vi.mocked(timelineService.getDistribution).mockRejectedValue(
        new Error("Database connection failed")
      );

      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: { granularity: "months" },
        user: testUser({ id: 1 }),
      });

      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to fetch date distribution",
      });
    });
  });
});
