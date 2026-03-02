import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { libraryApi } from "../library";

interface UpdateFavoriteParams {
  entityType: string;
  entityId: string;
  favorite: boolean;
  instanceId?: string | null;
}

export function useUpdateFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityType, entityId, favorite, instanceId = null }: UpdateFavoriteParams) =>
      libraryApi.updateFavorite(entityType, entityId, favorite, instanceId),
    onSuccess: (_data, { entityType }) => {
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
