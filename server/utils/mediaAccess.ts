/**
 * Per-request access checks for media routes (sweep item 2).
 *
 * A media request names one or more entities in its path. The user may load
 * it only when EntityAccessService allows every one of them on the instance
 * the request is served from, so hidden items, restrictions and instance
 * selection apply to thumbnails and streams as they do to lists.
 */
import { canUserAccessEntity } from "../services/EntityAccessService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import type { MediaEntity } from "./stashMediaPath.js";

/**
 * The instance a media request is served from, which the access check must
 * look at: the one it names ("default" is an ordinary id), or the
 * highest-priority enabled instance when it names none, as the proxies'
 * `getCredentials` resolves it.
 */
export function resolveMediaInstanceId(instanceId: string | undefined): string {
  return stashInstanceManager.resolveInstanceId(instanceId);
}

/**
 * True when the user may load every entity the media path names (a
 * scene_marker path names its scene and its clip; both must pass).
 */
export async function canUserLoadMedia(
  userId: number,
  entities: MediaEntity[],
  instanceId: string | undefined
): Promise<boolean> {
  if (entities.length === 0) return false;
  const resolved = resolveMediaInstanceId(instanceId);
  const results = await Promise.all(
    entities.map((e) =>
      canUserAccessEntity(userId, e.entityType, e.entityId, resolved)
    )
  );
  return results.every(Boolean);
}
