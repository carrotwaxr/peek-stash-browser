/**
 * Sync from Stash: the admin's one-off import of a user's ratings,
 * favorites, O counts and plays from every Stash instance into Peek's
 * per-user tables. Peek never writes to Stash here (invariant 8), and every
 * row it writes carries the instance it came from (invariant 7).
 *
 * Ratings and favorites run per type over `RATING_TARGETS`, whose `stash`
 * fields say what Stash has on the type: a pass per option, each a Stash
 * list query filtered to the entities with that field set (rated, or
 * favorite), paged at IMPORT_PAGE_SIZE and written page by page as one
 * `dbWriteBatch` of `target.upsert` calls. A pass writes only its own
 * field, so a rated entity that Stash does not favorite never loses a Peek
 * favorite, and an unrated one never clears a Peek rating.
 *
 * Scene history runs a pass for O counts (`o_counter > 0`) and one for
 * plays (`play_count > 0`, or watch time or a resume point without plays);
 * a scene the O pass handled is skipped by the play pass. Per scene, the
 * stored history is `mergeHistory` of Peek's and Stash's dates; the count
 * is the merged length, never lower than Stash's counter (Stash counted
 * before it kept dates) nor than Peek's count (Peek counted plays before it
 * kept dates); `lastPlayedAt` is the latest merged play, never earlier than
 * it was. With the plays come the watch time, the larger of Peek's and
 * Stash's (Sync to Stash adds Peek's to Stash's, so a sum would count it
 * twice), and the resume point, Peek's own or Stash's when Peek has none.
 * Each page is one `dbWriteTransaction` that reads the rows it merges into,
 * so an O or a play the user records meanwhile waits for it and is never
 * merged away.
 *
 * An import that wrote anything makes the user's rankings and Recommended
 * list stale: both are forgotten once the import (and the stats rebuild
 * after its history) is written, so the next stats page or Recommended
 * page computes them from the imported data.
 *
 * The stats per type count entities once: read from Stash (`checked`),
 * given a row (`created`) or a changed one (`updated`).
 */
import type { Prisma } from "@prisma/client";
import {
  RATING_TARGETS,
  type RatingChange,
  type RatingEntityType,
  type RatingTarget,
} from "../controllers/ratings.js";
import type { StashClient } from "../graphql/StashClient.js";
import {
  CriterionModifier,
  type FindFilterType,
  type IntCriterionInput,
} from "../graphql/generated/graphql.js";
import prisma from "../prisma/singleton.js";
import type {
  SyncFromStashBody,
  SyncFromStashOptions,
  SyncStats,
  SyncTypeStats,
} from "../types/api/index.js";
import { dbWriteBatch, dbWriteTransaction } from "../utils/dbWrite.js";
import { mergeHistory, readHistory } from "../utils/historyJson.js";
import { logger } from "../utils/logger.js";
import { rankingComputeService } from "./RankingComputeService.js";
import { recommendationService } from "./RecommendationService.js";
import { userStatsService } from "./UserStatsService.js";

/** Entities per Stash page, and rows per writer-queue unit. */
export const IMPORT_PAGE_SIZE = 500;

type OptionsKey = keyof SyncFromStashOptions;

export function defaultImportOptions(): SyncFromStashOptions {
  return {
    scenes: {
      rating: true,
      favorite: false,
      oCounter: false,
      playCount: false,
    },
    performers: { rating: true, favorite: true },
    studios: { rating: true, favorite: true },
    tags: { rating: false, favorite: true },
    galleries: { rating: true },
    groups: { rating: true },
    images: { rating: true },
  };
}

/** The request's options over the defaults; anything but a boolean keeps the default. */
export function importOptionsFrom(
  given: SyncFromStashBody["options"]
): SyncFromStashOptions {
  const options = defaultImportOptions();
  for (const key of Object.keys(options) as OptionsKey[]) {
    const defaults: Record<string, boolean | undefined> = options[key];
    const chosen: Record<string, unknown> = given?.[key] ?? {};
    for (const field of Object.keys(defaults)) {
      const value = chosen[field];
      if (typeof value === "boolean") defaults[field] = value;
    }
  }
  return options;
}

const GREATER_THAN_ZERO: IntCriterionInput = {
  value: 0,
  modifier: CriterionModifier.GreaterThan,
};

/**
 * The criteria an import pass sends: one field set on the type's filter,
 * or for the play pass fields joined by Stash's `OR` sub-filter.
 */
