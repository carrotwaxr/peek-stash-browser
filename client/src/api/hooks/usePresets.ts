import type {
  GetDefaultFilterPresetsResponse,
  GetFilterPresetsResponse,
} from "@peek/shared-types";
import { presetArtifactType } from "@peek/shared-types/presetContexts.js";
import {
  type QueryClient,
  queryOptions,
  useQuery,
} from "@tanstack/react-query";
import { apiGet } from "..";
import { queryKeys } from "../queryKeys";

/**
 * The user's saved filter presets and default-preset ids: one request each per
 * session, shared by every list page and its Load Preset menu. A save, delete
 * or default change calls `invalidatePresets`; sign-out clears the cache.
 */
export const presetsQueryOptions = queryOptions({
  queryKey: queryKeys.user.filterPresets(),
  queryFn: () => apiGet<GetFilterPresetsResponse>("/user/filter-presets"),
  staleTime: Infinity,
});

export const defaultPresetsQueryOptions = queryOptions({
  queryKey: queryKeys.user.defaultPresets(),
  queryFn: () =>
    apiGet<GetDefaultFilterPresetsResponse>("/user/default-presets"),
  staleTime: Infinity,
});

/** A saved preset as the list pages read it. */
export interface SavedPreset {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  sort: string;
  direction: string;
  viewMode?: string;
  zoomLevel?: string;
  gridDensity?: string;
  tableColumns?: Record<string, unknown> | null;
  perPage?: number | null;
}

/** The presets a list context offers; scene grid contexts use the scene presets. */
export function presetsForContext(
  response: GetFilterPresetsResponse | undefined,
  context: string
): SavedPreset[] {
  const artifactType = presetArtifactType(context);
  return (response?.presets[artifactType] ?? []) as unknown as SavedPreset[];
}

export function useFilterPresets() {
  return useQuery(presetsQueryOptions);
}

export function useDefaultPresets() {
  return useQuery(defaultPresetsQueryOptions);
}

/** Refetch both preset queries after a save, delete or default change. */
export function invalidatePresets(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.user.filterPresets() }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.user.defaultPresets(),
    }),
  ]);
}
