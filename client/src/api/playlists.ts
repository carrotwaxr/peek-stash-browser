/**
 * Playlist API endpoints, typed with the shared contract
 * (`shared/types/api/playlist.ts`).
 */
import type {
  AddSceneToPlaylistRequest,
  AddSceneToPlaylistResponse,
  AddScenesToPlaylistRequest,
  AddScenesToPlaylistResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  DeletePlaylistResponse,
  DuplicatePlaylistResponse,
  GetPlaylistQueueResponse,
  GetPlaylistResponse,
  GetPlaylistSharesResponse,
  GetSharedPlaylistsResponse,
  GetUserPlaylistsQuery,
  GetUserPlaylistsResponse,
  MovePlaylistItemRequest,
  MovePlaylistItemResponse,
  RemovePlaylistItemsRequest,
  RemovePlaylistItemsResponse,
  RemoveSceneFromPlaylistResponse,
  RemoveUnavailableItemsResponse,
  SortPlaylistRequest,
  SortPlaylistResponse,
  UpdatePlaylistRequest,
  UpdatePlaylistResponse,
  UpdatePlaylistSharesRequest,
  UpdatePlaylistSharesResponse,
} from "@peek/shared-types";
import { apiDelete, apiGet, apiPost, apiPut } from "./client";

/** The item page a playlist is read in, and the order it is read in */
export interface PlaylistPageParams {
  page?: number;
  perPage?: number;
  sort?: string;
  direction?: "ASC" | "DESC";
}

/** The order a play queue is read in */
export interface PlaylistQueueParams {
  sort?: string;
  direction?: "ASC" | "DESC";
}

/** `?a=1&b=2` for the defined values, "" for none */
function queryString(
  params: Record<string, string | number | undefined>
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const getPlaylists = (params: GetUserPlaylistsQuery = {}) =>
  apiGet<GetUserPlaylistsResponse>(
    `/playlists${queryString({ containsScene: params.containsScene })}`
  );

export const getSharedPlaylists = () =>
  apiGet<GetSharedPlaylistsResponse>("/playlists/shared");

export const getPlaylist = (
  playlistId: number,
  params: PlaylistPageParams = {},
  signal?: AbortSignal
) =>
  apiGet<GetPlaylistResponse>(
    `/playlists/${playlistId}${queryString({
      page: params.page,
      per_page: params.perPage,
      sort: params.sort,
      direction: params.direction,
    })}`,
    signal
  );

export const getPlaylistQueue = (
  playlistId: number,
  params: PlaylistQueueParams = {},
  signal?: AbortSignal
) =>
  apiGet<GetPlaylistQueueResponse>(
    `/playlists/${playlistId}/queue${queryString({
      sort: params.sort,
      direction: params.direction,
    })}`,
    signal
  );

export const createPlaylist = (body: CreatePlaylistRequest) =>
  apiPost<CreatePlaylistResponse>("/playlists", body);

export const updatePlaylist = (
  playlistId: number,
  body: UpdatePlaylistRequest
) => apiPut<UpdatePlaylistResponse>(`/playlists/${playlistId}`, body);

export const deletePlaylist = (playlistId: number) =>
  apiDelete<DeletePlaylistResponse>(`/playlists/${playlistId}`);

export const addSceneToPlaylist = (
  playlistId: number,
  body: AddSceneToPlaylistRequest
) =>
  apiPost<AddSceneToPlaylistResponse>(`/playlists/${playlistId}/items`, body);

export const addScenesToPlaylist = (
  playlistId: number,
  body: AddScenesToPlaylistRequest
) =>
  apiPost<AddScenesToPlaylistResponse>(
    `/playlists/${playlistId}/items/bulk`,
    body
  );

export const removeSceneFromPlaylist = (
  playlistId: number,
  sceneId: string,
  instanceId: string
) =>
  apiDelete<RemoveSceneFromPlaylistResponse>(
    `/playlists/${playlistId}/items/${encodeURIComponent(sceneId)}${queryString({ instanceId })}`
  );

export const movePlaylistItem = (
  playlistId: number,
  itemId: number,
  body: MovePlaylistItemRequest
) =>
  apiPut<MovePlaylistItemResponse>(
    `/playlists/${playlistId}/items/${itemId}/position`,
    body
  );

export const removePlaylistItems = (
  playlistId: number,
  body: RemovePlaylistItemsRequest
) =>
  apiPost<RemovePlaylistItemsResponse>(
    `/playlists/${playlistId}/items/remove`,
    body
  );

export const sortPlaylist = (playlistId: number, body: SortPlaylistRequest) =>
  apiPost<SortPlaylistResponse>(`/playlists/${playlistId}/sort`, body);

export const removeUnavailableItems = (playlistId: number) =>
  apiPost<RemoveUnavailableItemsResponse>(
    `/playlists/${playlistId}/items/remove-unavailable`
  );

export const getPlaylistShares = (playlistId: number) =>
  apiGet<GetPlaylistSharesResponse>(`/playlists/${playlistId}/shares`);

export const updatePlaylistShares = (playlistId: number, groupIds: number[]) =>
  apiPut<UpdatePlaylistSharesResponse>(`/playlists/${playlistId}/shares`, {
    groupIds,
  } satisfies UpdatePlaylistSharesRequest);

export const duplicatePlaylist = (playlistId: number) =>
  apiPost<DuplicatePlaylistResponse>(`/playlists/${playlistId}/duplicate`);