interface Criteria {
  rating100?: IntCriterionInput;
  favorite?: boolean;
  filter_favorites?: boolean;
  o_counter?: IntCriterionInput;
  play_count?: IntCriterionInput;
  play_duration?: IntCriterionInput;
  resume_time?: IntCriterionInput;
  OR?: Criteria;
}

/**
 * The play pass: scenes with plays, watch time or a resume point in Stash.
 * Stash's player adds watch time as it plays but a play only past the
 * minimum play percent, and Sync to Stash sends Peek's watch time and
 * resume point on every progress report but a play only once Peek counts
 * one, so many watched scenes hold no play count.
 */
const PLAY_PASS: Criteria = {
  play_count: GREATER_THAN_ZERO,
  OR: {
    play_duration: GREATER_THAN_ZERO,
    OR: { resume_time: GREATER_THAN_ZERO },
  },
};

/** A Stash entity as the import reads it. */
interface ImportedEntity {
  id: string;
  rating100?: number | null;
  favorite?: boolean;
}

interface ImportedScene extends ImportedEntity {
  o_counter?: number | null;
  play_count?: number | null;
  o_history: string[];
  play_history: string[];
  /** Seconds watched in all */
  play_duration?: number | null;
  /** Seconds into the scene where playback left off */
  resume_time?: number | null;
}

interface StashPage<E> {
  items: E[];
  count: number;
}

/** The user's rating row of one entity, as the import compares it. */
interface ExistingRating {
  entityId: string;
  rating: number | null;
  favorite: boolean;
}

interface RowKey {
  userId: number;
  instanceId: string;
}

/** Per type: its options and stats key, its Stash list query and its rows. */
interface ImportSource {
  key: OptionsKey;
  list(
    stash: StashClient,
    filter: FindFilterType,
    criteria: Criteria
  ): Promise<StashPage<ImportedEntity>>;
  existing(key: RowKey, ids: string[]): Promise<ExistingRating[]>;
}

async function listScenes(
  stash: StashClient,
  filter: FindFilterType,
  criteria: Criteria
): Promise<StashPage<ImportedScene>> {
  const result = await stash.findScenes({ filter, scene_filter: criteria });
  return { items: result.findScenes.scenes, count: result.findScenes.count };
}

const IMPORT_SOURCES: { [T in RatingEntityType]: ImportSource } = {
  scene: {
    key: "scenes",
    list: listScenes,
    existing: async ({ userId, instanceId }, ids) =>
      (
        await prisma.sceneRating.findMany({
          where: { userId, instanceId, sceneId: { in: ids } },
          select: { sceneId: true, rating: true, favorite: true },
        })
      ).map(({ sceneId, ...row }) => ({ entityId: sceneId, ...row })),
  },
  performer: {
    key: "performers",
    list: async (stash, filter, criteria) => {
      const result = await stash.findPerformers({
        filter,
        performer_filter: criteria,
      });
      return {
        items: result.findPerformers.performers,
        count: result.findPerformers.count,
      };
    },
    existing: async ({ userId, instanceId }, ids) =>
      (
        await prisma.performerRating.findMany({
          where: { userId, instanceId, performerId: { in: ids } },
          select: { performerId: true, rating: true, favorite: true },
        })
      ).map(({ performerId, ...row }) => ({ entityId: performerId, ...row })),
  },
  studio: {
    key: "studios",
    list: async (stash, filter, criteria) => {
      const result = await stash.findStudios({
        filter,
        studio_filter: criteria,
      });
      return {
        items: result.findStudios.studios,
        count: result.findStudios.count,
      };
    },
    existing: async ({ userId, instanceId }, ids) =>
      (
        await prisma.studioRating.findMany({
          where: { userId, instanceId, studioId: { in: ids } },
          select: { studioId: true, rating: true, favorite: true },
        })
      ).map(({ studioId, ...row }) => ({ entityId: studioId, ...row })),
  },
  tag: {
    key: "tags",
    list: async (stash, filter, criteria) => {
      const result = await stash.findTags({ filter, tag_filter: criteria });
      return { items: result.findTags.tags, count: result.findTags.count };
    },
    existing: async ({ userId, instanceId }, ids) =>
      (
        await prisma.tagRating.findMany({
          where: { userId, instanceId, tagId: { in: ids } },
          select: { tagId: true, rating: true, favorite: true },
        })
      ).map(({ tagId, ...row }) => ({ entityId: tagId, ...row })),
  },
  gallery: {
    key: "galleries",
    list: async (stash, filter, criteria) => {
      const result = await stash.findGalleries({
        filter,
        gallery_filter: criteria,
      });
      return {
        items: result.findGalleries.galleries,
        count: result.findGalleries.count,
      };
    },
    existing: async ({ userId, instanceId }, ids) =>
      (
        await prisma.galleryRating.findMany({
          where: { userId, instanceId, galleryId: { in: ids } },
          select: { galleryId: true, rating: true, favorite: true },
        })
      ).map(({ galleryId, ...row }) => ({ entityId: galleryId, ...row })),
  },
  group: {
    key: "groups",
    list: async (stash, filter, criteria) => {
      const result = await stash.findGroups({ filter, group_filter: criteria });
      return {
        items: result.findGroups.groups,
        count: result.findGroups.count,
      };
    },
    existing: async ({ userId, instanceId }, ids) =>
      (
        await prisma.groupRating.findMany({
          where: { userId, instanceId, groupId: { in: ids } },
          select: { groupId: true, rating: true, favorite: true },
        })
      ).map(({ groupId, ...row }) => ({ entityId: groupId, ...row })),
  },
  image: {
    key: "images",
    list: async (stash, filter, criteria) => {
      const result = await stash.findImages({ filter, image_filter: criteria });
      return {
        items: result.findImages.images,
        count: result.findImages.count,
      };
    },
    existing: async ({ userId, instanceId }, ids) =>
      (
        await prisma.imageRating.findMany({
          where: { userId, instanceId, imageId: { in: ids } },
          select: { imageId: true, rating: true, favorite: true },
        })
      ).map(({ imageId, ...row }) => ({ entityId: imageId, ...row })),
  },
};

