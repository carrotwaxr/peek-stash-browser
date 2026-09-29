/**
 * Unit tests for the rating handlers.
 *
 * The seven entity types (scene, performer, studio, tag, gallery, group,
 * image) go through the same checks, one `describe.each` case per type:
 * input validation, the access check, the upsert's key and defaults, its
 * writer-queue label, and which Stash mutation Sync to Stash sends for each
 * change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RATING_TARGETS,
  updateGalleryRating,
  updateGroupRating,
  updateImageRating,
  updatePerformerRating,
  updateSceneRating,
  updateStudioRating,
  updateTagRating,
} from "../../controllers/ratings.js";
import prisma from "../../prisma/singleton.js";
import { resolveAccessibleInstanceId } from "../../services/EntityAccessService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import type {
  ApiErrorResponse,
  TypedRequest,
  TypedResponse,
  UpdateRatingRequest,
  UpdateRatingResponse,
} from "../../types/api/index.js";
import { dbWrite } from "../../utils/dbWrite.js";
import type * as dbWriteModule from "../../utils/dbWrite.js";
import { authenticated } from "../../utils/routeHelpers.js";
import { malformed, reqFor, resFor } from "../helpers/controllerTestUtils.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getForSync: vi.fn(),
  },
}));

vi.mock("../../services/EntityAccessService.js", () => ({
  resolveAccessibleInstanceId: vi.fn(),
}));

// The writer queue runs for real; the spy records each unit's label
vi.mock("../../utils/dbWrite.js", async (importOriginal) => {
  const actual = await importOriginal<typeof dbWriteModule>();
  return { ...actual, dbWrite: vi.fn(actual.dbWrite) };
});

const mockPrisma = vi.mocked(prisma, true);
const mockInstanceManager = vi.mocked(stashInstanceManager);
const mockResolve = vi.mocked(resolveAccessibleInstanceId);
const mockDbWrite = vi.mocked(dbWrite);

const USER = { id: 1, username: "testuser", role: "USER" };

/**
 * Any of the rating handlers. They share a body and response and differ only
 * in the name of their one id param, which the cases below pass as data. A
 * method signature (checked bivariantly) lets each handler's own params type
 * stand in for that `Record<string, string>`.
 */
type RatingHandler = {
  handle(
    req: TypedRequest<UpdateRatingRequest>,
    res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
  ): Promise<unknown>;
}["handle"];

/** The Prisma model each rating handler writes to */
type RatingModel =
  | "sceneRating"
  | "performerRating"
  | "studioRating"
  | "tagRating"
  | "galleryRating"
  | "groupRating"
  | "imageRating";

/** A Stash update mutation's `input`, as the handlers send it */
interface StashInput {
  id: string;
  rating100?: number | null;
  favorite?: boolean;
}

const mockStash = {
  sceneUpdate: vi.fn(),
  performerUpdate: vi.fn(),
  studioUpdate: vi.fn(),
  tagUpdate: vi.fn(),
  galleryUpdate: vi.fn(),
  groupUpdate: vi.fn(),
  imageUpdate: vi.fn(),
};
type StashMutation = keyof typeof mockStash;

const ENTITY_ID = "77";

/** The Stash inputs for the changes below, on entity 77 */
const RATED: StashInput = { id: ENTITY_ID, rating100: 40 };
const FAVORITED: StashInput = { id: ENTITY_ID, favorite: true };
const BOTH: StashInput = { id: ENTITY_ID, rating100: 40, favorite: true };
const CLEARED: StashInput = { id: ENTITY_ID, rating100: null };

/** The changes a request sends */
const CHANGES = {
  rating: { rating: 40 },
  favorite: { favorite: true },
  both: { rating: 40, favorite: true },
  cleared: { rating: null },
} satisfies Record<string, UpdateRatingRequest>;
type ChangeName = keyof typeof CHANGES;
const CHANGE_NAMES: ChangeName[] = ["rating", "favorite", "both", "cleared"];

interface RatingCase {
  type:
    | "scene"
    | "performer"
    | "studio"
    | "tag"
    | "gallery"
    | "group"
    | "image";
  label: string;
  handler: RatingHandler;
  param: string;
  model: RatingModel;
  mutation: StashMutation;
  /** What Sync to Stash sends for each change; null: no Stash request */
  stash: Record<ChangeName, StashInput | null>;
}

