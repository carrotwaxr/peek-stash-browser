import prisma from "../prisma/singleton.js";
import type {
  GetHiddenEntitiesResponse,
  HiddenEntityItem,
  HiddenEntitySummary,
  HiddenEntityType,
} from "../types/api/index.js";
import { dbWrite } from "../utils/dbWrite.js";
import {
  type EntityRef,
  compositeKey,
  entityKey,
  pairsJson,
} from "../utils/entityRef.js";
import { toProxyUrl } from "../utils/proxyUrl.js";
import { emptyToNull } from "../utils/sqlHelpers.js";
import {
  getGalleryFallbackTitle,
  getImageFallbackTitle,
  getSceneFallbackTitle,
} from "../utils/titleUtils.js";
import { resolveVisibleApartFromOwnHides } from "./EntityAccessService.js";
import { exclusionComputationService } from "./ExclusionComputationService.js";

/** The entity types a user can hide: every request's type is checked here. */
export const HIDEABLE_ENTITY_TYPES = [
  "scene",
  "performer",
  "studio",
  "tag",
  "group",
  "gallery",
  "image",
  "clip",
] as const satisfies readonly HiddenEntityType[];

export type EntityType = (typeof HIDEABLE_ENTITY_TYPES)[number];

export function isHideableEntityType(value: unknown): value is EntityType {
  return (HIDEABLE_ENTITY_TYPES as readonly unknown[]).includes(value);
}

export interface HiddenEntitiesPageOptions {
  /** Every hideable type when undefined */
  entityType: EntityType | undefined;
  /** 1-based */
  page: number;
  perPage: number;
}

/**
 * Where a type's summary comes from: its table, its display name, the
 * columns its fallback name is built from, and its thumbnail's stored path.
 * Fixed text, never from a request.
 */
interface SummarySource {
  table: string;
  name: string;
  fallbackA: string;
  fallbackB: string;
  image: string;
  fallback: (a: string | null, b: string | null) => string | null;
}

const noFallback = () => null;

const SUMMARY_SOURCES: Record<EntityType, SummarySource> = {
  scene: {
    table: "StashScene",
    name: "x.title",
    fallbackA: "x.filePath",
    fallbackB: "NULL",
    image: "x.pathScreenshot",
    fallback: (filePath) => getSceneFallbackTitle(filePath),
  },
  performer: {
    table: "StashPerformer",
    name: "x.name",
    fallbackA: "NULL",
    fallbackB: "NULL",
    image: "x.imagePath",
    fallback: noFallback,
  },
  studio: {
    table: "StashStudio",
    name: "x.name",
    fallbackA: "NULL",
    fallbackB: "NULL",
    image: "x.imagePath",
    fallback: noFallback,
  },
  tag: {
    table: "StashTag",
    name: "x.name",
    fallbackA: "NULL",
    fallbackB: "NULL",
    image: "x.imagePath",
    fallback: noFallback,
  },
  group: {
    table: "StashGroup",
    name: "x.name",
    fallbackA: "NULL",
    fallbackB: "NULL",
    image: "x.frontImagePath",
    fallback: noFallback,
  },
  gallery: {
    table: "StashGallery",
    name: "x.title",
    fallbackA: "x.folderPath",
    fallbackB: "x.fileBasename",
    image: "x.coverPath",
    fallback: (folderPath, fileBasename) =>
      getGalleryFallbackTitle(folderPath, fileBasename),
  },
  image: {
    table: "StashImage",
    name: "x.title",
    fallbackA: "x.filePath",
    fallbackB: "NULL",
    image: "x.pathThumbnail",
    fallback: (filePath) => getImageFallbackTitle(filePath),
  },
  clip: {
    table: "StashClip",
    name: "x.title",
    fallbackA: "NULL",
    fallbackB: "NULL",
    image: "x.screenshotPath",
    fallback: noFallback,
  },
};

interface SummaryRow {
  id: string;
  instanceId: string;
  name: string | null;
  fallbackA: string | null;
  fallbackB: string | null;
  imagePath: string | null;
}

