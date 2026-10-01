import type { GetMyPermissionsResponse } from "@peek/shared-types";

/** A resolved-permissions answer: everything denied except the overrides */
export function permissions(
  overrides: Partial<GetMyPermissionsResponse["permissions"]> = {}
): GetMyPermissionsResponse["permissions"] {
  return {
    canShare: false,
    canDownloadFiles: false,
    canDownloadPlaylists: false,
    sources: {
      canShare: "default",
      canDownloadFiles: "default",
      canDownloadPlaylists: "default",
    },
    ...overrides,
  };
}
