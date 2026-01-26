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

export interface TimelineFilters {
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
}

const ENTITY_CONFIG: Record<TimelineEntityType, { table: string; alias: string; dateField: string }> = {
  scene: { table: "StashScene", alias: "s", dateField: "s.date" },
  gallery: { table: "StashGallery", alias: "g", dateField: "g.date" },
  image: { table: "StashImage", alias: "i", dateField: "i.date" },
};

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

  buildDistributionQuery(
    entityType: TimelineEntityType,
    userId: number,
    granularity: Granularity,
    filters?: TimelineFilters
  ): QueryClause {
    const config = ENTITY_CONFIG[entityType];
    const format = this.getStrftimeFormat(granularity);

    const joins: string[] = [];
    const whereConditions: string[] = [];

    if (entityType === "scene") {
      if (filters?.performerId) {
        joins.push(`INNER JOIN ScenePerformer sp ON sp.sceneId = ${config.alias}.id AND sp.sceneInstanceId = ${config.alias}.stashInstanceId`);
        whereConditions.push(`sp.performerId = ?`);
      }
      if (filters?.tagId) {
        joins.push(`INNER JOIN SceneTag st ON st.sceneId = ${config.alias}.id AND st.sceneInstanceId = ${config.alias}.stashInstanceId`);
        whereConditions.push(`st.tagId = ?`);
      }
      if (filters?.studioId) {
        whereConditions.push(`${config.alias}.studioId = ?`);
      }
      if (filters?.groupId) {
        joins.push(`INNER JOIN SceneGroup sg ON sg.sceneId = ${config.alias}.id AND sg.sceneInstanceId = ${config.alias}.stashInstanceId`);
        whereConditions.push(`sg.groupId = ?`);
      }
    } else if (entityType === "gallery") {
      if (filters?.performerId) {
        joins.push(`INNER JOIN GalleryPerformer gp ON gp.galleryId = ${config.alias}.id AND gp.galleryInstanceId = ${config.alias}.stashInstanceId`);
        whereConditions.push(`gp.performerId = ?`);
      }
      if (filters?.tagId) {
        joins.push(`INNER JOIN GalleryTag gt ON gt.galleryId = ${config.alias}.id AND gt.galleryInstanceId = ${config.alias}.stashInstanceId`);
        whereConditions.push(`gt.tagId = ?`);
      }
      if (filters?.studioId) {
        whereConditions.push(`${config.alias}.studioId = ?`);
      }
    } else if (entityType === "image") {
      if (filters?.performerId) {
        joins.push(`INNER JOIN ImagePerformer ip ON ip.imageId = ${config.alias}.id AND ip.imageInstanceId = ${config.alias}.stashInstanceId`);
        whereConditions.push(`ip.performerId = ?`);
      }
      if (filters?.tagId) {
        joins.push(`INNER JOIN ImageTag it ON it.imageId = ${config.alias}.id AND it.imageInstanceId = ${config.alias}.stashInstanceId`);
        whereConditions.push(`it.tagId = ?`);
      }
      if (filters?.studioId) {
        whereConditions.push(`${config.alias}.studioId = ?`);
      }
    }

    const joinClause = joins.length > 0 ? joins.join("\n      ") : "";
    const extraWhere = whereConditions.length > 0 ? `AND ${whereConditions.join(" AND ")}` : "";

    const sql = `
      SELECT
        strftime('${format}', ${config.dateField}) as period,
        COUNT(DISTINCT ${config.alias}.id) as count
      FROM ${config.table} ${config.alias}
      ${joinClause}
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ? AND e.entityType = '${entityType}' AND e.entityId = ${config.alias}.id
      WHERE ${config.alias}.deletedAt IS NULL
        AND e.id IS NULL
        AND ${config.dateField} IS NOT NULL
        AND ${config.dateField} LIKE '____-__-__'
        ${extraWhere}
      GROUP BY period
      HAVING period IS NOT NULL AND period NOT LIKE '-%'
      ORDER BY period ASC
    `.trim();

    const params: (string | number)[] = [userId];
    if (filters?.performerId) params.push(filters.performerId);
    if (filters?.tagId) params.push(filters.tagId);
    if (filters?.studioId) params.push(filters.studioId);
    if (entityType === "scene" && filters?.groupId) params.push(filters.groupId);

    return { sql, params };
  }

  async getDistribution(
    entityType: TimelineEntityType,
    userId: number,
    granularity: Granularity,
    filters?: TimelineFilters
  ): Promise<DistributionItem[]> {
    const { sql, params } = this.buildDistributionQuery(entityType, userId, granularity, filters);

    const results = await prisma.$queryRawUnsafe<Array<{ period: string; count: bigint }>>(
      sql,
      ...params
    );

    return results.map((row) => ({
      period: row.period,
      count: Number(row.count),
    }));
  }
}

export const timelineService = new TimelineService();
