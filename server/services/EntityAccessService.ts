/**
 * EntityAccessService: may this user see this entity?
 *
 * The single read helper for decisions about one id, or a batch of ids, that
 * came in a request: ratings, history writes, downloads and media. The list
 * builders keep their LEFT JOIN on UserExcludedEntity, and in-memory reads
 * keep entityExclusionHelper.filterExcluded.
 *
 * An entity (entityId, instanceId) is accessible to userId when all of these
 * hold:
 * 1. Its cached row exists with that id and stashInstanceId, and deletedAt
 *    IS NULL.
 * 2. StashInstance.enabled = 1 for that instance.
 * 3. The instance is allowed: a user with no UserStashInstance rows may use
 *    every enabled instance, otherwise only their selected ones. This clause
 *    mirrors UserInstanceService.getUserAllowedInstanceIds and must change
 *    with it (item 12); the integration test "agrees with
 *    getUserAllowedInstanceIds" fails when one side changes alone.
 * 4. No UserExcludedEntity row for (userId, entityType, entityId) has an
 *    instanceId of '' or the entity's instance.
 * 5. Clips only: the clip's scene is not soft-deleted and has no scene
 *    exclusion row, under the same instance rule. A clip is hidden when the
 *    clip or its scene is hidden.
 *
 * No role logic, by design: the exclusion compute already settles admins (an
 * admin's rows hold only their own hides and cascades, never restriction
 * output), so reading UserExcludedEntity for every user is exactly the policy.
 *
 * Every value is bound; the table name and the clip fragments come from a
 * fixed map keyed by the typed entity type. A database error throws: access
 * is never allowed because a query failed.
 */
import prisma from "../prisma/singleton.js";

export type AccessEntityType =
  | "scene"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery"
  | "image"
  | "clip";

export interface EntityRef {
  id: string;
  instanceId: string;
}

// Matches UserStatsService.KEY_SEP. Not imported: UserStatsService pulls in
// StashEntityService and the instance manager.
const KEY_SEP = "\0";

/** Map key for in-memory sets: `${id}\0${instanceId}`. */
export function entityRefKey(id: string, instanceId: string): string {
  return `${id}${KEY_SEP}${instanceId}`;
}

interface EntitySource {
  table: string;
  join: string;
  where: string;
  /** The clip's scene exclusion check binds one more userId. */
  extraUserParam: boolean;
}

const plain = (table: string): EntitySource => ({
  table,
  join: "",
  where: "",
  extraUserParam: false,
});

const ENTITY_SOURCES: Record<AccessEntityType, EntitySource> = {
  scene: plain("StashScene"),
  performer: plain("StashPerformer"),
  studio: plain("StashStudio"),
  tag: plain("StashTag"),
  group: plain("StashGroup"),
  gallery: plain("StashGallery"),
  image: plain("StashImage"),
  clip: {
    table: "StashClip",
    join: "JOIN StashScene cs ON cs.id = x.sceneId AND cs.stashInstanceId = x.sceneInstanceId AND cs.deletedAt IS NULL",
    where:
      "AND NOT EXISTS (SELECT 1 FROM UserExcludedEntity es WHERE es.userId = ? AND es.entityType = 'scene' AND es.entityId = cs.id AND (es.instanceId = '' OR es.instanceId = cs.stashInstanceId))",
    extraUserParam: true,
  },
};

/**
 * Rules 1, 3 and 4 for the row aliased `x`, shared by every query here so the
 * single, batch and guess checks can't drift. Binds userId, userId, userId,
 * entityType. Each probe hits an index: UserStashInstance (userId,
 * instanceId) and UserExcludedEntity (userId, entityType, entityId,
 * instanceId).
 */
const ACCESS_WHERE = `x.deletedAt IS NULL
  AND (NOT EXISTS (SELECT 1 FROM UserStashInstance usi WHERE usi.userId = ?)
       OR EXISTS (SELECT 1 FROM UserStashInstance usi WHERE usi.userId = ? AND usi.instanceId = x.stashInstanceId))
  AND NOT EXISTS (SELECT 1 FROM UserExcludedEntity e
                  WHERE e.userId = ? AND e.entityType = ? AND e.entityId = x.id
                    AND (e.instanceId = '' OR e.instanceId = x.stashInstanceId))`;

function sourceFor(entityType: AccessEntityType): EntitySource {
  if (!Object.prototype.hasOwnProperty.call(ENTITY_SOURCES, entityType)) {
    throw new Error(`Unknown entity type: ${String(entityType)}`);
  }
  return ENTITY_SOURCES[entityType];
}

