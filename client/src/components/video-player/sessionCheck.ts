/**
 * The player's session check (sweep item 2).
 *
 * Media needs a session, but a <video> element cannot see its source's HTTP
 * status: a 401 looks like any other media error. On an error the player
 * asks the server once whether the session is still valid; /auth/* never
 * redirects inside apiFetch, so the answer comes back as an ApiError.
 */
import { apiGet } from "../../api";
import { ApiError } from "../../api/client";

export const SESSION_EXPIRED_PLAYBACK_MESSAGE =
  "Your session expired while the video was paused. Log in to keep watching.";

/** True only when /auth/check answers 401 or 403. */
export async function isSessionExpired(): Promise<boolean> {
  try {
    await apiGet("/auth/check");
    return false;
  } catch (error) {
    return (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    );
  }
}