/** Stash's pages of a list query, non-empty, until its count is reached. */
async function* pages<E>(
  fetch: (filter: FindFilterType) => Promise<StashPage<E>>
): AsyncGenerator<E[]> {
  let fetched = 0;
  for (let page = 1; ; page++) {
    const { items, count } = await fetch({
      page,
      per_page: IMPORT_PAGE_SIZE,
    });
    if (items.length === 0) return;
    yield items;
    fetched += items.length;
    if (fetched >= count) return;
  }
}

/** One type's stats on one instance, counting each entity once. */
class TypeCounter {
  private readonly seen = new Set<string>();
  private readonly created = new Set<string>();
  private readonly updated = new Set<string>();

  check(id: string): void {
    this.seen.add(id);
  }

  /** A row created for the entity; a later pass then updates it, not counted. */
  markCreated(id: string): void {
    this.created.add(id);
  }

  markUpdated(id: string): void {
    if (!this.created.has(id)) this.updated.add(id);
  }

  foldInto(stats: SyncTypeStats): void {
    stats.checked += this.seen.size;
    stats.created += this.created.size;
    stats.updated += this.updated.size;
  }
}

/** A rating pass: Stash's filter for the field, and the change it writes for an entity with it set. */
interface RatingPass {
  criteria: Criteria;
  change(entity: ImportedEntity): RatingChange | null;
}

function ratingPasses(
  target: RatingTarget,
  options: { rating?: boolean; favorite?: boolean }
): RatingPass[] {
  const passes: RatingPass[] = [];
  if (options.rating && target.stash.rating100) {
    passes.push({
      criteria: { rating100: GREATER_THAN_ZERO },
      change: ({ rating100 }) =>
        typeof rating100 === "number" && rating100 > 0
          ? { rating: rating100 }
          : null,
    });
  }
  const favoriteFilter = target.stash.favoriteFilter;
  if (options.favorite && favoriteFilter !== null) {
    passes.push({
      criteria: { [favoriteFilter]: true },
      change: ({ favorite }) => (favorite === true ? { favorite: true } : null),
    });
  }
  return passes;
}

function ratingDiffers(row: ExistingRating, change: RatingChange): boolean {
  return (
    (change.rating !== undefined && row.rating !== change.rating) ||
    (change.favorite !== undefined && row.favorite !== change.favorite)
  );
}

