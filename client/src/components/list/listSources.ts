/**
 * Where each list's page comes from: its list hook, its query key and where
 * its response holds the rows, shared by the list pages (`EntityListPage`)
 * and the detail tabs (`SearchableGrid`). The hooks share one shape, so the
 * one a page calls never changes the hook order.
 */
import { useCallback } from "react";
import { type UseQueryResult, useQueryClient } from "@tanstack/react-query";
import type { LibrarySearchParams } from "../../api";
import {
  useGalleryList,
  useGroupList,
  useImageList,
  usePerformerList,
  useStudioList,
  useTagList,
} from "../../api/hooks";
import { queryKeys } from "../../api/queryKeys";
import { makeCompositeKey } from "../../utils/compositeKey";

export type ListSourceEntity =
  | "performer"
  | "studio"
  | "group"
  | "tag"
  | "gallery"
  | "image";

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
  /** The response's key for the list ("findPerformers") */
  result: string;
  /** The list's key for its rows ("performers") */
  items: string;
}

export const LIST_SOURCES: Record<ListSourceEntity, ListSource> = {
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
};

type ListResponse = Record<
  string,
  { count?: number } & Record<string, unknown>
>;

const NO_ROWS: ListRow[] = [];

/** A row's "id:instanceId" key: two servers can hold the same id */
export const rowKey = (row: ListRow): string =>
  makeCompositeKey(row.id as string, row.instanceId as string | undefined);

/** The rows and the list's total in a list response */
export function pickPage(
  source: ListSource,
  data: unknown
): { items: ListRow[]; count: number } {
  const list = (data as ListResponse | undefined)?.[source.result];
  return {
    items: (list?.[source.items] as ListRow[] | undefined) ?? NO_ROWS,
    count: list?.count ?? 0,
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
        const current = old?.[source.result];
        const rows = current?.[source.items] as ListRow[] | undefined;
        if (!old || !current || !rows) return old;
        const kept = rows.filter((row) => rowKey(row) !== hidden);
        if (kept.length === rows.length) return old;
        return {
          ...old,
          [source.result]: {
            ...current,
            [source.items]: kept,
            count: Math.max(0, (current.count ?? 0) - 1),
          },
        };
      });
    },
    [queryClient, source, request]
  );
}
