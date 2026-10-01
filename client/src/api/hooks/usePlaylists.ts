import type {
  AddScenesToPlaylistRequest,
  CreatePlaylistRequest,
  SortPlaylistRequest,
  UpdatePlaylistRequest,
} from "@peek/shared-types";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  type PlaylistPageParams,
  type PlaylistQueueParams,
  addScenesToPlaylist,
  createPlaylist,
  deletePlaylist,
  duplicatePlaylist,
  getPlaylist,
  getPlaylistQueue,
  getPlaylists,
  getSharedPlaylists,
  movePlaylistItem,
  removePlaylistItems,
  removeUnavailableItems,
  sortPlaylist,
  updatePlaylist,
} from "../playlists";
import { queryKeys } from "../queryKeys";

/** `enabled: false` reads nothing, for a menu that is closed */
interface PlaylistReadOptions {
  enabled?: boolean;
}

/**
 * The user's playlists, for the playlists page and the add-to-playlist menu.
 * `containsScene` (a scene as `"id:instanceId"`) makes each playlist say
 * whether it holds that scene.
 */
export function usePlaylists(
  params: { containsScene?: string } = {},
  { enabled = true }: PlaylistReadOptions = {}
) {
  return useQuery({
    queryKey: queryKeys.playlists.list(params),
    queryFn: () => getPlaylists(params),
    enabled,
  });
}

/** The playlists other users shared with the viewer */
export function useSharedPlaylists({
  enabled = true,
}: PlaylistReadOptions = {}) {
  return useQuery({
    queryKey: queryKeys.playlists.shared(),
    queryFn: () => getSharedPlaylists(),
    enabled,
  });
}

/**
 * One page of a playlist's items in the given order. The page on screen
 * stays until the next one arrives.
 */
export function usePlaylist(playlistId: number, params: PlaylistPageParams) {
  return useQuery({
    queryKey: queryKeys.playlists.detail(playlistId, params),
    queryFn: ({ signal }) => getPlaylist(playlistId, params, signal),
    placeholderData: keepPreviousData,
  });
}

/** The play queue in the order the page shows (`sort`, `direction`) */
export function usePlaylistQueue(
  playlistId: number,
  params: PlaylistQueueParams
) {
  return useQuery({
    queryKey: queryKeys.playlists.queue(
      playlistId,
      params.sort,
      params.direction
    ),
    queryFn: ({ signal }) => getPlaylistQueue(playlistId, params, signal),
  });
}

/**
 * A playlist write. The list, every page, every queue and the shares live
 * under `queryKeys.playlists.all()`, so one invalidation after a success
 * refetches what is on screen and marks the rest stale.
 */
function usePlaylistMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all() }),
  });
}

/** Create a playlist */
export function useCreatePlaylist() {
  return usePlaylistMutation((body: CreatePlaylistRequest) =>
    createPlaylist(body)
  );
}

/** Copy a playlist the viewer can see into their own playlists */
export function useDuplicatePlaylist() {
  return usePlaylistMutation(({ playlistId }: { playlistId: number }) =>
    duplicatePlaylist(playlistId)
  );
}

/** Delete a playlist, with its items and shares */
export function useDeletePlaylist() {
  return usePlaylistMutation(({ playlistId }: { playlistId: number }) =>
    deletePlaylist(playlistId)
  );
}

/** Add scenes to a playlist, in the order given */
export function useAddScenesToPlaylist() {
  return usePlaylistMutation(
    ({
      playlistId,
      scenes,
    }: { playlistId: number } & AddScenesToPlaylistRequest) =>
      addScenesToPlaylist(playlistId, { scenes })
  );
}

/** Move one item to an index among the items the owner sees */
export function useMovePlaylistItem() {
  return usePlaylistMutation(
    ({
      playlistId,
      itemId,
      index,
    }: {
      playlistId: number;
      itemId: number;
      index: number;
    }) => movePlaylistItem(playlistId, itemId, { index })
  );
}

/** Remove items by item id */
export function useRemovePlaylistItems() {
  return usePlaylistMutation(
    ({ playlistId, itemIds }: { playlistId: number; itemIds: number[] }) =>
      removePlaylistItems(playlistId, { itemIds })
  );
}

/** Save a view sort as the playlist's own order */
export function useSortPlaylist() {
  return usePlaylistMutation(
    ({
      playlistId,
      sort,
      direction,
    }: { playlistId: number } & SortPlaylistRequest) =>
      sortPlaylist(playlistId, { sort, direction })
  );
}

/** Change a playlist's name, description, shuffle or repeat */
export function useUpdatePlaylist() {
  return usePlaylistMutation(
    ({ playlistId, ...body }: { playlistId: number } & UpdatePlaylistRequest) =>
      updatePlaylist(playlistId, body)
  );
}

/** Remove the items whose scene is deleted from Stash (owner only) */
export function useRemoveUnavailableItems() {
  return usePlaylistMutation(({ playlistId }: { playlistId: number }) =>
    removeUnavailableItems(playlistId)
  );
}