/** Imports the type's ratings and favorites from one instance; true when a row was written. */
async function importRatings(
  target: RatingTarget,
  source: ImportSource,
  stash: StashClient,
  key: RowKey,
  options: { rating?: boolean; favorite?: boolean },
  counter: TypeCounter
): Promise<boolean> {
  let wrote = false;
  for (const pass of ratingPasses(target, options)) {
    const fetch = (filter: FindFilterType) =>
      source.list(stash, filter, pass.criteria);
    for await (const items of pages(fetch)) {
      const existing = new Map(
        (
          await source.existing(
            key,
            items.map((item) => item.id)
          )
        ).map((row) => [row.entityId, row])
      );
      const ops: Prisma.PrismaPromise<unknown>[] = [];
      for (const item of items) {
        counter.check(item.id);
        const change = pass.change(item);
        if (change === null) continue;
        const row = existing.get(item.id);
        if (row === undefined) {
          counter.markCreated(item.id);
        } else if (ratingDiffers(row, change)) {
          counter.markUpdated(item.id);
        } else {
          continue;
        }
        ops.push(target.upsert({ ...key, entityId: item.id }, change));
      }
      if (ops.length > 0) {
        await dbWriteBatch(`syncFromStash.${target.type}`, ops);
        wrote = true;
      }
    }
  }
  return wrote;
}

type HistoryRow = Pick<
  Prisma.WatchHistoryGetPayload<object>,
  | "oCount"
  | "oHistory"
  | "playCount"
  | "playHistory"
  | "lastPlayedAt"
  | "playDuration"
  | "resumeTime"
>;

interface HistoryChange {
  oCount?: number;
  oHistory?: string[];
  playCount?: number;
  playHistory?: string[];
  lastPlayedAt?: Date | null;
  playDuration?: number;
  resumeTime?: number;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((entry, i) => entry === b[i]);
}

/** The latest of the merged plays and the row's own, or null with neither. */
function latestPlay(merged: string[], current: Date | null): Date | null {
  let latest = current === null ? Number.NEGATIVE_INFINITY : current.getTime();
  for (const entry of merged) {
    const ms = Date.parse(entry);
    if (Number.isFinite(ms) && ms > latest) latest = ms;
  }
  return Number.isFinite(latest) ? new Date(latest) : null;
}

/** The merged history for the scene, or null when the row already holds it. */
function historyChange(
  scene: ImportedScene,
  row: HistoryRow | undefined,
  options: { oCounter: boolean; playCount: boolean }
): HistoryChange | null {
  const change: HistoryChange = {};
  let changed = row === undefined;
  if (options.oCounter) {
    const current = readHistory(row?.oHistory ?? null);
    const oHistory = mergeHistory(current, scene.o_history);
    const oCount = Math.max(
      oHistory.length,
      scene.o_counter ?? 0,
      row?.oCount ?? 0
    );
    change.oCount = oCount;
    change.oHistory = oHistory;
    if (row && (row.oCount !== oCount || !sameList(current, oHistory))) {
      changed = true;
    }
  }
  if (options.playCount) {
    const current = readHistory(row?.playHistory ?? null);
    const playHistory = mergeHistory(current, scene.play_history);
    const playCount = Math.max(
      playHistory.length,
      scene.play_count ?? 0,
      row?.playCount ?? 0
    );
    const lastPlayedAt = latestPlay(playHistory, row?.lastPlayedAt ?? null);
    change.playCount = playCount;
    change.playHistory = playHistory;
    change.lastPlayedAt = lastPlayedAt;
    if (
      row &&
      (row.playCount !== playCount ||
        !sameList(current, playHistory) ||
        row.lastPlayedAt?.getTime() !== lastPlayedAt?.getTime())
    ) {
      changed = true;
    }
    // Written only when Stash's raises Peek's: never lowered, never
    // replaced. A resume point of 0 is the start of the scene, so none.
    const playDuration = scene.play_duration ?? 0;
    if (playDuration > (row?.playDuration ?? 0)) {
      change.playDuration = playDuration;
      changed = true;
    }
    const resumeTime = scene.resume_time ?? 0;
    if (resumeTime > 0 && (row?.resumeTime ?? 0) <= 0) {
      change.resumeTime = resumeTime;
      changed = true;
    }
  }
  return changed ? change : null;
}

