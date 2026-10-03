/**
 * Where each list's page comes from: its list hook, its query key and where
 * its response holds the rows, shared by the list pages (`EntityListPage`)
 * and the detail tabs (`SearchableGrid`). The hooks share one shape, so the
 * one a page calls never changes the hook order.
 */
import { useCallback } from "react";
import type { FindClipsRequest, ListPageInput } from "@peek/shared-types";
import { type UseQueryResult, useQueryClient } from "@tanstack/react-query";
import type { LibrarySearchParams } from "../../api";
import {
  useClipList,
  useGalleryList,
  useGroupList,
  useImageList,
  usePerformerList,
  useSceneList,
  useStudioList,
  useTagList,
} from "../../api/hooks";
import { queryKeys } from "../../api/queryKeys";
import { makeCompositeKey } from "../../utils/compositeKey";
import type { ListQuery } from "../../utils/listQuery";

export type ListSourceEntity =
  | "scene"
  | "performer"
  | "studio"
  | "group"
  | "tag"
  | "gallery"
  | "image"
  | "clip";

export type ListRequest = Record<string, unknown> | null;

export type ListRow = Record<string, unknown>;

/** A card's hide callback: the hidden entity, its type and its instance */
export type CardHideHandler = (
  entityId: string,
  entityType: string,
  instanceId?: string
) => void;

export interface ListSource {
  useList: (request: ListRequest) => UseQueryResult;
  listKey: (params: Record<string, unknown>) => readonly unknown[];
  /**
   * The response's key for the list ("findPerformers"); null when the rows
   * and the total sit at its top level (clips)
   */
  result: string | null;
  /** The list's key for its rows ("performers") */
  items: string;
  /** The list's key for its total; "count" unless named */
  count?: string;
  /**
   * The request the list hook takes, from the list's query and the page's
   * permanent filters; the query itself unless named
   */
  toRequest?: (
    query: ListQuery,
    permanentFilters: Record<string, unknown>
  ) => Record<string, unknown>;
  /**
   * Where the filter sheet's "Show N results" counts the request
   * (`useListCount`); `/library/<plural>/count` unless named (Recommended
   * counts within its own ranking)
   */
  countPath?: string;
}

/**
 * The clip list's request (`POST /api/library/clips`) from the list's
 * query: its page, sort and search in `filter`, `clip_filter` (a scene's
 * own clips carry the page's permanent `scenes` there, and the default "With
 * preview only") and the user's rows in `where`, as every list sends them;
 * a sort not yet chosen ("") is left to the server's default, newest first
 */
export function clipRequestOf(query: ListQuery): FindClipsRequest {
  const { sort, ...page } = query.filter;
  const clipFilter = "clip_filter" in query ? query.clip_filter : undefined;
  const where = query.where as FindClipsRequest["where"];
  return {
    filter: {
      ...page,
      ...(sort === "" ? {} : { sort: sort as ListPageInput<"clip">["sort"] }),
    },
    ...(clipFilter === undefined ? {} : { clip_filter: clipFilter }),
    ...(where === undefined ? {} : { where }),
  };
}

export const LIST_SOURCES: Record<ListSourceEntity, ListSource> = {
  scene: {
    useList: (request) =>
      useSceneList(request as LibrarySearchParams<"scene"> | null),
    listKey: (params) => queryKeys.scenes.list(undefined, params),
    result: "findScenes",
    items: "scenes",
  },
  performer: {
    useList: (request) =>
      usePerformerList(request as LibrarySearchParams<"performer"> | null),
    listKey: (params) => queryKeys.performers.list(undefined, params),
    result: "findPerformers",
    items: "performers",
  },
  studio: {
    useList: (request) =>
      useStudioList(request as LibrarySearchParams<"studio"> | null),
    listKey: (params) => queryKeys.studios.list(undefined, params),
    result: "findStudios",
    items: "studios",
  },
  group: {
    useList: (request) =>
      useGroupList(request as LibrarySearchParams<"group"> | null),
    listKey: (params) => queryKeys.groups.list(undefined, params),
    result: "findGroups",
    items: "groups",
  },
  tag: {
    useList: (request) =>
      useTagList(request as LibrarySearchParams<"tag"> | null),
    listKey: (params) => queryKeys.tags.list(undefined, params),
    result: "findTags",
    items: "tags",
  },
  gallery: {
    useList: (request) =>
      useGalleryList(request as LibrarySearchParams<"gallery"> | null),
    listKey: (params) => queryKeys.galleries.list(undefined, params),
    result: "findGalleries",
    items: "galleries",
  },
  image: {
    useList: (request) =>
      useImageList(request as LibrarySearchParams<"image"> | null),
    listKey: (params) => queryKeys.images.list(undefined, params),
    result: "findImages",
    items: "images",
  },
  clip: {
    useList: (request) => useClipList(request as FindClipsRequest | null),
    listKey: (params) => queryKeys.clips.list(params),
    result: null,
    items: "clips",
    count: "total",
    toRequest: (query) => clipRequestOf(query) as Record<string, unknown>,
  },
};

type ListResult = Record<string, unknown>;
type ListResponse = Record<string, unknown>;

/** The part of a response that holds the rows and the total */
const listOf = (
  source: ListSource,
  data: ListResponse | undefined
): ListResult | undefined =>
  source.result === null
    ? data
    : (data?.[source.result] as ListResult | undefined);

const countOf = (source: ListSource, list: ListResult | undefined): number => {
  const count = list?.[source.count ?? "count"];
  return typeof count === "number" ? count : 0;
};

const NO_ROWS: ListRow[] = [];

/** A row's "id:instanceId" key: two servers can hold the same id */
export const rowKey = (row: ListRow): string =>
  makeCompositeKey(row.id as string, row.instanceId as string | undefined);

/** The rows and the list's total in a list response */
export function pickPage(
  source: ListSource,
  data: unknown
): { items: ListRow[]; count: number } {
  const list = listOf(source, data as ListResponse | undefined);
  return {
    items: (list?.[source.items] as ListRow[] | undefined) ?? NO_ROWS,
    count: countOf(source, list),
  };
}

/**
 * A card's `onHideSuccess` for this page, one function for every card: drops
 * the hidden item (the id on that instance, not its namesakes) from the
 * page's cached result and lowers the count. The hide's own invalidation
 * refetches the lists afterwards.
 */
export function useHideFromList(
  source: ListSource,
  request: ListRequest
): CardHideHandler {
  const queryClient = useQueryClient();
  return useCallback<CardHideHandler>(
    (entityId, _entityType, instanceId) => {
      if (!request) return;
      const hidden = makeCompositeKey(entityId, instanceId);
      queryClient.setQueryData<ListResponse>(source.listKey(request), (old) => {
        const current = listOf(source, old);
        const rows = current?.[source.items] as ListRow[] | undefined;
        if (!old || !current || !rows) return old;
        const kept = rows.filter((row) => rowKey(row) !== hidden);
        if (kept.length === rows.length) return old;
        const next = {
          ...current,
          [source.items]: kept,
          [source.count ?? "count"]: Math.max(0, countOf(source, current) - 1),
        };
        return source.result === null
          ? next
          : { ...old, [source.result]: next };
      });
    },
    [queryClient, source, request]
  );
}
