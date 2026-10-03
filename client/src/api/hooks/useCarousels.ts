import type {
  CreateCarouselRequest,
  UpdateCarouselRequest,
} from "@peek/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { libraryApi } from "..";
import { queryKeys } from "../queryKeys";

/**
 * The user's custom carousels (`GET /carousels`). One request is shared by
 * Home and Settings; coming back to Home sends none while the answer is
 * fresh. A save or a delete marks it stale, so the next reader asks again.
 */
export function useCarousels() {
  return useQuery({
    queryKey: queryKeys.carousels.list(),
    queryFn: () => libraryApi.getCarousels(),
    select: (response) => response.carousels,
  });
}

/** A new carousel, or the parts of one to update (a locked carousel's update sends no rules) */
type SaveCarouselInput =
  | { readonly id?: undefined; readonly data: CreateCarouselRequest }
  | { readonly id: string; readonly data: UpdateCarouselRequest };

/**
 * Creates a carousel, or updates it when `id` is given. Home's list and the
 * scenes of every carousel are asked for again: a rules change shows its new
 * scenes at once, an open Home refreshes.
 */
export function useSaveCarousel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCarouselInput) =>
      input.id === undefined
        ? libraryApi.createCarousel(input.data)
        : libraryApi.updateCarousel(input.id, input.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.carousels.all() }),
  });
}

/**
 * Deletes a carousel. Its scenes leave the cache, and the list is read
 * again, so Home drops it at once.
 */
export function useDeleteCarousel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => libraryApi.deleteCarousel(id),
    onSuccess: (_response, id) => {
      queryClient.removeQueries({
        queryKey: queryKeys.carousels.execute(id),
      });
      return queryClient.invalidateQueries({
        queryKey: queryKeys.carousels.all(),
      });
    },
  });
}
