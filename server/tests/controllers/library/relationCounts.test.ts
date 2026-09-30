/**
 * The detail pages' counts handler (B19): the query it takes, the 404 for an
 * entity the viewer cannot see, and the counts it answers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGalleryCounts } from "../../../controllers/library/galleries.js";
import { getGroupCounts } from "../../../controllers/library/groups.js";
import { getPerformerCounts } from "../../../controllers/library/performers.js";
import { getStudioCounts } from "../../../controllers/library/studios.js";
import { getTagCounts } from "../../../controllers/library/tags.js";
import {
  NotFoundError,
  ValidationError,
} from "../../../middleware/errorHandler.js";
import { canUserAccessEntity } from "../../../services/EntityAccessService.js";
import { countRelations } from "../../../services/RelationCounts.js";
import {
  malformed,
  reqFor,
  resFor,
  testUser,
} from "../../helpers/controllerTestUtils.js";
import { must } from "../../helpers/must.js";

vi.mock("../../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn(),
}));
vi.mock("../../../services/RelationCounts.js", () => ({
  countRelations: vi.fn(),
}));

const mockAccess = vi.mocked(canUserAccessEntity);
const mockCount = vi.mocked(countRelations);

const user = testUser({ id: 7 });
const allowed = ["inst-a", "inst-b"];

function tagRequest(query: Record<string, unknown>, id = "5") {
  return reqFor(getTagCounts, {
    params: { id },
    query: malformed(query),
    user,
    allowedInstanceIds: allowed,
  });
}

describe("relation counts handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccess.mockResolvedValue(true);
    mockCount.mockResolvedValue({
      scenes: 3,
      galleries: 0,
      images: 1,
      performers: 2,
      studios: 1,
      groups: 0,
    });
  });

  it("checks the entity on its instance, then answers its counts for the request's instances", async () => {
    const res = resFor(getTagCounts);
    await getTagCounts(tagRequest({ instanceId: "inst-b" }), res);

    expect(mockAccess).toHaveBeenCalledWith(7, "tag", "5", "inst-b");
    expect(mockCount).toHaveBeenCalledWith(
      "tag",
      { id: "5", instanceId: "inst-b" },
      { userId: 7, allowedInstanceIds: allowed, depth: undefined }
    );
    expect(res._getBody()).toEqual({
      counts: {
        scenes: 3,
        galleries: 0,
        images: 1,
        performers: 2,
        studios: 1,
        groups: 0,
      },
    });
  });

  it("includeSubTags=true counts to every depth; false as none", async () => {
    await getTagCounts(
      tagRequest({ instanceId: "inst-a", includeSubTags: "true" }),
      resFor(getTagCounts)
    );
    expect(must(mockCount.mock.lastCall)[2].depth).toBe(-1);

    await getTagCounts(
      tagRequest({ instanceId: "inst-a", includeSubTags: "false" }),
      resFor(getTagCounts)
    );
    expect(must(mockCount.mock.lastCall)[2].depth).toBeUndefined();
  });

  it("includeSubStudios=true on a studio page counts to every depth", async () => {
    await getStudioCounts(
      reqFor(getStudioCounts, {
        params: { id: "9" },
        query: { instanceId: "inst-a", includeSubStudios: "true" },
        user,
        allowedInstanceIds: allowed,
      }),
      resFor(getStudioCounts)
    );
    expect(mockCount).toHaveBeenCalledWith(
      "studio",
      { id: "9", instanceId: "inst-a" },
      { userId: 7, allowedInstanceIds: allowed, depth: -1 }
    );
  });

  it("the performer, collection and gallery pages count their own type", async () => {
    const query = { instanceId: "inst-a" };
    const parts = {
      params: { id: "3" },
      query,
      user,
      allowedInstanceIds: allowed,
    };
    await getPerformerCounts(
      reqFor(getPerformerCounts, parts),
      resFor(getPerformerCounts)
    );
    await getGroupCounts(reqFor(getGroupCounts, parts), resFor(getGroupCounts));
    await getGalleryCounts(
      reqFor(getGalleryCounts, parts),
      resFor(getGalleryCounts)
    );

    expect(mockAccess.mock.calls).toEqual([
      [7, "performer", "3", "inst-a"],
      [7, "group", "3", "inst-a"],
      [7, "gallery", "3", "inst-a"],
    ]);
    expect(mockCount.mock.calls.map(([type]) => type)).toEqual([
      "performer",
      "group",
      "gallery",
    ]);
  });

  it.each([
    ["no instance", {}, "5"],
    ["an instance twice", { instanceId: ["inst-a", "inst-b"] }, "5"],
    ["a bad instance", { instanceId: "bad instance" }, "5"],
    [
      "another page's toggle",
      { instanceId: "a", includeSubStudios: "true" },
      "5",
    ],
    [
      "a toggle that is not a flag",
      { instanceId: "a", includeSubTags: "1" },
      "5",
    ],
    ["an unknown option", { instanceId: "a", page: "2" }, "5"],
    ["an id with an instance", { instanceId: "a" }, "5:a"],
    ["an id that is not one", { instanceId: "a" }, "five"],
  ])("answers 400 for %s", async (_what, query, id) => {
    await expect(
      getTagCounts(tagRequest(query, id), resFor(getTagCounts))
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockAccess).not.toHaveBeenCalled();
    expect(mockCount).not.toHaveBeenCalled();
  });

  it("answers 404 for an entity the viewer cannot see, and counts nothing", async () => {
    mockAccess.mockResolvedValue(false);
    await expect(
      getTagCounts(tagRequest({ instanceId: "inst-a" }), resFor(getTagCounts))
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(mockCount).not.toHaveBeenCalled();
  });
});