/**
 * Name and thumbnail of each ref, keyed by entityKey(id, instanceId): one
 * statement for the refs, driven from their (id, instance) pairs with
 * CROSS JOIN, so each is one primary-key probe. A ref whose row is gone
 * (deleted since the visibility check) has no entry. Every URL goes through
 * toProxyUrl with the row's own instance.
 */
async function loadSummaries(
  entityType: EntityType,
  refs: readonly EntityRef[]
): Promise<Map<string, HiddenEntitySummary>> {
  const summaries = new Map<string, HiddenEntitySummary>();
  if (refs.length === 0) return summaries;
  const source = SUMMARY_SOURCES[entityType];

  const rows = await prisma.$queryRawUnsafe<SummaryRow[]>(
    `WITH page(pid, pinst) AS (
  SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?)
)
SELECT x.id AS id, x.stashInstanceId AS instanceId, ${source.name} AS name,
  ${source.fallbackA} AS fallbackA, ${source.fallbackB} AS fallbackB,
  ${source.image} AS imagePath
FROM page pg
CROSS JOIN ${source.table} x ON x.id = pg.pid AND x.stashInstanceId = pg.pinst
WHERE x.deletedAt IS NULL`,
    pairsJson(refs)
  );

  for (const row of rows) {
    summaries.set(entityKey(row.id, row.instanceId), {
      id: row.id,
      instanceId: row.instanceId,
      name:
        emptyToNull(row.name) ?? source.fallback(row.fallbackA, row.fallbackB),
      imageUrl: toProxyUrl(row.imagePath, row.instanceId),
    });
  }
  return summaries;
}

/**
 * Service for managing user-hidden entities
 * Users can hide entities which will filter them from all views
 */
class UserHiddenEntityService {
  /**
   * Hide an entity for a user: its row and its exclusions in one unit.
   */
  async hideEntity(
    userId: number,
    entityType: EntityType,
    entityId: string,
    instanceId: string = ""
  ): Promise<void> {
    await this.hideEntities(userId, [{ entityType, entityId, instanceId }]);
  }

  /**
   * Hide every target for a user, all or nothing: the hidden rows and their
   * exclusions are written together, with one compute for the whole batch
   * (`addHiddenEntities`). A failure writes no hidden row. The caller checks
   * each target first (visible, not already hidden).
   */
  async hideEntities(
    userId: number,
    targets: ReadonlyArray<{
      entityType: EntityType;
      entityId: string;
      instanceId: string;
    }>
  ): Promise<void> {
    await exclusionComputationService.addHiddenEntities(userId, targets);
  }

  /**
   * Unhide (restore) an entity for a user. Resolves once the user's
   * exclusions are recomputed without it, so the next request lists it.
   */
  async unhideEntity(
    userId: number,
    entityType: EntityType,
    entityId: string,
    instanceId: string = ""
  ): Promise<void> {
    await dbWrite("hide.remove", () =>
      prisma.userHiddenEntity.deleteMany({
        where: {
          userId,
          entityType,
          entityId,
          instanceId,
        },
      })
    );

    // A full recompute: the unhide can release cascades other hides do not
    // cover. It reads after the delete committed (coalesced with any running
    // recompute, as every recompute is)
    await exclusionComputationService.recomputeForUser(userId);
  }

  /**
   * Unhide all entities for a user (optionally filtered by type)
   * @returns Number of entities unhidden
   */
  async unhideAll(userId: number, entityType?: EntityType): Promise<number> {
    const where: { userId: number; entityType?: EntityType } = { userId };
    if (entityType) {
      where.entityType = entityType;
    }

    const result = await dbWrite("hide.removeAll", () =>
      prisma.userHiddenEntity.deleteMany({ where })
    );

    // Recompute exclusions for this user (full recompute since multiple entities unhidden)
    if (result.count > 0) {
      await exclusionComputationService.recomputeForUser(userId);
    }

    return result.count;
  }

