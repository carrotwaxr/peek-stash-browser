import { useQuery } from "@tanstack/react-query";
import { getMyPermissions } from "..";
import { useAuth } from "../../hooks/useAuth";
import { queryKeys } from "../queryKeys";

/**
 * The signed-in user's resolved permissions (`GET /user/permissions`): one
 * request shared by the scene page, the playlist page and the lightbox. The
 * answer stays fresh for the default 5 minutes. The server enforces every
 * permission, so a stale "can download" only shows a button that answers 403.
 *
 * @param enabled - false holds the request back (the lightbox asks only while open)
 */
export function useMyPermissions(enabled = true) {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.user.permissions(),
    queryFn: ({ signal }) => getMyPermissions(signal),
    select: (response) => response.permissions,
    enabled: isAuthenticated && enabled,
  });
}
