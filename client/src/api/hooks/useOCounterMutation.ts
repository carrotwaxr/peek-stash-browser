import type {
  DecrementImageOCounterResponse,
  DecrementOCounterResponse,
} from "@peek/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../client";
import { queryKeys } from "../queryKeys";

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
        return apiPost<IncrementOCounterResponse>(
          "/watch-history/increment-o",
          {
            sceneId,
            ...(instanceId && { instanceId }),
          }
        );
      }
      if (imageId) {
        return apiPost<IncrementOCounterResponse>(
          "/image-view-history/increment-o",
          {
            imageId,
            ...(instanceId && { instanceId }),
          }
        );
      }
      return Promise.reject(new Error("Either sceneId or imageId is required"));
    },
    onSuccess: (_data, { sceneId, imageId }) => {
      if (sceneId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.scenes.all(),
        });
      }
      if (imageId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.images.all(),
        });
      }
    },
  });
}

interface DecrementSceneOParams {
  sceneId: string;
  instanceId: string;
}

/** Remove the user's newest O on a scene; answers the count left */
export function useDecrementOCounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ sceneId, instanceId }: DecrementSceneOParams) =>
      apiPost<DecrementOCounterResponse>("/watch-history/decrement-o", {
        sceneId,
        instanceId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.scenes.all() });
    },
  });
}

interface DecrementImageOParams {
  imageId: string;
  instanceId: string;
}

/** Remove the user's newest O on an image; answers the count left */
export function useDecrementImageOCounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ imageId, instanceId }: DecrementImageOParams) =>
      apiPost<DecrementImageOCounterResponse>(
        "/image-view-history/decrement-o",
        { imageId, instanceId }
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.images.all() });
    },
  });
}
