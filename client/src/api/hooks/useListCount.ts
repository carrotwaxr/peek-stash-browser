import type { ListCountResponse, ListKind } from "@peek/shared-types";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { apiPost } from "..";
import { queryKeys } from "../queryKeys";

/** Each list's query root (`queryKeys`) and the plural its routes use */
const LIST_PLURALS: Record<ListKind, string> = {
  scene: "scenes",
  performer: "performers",
  studio: "studios",
  tag: "tags",
  group: "groups",
  gallery: "galleries",
  image: "images",
  clip: "clips",
};

export interface ListCountOptions {
  /** False sends nothing (the sheet is closed) */
  enabled?: boolean;
  /** Replaces `/library/<plural>/count` (Recommended counts within its own ranking) */
  path?: string;
}

/** The request as the count route reads it: no page, page size or order */
function countBody(request: Record<string, unknown>): Record<string, unknown> {
  const { filter, ...rest } = request;
  if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
    return request;
  }
  const {
    page: _page,
    per_page: _perPage,
    sort: _sort,
    direction: _direction,
    ...filterRest
  } = filter as Record<string, unknown>;
  return { ...rest, filter: filterRest };
}

/**
 * How many rows a list's request matches, for "Show N results". The body
 * leaves out page, page size and order, so requests that differ only in
 * those share one entry. The key sits under the list's root: every library
 * invalidation marks it. The previous number stays on screen while the next
 * loads, and a request a newer one supersedes is aborted. A null request
 * (nothing to count yet) sends nothing.
 */
export function useListCount(
  entity: ListKind,
  request: Record<string, unknown> | null,
  { enabled = true, path }: ListCountOptions = {}
) {
  const plural = LIST_PLURALS[entity];
  const url = path ?? `/library/${plural}/count`;
  const body = request === null ? null : countBody(request);
  return useQuery({
    queryKey: queryKeys.listCount(plural, url, body),
    queryFn:
      body === null
        ? skipToken
        : ({ signal }) =>
            apiPost<ListCountResponse>(url, body, signal).then(
              (response) => response.count
            ),
    enabled,
    placeholderData: keepPreviousData,
  });
}
