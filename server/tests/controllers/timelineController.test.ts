// server/tests/controllers/timelineController.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDateDistribution } from "../../controllers/timelineController.js";
import { ValidationError } from "../../middleware/errorHandler.js";
import { timelineService } from "../../services/TimelineService.js";
import { reqFor, resFor, testUser } from "../helpers/controllerTestUtils.js";
import { untrusted } from "../helpers/untrusted.js";

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
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
        allowedInstanceIds: ["inst-a"],
      });

      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      expect(timelineService.getDistribution).toHaveBeenCalledWith(
        "scene",
        1,
        ["inst-a"],
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
        allowedInstanceIds: ["inst-a"],
      });

      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      expect(timelineService.getDistribution).toHaveBeenCalledWith(
        "scene",
        1,
        ["inst-a"],
        "months",
        undefined
      );
    });

    it("passes each of the performer, tag, studio and group filters to the service", async () => {
      vi.mocked(timelineService.getDistribution).mockResolvedValue([]);

      const req = reqFor(getDateDistribution, {
        params: { entityType: "image" },
        query: {
          granularity: "days",
          performerId: "1:inst-a",
          tagId: "2:inst-a",
          studioId: "3:inst-a",
          groupId: "4:inst-a",
        },
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      await getDateDistribution(req, resFor(getDateDistribution));

      expect(timelineService.getDistribution).toHaveBeenCalledWith(
        "image",
        1,
        ["inst-a"],
        "days",
        {
          performerId: { id: "1", instanceId: "inst-a" },
          tagId: { id: "2", instanceId: "inst-a" },
          studioId: { id: "3", instanceId: "inst-a" },
          groupId: { id: "4", instanceId: "inst-a" },
        }
      );
    });

    it("passes req.allowedInstanceIds and the parsed refs to the service", async () => {
      vi.mocked(timelineService.getDistribution).mockResolvedValue([]);

      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: { performerId: "7", tagId: "9:inst-b" },
        user: testUser({ id: 3 }),
        allowedInstanceIds: ["inst-a", "inst-b"],
      });

      await getDateDistribution(req, resFor(getDateDistribution));

      expect(timelineService.getDistribution).toHaveBeenCalledWith(
        "scene",
        3,
        ["inst-a", "inst-b"],
        "months",
        {
          performerId: { id: "7", instanceId: undefined },
          tagId: { id: "9", instanceId: "inst-b" },
        }
      );
    });

    it.each([
      ["a malformed value", "not an id"],
      ["a repeated parameter", ["1", "2"]],
    ])("%s answers 400 naming the parameter", async (_name, value) => {
      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: { studioId: untrusted<string>(value) },
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      const error: unknown = await getDateDistribution(
        req,
        resFor(getDateDistribution)
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).issues).toEqual([
        { path: "studioId", message: "Expected an id or id:instanceId" },
      ]);
      expect(timelineService.getDistribution).not.toHaveBeenCalled();
    });

    it("a request with only one filter passes only that filter", async () => {
      vi.mocked(timelineService.getDistribution).mockResolvedValue([]);

      const req = reqFor(getDateDistribution, {
        params: { entityType: "gallery" },
        query: { tagId: "2:inst-a" },
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      await getDateDistribution(req, resFor(getDateDistribution));

      expect(timelineService.getDistribution).toHaveBeenCalledWith(
        "gallery",
        1,
        ["inst-a"],
        "months",
        { tagId: { id: "2", instanceId: "inst-a" } }
      );
    });

    it("returns 400 for invalid entity type", async () => {
      const req = reqFor(getDateDistribution, {
        params: { entityType: "invalid" },
        query: { granularity: "months" },
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
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
        allowedInstanceIds: ["inst-a"],
      });

      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid granularity" });
    });

    it("a database failure reaches the error handler", async () => {
      vi.mocked(timelineService.getDistribution).mockRejectedValue(
        new Error("Database connection failed")
      );

      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: { granularity: "months" },
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      const res = resFor(getDateDistribution);

      await expect(getDateDistribution(req, res)).rejects.toThrow(
        "Database connection failed"
      );
      expect(res.json).not.toHaveBeenCalled();
    });
  });
});