/**
 * The Sync to Stash matrix: scene rating; performer and studio rating and
 * favorite; tag favorite; gallery, group and image rating.
 */
const RATING_CASES: RatingCase[] = [
  {
    type: "scene",
    label: "Scene",
    handler: updateSceneRating,
    param: "sceneId",
    model: "sceneRating",
    mutation: "sceneUpdate",
    stash: { rating: RATED, favorite: null, both: RATED, cleared: CLEARED },
  },
  {
    type: "performer",
    label: "Performer",
    handler: updatePerformerRating,
    param: "performerId",
    model: "performerRating",
    mutation: "performerUpdate",
    stash: { rating: RATED, favorite: FAVORITED, both: BOTH, cleared: CLEARED },
  },
  {
    type: "studio",
    label: "Studio",
    handler: updateStudioRating,
    param: "studioId",
    model: "studioRating",
    mutation: "studioUpdate",
    stash: { rating: RATED, favorite: FAVORITED, both: BOTH, cleared: CLEARED },
  },
  {
    type: "tag",
    label: "Tag",
    handler: updateTagRating,
    param: "tagId",
    model: "tagRating",
    mutation: "tagUpdate",
    stash: {
      rating: null,
      favorite: FAVORITED,
      both: FAVORITED,
      cleared: null,
    },
  },
  {
    type: "gallery",
    label: "Gallery",
    handler: updateGalleryRating,
    param: "galleryId",
    model: "galleryRating",
    mutation: "galleryUpdate",
    stash: { rating: RATED, favorite: null, both: RATED, cleared: CLEARED },
  },
  {
    type: "group",
    label: "Group",
    handler: updateGroupRating,
    param: "groupId",
    model: "groupRating",
    mutation: "groupUpdate",
    stash: { rating: RATED, favorite: null, both: RATED, cleared: CLEARED },
  },
  {
    type: "image",
    label: "Image",
    handler: updateImageRating,
    param: "imageId",
    model: "imageRating",
    mutation: "imageUpdate",
    stash: { rating: RATED, favorite: null, both: RATED, cleared: CLEARED },
  },
];

/** Standard mock for a successful upsert */
const UPSERT_RESULT = {
  id: 1,
  userId: 1,
  instanceId: "instance-1",
  rating: 85,
  favorite: false,
};

/** The Stash mutations that ran, with their variables */
function stashCalls(): [string, unknown][] {
  return Object.entries(mockStash).flatMap(([name, fn]) =>
    fn.mock.calls.map((call): [string, unknown] => [name, call[0]])
  );
}