/** Imports the user's O and play history from one instance; true when a row was written. */
async function importSceneHistory(
  stash: StashClient,
  key: RowKey,
  options: { oCounter: boolean; playCount: boolean },
  counter: TypeCounter
): Promise<boolean> {
  const passes: Criteria[] = [];
  if (options.oCounter) passes.push({ o_counter: GREATER_THAN_ZERO });
  if (options.playCount) passes.push(PLAY_PASS);
  const { userId, instanceId } = key;
  // Scenes an earlier pass merged; the same payload served both options
  const done = new Set<string>();
  let wrote = false;
  for (const [index, criteria] of passes.entries()) {
    // The play pass after an O pass writes only plays: its scenes have no O
    const passOptions =
      index === 0 ? options : { oCounter: false, playCount: true };
    const fetch = (filter: FindFilterType) =>
      listScenes(stash, filter, criteria);
    for await (const items of pages(fetch)) {
      for (const scene of items) counter.check(scene.id);
      const scenes =
        index === 0 ? items : items.filter((scene) => !done.has(scene.id));
      if (scenes.length === 0) continue;
      const written = await dbWriteTransaction(
        "syncFromStash.history",
        async (tx) => {
          const rows = await tx.watchHistory.findMany({
            where: {
              userId,
              instanceId,
              sceneId: { in: scenes.map((scene) => scene.id) },
            },
          });
          const existing = new Map(rows.map((row) => [row.sceneId, row]));
          let count = 0;
          for (const scene of scenes) {
            const row = existing.get(scene.id);
            const change = historyChange(scene, row, passOptions);
            if (change === null) continue;
            await tx.watchHistory.upsert({
              where: {
                userId_instanceId_sceneId: {
                  userId,
                  instanceId,
                  sceneId: scene.id,
                },
              },
              update: change,
              create: {
                userId,
                instanceId,
                sceneId: scene.id,
                oCount: 0,
                oHistory: [],
                playCount: 0,
                playDuration: 0,
                playHistory: [],
                ...change,
              },
            });
            if (row === undefined) counter.markCreated(scene.id);
            else counter.markUpdated(scene.id);
            count++;
          }
          return count;
        }
      );
      if (passes.length > 1) for (const scene of scenes) done.add(scene.id);
      wrote ||= written > 0;
    }
  }
  return wrote;
}

function emptyStats(): SyncStats {
  const stats: Partial<SyncStats> = {};
  for (const key of Object.keys(defaultImportOptions()) as OptionsKey[]) {
    stats[key] = { checked: 0, updated: 0, created: 0 };
  }
  return stats as SyncStats;
}

/** What an import wrote, and the instances whose import failed */
export interface ImportResult {
  stats: SyncStats;
  failedInstances: string[];
}

/**
 * Imports `userId`'s data from every instance given, one type at a time
 * per instance. An instance whose import fails is logged, skipped and named
 * in `failedInstances`; the others still run. After a history import that wrote something, the
 * user's per-entity stats are rebuilt from their history. After an import
 * that wrote anything, the user's rankings and Recommended list are
 * forgotten, so the next stats and Recommended pages compute them again.
 */
export async function importFromStash(
  userId: number,
  options: SyncFromStashOptions,
  instances: ReadonlyArray<readonly [string, StashClient]>
): Promise<ImportResult> {
  const stats = emptyStats();
  const failedInstances: string[] = [];
  let historyWrote = false;
  let ratingsWrote = false;

  for (const [instanceId, stash] of instances) {
    const key: RowKey = { userId, instanceId };
    logger.info("Syncing from Stash instance", { instanceId, userId });
    try {
      for (const target of Object.values(RATING_TARGETS)) {
        const source = IMPORT_SOURCES[target.type];
        const counter = new TypeCounter();
        try {
          ratingsWrote =
            (await importRatings(
              target,
              source,
              stash,
              key,
              options[source.key],
              counter
            )) || ratingsWrote;
          if (target.type === "scene") {
            historyWrote =
              (await importSceneHistory(stash, key, options.scenes, counter)) ||
              historyWrote;
          }
        } finally {
          counter.foldInto(stats[source.key]);
        }
      }
    } catch (error) {
      // Continue with the other instances
      failedInstances.push(instanceId);
      logger.error("Error syncing from Stash instance", { instanceId, error });
    }
  }

  if (historyWrote) {
    try {
      await userStatsService.rebuildAllStatsForUser(userId);
    } catch (error) {
      // The rows are in; the stats page catches up on the next rebuild
      logger.error("Stats rebuild after Sync from Stash failed", {
        userId,
        error,
      });
    }
  }

  if (historyWrote || ratingsWrote) {
    // Last, once everything is written: a recompute started before this
    // read the data from before the import
    rankingComputeService.forget(userId);
    recommendationService.forget(userId);
  }

  return { stats, failedInstances };
}
