/**
 * A user's recommendation preferences as Recommended, Scenes Like This and
 * My Stats read them: one lookup, and the ignored tags as (id, instance)
 * refs or entity keys (an entry without an instance names no tag).
 */
import { parseEntityRef } from "@peek/shared-types/instanceAwareId.js";
import {
  type RecommendationPreferences,
  readRecommendationPreferences,
} from "@peek/shared-types/recommendationPreferences.js";
import prisma from "../prisma/singleton.js";
import { type EntityRef, entityKey } from "../utils/entityRef.js";

/** The user's recommendation preferences, defaults for anything unreadable */
export async function readUserRecommendationPreferences(
  userId: number
): Promise<RecommendationPreferences> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { recommendationPreferences: true },
  });
  return readRecommendationPreferences(user?.recommendationPreferences);
}

/** The ignored tags as (id, instance) refs, each on its own instance */
export function ignoredTagRefs(prefs: RecommendationPreferences): EntityRef[] {
  return prefs.ignoredTagIds.flatMap((value) => {
    const { id, instanceId } = parseEntityRef(value);
    return id !== "" && instanceId !== undefined && instanceId !== ""
      ? [{ id, instanceId }]
      : [];
  });
}

/** The ignored tags as entityKeys */
export function ignoredTagKeys(prefs: RecommendationPreferences): Set<string> {
  return new Set(
    ignoredTagRefs(prefs).map((ref) => entityKey(ref.id, ref.instanceId))
  );
}
