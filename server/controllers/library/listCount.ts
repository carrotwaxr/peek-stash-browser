import type { ListKind } from "@peek/shared-types/filters/index.js";
import { COUNTERS } from "../../services/RelationCounts.js";
import type {
  ListCountResponse,
  TypedLibraryRequest,
  TypedResponse,
} from "../../types/api/index.js";
import { parseListRequest } from "../../utils/listRequest.js";

/**
 * `POST /api/library/<list>/count`: how many rows the list's own request
 * matches, for the filter sheet's live count. The body is the list's (page
 * and sort are read and ignored); the answer is the builder's `count()`, so
 * it equals the `count` of `POST /api/library/<list>` for the same body, with
 * the viewer's exclusions and instances applied and no page or relations
 * loaded. A ValidationError (400) reaches the central error handler.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- K ties the parsed request to its list's counter
export function countHandler<K extends ListKind>(kind: K) {
  return async (
    req: TypedLibraryRequest,
    res: TypedResponse<ListCountResponse>
  ) => {
    const request = parseListRequest(kind, req.body, { userId: req.user.id });
    const count = await COUNTERS[kind].count({
      userId: req.user.id,
      allowedInstanceIds: req.allowedInstanceIds,
      timeZone: req.timeZone,
      request,
    });
    res.json({ count });
  };
}