/** The params ACCESS_WHERE and the source's own clause bind, in order. */
function accessParams(
  source: EntitySource,
  userId: number,
  entityType: AccessEntityType
): unknown[] {
  const params: unknown[] = [userId, userId, userId, entityType];
  if (source.extraUserParam) params.push(userId);
  return params;
}

/** May this user see this one entity? One SQL round trip. */
export async function canUserAccessEntity(
  userId: number,
  entityType: AccessEntityType,
  entityId: string,
  instanceId: string
): Promise<boolean> {
  const source = sourceFor(entityType);
  if (!entityId || !instanceId) return false;

  const sql = `SELECT 1 AS ok
FROM ${source.table} x
JOIN StashInstance si ON si.id = x.stashInstanceId AND si.enabled = 1
${source.join}
WHERE x.id = ? AND x.stashInstanceId = ?
  AND ${ACCESS_WHERE}
  ${source.where}
LIMIT 1`;

  const rows = await prisma.$queryRawUnsafe<{ ok: number }[]>(
    sql,
    entityId,
    instanceId,
    ...accessParams(source, userId, entityType)
  );
  return rows.length > 0;
}

/**
 * Batch form: the entityRefKey()s of the refs the user may see. One SQL round
 * trip, one bound JSON parameter for all refs, so a large batch never hits
 * SQLite's bound-parameter limit.
 */
export async function getVisibleEntityKeys(
  userId: number,
  entityType: AccessEntityType,
  refs: ReadonlyArray<EntityRef>
): Promise<Set<string>> {
  const source = sourceFor(entityType);

  const unique = new Map<string, [string, string]>();
  for (const ref of refs) {
    const id = String(ref.id ?? "");
    const instanceId = String(ref.instanceId ?? "");
    if (!id || !instanceId) continue;
    unique.set(entityRefKey(id, instanceId), [id, instanceId]);
  }
  if (unique.size === 0) return new Set();

  // CROSS JOIN makes SQLite keep json_each as the outer loop, so each ref
  // probes the entity primary key. With a plain JOIN the planner can scan the
  // whole table by deletedAt and re-read the JSON for every row (27 s for
  // 5,000 refs against 26k scenes).
  const sql = `SELECT x.id AS id, x.stashInstanceId AS instanceId
FROM json_each(?) j
CROSS JOIN ${source.table} x ON x.id = json_extract(j.value, '$[0]') AND x.stashInstanceId = json_extract(j.value, '$[1]')
JOIN StashInstance si ON si.id = x.stashInstanceId AND si.enabled = 1
${source.join}
WHERE ${ACCESS_WHERE}
  ${source.where}`;

  const rows = await prisma.$queryRawUnsafe<EntityRef[]>(
    sql,
    JSON.stringify([...unique.values()]),
    ...accessParams(source, userId, entityType)
  );
  return new Set(rows.map((r) => entityRefKey(r.id, r.instanceId)));
}

/**
 * For writes that may omit the instance: the request's instance if
 * canUserAccessEntity passes, else null. With no request instance, the legacy
 * guess: the first instance where this user can see the entity
 * (StashInstance.priority, then id), else null. Item 33 removes the guess.
 */
export async function resolveAccessibleInstanceId(
  userId: number,
  entityType: Exclude<AccessEntityType, "clip">,
  entityId: string,
  requestInstanceId: string | undefined
): Promise<string | null> {
  if (requestInstanceId !== undefined) {
    return (await canUserAccessEntity(
      userId,
      entityType,
      entityId,
      requestInstanceId
    ))
      ? requestInstanceId
      : null;
  }

  // Legacy guess (item 33 removes it): only copies this user can see, so a
  // hidden or deselected same-id copy on another instance never turns a
  // visible entity into a 404.
  const source = sourceFor(entityType);
  if (!entityId) return null;

  const guessSql = `SELECT x.stashInstanceId AS instanceId
FROM ${source.table} x
JOIN StashInstance si ON si.id = x.stashInstanceId AND si.enabled = 1
${source.join}
WHERE x.id = ?
  AND ${ACCESS_WHERE}
  ${source.where}
ORDER BY si.priority, x.stashInstanceId
LIMIT 1`;

  const rows = await prisma.$queryRawUnsafe<{ instanceId: string }[]>(
    guessSql,
    entityId,
    ...accessParams(source, userId, entityType)
  );
  return rows[0]?.instanceId ?? null;
}
