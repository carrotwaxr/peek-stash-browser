import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queryKeys";
import { apiPost } from "../client";

interface IncrementOCounterParams {
  sceneId?: string;
  imageId?: string;
  instanceId?: string;
}

interface IncrementOCounterResponse {
  success: boolean;
  oCount: number;
}

export function useIncrementOCounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sceneId, imageId, instanceId }: IncrementOCounterParams) => {
      if (sceneId) {
        return apiPost<IncrementOCounterResponse>("/watch-history/increment-o", { sceneId });
      }
      if (imageId) {
        return apiPost<IncrementOCounterResponse>("/image-view-history/increment-o", {
          imageId,
          ...(instanceId && { instanceId }),
        });
      }
      return Promise.reject(new Error("Either sceneId or imageId is required"));
    },
    onSuccess: (_data, { sceneId, imageId }) => {
      if (sceneId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.scenes.all() });
      }
      if (imageId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.images.all() });
      }
    },
  });
}
