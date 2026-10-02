/**
 * The timeline's bars (C12, UD-09): one per period, the count of what the
 * list shows dated in it. Each list's builder counts its own request
 * (`periodCounts`), so the page's tag with inherited tags, the panel's
 * filters, the search, the viewer's exclusions and instances and the zone
 * date filters read in are the grid's by construction.
 */
import type {
  TimelineEntityType,
  TimelineGranularity,
} from "@peek/shared-types/api/timeline.js";
import type { ParsedListRequest } from "../types/parsedFilters.js";
import { galleryQueryBuilder } from "./GalleryQueryBuilder.js";
import { imageQueryBuilder } from "./ImageQueryBuilder.js";
import { sceneQueryBuilder } from "./SceneQueryBuilder.js";
import type { PeriodCount } from "./query/EntityQueryBuilder.js";

export type Granularity = TimelineGranularity;
export type { TimelineEntityType };
export type DistributionItem = PeriodCount;

export interface DistributionOptions {
  readonly userId: number;
  readonly allowedInstanceIds: readonly string[];
  /** The viewer's IANA zone (`req.timeZone`), which date filters read days in */
  readonly timeZone: string;
  readonly granularity: Granularity;
}

/** A list builder's `periodCounts` options, as the bars pass them */
interface CountOptions<E extends TimelineEntityType> {
  readonly userId: number;
  readonly allowedInstanceIds: readonly string[];
  readonly request: ParsedListRequest<E>;
  readonly applyExclusions: boolean;
  readonly timeZone: string;
}

/** Each list's builder, as far as the bars need it, and the date it counts by */
const LISTS: {
  readonly [E in TimelineEntityType]: {
    readonly builder: {
      periodCounts(
        options: CountOptions<E>,
        periodSql: string,
        dateColumn: string
      ): Promise<PeriodCount[]>;
    };
    readonly dateColumn: string;
  };
} = {
  scene: { builder: sceneQueryBuilder, dateColumn: "s.date" },
  gallery: { builder: galleryQueryBuilder, dateColumn: "g.date" },
  image: { builder: imageQueryBuilder, dateColumn: "i.date" },
};

/**
 * The period of a `YYYY-MM-DD` column, in the forms URLs carry
 * (`period=2024`, `2024-03`, `2024-W12`, `2024-03-09`). A week is the ISO
 * week: Monday to Sunday, numbered in the year of its Thursday, so
 * 2024-12-30 is in 2025-W01 and 2021-01-03 in 2020-W53. The Thursday of a
 * date's week is the first Thursday on or after the date less three days.
 */
export function periodSql(granularity: Granularity, column: string): string {
  switch (granularity) {
    case "years":
      return `strftime('%Y', ${column})`;
    case "months":
      return `strftime('%Y-%m', ${column})`;
    case "days":
      return column;
    case "weeks": {
      const thursday = `date(${column}, '-3 days', 'weekday 4')`;
      return `printf('%s-W%02d', strftime('%Y', ${thursday}), (CAST(strftime('%j', ${thursday}) AS INTEGER) - 1) / 7 + 1)`;
    }
  }
}

export class TimelineService {
  /**
   * One bar per period: the request's list, as the viewer sees it, counted
   * by the period of its date. The viewer's exclusions always apply (an
   * admin's rows hold only their own hides).
   */
  async getDistribution<E extends TimelineEntityType>(
    entityType: E,
    request: ParsedListRequest<E>,
    options: DistributionOptions
  ): Promise<DistributionItem[]> {
    const { builder, dateColumn } = LISTS[entityType];
    const { granularity, ...viewer } = options;
    return builder.periodCounts(
      { ...viewer, request, applyExclusions: true },
      periodSql(granularity, dateColumn),
      dateColumn
    );
  }
}

export const timelineService = new TimelineService();
