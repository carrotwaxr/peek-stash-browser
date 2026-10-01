import { useQuery } from "@tanstack/react-query";
import { getClipsForScene } from "..";
import { queryKeys } from "../queryKeys";
import { useLibraryReady } from "./useLibraryReady";

/**
 * A scene's clips, generated or not, keyed by the scene and its instance:
 * the player's timeline and the details panel share one request, and an
 * answer for a scene the user has left never shows under the next one. The
 * key is under the `clips` root, so a hide or a library refresh reaches it.
 */
export function useSceneClips(sceneId: string, instanceId: string) {
  // Mounts the library re-check, so a scene opened during the first sync
  // loads its clips once the library is ready
  const { ready } = useLibraryReady();
  return useQuery({
    queryKey: queryKeys.clips.forScene(sceneId, instanceId),
    queryFn: ({ signal }) =>
      getClipsForScene(sceneId, instanceId, true, signal),
    enabled: !!sceneId && !!instanceId && ready,
  });
}