describe("Ratings Controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.user.findUnique.mockResolvedValue(
      partialRow({ syncToStash: false })
    );
    mockResolve.mockImplementation((_userId, _type, _id, requested) =>
      Promise.resolve(requested ?? "instance-1")
    );
    for (const fn of Object.values(mockStash)) fn.mockResolvedValue({});
    mockInstanceManager.getForSync.mockReturnValue(partialRow(mockStash));
  });

  // The sign-in check authenticated() runs before the handler, as the route registers it
  describe("sign-in check (via updateSceneRating)", () => {
    it("returns 401 when user has no id", async () => {
      const req = reqFor(updateSceneRating, {
        params: { sceneId: "1" },
        user: malformed({}),
      });
      const res = resFor(updateSceneRating);
      await authenticated(updateSceneRating)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
      expect(res._getErrorBody().error).toBe("Unauthorized");
    });

    it("returns 401 when user is missing entirely", async () => {
      const req = reqFor(updateSceneRating, { params: { sceneId: "1" } });
      const res = resFor(updateSceneRating);
      await authenticated(updateSceneRating)(req, res, vi.fn());
      expect(res._getStatus()).toBe(401);
      expect(res._getErrorBody().error).toBe("Unauthorized");
    });
  });

  describe.each(RATING_CASES)("$type", (c) => {
    const model = () => mockPrisma[c.model];
    const params = { [c.param]: ENTITY_ID };

    /** Calls the handler with this body (and the case's id param) */
    async function send(
      body: UpdateRatingRequest | ReturnType<typeof malformed>,
      requestParams: Record<string, string> = params
    ) {
      const req = reqFor(c.handler, {
        body,
        params: requestParams,
        user: USER,
      });
      const res = resFor(c.handler);
      await c.handler(req, res);
      return res;
    }

    beforeEach(() => {
      model().upsert.mockResolvedValue(partialRow(UPSERT_RESULT));
    });

    describe("validation", () => {
      it.each([
        ["not a number", { rating: "high" }],
        ["below 0", { rating: -1 }],
        ["above 100", { rating: 101 }],
      ])("returns 400 when rating is %s", async (_name, body) => {
        const res = await send(malformed(body));
        expect(res._getStatus()).toBe(400);
        expect(res._getErrorBody().error).toBe(
          "Rating must be a number between 0 and 100"
        );
        expect(model().upsert).not.toHaveBeenCalled();
      });

      it("returns 400 when favorite is not a boolean", async () => {
        const res = await send(malformed({ favorite: "yes" }));
        expect(res._getStatus()).toBe(400);
        expect(res._getErrorBody().error).toBe("Favorite must be a boolean");
        expect(model().upsert).not.toHaveBeenCalled();
      });

      it.each([[{ instanceId: 5 }], [{ instanceId: "" }]])(
        "returns 400 when instanceId is not a non-empty string (%j)",
        async (body) => {
          const res = await send(malformed({ rating: 50, ...body }));
          expect(res._getStatus()).toBe(400);
          expect(res._getErrorBody().error).toBe(
            "instanceId must be a non-empty string"
          );
          expect(mockResolve).not.toHaveBeenCalled();
          expect(model().upsert).not.toHaveBeenCalled();
        }
      );

      it(`returns 400 when ${c.param} is missing`, async () => {
        const res = await send({ rating: 50 }, {});
        expect(res._getStatus()).toBe(400);
        expect(res._getErrorBody().error).toBe(`Missing ${c.param}`);
      });

      it.each([0, 100, null])("accepts a rating of %s", async (rating) => {
        const res = await send({ rating });
        expect(res._getOkBody().success).toBe(true);
        expect(model().upsert).toHaveBeenCalledWith(
          expect.objectContaining({ update: { rating } })
        );
      });
    });

    describe("access", () => {
      it(`returns 404 "${c.label} not found" and writes nothing when the user cannot see it`, async () => {
        mockPrisma.user.findUnique.mockResolvedValue(
          partialRow({ syncToStash: true })
        );
        mockResolve.mockResolvedValueOnce(null);
        const res = await send({
          rating: 50,
          favorite: true,
          instanceId: "inst-b",
        });

        expect(mockResolve).toHaveBeenCalledWith(
          1,
          c.type,
          ENTITY_ID,
          "inst-b"
        );
        expect(res._getStatus()).toBe(404);
        expect(res._getErrorBody().error).toBe(`${c.label} not found`);
        expect(model().upsert).not.toHaveBeenCalled();
        expect(mockInstanceManager.getForSync).not.toHaveBeenCalled();
      });

      it("writes on the request's instance", async () => {
        await send({ rating: 50, instanceId: "inst-b" });
        expect(mockResolve).toHaveBeenCalledWith(
          1,
          c.type,
          ENTITY_ID,
          "inst-b"
        );
        expect(model().upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              [`userId_instanceId_${c.param}`]: {
                userId: 1,
                instanceId: "inst-b",
                [c.param]: ENTITY_ID,
              },
            },
          })
        );
      });

      it("lets the resolver pick the instance when the request has none", async () => {
        await send({ rating: 50 });
        expect(mockResolve).toHaveBeenCalledWith(
          1,
          c.type,
          ENTITY_ID,
          undefined
        );
        expect(model().upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              [`userId_instanceId_${c.param}`]: {
                userId: 1,
                instanceId: "instance-1",
                [c.param]: ENTITY_ID,
              },
            },
          })
        );
      });
    });

    describe("upsert", () => {
      it(`upserts by the compound key in one "rating.${c.type}" write`, async () => {
        const res = await send({ rating: 75, instanceId: "inst-b" });

        expect(res._getOkBody()).toEqual({
          success: true,
          rating: UPSERT_RESULT,
        });
        expect(model().upsert).toHaveBeenCalledTimes(1);
        expect(model().upsert).toHaveBeenCalledWith({
          where: {
            [`userId_instanceId_${c.param}`]: {
              userId: 1,
              instanceId: "inst-b",
              [c.param]: ENTITY_ID,
            },
          },
          update: { rating: 75 },
          create: {
            userId: 1,
            instanceId: "inst-b",
            [c.param]: ENTITY_ID,
            rating: 75,
            favorite: false,
          },
        });
        expect(mockDbWrite.mock.calls.map(([label]) => label)).toEqual([
          `rating.${c.type}`,
        ]);
      });

      it("creates an unrated favorite when only favorite is sent", async () => {
        await send({ favorite: true });
        expect(model().upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: { favorite: true },
            create: {
              userId: 1,
              instanceId: "instance-1",
              [c.param]: ENTITY_ID,
              rating: null,
              favorite: true,
            },
          })
        );
      });

      it("a database failure reaches the error handler", async () => {
        mockPrisma.user.findUnique.mockRejectedValue(new Error("DB down"));
        const req = reqFor(c.handler, {
          body: { rating: 50 },
          params,
          user: USER,
        });
        const res = resFor(c.handler);
        await expect(c.handler(req, res)).rejects.toThrow("DB down");
        expect(res.json).not.toHaveBeenCalled();
      });
    });

    describe("Sync to Stash", () => {
      beforeEach(() => {
        mockPrisma.user.findUnique.mockResolvedValue(
          partialRow({ syncToStash: true })
        );
      });

      it.each(CHANGE_NAMES)(
        "sends what Stash holds for this type (%s)",
        async (change) => {
          const res = await send(CHANGES[change]);
          expect(res._getOkBody().success).toBe(true);

          // No Stash request, and no client looked up, when nothing syncs
          const input = c.stash[change];
          expect(stashCalls()).toEqual(input ? [[c.mutation, { input }]] : []);
          expect(mockInstanceManager.getForSync.mock.calls).toEqual(
            input ? [["instance-1"]] : []
          );
        }
      );

      it("sends nothing when the user's Sync to Stash is off", async () => {
        mockPrisma.user.findUnique.mockResolvedValue(
          partialRow({ syncToStash: false })
        );
        const res = await send(CHANGES.both);
        expect(res._getOkBody().success).toBe(true);
        expect(mockInstanceManager.getForSync).not.toHaveBeenCalled();
        expect(stashCalls()).toEqual([]);
      });

      it("answers 200 without Stash when the instance has no client", async () => {
        mockInstanceManager.getForSync.mockReturnValue(null);
        const res = await send(CHANGES.both);
        expect(res._getOkBody().success).toBe(true);
        expect(stashCalls()).toEqual([]);
      });

      it("answers 200 when Stash fails", async () => {
        mockStash[c.mutation].mockRejectedValueOnce(new Error("Stash down"));
        const res = await send(CHANGES.both);
        expect(res._getStatus()).toBe(200);
        expect(res._getOkBody().success).toBe(true);
        expect(mockStash[c.mutation]).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("RATING_TARGETS", () => {
    it("names the fields Stash has on each type, which Sync from Stash reads", () => {
      expect(
        Object.fromEntries(
          Object.entries(RATING_TARGETS).map(([type, target]) => [
            type,
            target.stash,
          ])
        )
      ).toEqual({
        scene: { rating100: true, favoriteFilter: null },
        performer: { rating100: true, favoriteFilter: "filter_favorites" },
        studio: { rating100: true, favoriteFilter: "favorite" },
        tag: { rating100: false, favoriteFilter: "favorite" },
        gallery: { rating100: true, favoriteFilter: null },
        group: { rating100: true, favoriteFilter: null },
        image: { rating100: true, favoriteFilter: null },
      });
    });

    it.each(RATING_CASES)(
      "the target for $type names its type, route param and label",
      (c) => {
        const target = RATING_TARGETS[c.type];
        expect([target.type, target.param, target.label]).toEqual([
          c.type,
          c.param,
          c.label,
        ]);
      }
    );
  });
});
