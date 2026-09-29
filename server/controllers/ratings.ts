/**
 * Ratings and favorites, on all seven entity types, from one handler driven
 * by `RATING_TARGETS`.
 *
 * Peek keeps each user's rating and favorite per entity and instance. When
 * an admin has switched Sync to Stash on for the user, a change also goes to
 * Stash, for the fields Stash has on that type (`stash` in each target):
 *
 * | Type      | rating100 | favorite |
 * |-----------|-----------|----------|
 * | scene     | synced    | -        |
 * | performer | synced    | synced   |
 * | studio    | synced    | synced   |
 * | tag       | -         | synced   |
 * | gallery   | synced    | -        |
 * | group     | synced    | -        |
 * | image     | synced    | -        |
 *
 * Stash holds one value per entity, so with several users syncing, the last
 * rating or favorite written wins (O counts, synced by the watch history,
 * add up instead). A failed Stash write is logged and the request still
 * succeeds: Peek's row is the record.
 */
import type { Prisma } from "@prisma/client";
import type { StashClient } from "../graphql/StashClient.js";
import prisma from "../prisma/singleton.js";
import {
  type AccessEntityType,
  resolveAccessibleInstanceId,
} from "../services/EntityAccessService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import type {
  ApiErrorResponse,
  TypedAuthRequest,
  TypedResponse,
  UpdateRatingRequest,
  UpdateRatingResponse,
} from "../types/api/index.js";
import { dbWrite } from "../utils/dbWrite.js";
import { logger } from "../utils/logger.js";

export type RatingEntityType = Exclude<AccessEntityType, "clip">;

/** A rating change: a field left out keeps its value. */
export interface RatingChange {
  rating?: number | null;
  favorite?: boolean;
}

/** The user's row for one entity on one instance. */
export interface RatingKey {
  userId: number;
  instanceId: string;
  entityId: string;
}

/** A Stash update mutation's input: the entity and the fields that change. */
interface StashRatingInput {
  id: string;
  rating100?: number | null;
  favorite?: boolean;
}

export interface RatingTarget<T extends RatingEntityType = RatingEntityType> {
  type: T;
  /** The route param holding the entity id. */
  param: `${T}Id`;
  /** "Scene" in "Scene not found". */
  label: string;
  /** The fields Stash has on this type: Sync to Stash writes them, and they are all an import from Stash can read. */
  stash: {
    /** Stash has `rating100` on the entity, its update input and its filter. */
    rating100: boolean;
    /** The filter input that selects Stash favorites (`favorite` on the entity and its update input), or null when Stash has no favorite on this type. */
    favoriteFilter: "favorite" | "filter_favorites" | null;
  };
  /**
   * The upsert of the user's row. The caller runs it as a writer-queue unit
   * (`dbWrite`, or `dbWriteBatch` for many). A new row starts unrated and
   * not a favorite.
   */
  upsert(
    key: RatingKey,
    change: RatingChange
  ): Prisma.PrismaPromise<UpdateRatingResponse["rating"]>;
  /** Sends `input` to Stash through this type's update mutation. */
  stashUpdate(stash: StashClient, input: StashRatingInput): Promise<unknown>;
}

const updateData = ({ rating, favorite }: RatingChange) => ({
  ...(rating !== undefined && { rating }),
  ...(favorite !== undefined && { favorite }),
});

const createData = ({ rating, favorite }: RatingChange) => ({
  rating: rating ?? null,
  favorite: favorite ?? false,
});

export const RATING_TARGETS: { [T in RatingEntityType]: RatingTarget<T> } = {
  scene: {
    type: "scene",
    param: "sceneId",
    label: "Scene",
    stash: { rating100: true, favoriteFilter: null },
    upsert: ({ userId, instanceId, entityId: sceneId }, change) =>
      prisma.sceneRating.upsert({
        where: { userId_instanceId_sceneId: { userId, instanceId, sceneId } },
        update: updateData(change),
        create: { userId, instanceId, sceneId, ...createData(change) },
      }),
    stashUpdate: (stash, input) => stash.sceneUpdate({ input }),
  },
  performer: {
    type: "performer",
    param: "performerId",
    label: "Performer",
    stash: { rating100: true, favoriteFilter: "filter_favorites" },
    upsert: ({ userId, instanceId, entityId: performerId }, change) =>
      prisma.performerRating.upsert({
        where: {
          userId_instanceId_performerId: { userId, instanceId, performerId },
        },
        update: updateData(change),
        create: { userId, instanceId, performerId, ...createData(change) },
      }),
    stashUpdate: (stash, input) => stash.performerUpdate({ input }),
  },
  studio: {
    type: "studio",
    param: "studioId",
    label: "Studio",
    stash: { rating100: true, favoriteFilter: "favorite" },
    upsert: ({ userId, instanceId, entityId: studioId }, change) =>
      prisma.studioRating.upsert({
        where: { userId_instanceId_studioId: { userId, instanceId, studioId } },
        update: updateData(change),
        create: { userId, instanceId, studioId, ...createData(change) },
      }),
    stashUpdate: (stash, input) => stash.studioUpdate({ input }),
  },
  tag: {
    type: "tag",
    param: "tagId",
    label: "Tag",
    stash: { rating100: false, favoriteFilter: "favorite" },
    upsert: ({ userId, instanceId, entityId: tagId }, change) =>
      prisma.tagRating.upsert({
        where: { userId_instanceId_tagId: { userId, instanceId, tagId } },
        update: updateData(change),
        create: { userId, instanceId, tagId, ...createData(change) },
      }),
    stashUpdate: (stash, input) => stash.tagUpdate({ input }),
  },
  gallery: {
    type: "gallery",
    param: "galleryId",
    label: "Gallery",
    stash: { rating100: true, favoriteFilter: null },
    upsert: ({ userId, instanceId, entityId: galleryId }, change) =>
      prisma.galleryRating.upsert({
        where: {
          userId_instanceId_galleryId: { userId, instanceId, galleryId },
        },
        update: updateData(change),
        create: { userId, instanceId, galleryId, ...createData(change) },
      }),
    stashUpdate: (stash, input) => stash.galleryUpdate({ input }),
  },
  group: {
    type: "group",
    param: "groupId",
    label: "Group",
    stash: { rating100: true, favoriteFilter: null },
    upsert: ({ userId, instanceId, entityId: groupId }, change) =>
      prisma.groupRating.upsert({
        where: { userId_instanceId_groupId: { userId, instanceId, groupId } },
        update: updateData(change),
        create: { userId, instanceId, groupId, ...createData(change) },
      }),
    stashUpdate: (stash, input) => stash.groupUpdate({ input }),
  },
  image: {
    type: "image",
    param: "imageId",
    label: "Image",
    stash: { rating100: true, favoriteFilter: null },
    upsert: ({ userId, instanceId, entityId: imageId }, change) =>
      prisma.imageRating.upsert({
        where: { userId_instanceId_imageId: { userId, instanceId, imageId } },
        update: updateData(change),
        create: { userId, instanceId, imageId, ...createData(change) },
      }),
    stashUpdate: (stash, input) => stash.imageUpdate({ input }),
  },
};

