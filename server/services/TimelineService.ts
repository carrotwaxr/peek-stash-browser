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
    granularity: Granularity
  ): QueryClause {
    const config = ENTITY_CONFIG[entityType];
    const format = this.getStrftimeFormat(granularity);

    // Filter for properly formatted dates (YYYY-MM-DD format)
    // This excludes malformed dates like "2007" that SQLite can't parse correctly
    const sql = `
      SELECT
        strftime('${format}', ${config.dateField}) as period,
        COUNT(*) as count
      FROM ${config.table} ${config.alias}
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ? AND e.entityType = '${entityType}' AND e.entityId = ${config.alias}.id
      WHERE ${config.alias}.deletedAt IS NULL
        AND e.id IS NULL
        AND ${config.dateField} IS NOT NULL
        AND ${config.dateField} LIKE '____-__-__'
      GROUP BY period
      HAVING period IS NOT NULL AND period NOT LIKE '-%'
      ORDER BY period ASC
    `.trim();

    return { sql, params: [userId] };
  }

  async getDistribution(
    entityType: TimelineEntityType,
    userId: number,
    granularity: Granularity
  ): Promise<DistributionItem[]> {
    const { sql, params } = this.buildDistributionQuery(entityType, userId, granularity);

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
