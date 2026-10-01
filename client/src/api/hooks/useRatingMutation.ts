import type { RatableEntityType } from "@peek/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { libraryApi } from "../library";
import {
  beginUserDataWrite,
  confirmUserDataWrite,
  endUserDataWrite,
  failUserDataWrite,
} from "../userDataWrite";

interface UpdateRatingParams {
  entityType: RatableEntityType;
  entityId: string;
  rating: number | null;
  instanceId: string;
}

/**
 * Saves the viewer's rating. Every cached row and detail entry of the
 * entity shows the new rating at once, a failed save puts the old one
 * back, and the library is marked stale without a refetch.
 */
export function useUpdateRating() {
  const client = useQueryClient();
  const refOf = ({ entityType, entityId, instanceId }: UpdateRatingParams) => ({
    type: entityType,
    id: entityId,
    instanceId,
  });

  return useMutation({
    mutationFn: ({
      entityType,
      entityId,
      rating,
      instanceId,
    }: UpdateRatingParams) =>
      libraryApi.updateRating(entityType, entityId, rating, instanceId),
    onMutate: (vars) =>
      beginUserDataWrite(client, refOf(vars), "rating100", {
        rating100: vars.rating,
      }),
    onSuccess: (response, vars) =>
      confirmUserDataWrite(client, refOf(vars), "rating100", {
        rating100: response.rating.rating,
      }),
    onError: (_error, vars) =>
      failUserDataWrite(client, refOf(vars), "rating100"),
    onSettled: (_data, _error, vars) =>
      endUserDataWrite(client, refOf(vars), "rating100"),
  });
}