  /**
   * For each target, has this user already hidden it? A target on an
   * instance is covered by a hide on that instance or one stored for every
   * instance (""). One query for the whole batch.
   */
  async findAlreadyHidden(
    userId: number,
    targets: ReadonlyArray<{
      entityType: EntityType;
      entityId: string;
      instanceId: string;
    }>
  ): Promise<boolean[]> {
    if (targets.length === 0) return [];

    const rows = await prisma.userHiddenEntity.findMany({
      where: {
        userId,
        entityId: { in: [...new Set(targets.map((t) => t.entityId))] },
      },
      select: { entityType: true, entityId: true, instanceId: true },
    });
    const stored = new Set(
      rows.map((r) => compositeKey(r.entityType, r.entityId, r.instanceId))
    );

    return targets.map(
      (t) =>
        stored.has(compositeKey(t.entityType, t.entityId, t.instanceId)) ||
        stored.has(compositeKey(t.entityType, t.entityId, ""))
    );
  }

  /**
   * One page of the user's hidden rows for the Hidden Items list, newest
   * first, with the number of rows of each hideable type. A row of any other
   * type is neither listed nor counted.
   *
   * A row carries a summary (name and thumbnail) only when the user could see
   * the entity if they had hidden nothing (resolveVisibleApartFromOwnHides,
   * one query per entity type on the page). A hide stored for every instance
   * shows the first instance where that holds. Every other row (restricted or
   * empty for the user, deleted, or on an instance they do not use) comes back
   * as restricted, with no summary, so its owner can still unhide it.
   *
   * Statements: the counts (one groupBy on the user's rows), the page, then
   * per type on the page one visibility query and one summary statement.
   */
  async getHiddenEntities(
    userId: number,
    { entityType, page, perPage }: HiddenEntitiesPageOptions
  ): Promise<GetHiddenEntitiesResponse> {
    const grouped = await prisma.userHiddenEntity.groupBy({
      by: ["entityType"],
      where: { userId, entityType: { in: [...HIDEABLE_ENTITY_TYPES] } },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      HIDEABLE_ENTITY_TYPES.map((type) => [type, 0])
    ) as Record<EntityType, number>;
    for (const group of grouped) {
      if (isHideableEntityType(group.entityType)) {
        counts[group.entityType] = group._count._all;
      }
    }
    const total = entityType
      ? counts[entityType]
      : Object.values(counts).reduce((sum, n) => sum + n, 0);

    const rows = await prisma.userHiddenEntity.findMany({
      where: {
        userId,
        entityType: entityType ?? { in: [...HIDEABLE_ENTITY_TYPES] },
      },
      orderBy: [{ hiddenAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    });

    const byType = new Map<EntityType, typeof rows>();
    for (const row of rows) {
      // The where clause admits hideable types only
      if (!isHideableEntityType(row.entityType)) continue;
      const list = byType.get(row.entityType) ?? [];
      list.push(row);
      byType.set(row.entityType, list);
    }

    // Row id -> the entity's summary on the instance it shows from
    const summaries = new Map<number, HiddenEntitySummary>();
    for (const [type, typeRows] of byType) {
      const resolved = await resolveVisibleApartFromOwnHides(
        userId,
        type,
        typeRows.map((row) => ({
          id: row.entityId,
          instanceId: row.instanceId,
        }))
      );
      const shown: Array<{ rowId: number; ref: EntityRef }> = [];
      for (const row of typeRows) {
        const instanceId = resolved.get(
          entityKey(row.entityId, row.instanceId)
        );
        if (instanceId) {
          shown.push({ rowId: row.id, ref: { id: row.entityId, instanceId } });
        }
      }
      const byRef = await loadSummaries(
        type,
        shown.map((s) => s.ref)
      );
      for (const { rowId, ref } of shown) {
        const summary = byRef.get(entityKey(ref.id, ref.instanceId));
        if (summary) summaries.set(rowId, summary);
      }
    }

    const items = rows.flatMap((row): HiddenEntityItem[] => {
      if (!isHideableEntityType(row.entityType)) return [];
      const summary = summaries.get(row.id) ?? null;
      return [
        {
          id: row.id,
          entityType: row.entityType,
          entityId: row.entityId,
          instanceId: row.instanceId,
          hiddenAt: row.hiddenAt.toISOString(),
          restricted: summary === null,
          summary,
        },
      ];
    });

    return { items, total, counts };
  }
}

export const userHiddenEntityService = new UserHiddenEntityService();
export default userHiddenEntityService;
