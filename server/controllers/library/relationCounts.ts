import { z } from "zod";
import {
  NotFoundError,
  ValidationError,
} from "../../middleware/errorHandler.js";
import { canUserAccessEntity } from "../../services/EntityAccessService.js";
import { countRelations } from "../../services/RelationCounts.js";
import type {
  RelationCountsParams,
  RelationCountsQuery,
  RelationCountsResponse,
  RelationCountsType,
  TypedLibraryRequest,
  TypedResponse,
} from "../../types/api/index.js";
import { parseFilterRef } from "../../utils/listRequest.js";

const flag = z.enum(["true", "false"]).optional();
const instanceId = z.string({ error: "instanceId is required" });

/**
 * Each page's query: the entity's instance, required, and the page's own
 * toggle. Unknown keys answer 400 (item 38).
 */
const QUERIES = {
  performer: z.strictObject({ instanceId }),
  studio: z.strictObject({ instanceId, includeSubStudios: flag }),
  tag: z.strictObject({ instanceId, includeSubTags: flag }),
  group: z.strictObject({ instanceId }),
  gallery: z.strictObject({ instanceId }),
} as const satisfies Record<RelationCountsType, z.ZodType>;

/** The query's toggle: -1 when the page's Include sub-tags or sub-studios is on */
function depthOf(query: Record<string, string | undefined>): -1 | undefined {
  return query.includeSubTags === "true" || query.includeSubStudios === "true"
    ? -1
    : undefined;
}

/**
 * `GET /api/library/<entities>/:id/counts?instanceId=`: a detail page's tab
 * counts, each the total of the tab's list for the viewer (B19). 400 for a
 * bad id, a missing or bad instance, or an unknown option; 404 for an
 * entity the viewer cannot see (missing, deleted, excluded, on an instance
 * they do not use), as a by-id lookup answers. A ValidationError or
 * NotFoundError reaches the central error handler.
 */
export function relationCountsHandler<T extends RelationCountsType>(type: T) {
  const schema = QUERIES[type];
  return async (
    req: TypedLibraryRequest<
      unknown,
      RelationCountsParams,
      RelationCountsQuery
    >,
    res: TypedResponse<RelationCountsResponse<T>>
  ) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError("Invalid request", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      });
    }
    const idRef = parseFilterRef(req.params.id);
    const ref = parseFilterRef(`${req.params.id}:${parsed.data.instanceId}`);
    if (idRef?.instanceId !== undefined || ref?.instanceId === undefined) {
      throw new ValidationError("Invalid request", {
        issues: [
          {
            path: idRef === undefined ? "id" : "instanceId",
            message: "Expected an id and an instance id",
          },
        ],
      });
    }
    const userId = req.user.id;
    const target = { id: ref.id, instanceId: ref.instanceId };
    if (
      !(await canUserAccessEntity(userId, type, target.id, target.instanceId))
    ) {
      throw new NotFoundError();
    }
    const counts = await countRelations(type, target, {
      userId,
      allowedInstanceIds: req.allowedInstanceIds,
      depth: depthOf(parsed.data),
    });
    res.json({ counts });
  };
}
