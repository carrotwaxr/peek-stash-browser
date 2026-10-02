// server/controllers/timelineController.ts
import { FIELDS, FILTER_BODY_KEYS } from "@peek/shared-types/filters/index.js";
import { ValidationError } from "../middleware/errorHandler.js";
import {
  type DistributionItem,
  type Granularity,
  type TimelineEntityType,
  timelineService,
} from "../services/TimelineService.js";
import type { ApiErrorIssue, ApiErrorResponse } from "../types/api/common.js";
import type {
  TypedLibraryRequest,
  TypedResponse,
} from "../types/api/express.js";
import type {
  GetDateDistributionParams,
  GetDateDistributionQuery,
  GetDateDistributionResponse,
  PostDateDistributionRequest,
} from "../types/api/timeline.js";
import { parseFilterRef, parseListRequest } from "../utils/listRequest.js";

const VALID_ENTITY_TYPES: readonly TimelineEntityType[] = [
  "scene",
  "gallery",
  "image",
];
const VALID_GRANULARITIES: readonly Granularity[] = [
  "years",
  "months",
  "weeks",
  "days",
];

/**
 * The GET's entity parameters and the list field each names: the GET is a
 * thin reader over the POST's path (one entity, INCLUDES, depth 0)
 */
const GET_PARAMS = {
  performerId: "performers",
  tagId: "tags",
  studioId: "studios",
  groupId: "groups",
  galleryId: "galleries",
} as const;

function entityTypeOf(raw: string): TimelineEntityType {
  const entity = VALID_ENTITY_TYPES.find((type) => type === raw);
  if (entity) return entity;
  throw new ValidationError("Invalid entity type", {
    issues: [
      { path: "entityType", message: "Expected scene, gallery or image" },
    ],
  });
}

/** The period, "months" when absent */
function granularityOf(raw: unknown): Granularity {
  if (raw === undefined) return "months";
  const granularity = VALID_GRANULARITIES.find((g) => g === raw);
  if (granularity) return granularity;
  throw new ValidationError("Invalid granularity", {
    issues: [
      {
        path: "granularity",
        message: "Expected years, months, weeks or days",
      },
    ],
  });
}

/**
 * The GET's entity parameters as the list's filter body: each names its
 * field, INCLUDES; a parameter whose field the list lacks is ignored, as
 * before. A value that is not one id (or id:instanceId), or a repeated
 * parameter, is a 400 naming it.
 */
function filterBodyOf(
  entity: TimelineEntityType,
  query: GetDateDistributionQuery
): Record<string, unknown> {
  const fields: Readonly<Record<string, unknown>> = FIELDS[entity];
  const filter: Record<string, unknown> = {};
  const issues: ApiErrorIssue[] = [];
  for (const [param, field] of Object.entries(GET_PARAMS)) {
    const raw: unknown = query[param];
    if (raw === undefined || raw === "") continue;
    if (typeof raw !== "string" || !parseFilterRef(raw)) {
      issues.push({ path: param, message: "Expected an id or id:instanceId" });
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      filter[field] = { value: [raw], modifier: "INCLUDES" };
    }
  }
  if (issues.length > 0)
    throw new ValidationError("Invalid request", { issues });
  return filter;
}

/** What a request settles about its viewer */
interface Viewer {
  readonly user: { readonly id: number };
  readonly allowedInstanceIds: readonly string[];
  readonly timeZone: string;
}

/** The bars of a list request, as the viewer of the request sees them */
async function distribution(
  viewer: Viewer,
  entity: TimelineEntityType,
  body: unknown,
  granularity: Granularity
): Promise<DistributionItem[]> {
  const userId = viewer.user.id;
  const request = parseListRequest(entity, body, { userId });
  return timelineService.getDistribution(entity, request, {
    userId,
    allowedInstanceIds: viewer.allowedInstanceIds,
    timeZone: viewer.timeZone,
    granularity,
  });
}

/**
 * POST /api/timeline/:entityType/distribution: the list's own request
 * (`filter: { q }`, `<entity>_filter`, `ids`; page and sort not read) plus
 * `granularity`. Unknown input is the list parser's 400 naming its path.
 */
export async function postDateDistribution(
  req: TypedLibraryRequest<
    PostDateDistributionRequest,
    GetDateDistributionParams
  >,
  res: TypedResponse<GetDateDistributionResponse | ApiErrorResponse>
): Promise<void> {
  const entity = entityTypeOf(req.params.entityType);
  const body: unknown = req.body;
  let listBody: unknown = body;
  let granularity: Granularity = "months";
  if (typeof body === "object" && body !== null && !Array.isArray(body)) {
    const { granularity: raw, ...rest } = body as Record<string, unknown>;
    granularity = granularityOf(raw);
    listBody = rest;
  }
  res.json({
    distribution: await distribution(req, entity, listBody, granularity),
  });
}

/**
 * GET /api/timeline/:entityType/distribution (documented; lead resolution
 * 6): `performerId`, `tagId`, `studioId`, `groupId` or `galleryId`, each
 * read as the list request naming it, and counted by the POST's path
 */
export async function getDateDistribution(
  req: TypedLibraryRequest<
    never,
    GetDateDistributionParams,
    GetDateDistributionQuery
  >,
  res: TypedResponse<GetDateDistributionResponse | ApiErrorResponse>
): Promise<void> {
  const entity = entityTypeOf(req.params.entityType);
  const granularity = granularityOf(req.query.granularity);
  const filter = filterBodyOf(entity, req.query);
  res.json({
    distribution: await distribution(
      req,
      entity,
      { [FILTER_BODY_KEYS[entity]]: filter },
      granularity
    ),
  });
}
