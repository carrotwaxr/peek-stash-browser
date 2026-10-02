// server/tests/controllers/timelineController.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDateDistribution,
  postDateDistribution,
} from "../../controllers/timelineController.js";
import { ValidationError } from "../../middleware/errorHandler.js";
import { timelineService } from "../../services/TimelineService.js";
import { reqFor, resFor, testUser } from "../helpers/controllerTestUtils.js";
import { must } from "../helpers/must.js";
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

/** What a refused request's error names */
async function refusal(run: () => Promise<void>): Promise<string[]> {
  const error: unknown = await run().catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ValidationError);
  return ((error as ValidationError).issues ?? []).map((issue) => issue.path);
}

const service = vi.mocked(timelineService, true);

/** The service call's arguments */
function serviceCall() {
  return must(service.getDistribution.mock.calls[0], "a getDistribution call");
}

describe("timelineController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(timelineService.getDistribution).mockResolvedValue([]);
  });

  /**
   * The list's own request (C12): the bars count what the grid shows, so
   * the body is the list's, parsed by the list's parser, plus `granularity`
   */
  describe("postDateDistribution", () => {
    it("parses the body as the list's request and passes the viewer, instances, zone and granularity", async () => {
      const bars = [{ period: "2024-W12", count: 4 }];
      vi.mocked(timelineService.getDistribution).mockResolvedValue(bars);
      const req = reqFor(postDateDistribution, {
        params: { entityType: "scene" },
        body: {
          granularity: "weeks",
          filter: { q: "beach", page: 3, sort: "title" },
          scene_filter: {
            tags: { value: ["7:inst-a"], modifier: "INCLUDES" },
            rating100: { value: 60, modifier: "GREATER_THAN" },
          },
        },
        user: testUser({ id: 5 }),
        allowedInstanceIds: ["inst-a", "inst-b"],
        timeZone: "America/Los_Angeles",
      });
      const res = resFor(postDateDistribution);

      await postDateDistribution(req, res);

      const [entity, request, options] = serviceCall();
      expect(entity).toBe("scene");
      expect(request.q).toBe("beach");
      expect(request.filter).toEqual({
        tags: {
          refs: [{ id: "7", instanceId: "inst-a" }],
          modifier: "INCLUDES",
          depth: 0,
        },
        rating100: { value: 60, modifier: "GREATER_THAN" },
      });
      expect(options).toEqual({
        userId: 5,
        allowedInstanceIds: ["inst-a", "inst-b"],
        timeZone: "America/Los_Angeles",
        granularity: "weeks",
      });
      expect(res.json).toHaveBeenCalledWith({ distribution: bars });
    });

    it("an empty body is the unfiltered list by months", async () => {
      const req = reqFor(postDateDistribution, {
        params: { entityType: "image" },
        body: {},
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
        timeZone: "UTC",
      });

      await postDateDistribution(req, resFor(postDateDistribution));

      const [entity, request, options] = serviceCall();
      expect(entity).toBe("image");
      expect(request.filter).toEqual({});
      expect(request.q).toBeUndefined();
      expect(options).toEqual({
        userId: 1,
        allowedInstanceIds: ["inst-a"],
        timeZone: "UTC",
        granularity: "months",
      });
    });

    it("an unknown granularity is a 400 naming it", async () => {
      const req = reqFor(postDateDistribution, {
        params: { entityType: "scene" },
        body: untrusted({ granularity: "fortnights" }),
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      expect(
        await refusal(() =>
          postDateDistribution(req, resFor(postDateDistribution))
        )
      ).toEqual(["granularity"]);
      expect(timelineService.getDistribution).not.toHaveBeenCalled();
    });

    it("an unknown filter field is the list parser's 400 naming its path", async () => {
      const req = reqFor(postDateDistribution, {
        params: { entityType: "gallery" },
        body: untrusted({ gallery_filter: { nope: { value: 1 } } }),
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      expect(
        await refusal(() =>
          postDateDistribution(req, resFor(postDateDistribution))
        )
      ).toEqual(["gallery_filter.nope"]);
      expect(timelineService.getDistribution).not.toHaveBeenCalled();
    });

    it("another list's filter body is refused", async () => {
      const req = reqFor(postDateDistribution, {
        params: { entityType: "image" },
        body: untrusted({ scene_filter: {} }),
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      expect(
        await refusal(() =>
          postDateDistribution(req, resFor(postDateDistribution))
        )
      ).toEqual(["scene_filter"]);
    });

    it("an unknown entity type is a 400 naming it", async () => {
      const req = reqFor(postDateDistribution, {
        params: { entityType: "performer" },
        body: {},
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      expect(
        await refusal(() =>
          postDateDistribution(req, resFor(postDateDistribution))
        )
      ).toEqual(["entityType"]);
    });
  });

  /**
   * The documented GET stays (lead resolution 6): one entity parameter
   * each, mapped onto the list request's ref criteria (INCLUDES, depth 0)
   * and counted by the same path as the POST
   */
  describe("getDateDistribution", () => {
    it("maps each entity parameter onto the list's ref criterion", async () => {
      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: {
          granularity: "days",
          performerId: "1:inst-a",
          tagId: "2",
          studioId: "3:inst-a",
          groupId: "4:inst-a",
          galleryId: "5:inst-a",
        },
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
        timeZone: "Asia/Tokyo",
      });

      await getDateDistribution(req, resFor(getDateDistribution));

      const [entity, request, options] = serviceCall();
      expect(entity).toBe("scene");
      const include = (id: string, instanceId?: string) => ({
        refs: [{ id, instanceId }],
        modifier: "INCLUDES",
        depth: 0,
      });
      expect(request.filter).toEqual({
        performers: include("1", "inst-a"),
        tags: include("2"),
        studios: include("3", "inst-a"),
        groups: include("4", "inst-a"),
        galleries: include("5", "inst-a"),
      });
      expect(options).toEqual({
        userId: 1,
        allowedInstanceIds: ["inst-a"],
        timeZone: "Asia/Tokyo",
        granularity: "days",
      });
    });

    it("with no parameter counts the unfiltered list by months", async () => {
      const bars = [{ period: "2024-01", count: 47 }];
      vi.mocked(timelineService.getDistribution).mockResolvedValue(bars);
      const req = reqFor(getDateDistribution, {
        params: { entityType: "scene" },
        query: {},
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });
      const res = resFor(getDateDistribution);

      await getDateDistribution(req, res);

      const [, request, options] = serviceCall();
      expect(request.filter).toEqual({});
      expect(options.granularity).toBe("months");
      expect(res.json).toHaveBeenCalledWith({ distribution: bars });
    });

    it("ignores a parameter the entity type has no field for, as before", async () => {
      const req = reqFor(getDateDistribution, {
        params: { entityType: "gallery" },
        query: { groupId: "4:inst-a", galleryId: "5:inst-a", tagId: "2" },
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      await getDateDistribution(req, resFor(getDateDistribution));

      const [, request] = serviceCall();
      expect(Object.keys(request.filter)).toEqual(["tags"]);
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

      expect(
        await refusal(() =>
          getDateDistribution(req, resFor(getDateDistribution))
        )
      ).toEqual(["studioId"]);
      expect(timelineService.getDistribution).not.toHaveBeenCalled();
    });

    it.each([
      ["entityType", { entityType: "invalid" }, {}],
      ["granularity", { entityType: "scene" }, { granularity: "invalid" }],
    ])("an unknown %s is a 400 naming it", async (path, params, query) => {
      const req = reqFor(getDateDistribution, {
        params,
        query,
        user: testUser({ id: 1 }),
        allowedInstanceIds: ["inst-a"],
      });

      expect(
        await refusal(() =>
          getDateDistribution(req, resFor(getDateDistribution))
        )
      ).toEqual([path]);
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
