import type {
  GetUserSettingsResponse,
  UpdateUserSettingsBody,
  UpdateUserSettingsResponse,
} from "@peek/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "..";
import { useAuth } from "../../hooks/useAuth";
import { queryKeys } from "../queryKeys";

export type UserSettings = GetUserSettingsResponse["settings"];

/** The landing page the server reports when none is stored. */
const DEFAULT_LANDING_PAGE = { pages: ["home"], randomize: false };

/**
 * The signed-in user's settings: one request per session, shared by every
 * reader. A save through `useUpdateUserSettings` updates the cache, so each
 * reader sees it at once; sign-out clears the cache.
 */
export function useUserSettings() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.user.settings(),
    queryFn: ({ signal }) =>
      apiGet<GetUserSettingsResponse>("/user/settings", signal),
    enabled: isAuthenticated,
    staleTime: Infinity,
  });
}

/** The stored settings with a saved patch applied, as the server now holds them. */
function applyPatch(
  settings: UserSettings,
  patch: UpdateUserSettingsBody
): UserSettings {
  const { landingPagePreference, ...rest } = patch;
  return {
    ...settings,
    ...rest,
    ...(landingPagePreference !== undefined && {
      landingPagePreference: landingPagePreference ?? DEFAULT_LANDING_PAGE,
    }),
  };
}

/**
 * Save part of the user's settings (PUT /user/settings). On success the
 * settings cache takes the patch, so every reader updates without a refetch.
 */
export function useUpdateUserSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateUserSettingsBody) =>
      apiPut<UpdateUserSettingsResponse>("/user/settings", patch),
    onSuccess: (_response, patch) => {
      queryClient.setQueryData<GetUserSettingsResponse>(
        queryKeys.user.settings(),
        (old) => old && { settings: applyPatch(old.settings, patch) }
      );
    },
  });
}
