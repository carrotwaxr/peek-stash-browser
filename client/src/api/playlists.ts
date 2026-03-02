/**
 * Playlist sharing API endpoints.
 */
import { apiGet, apiPost, apiPut } from "./client";

export const getSharedPlaylists = () =>
  apiGet<{ playlists: unknown[] }>("/playlists/shared");

export const getPlaylistShares = (playlistId: number) =>
  apiGet<{ shares: unknown[] }>(`/playlists/${playlistId}/shares`);

export const updatePlaylistShares = (playlistId: number, groupIds: number[]) =>
  apiPut<{ shares: unknown[] }>(`/playlists/${playlistId}/shares`, { groupIds });

export const duplicatePlaylist = (playlistId: number) =>
  apiPost<{ playlist: unknown }>(`/playlists/${playlistId}/duplicate`);
