import { beforeEach, describe, expect, it, vi } from "vitest";
import { countHandler } from "../../../controllers/library/listCount.js";
import { ValidationError } from "../../../middleware/errorHandler.js";
import { sceneQueryBuilder } from "../../../services/SceneQueryBuilder.js";
import { libraryHandler } from "../../../utils/routeHelpers.js";
import { reqFor, resFor, testUser } from "../../helpers/controllerTestUtils.js";
import { objectContaining } from "../../helpers/matchers.js";

vi.mock(
  "../../../prisma/singleton.js",
  () => import("../../helpers/prismaSingletonMock.js")
);

vi.mock("../../../services/SceneQueryBuilder.js", () => ({
  sceneQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../../services/PerformerQueryBuilder.js", () => ({
  performerQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../../services/StudioQueryBuilder.js", () => ({
  studioQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../../services/TagQueryBuilder.js", () => ({
  tagQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../../services/GroupQueryBuilder.js", () => ({
  groupQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../../services/GalleryQueryBuilder.js", () => ({
  galleryQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../../services/ImageQueryBuilder.js", () => ({
  imageQueryBuilder: { count: vi.fn() },
}));
vi.mock("../../../services/ClipQueryBuilder.js", () => ({
  clipQueryBuilder: { count: vi.fn() },
}));

const mockScene = vi.mocked(sceneQueryBuilder);

describe("countHandler", () => {
  const handler = countHandler("scene");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers the builder's count for the parsed body", async () => {
    mockScene.count.mockResolvedValue(7);
    const req = reqFor(handler, {
      body: {
        filter: { page: 3, per_page: 10, sort: "rating" },
        scene_filter: {
          tags: { value: ["5:inst-a"], modifier: "INCLUDES" },
        },
      },
      user: testUser({ id: 9 }),
      allowedInstanceIds: ["inst-a", "inst-b"],
      timeZone: "America/Chicago",
    });
    const res = resFor(handler);

    await handler(req, res);

    expect(res._getBody()).toEqual({ count: 7 });
    expect(mockScene.count).toHaveBeenCalledTimes(1);
    expect(mockScene.count).toHaveBeenCalledWith(
      objectContaining({
        userId: 9,
        allowedInstanceIds: ["inst-a", "inst-b"],
        timeZone: "America/Chicago",
        request: objectContaining({
          filter: objectContaining({
            tags: objectContaining({ modifier: "INCLUDES" }),
          }),
        }),
      })
    );
  });

  it("counts a clip list through the clip builder", async () => {
    const clipHandler = countHandler("clip");
    const { clipQueryBuilder } =
      await import("../../../services/ClipQueryBuilder.js");
    vi.mocked(clipQueryBuilder.count).mockResolvedValue(4);
    const res = resFor(clipHandler);

    await clipHandler(
      reqFor(clipHandler, {
        body: { clip_filter: { is_generated: true } },
        user: testUser(),
        allowedInstanceIds: ["inst-a"],
      }),
      res
    );

    expect(res._getBody()).toEqual({ count: 4 });
  });

  it("a bad body is the list parser's 400", async () => {
    const req = reqFor(handler, {
      body: { scene_filter: { nope: { value: 1 } } } as never,
      user: testUser(),
      allowedInstanceIds: ["inst-a"],
    });

    await expect(handler(req, resFor(handler))).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(mockScene.count).not.toHaveBeenCalled();
  });

  it("needs a signed-in user and the cache", async () => {
    const guarded = libraryHandler(handler);

    // No user: 401
    const anonymous = resFor(handler);
    await guarded(
      reqFor(handler, { body: {}, allowedInstanceIds: ["inst-a"] }),
      anonymous,
      vi.fn()
    );
    expect(anonymous._getStatus()).toBe(401);

    // No instance list (requireCacheReady left out): the handler is not run
    await expect(
      guarded(
        reqFor(handler, { body: {}, user: testUser() }),
        resFor(handler),
        vi.fn()
      )
    ).rejects.toThrow("allowedInstanceIds missing");
    expect(mockScene.count).not.toHaveBeenCalled();
  });
});
