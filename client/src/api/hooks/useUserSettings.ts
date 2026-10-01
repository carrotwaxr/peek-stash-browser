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
 * reader, the providers included. A save through `useUpdateUserSettings`
 * updates the cache, so each reader sees it at once; sign-out clears the cache.
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

/** The stored settings with a patch applied, as the server will hold them. */
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
 * Save part of the user's settings (PUT /user/settings). The patch shows in
 * the settings cache at once, so every reader updates before the server
 * answers. A refused save refetches the settings, so every reader shows the
 * server's value again; refetching, rather than restoring a snapshot, keeps
 * two overlapping saves correct.
 */
export function useUpdateUserSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateUserSettingsBody) =>
      apiPut<UpdateUserSettingsResponse>("/user/settings", patch),
    onMutate: async (patch) => {
      const queryKey = queryKeys.user.settings();
      // A read in flight may carry the value from before this save
      await queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData<GetUserSettingsResponse>(
        queryKey,
        (old) => old && { settings: applyPatch(old.settings, patch) }
      );
    },
    onError: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.user.settings() }),
  });
}
