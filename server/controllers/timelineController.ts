// server/controllers/timelineController.ts
import { ValidationError } from "../middleware/errorHandler.js";
import {
  type Granularity,
  type TimelineEntityType,
  type TimelineFilters,
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
} from "../types/api/timeline.js";
import { parseFilterRef } from "../utils/listRequest.js";

const VALID_ENTITY_TYPES: TimelineEntityType[] = ["scene", "gallery", "image"];
const VALID_GRANULARITIES: Granularity[] = ["years", "months", "weeks", "days"];

const FILTER_PARAMS = [
  "performerId",
  "tagId",
  "studioId",
  "groupId",
  "galleryId",
] as const satisfies ReadonlyArray<keyof TimelineFilters>;

/** Each filter parameter as a ref; a value that is not one id (or id:instanceId), or a repeated parameter, is a 400 */
function parseFilters(
  query: GetDateDistributionQuery
): TimelineFilters | undefined {
  const filters: TimelineFilters = {};
  const issues: ApiErrorIssue[] = [];
  for (const name of FILTER_PARAMS) {
    const raw: unknown = query[name];
    if (raw === undefined || raw === "") continue;
    const ref = typeof raw === "string" ? parseFilterRef(raw) : undefined;
    if (ref) filters[name] = ref;
    else
      issues.push({ path: name, message: "Expected an id or id:instanceId" });
  }
  if (issues.length > 0)
    throw new ValidationError("Invalid request", { issues });
  return Object.keys(filters).length > 0 ? filters : undefined;
}

export async function getDateDistribution(
  req: TypedLibraryRequest<
    never,
    GetDateDistributionParams,
    GetDateDistributionQuery
  >,
  res: TypedResponse<GetDateDistributionResponse | ApiErrorResponse>
): Promise<void> {
  const { entityType } = req.params;
  const granularity = req.query.granularity ?? "months";
  const userId = req.user.id;

  if (!VALID_ENTITY_TYPES.includes(entityType as TimelineEntityType)) {
    res.status(400).json({ error: "Invalid entity type" });
    return;
  }

  if (!VALID_GRANULARITIES.includes(granularity as Granularity)) {
    res.status(400).json({ error: "Invalid granularity" });
    return;
  }

  const filters = parseFilters(req.query);

  const distribution = await timelineService.getDistribution(
    entityType as TimelineEntityType,
    userId,
    req.allowedInstanceIds,
    granularity as Granularity,
    filters
  );
  res.json({ distribution });
}
