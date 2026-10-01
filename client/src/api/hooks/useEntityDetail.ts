/**
 * A detail page's entity, through the query cache: the lookup by the URL's
 * id and instance, its state, and the viewer's rating and favorite with
 * their writes and hotkeys.
 */
import { useCallback } from "react";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys";
import { makeCompositeKey } from "../../utils/compositeKey";
import {
  type DetailEntityByType,
  type DetailType,
  findEntityById,
} from "../library";
import { type EntityMatch, describeLookupFailure } from "../lookupFailure";
import { queryKeys } from "../queryKeys";
import { useUpdateFavorite } from "./useFavoriteMutation";
import { isLibraryInitializing, useLibraryReady } from "./useLibraryReady";
import { useUpdateRating } from "./useRatingMutation";

/** Each detail type's detail key */
const DETAIL_KEYS = {
  performer: queryKeys.performers.detail,
  studio: queryKeys.studios.detail,
  tag: queryKeys.tags.detail,
  group: queryKeys.groups.detail,
  gallery: queryKeys.galleries.detail,
} as const satisfies Record<DetailType, unknown>;

export type EntityDetail<T extends DetailType> =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "ambiguous"; matches: EntityMatch[] }
  | { status: "error"; error: unknown; retry: () => void }
  | {
      status: "found";
      entity: DetailEntityByType[T];
      /** The entity's own server: the one every read, filter and write uses */
      instanceId: string;
      /** "id:instanceId" */
      ref: string;
      rating: number | null;
      favorite: boolean;
      setRating: (rating: number | null) => void;
      setFavorite: (favorite: boolean) => void;
      toggleFavorite: () => void;
    };

/**
 * Looks up the entity a detail page shows, by the id and instance in its
 * URL (`urlInstance` is null for a bare-id link), and caches it under
 * `<entities>.detail(urlInstance, id)`. A bare-id answer also seeds the
 * key that names the entity's own instance, so a later link naming it
 * reads the cache.
 *
 * A new id reads "loading" until its answer arrives, never the previous
 * entity. While the library is initializing (the server's 503
 * `ready: false`) it reads "loading" too: the query cache marks the library
 * not ready, and `useLibraryReady` refetches once it is ready.
 *
 * `rating` and `favorite` are the cached entity's, so a write's optimistic
 * patch (`useUpdateRating`, `useUpdateFavorite`) moves them at once and its
 * rollback puts them back. The `r` rating hotkeys act on the entity once it
 * is found.
 */
export function useEntityDetail<T extends DetailType>(
  type: T,
  id: string | undefined,
  urlInstance: string | null
): EntityDetail<T> {
  const client = useQueryClient();
  const { ready } = useLibraryReady();
  const detailKey = DETAIL_KEYS[type];

  const query = useQuery({
    queryKey: detailKey(urlInstance ?? undefined, id),
    queryFn:
      id !== undefined && ready
        ? async ({ signal }) => {
            const entity = await findEntityById(type, id, urlInstance, signal);
            if (entity && urlInstance === null) {
              client.setQueryData(detailKey(entity.instanceId, id), entity);
            }
            return entity;
          }
        : skipToken,
  });

  const entity = query.data ?? undefined;
  const updateRating = useUpdateRating();
  const updateFavorite = useUpdateFavorite();
  const { mutate: rate } = updateRating;
  const { mutate: favor } = updateFavorite;

  const rating = entity?.rating100 ?? null;
  const favorite = entity?.favorite ?? false;
  const entityId = entity?.id;
  const instanceId = entity?.instanceId;

  const setRating = useCallback(
    (value: number | null) => {
      if (entityId === undefined || instanceId === undefined) return;
      rate({ entityType: type, entityId, instanceId, rating: value });
    },
    [rate, type, entityId, instanceId]
  );
  const setFavorite = useCallback(
    (value: boolean) => {
      if (entityId === undefined || instanceId === undefined) return;
      favor({ entityType: type, entityId, instanceId, favorite: value });
    },
    [favor, type, entityId, instanceId]
  );
  const toggleFavorite = useCallback(() => {
    setFavorite(!favorite);
  }, [setFavorite, favorite]);

  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  useRatingHotkeys({
    enabled: id !== undefined && !query.isError && entity !== undefined,
    setRating,
    toggleFavorite,
  });

  if (id === undefined) return { status: "notFound" };
  if (query.isError) {
    // Initializing waits for the library; a retry in flight is loading again
    if (isLibraryInitializing(query.error) || query.isFetching) {
      return { status: "loading" };
    }
    const failure = describeLookupFailure(query.error);
    return failure.status === "error" ? { ...failure, retry } : failure;
  }
  if (query.isPending) return { status: "loading" };
  if (!entity) return { status: "notFound" };
  return {
    status: "found",
    entity,
    instanceId: entity.instanceId,
    ref: makeCompositeKey(entity.id, entity.instanceId),
    rating,
    favorite,
    setRating,
    setFavorite,
    toggleFavorite,
  };
}
