import type { RatableEntityType } from "@peek/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { libraryApi } from "../library";
import {
  beginUserDataWrite,
  confirmUserDataWrite,
  endUserDataWrite,
  failUserDataWrite,
} from "../userDataWrite";

interface UpdateFavoriteParams {
  entityType: RatableEntityType;
  entityId: string;
  favorite: boolean;
  instanceId: string;
}

/**
 * Saves the viewer's favorite flag. Every cached row and detail entry of
 * the entity shows it at once, a failed save puts the old one back, and
 * the library is marked stale without a refetch.
 */
export function useUpdateFavorite() {
  const client = useQueryClient();
  const refOf = ({
    entityType,
    entityId,
    instanceId,
  }: UpdateFavoriteParams) => ({
    type: entityType,
    id: entityId,
    instanceId,
  });

  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      favorite,
      instanceId,
    }: UpdateFavoriteParams) =>
      libraryApi.updateFavorite(entityType, entityId, favorite, instanceId),
    onMutate: (vars) =>
      beginUserDataWrite(client, refOf(vars), "favorite", {
        favorite: vars.favorite,
      }),
    onSuccess: (response, vars) =>
      confirmUserDataWrite(client, refOf(vars), "favorite", {
        favorite: response.rating.favorite,
      }),
    onError: (_error, vars) =>
      failUserDataWrite(client, refOf(vars), "favorite"),
    onSettled: (_data, _error, vars) =>
      endUserDataWrite(client, refOf(vars), "favorite"),
  });
}
