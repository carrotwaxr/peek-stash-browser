/**
 * Safari's signed sources, when their link has run out. A <video> cannot see
 * an HTTP status, so a 401 on one reads as a network error: the link is
 * minted again and the selector's sources are swapped in place, and the
 * selector retries the same source at the same time with its new address.
 * Loaded on the first such error only, and kept free of the player's other
 * modules (the caller hands over what it needs).
 */
import type { SceneMediaLinkResponse } from "@peek/shared-types";
import type { PlayerSource } from "./playerSources";

const MEDIA_ERR_NETWORK = 2;

/** What the check calls on the player */
export interface LinkPlayer {
  error(): { code: number } | null;
  currentSrc(): string;
  sourceSelector(): { refreshSources(sources: PlayerSource[]): void };
}

/** The link the loaded sources were built from */
export interface LoadedLink {
  scene: unknown;
  expiresAt: string;
}

/** True when the sources now hold fresh addresses for the failed source */
export async function renewSignedLink(
  player: LinkPlayer | null,
  loaded: LoadedLink,
  fetchFresh: () => Promise<SceneMediaLinkResponse>,
  rebuild: (streams: SceneMediaLinkResponse["streams"]) => PlayerSource[],
  isCurrent: () => boolean
): Promise<boolean> {
  if (
    player?.error()?.code !== MEDIA_ERR_NETWORK ||
    !new URL(player.currentSrc()).searchParams.has("sig")
  ) {
    return false;
  }
  try {
    const fresh = await fetchFresh();
    // The scene changed while the link was out
    if (!isCurrent()) return false;
    loaded.expiresAt = fresh.expiresAt;
    player.sourceSelector().refreshSources(rebuild(fresh.streams));
    return true;
  } catch {
    return false;
  }
}
