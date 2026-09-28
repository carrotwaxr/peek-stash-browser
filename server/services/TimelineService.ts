import { parseEntityRef } from "@peek/shared-types/instanceAwareId.js";
import prisma from "../prisma/singleton.js";

export type Granularity = "years" | "months" | "weeks" | "days";
export type TimelineEntityType = "scene" | "gallery" | "image";

export interface DistributionItem {
  period: string;
  count: number;
}

interface QueryClause {
  sql: string;
  params: (string | number)[];
}

/**
 * One entity to filter by per field, as the detail pages send it:
 * `"id:instanceId"`, or a bare id, which matches that id on every instance
 */
export interface TimelineFilters {
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
}

type TimelineFilter = keyof TimelineFilters;

/**
 * How a filter reaches an entity: through a junction row, which holds both
 * sides' (id, instance), or through the entity's own `studioId`, whose studio
 * is on the entity's instance
 */
type FilterPath =
  | {
      kind: "junction";
      table: string;
      alias: string;
      ref: "performer" | "tag" | "group";
    }
  | { kind: "studio" };

interface EntityConfig {
  table: string;
  alias: string;
  /** The entity's column prefix in its junction tables (`sceneId`, ...) */
  junctionKey: TimelineEntityType;
  /** The filters the entity type has; any other is ignored */
  filters: Partial<Record<TimelineFilter, FilterPath>>;
}

const ENTITY_CONFIG: Record<TimelineEntityType, EntityConfig> = {
  scene: {
    table: "StashScene",
    alias: "s",
    junctionKey: "scene",
    filters: {
      performerId: {
        kind: "junction",
        table: "ScenePerformer",
        alias: "sp",
        ref: "performer",
      },
      tagId: { kind: "junction", table: "SceneTag", alias: "st", ref: "tag" },
      studioId: { kind: "studio" },
      groupId: {
        kind: "junction",
        table: "SceneGroup",
        alias: "sg",
        ref: "group",
      },
    },
  },
  gallery: {
    table: "StashGallery",
    alias: "g",
    junctionKey: "gallery",
    filters: {
      performerId: {
        kind: "junction",
        table: "GalleryPerformer",
        alias: "gp",
        ref: "performer",
      },
      tagId: { kind: "junction", table: "GalleryTag", alias: "gt", ref: "tag" },
      studioId: { kind: "studio" },
    },
  },
  image: {
    table: "StashImage",
    alias: "i",
    junctionKey: "image",
    filters: {
      performerId: {
        kind: "junction",
        table: "ImagePerformer",
        alias: "ip",
        ref: "performer",
      },
      tagId: { kind: "junction", table: "ImageTag", alias: "it", ref: "tag" },
      studioId: { kind: "studio" },
    },
  },
};

/** The order the filters' conditions, and so their parameters, appear in */
const FILTER_ORDER: readonly TimelineFilter[] = [
  "performerId",
  "tagId",
  "studioId",
  "groupId",
];

export class TimelineService {
  getStrftimeFormat(granularity: Granularity): string {
    switch (granularity) {
      case "years":
        return "%Y";
      case "months":
        return "%Y-%m";
      case "weeks":
        return "%Y-W%W";
      case "days":
        return "%Y-%m-%d";
      default:
        return "%Y-%m";
    }
  }

  /**
   * One bar per period: the count of the user's visible entities dated in it.
   *
   * The inner query lists each matching entity by (id, instance), since two
   * Stash servers reuse small ids; the outer one counts them per period. A
   * junction ref that names its instance matches at most one junction row per
   * entity (the row's key is both pairs), so the rows are the entities. A
   * bare ref leaves the ref's instance open, so the inner query keeps each
   * entity once with DISTINCT.
   */
  buildDistributionQuery(
    entityType: TimelineEntityType,
    userId: number,
    granularity: Granularity,
    filters?: TimelineFilters
  ): QueryClause {
    const config = ENTITY_CONFIG[entityType];
    const { alias } = config;
    const format = this.getStrftimeFormat(granularity);
    const dateField = `${alias}.date`;

    const joins: string[] = [];
    const conditions: string[] = [];
    const filterParams: string[] = [];
    let distinct = false;

    for (const name of FILTER_ORDER) {
      const value = filters?.[name];
      const path = config.filters[name];
      if (!value || !path) continue;

      let idColumn: string;
      let instanceColumn: string;
      if (path.kind === "junction") {
        const j = path.alias;
        const key = config.junctionKey;
        joins.push(
          `INNER JOIN ${path.table} ${j} ON ${j}.${key}Id = ${alias}.id AND ${j}.${key}InstanceId = ${alias}.stashInstanceId`
        );
        idColumn = `${j}.${path.ref}Id`;
        instanceColumn = `${j}.${path.ref}InstanceId`;
      } else {
        idColumn = `${alias}.studioId`;
        instanceColumn = `${alias}.stashInstanceId`;
      }

      // An empty instance ("42:") is a bare id
      const ref = parseEntityRef(value);
      if (ref.instanceId) {
        conditions.push(`${idColumn} = ? AND ${instanceColumn} = ?`);
        filterParams.push(ref.id, ref.instanceId);
      } else {
        conditions.push(`${idColumn} = ?`);
        filterParams.push(ref.id);
        if (path.kind === "junction") distinct = true;
      }
    }

    const joinClause = joins.join("\n        ");
    const extraWhere = conditions.map((c) => `AND ${c}`).join("\n          ");

    const sql = `
      SELECT period, COUNT(*) AS count
      FROM (
        SELECT ${distinct ? "DISTINCT " : ""}${alias}.id, ${alias}.stashInstanceId,
          strftime('${format}', ${dateField}) AS period
        FROM ${config.table} ${alias}
        ${joinClause}
        LEFT JOIN UserExcludedEntity e
          ON e.userId = ? AND e.entityType = '${entityType}' AND e.entityId = ${alias}.id AND (e.instanceId = '' OR e.instanceId = ${alias}.stashInstanceId)
        WHERE ${alias}.deletedAt IS NULL
          AND e.id IS NULL
          AND ${dateField} IS NOT NULL
          AND ${dateField} LIKE '____-__-__'
          ${extraWhere}
      )
      GROUP BY period
      HAVING period IS NOT NULL AND period NOT LIKE '-%'
      ORDER BY period ASC
    `.trim();

    return { sql, params: [userId, ...filterParams] };
  }

  async getDistribution(
    entityType: TimelineEntityType,
    userId: number,
    granularity: Granularity,
    filters?: TimelineFilters
  ): Promise<DistributionItem[]> {
    const { sql, params } = this.buildDistributionQuery(
      entityType,
      userId,
      granularity,
      filters
    );

    const results = await prisma.$queryRawUnsafe<
      Array<{ period: string; count: bigint }>
    >(sql, ...params);

    return results.map((row) => ({
      period: row.period,
      count: Number(row.count),
    }));
  }
}

export const timelineService = new TimelineService();
