/**
 * Per-request access checks for media routes (sweep item 2).
 *
 * A media request names one or more entities in its path. The user may load
 * it only when EntityAccessService allows every one of them on the instance
 * the request is served from, so hidden items, restrictions and instance
 * selection apply to thumbnails and streams as they do to lists.
 */
import { canUserAccessEntity } from "../services/EntityAccessService.js";
import { INSTANCE_ID_PATTERN, type MediaEntity } from "./stashMediaPath.js";

/**
 * The error every media route answers with 400 when its `?instanceId=` is
 * missing or malformed: media is served only from the instance a request
 * names, never from a guessed one.
 */
export const INSTANCE_ID_REQUIRED = "instanceId is required";

/**
 * A media request's `instanceId` as the routes accept it: one string
 * matching INSTANCE_ID_PATTERN. A repeated parameter arrives as an array
 * and is refused.
 */
export function isValidInstanceId(value: unknown): value is string {
  return typeof value === "string" && INSTANCE_ID_PATTERN.test(value);
}

/**
 * True when the user may load every entity the media path names on the
 * instance the request names and is served from (a scene_marker path names
 * its scene and its clip; both must pass).
 */
export async function canUserLoadMedia(
  userId: number,
  entities: MediaEntity[],
  instanceId: string
): Promise<boolean> {
  if (entities.length === 0) return false;
  const results = await Promise.all(
    entities.map((e) =>
      canUserAccessEntity(userId, e.entityType, e.entityId, instanceId)
    )
  );
  return results.every(Boolean);
}