/** The Stash update for this change, or null when it touches no field Stash has on the type. */
function stashInput(
  fields: RatingTarget["stash"],
  id: string,
  { rating, favorite }: RatingChange
): StashRatingInput | null {
  const input: StashRatingInput = { id };
  if (fields.rating100 && rating !== undefined) input.rating100 = rating;
  if (fields.favoriteFilter !== null && favorite !== undefined) {
    input.favorite = favorite;
  }
  return "rating100" in input || "favorite" in input ? input : null;
}

/** PUT /api/ratings/<type>/:<type>Id: the user's rating and/or favorite. */
function ratingHandler<T extends RatingEntityType>(target: RatingTarget<T>) {
  const { type, param, label } = target;
  return async function updateRating(
    req: TypedAuthRequest<UpdateRatingRequest, Record<`${T}Id`, string>>,
    res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
  ): Promise<void> {
    const userId = req.user.id;
    const entityId = req.params[param];
    const { instanceId: requestInstanceId, ...change } = req.body;
    const { rating, favorite } = change;

    if (!entityId) {
      res.status(400).json({ error: `Missing ${param}` });
      return;
    }
    if (
      rating !== undefined &&
      rating !== null &&
      (typeof rating !== "number" || rating < 0 || rating > 100)
    ) {
      res
        .status(400)
        .json({ error: "Rating must be a number between 0 and 100" });
      return;
    }
    if (favorite !== undefined && typeof favorite !== "boolean") {
      res.status(400).json({ error: "Favorite must be a boolean" });
      return;
    }
    if (
      requestInstanceId !== undefined &&
      (typeof requestInstanceId !== "string" || requestInstanceId === "")
    ) {
      res.status(400).json({ error: "instanceId must be a non-empty string" });
      return;
    }

    // The user's sync setting, and the entity's instance if they can see it
    const [user, instanceId] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { syncToStash: true },
      }),
      resolveAccessibleInstanceId(userId, type, entityId, requestInstanceId),
    ]);
    if (!instanceId) {
      res.status(404).json({ error: `${label} not found` });
      return;
    }

    const row = await dbWrite(`rating.${type}`, () =>
      target.upsert({ userId, instanceId, entityId }, change)
    );
    logger.debug(`${label} rating updated`, {
      userId,
      [param]: entityId,
      instanceId,
      rating,
      favorite,
    });

    const input = user?.syncToStash
      ? stashInput(target.stash, entityId, change)
      : null;
    if (input) {
      try {
        const stash = stashInstanceManager.getForSync(instanceId);
        if (stash) {
          await target.stashUpdate(stash, input);
          logger.info(`Synced ${type} rating to Stash`, {
            ...input,
            instanceId,
          });
        }
      } catch (stashError) {
        // Peek's row is the record: the request still succeeds
        logger.error(`Failed to sync ${type} rating to Stash`, {
          [param]: entityId,
          instanceId,
          error: stashError,
        });
      }
    }

    res.json({ success: true, rating: row });
  };
}

export const updateSceneRating = ratingHandler(RATING_TARGETS.scene);
export const updatePerformerRating = ratingHandler(RATING_TARGETS.performer);
export const updateStudioRating = ratingHandler(RATING_TARGETS.studio);
export const updateTagRating = ratingHandler(RATING_TARGETS.tag);
export const updateGalleryRating = ratingHandler(RATING_TARGETS.gallery);
export const updateGroupRating = ratingHandler(RATING_TARGETS.group);
export const updateImageRating = ratingHandler(RATING_TARGETS.image);
