/**
 * A detail page's tab counts (item 36, B19): for each tab of the page, the
 * total of the tab's list as the viewer sees it. Each count is the list
 * builder's `count` over the request the tab's grid sends (the list's
 * filter field naming the page's entity, INCLUDES, and a depth only when the
 * page's Include sub-tags or sub-studios toggle is on and the field takes
 * one), parsed by the same parser, so a count and its tab agree by
 * construction. A card counts the same way (B13's stored counts), so a card
 * and the page it opens agree.
 *
 * The counts run in turn, not together (server-sql.md: heavy statements
 * sent together through the pool contend).
 */
import type {
  RelationCountsByType,
  RelationCountsType,
} from "@peek/shared-types/api/library.js";
import {
  type EntityKind,
  FIELDS,
  FILTER_BODY_KEYS,
} from "@peek/shared-types/filters/index.js";
import { makeEntityRef } from "@peek/shared-types/instanceAwareId.js";
import type { ParsedListRequest } from "../types/parsedFilters.js";
import { parseClipQuery, parseListRequest } from "../utils/listRequest.js";
import { clipQueryBuilder } from "./ClipQueryBuilder.js";
import { galleryQueryBuilder } from "./GalleryQueryBuilder.js";
import { groupQueryBuilder } from "./GroupQueryBuilder.js";
import { imageQueryBuilder } from "./ImageQueryBuilder.js";
import { performerQueryBuilder } from "./PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "./SceneQueryBuilder.js";
import { studioQueryBuilder } from "./StudioQueryBuilder.js";
import { tagQueryBuilder } from "./TagQueryBuilder.js";

/** A tab: its list, and the list's filter field naming the page's entity */
type Tab = readonly [list: EntityKind, field: string];

/**
 * Each page's counted tabs, as its grids filter them. A clips count is not a
 * tab of this kind (clips are not an `EntityKind`): `countClips` adds it.
 */
const PAGE_TABS: {
  readonly [T in RelationCountsType]: {
    readonly [R in Exclude<keyof RelationCountsByType[T], "clips">]: Tab;
  };
} = {
  performer: {
    scenes: ["scene", "performers"],
    galleries: ["gallery", "performers"],
    images: ["image", "performers"],
    groups: ["group", "performers"],
  },
  studio: {
    scenes: ["scene", "studios"],
    galleries: ["gallery", "studios"],
    images: ["image", "studios"],
    performers: ["performer", "studios"],
    groups: ["group", "studios"],
  },
  tag: {
    scenes: ["scene", "tags"],
    galleries: ["gallery", "tags"],
    images: ["image", "tags"],
    performers: ["performer", "tags"],
    studios: ["studio", "tags"],
    groups: ["group", "tags"],
  },
  group: {
    scenes: ["scene", "groups"],
    performers: ["performer", "groups"],
  },
  gallery: {
    images: ["image", "galleries"],
    scenes: ["scene", "galleries"],
  },
};

interface CountOptions<E extends EntityKind> {
  readonly userId: number;
  readonly allowedInstanceIds: readonly string[];
  readonly request: ParsedListRequest<E>;
}

/** Each list's builder, as far as a count needs it */
const COUNTERS: {
  readonly [E in EntityKind]: {
    count(options: CountOptions<E>): Promise<number>;
  };
} = {
  scene: sceneQueryBuilder,
  performer: performerQueryBuilder,
  studio: studioQueryBuilder,
  tag: tagQueryBuilder,
  group: groupQueryBuilder,
  gallery: galleryQueryBuilder,
  image: imageQueryBuilder,
};

export interface RelationCountOptions {
  readonly userId: number;
  readonly allowedInstanceIds: readonly string[];
  /**
   * -1 while the page's Include sub-tags or sub-studios toggle is on: the
   * tabs whose field takes a depth count the descendants' content too
   */
  readonly depth: number | undefined;
}

/** Whether a list's filter field takes a depth in the shared contract */
function takesDepth(list: EntityKind, field: string): boolean {
  const spec = (FIELDS[list] as Record<string, { hierarchical?: boolean }>)[
    field
  ];
  return spec?.hierarchical === true;
}

/** One tab's total: its list's count over the request its grid sends */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- E ties the parsed request to its list's builder
async function countTab<E extends EntityKind>(
  list: E,
  field: string,
  ref: { id: string; instanceId: string },
  options: RelationCountOptions
): Promise<number> {
  const { depth } = options;
  const criterion = {
    value: [makeEntityRef(ref.id, ref.instanceId)],
    modifier: "INCLUDES",
    ...(depth !== undefined && takesDepth(list, field) ? { depth } : {}),
  };
  const request = parseListRequest(
    list,
    { [FILTER_BODY_KEYS[list]]: { [field]: criterion } },
    { userId: options.userId }
  );
  return COUNTERS[list].count({
    userId: options.userId,
    allowedInstanceIds: options.allowedInstanceIds,
    request,
  });
}

/**
 * A tag's clips: the Clips page's own count over the request its link sends
 * (`GET /api/clips?tagIds=<ref>&isGenerated=true`, the page's default), so
 * the statistic equals the list it opens. The clip's scene's exclusions and
 * the viewer's instances apply as on that list (invariant 3). Clip tag
 * filters take no depth.
 */
async function countClips(
  ref: { id: string; instanceId: string },
  options: RelationCountOptions
): Promise<number> {
  const request = parseClipQuery(
    { tagIds: makeEntityRef(ref.id, ref.instanceId), isGenerated: "true" },
    { userId: options.userId }
  );
  return clipQueryBuilder.count({
    userId: options.userId,
    allowedInstanceIds: options.allowedInstanceIds,
    request,
  });
}

/**
 * The page's tab counts for an entity the caller has checked the viewer
 * can see, on its own instance
 */
export async function countRelations<T extends RelationCountsType>(
  type: T,
  ref: { id: string; instanceId: string },
  options: RelationCountOptions
): Promise<RelationCountsByType[T]> {
  const tabs = PAGE_TABS[type] as Record<string, Tab>;
  const counts: Record<string, number> = {};
  for (const [key, [list, field]] of Object.entries(tabs)) {
    counts[key] = await countTab(list, field, ref, options);
  }
  if (type === "tag") counts.clips = await countClips(ref, options);
  return counts as RelationCountsByType[T];
}
