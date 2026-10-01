import type {
  DecrementImageOCounterResponse,
  DecrementOCounterResponse,
} from "@peek/shared-types";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiPost } from "../client";
import { cancelEntityQueries, patchEntityInCache } from "../entityCache";
import { markLibraryStale } from "./useLibraryReady";

/**
 * After an O write: list requests in flight are cancelled (they may carry
 * the old count), the server's count goes into every cached row of the
 * entity, then the library is marked stale without a refetch, so the
 * press no longer reloads the list behind it.
 */
async function showCount(
  client: QueryClient,
  type: "scene" | "image",
  id: string,
  instanceId: string,
  oCount: number
): Promise<void> {
  // A list fetch begun before the press may answer with the old count
  await cancelEntityQueries(client, type);
  patchEntityInCache(client, { type, id, instanceId }, { oCount });
  await markLibraryStale(client);
}

interface IncrementOCounterParams {
  sceneId?: string;
  imageId?: string;
  instanceId: string;
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
            instanceId,
          }
        );
      }
      if (imageId) {
        return apiPost<IncrementOCounterResponse>(
          "/image-view-history/increment-o",
          {
            imageId,
            instanceId,
          }
        );
      }
      return Promise.reject(new Error("Either sceneId or imageId is required"));
    },
    onSuccess: (data, { sceneId, imageId, instanceId }) =>
      showCount(
        queryClient,
        sceneId ? "scene" : "image",
        (sceneId ?? imageId) as string,
        instanceId,
        data.oCount
      ),
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
    onSuccess: (data, { sceneId, instanceId }) =>
      showCount(queryClient, "scene", sceneId, instanceId, data.oCount),
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
    onSuccess: (data, { imageId, instanceId }) =>
      showCount(queryClient, "image", imageId, instanceId, data.oCount),
  });
}
