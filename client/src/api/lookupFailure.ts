/**
 * What a failed by-id lookup means for a detail page: not found, a choice
 * of servers, or an error to show with Retry.
 */
import { ApiError } from "./client";

/**
 * One entity a single-id lookup matched on one server. The server answers a
 * lookup without an instance that finds the id on several servers with a 400
 * listing these (`AmbiguousLookupResponse`).
 */
export interface EntityMatch {
  id: string;
  instanceId: string;
  name?: string | null;
  title?: string | null;
}

/** A failed lookup: not found, a choice of servers, or an error */
export type LookupFailure =
  | { status: "notFound" }
  | { status: "ambiguous"; matches: EntityMatch[] }
  | { status: "error"; error: unknown };

function isEntityMatch(value: unknown): value is EntityMatch {
  if (!value || typeof value !== "object") return false;
  const match = value as Record<string, unknown>;
  return typeof match.id === "string" && typeof match.instanceId === "string";
}

/** The matches of an ambiguous-lookup 400, or null for any other body */
function readMatches(data: Record<string, unknown>): EntityMatch[] | null {
  const { matches } = data;
  if (!Array.isArray(matches) || matches.length === 0) return null;
  return matches.every(isEntityMatch) ? matches : null;
}

/**
 * What a failed lookup means for the page: a 404 is not found (as is a
 * missing, hidden or restricted entity, which the server leaves out); a 400
 * listing matches is a choice of servers; anything else is an error to show
 * with Retry.
 */
export function describeLookupFailure(err: unknown): LookupFailure {
  if (err instanceof ApiError) {
    if (err.status === 404) return { status: "notFound" };
    const matches = err.status === 400 ? readMatches(err.data) : null;
    if (matches) return { status: "ambiguous", matches };
  }
  return { status: "error", error: err };
}
