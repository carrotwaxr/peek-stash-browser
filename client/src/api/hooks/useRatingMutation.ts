import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { libraryApi } from "../library";

interface UpdateRatingParams {
  entityType: string;
  entityId: string;
  rating: number | null;
  instanceId?: string | null;
}

export function useUpdateRating() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityType, entityId, rating, instanceId = null }: UpdateRatingParams) =>
      libraryApi.updateRating(entityType, entityId, rating, instanceId),
    onSuccess: (_data, { entityType }) => {
      // Invalidate entity list queries to refresh ratings
      const keyMap: Record<string, () => readonly unknown[]> = {
        scene: () => queryKeys.scenes.all(),
        performer: () => queryKeys.performers.all(),
        studio: () => queryKeys.studios.all(),
        tag: () => queryKeys.tags.all(),
        gallery: () => queryKeys.galleries.all(),
        group: () => queryKeys.groups.all(),
      };
      const keyFn = keyMap[entityType];
      if (keyFn) {
        queryClient.invalidateQueries({ queryKey: keyFn() });
      }
    },
  });
}
