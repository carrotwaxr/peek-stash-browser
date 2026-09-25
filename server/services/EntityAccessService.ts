/**
 * EntityAccessService: may this user see this entity?
 *
 * The single read helper for decisions about one id, or a batch of ids, that
 * came in a request (ratings, history writes, downloads and media) or that a
 * query builder loads for tooltips (keepVisibleConditions). The list
 * builders keep their LEFT JOIN on UserExcludedEntity, and in-memory reads
 * keep entityExclusionHelper.filterExcluded.
 *
 * An entity (entityId, instanceId) is accessible to userId when all of these
 * hold:
 * 1. Its cached row exists with that id and stashInstanceId, and deletedAt
 *    IS NULL.
 * 2. StashInstance.enabled = 1 for that instance, and its first sync has
 *    finished with its users' exclusions computed (firstSyncedAt IS NOT
 *    NULL): until then nobody, admins included, is served its content.
 * 3. The instance is allowed: a user with no UserStashInstance rows may use
 *    every enabled instance, otherwise only their selected ones. Rules 2
 *    and 3 mirror UserInstanceService.getUserAllowedInstanceIds and must
 *    change with it (item 12); the integration test "agrees with
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
 * resolveVisibleApartFromOwnHides applies the same rules with rule 4 read as
 * if the user had hidden nothing, for the Hidden Items list.
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
 * Rules 1, 2 and 3 for the row aliased `x`. Binds userId, userId. The
 * queries' own JOIN on StashInstance checks rule 2's enabled part too; the
 * probe here keeps every query that uses the clause on both parts.
 */
const LIVE_AND_ALLOWED_WHERE = `x.deletedAt IS NULL
  AND EXISTS (SELECT 1 FROM StashInstance ri WHERE ri.id = x.stashInstanceId AND ri.enabled = 1 AND ri.firstSyncedAt IS NOT NULL)
  AND (NOT EXISTS (SELECT 1 FROM UserStashInstance usi WHERE usi.userId = ?)
       OR EXISTS (SELECT 1 FROM UserStashInstance usi WHERE usi.userId = ? AND usi.instanceId = x.stashInstanceId))`;

/**
 * Rule 4's probe for the row aliased `x`. Binds userId, entityType. Any
 * reason excludes, `pending` included: a hold a sync batch wrote for a
 * changed entity, replaced by the user's next recompute.
 */
const EXCLUSION_PROBE = `SELECT 1 FROM UserExcludedEntity e
                  WHERE e.userId = ? AND e.entityType = ? AND e.entityId = x.id
                    AND (e.instanceId = '' OR e.instanceId = x.stashInstanceId)`;

/**
 * Rules 1 to 4 for the row aliased `x`, shared by every query here so the
 * single, batch and guess checks can't drift. Binds userId, userId, userId,
 * entityType. Each probe hits an index: StashInstance's primary key,
 * UserStashInstance (userId, instanceId) and UserExcludedEntity (userId,
 * entityType, entityId, instanceId).
 */
const ACCESS_WHERE = `${LIVE_AND_ALLOWED_WHERE}
  AND NOT EXISTS (${EXCLUSION_PROBE})`;

/**
 * ACCESS_WHERE as if the user had hidden nothing: rule 4 ignores rows whose
 * reason is 'hidden'. Same binds.
 *
 * This reads the user's own hides apart from everything else because of how
 * the compute stores reasons (ExclusionComputationService, "Reason
 * precedence"): every restriction-derived reason ('restricted', a cascade
 * of a restriction, a content rule, 'empty' under the restrictions alone) is
 * stored ahead of 'hidden', and the incremental hide never overwrites a row.
 * So a key whose row is 'hidden' is one the user would see if they had
 * hidden nothing. Any other row still excludes, including a 'cascade' or
 * 'empty' row that the user's own hides produced for an entity they never
 * hid themselves: at worst a visible entity reads as not visible, never the
 * reverse. A `pending` row is such a row too: a sync batch wrote it to hold
 * a changed entity from the user until their recompute (C18), so the entity
 * is not visible, on the Hidden Items list included, until the recompute
 * settles what it is.
 */
const ACCESS_WHERE_APART_FROM_OWN_HIDES = `${LIVE_AND_ALLOWED_WHERE}
  AND NOT EXISTS (${EXCLUSION_PROBE}
                    AND e.reason <> 'hidden')`;

function sourceFor(entityType: AccessEntityType): EntitySource {
  if (!Object.prototype.hasOwnProperty.call(ENTITY_SOURCES, entityType)) {
    throw new Error(`Unknown entity type: ${entityType}`);
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
    const id = ref.id ?? "";
    const instanceId = ref.instanceId ?? "";
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
 * Batch form of resolveAccessibleInstanceId's guess: the ids (no instance)
 * this user may see on at least one instance. One SQL round trip, one bound
 * JSON parameter for all ids; each id probes the entity primary key.
 */
export async function getIdsVisibleOnAnyInstance(
  userId: number,
  entityType: Exclude<AccessEntityType, "clip">,
  ids: ReadonlyArray<string>
): Promise<Set<string>> {
  const source = sourceFor(entityType);
  const unique = [...new Set(ids.map((id) => id ?? ""))].filter(Boolean);
  if (unique.length === 0) return new Set();

  const sql = `SELECT DISTINCT x.id AS id
FROM json_each(?) j
CROSS JOIN ${source.table} x ON x.id = j.value
JOIN StashInstance si ON si.id = x.stashInstanceId AND si.enabled = 1
${source.join}
WHERE ${ACCESS_WHERE}
  ${source.where}`;

  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    sql,
    JSON.stringify(unique),
    ...accessParams(source, userId, entityType)
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * The conditions whose (id, stashInstanceId) this user may see, in their
 * order. For the query builders' relation loaders: filter the composite-key
 * conditions before the findMany, so tooltips never list an entity the user
 * can't see. One SQL round trip.
 */
export async function keepVisibleConditions<
  T extends { id: string; stashInstanceId: string },
>(userId: number, entityType: AccessEntityType, conditions: T[]): Promise<T[]> {
  if (conditions.length === 0) return conditions;
  const visible = await getVisibleEntityKeys(
    userId,
    entityType,
    conditions.map((c) => ({ id: c.id, instanceId: c.stashInstanceId }))
  );
  return conditions.filter((c) =>
    visible.has(entityRefKey(c.id, c.stashInstanceId))
  );
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

/**
 * The entity types a user can hide (clips follow their scene).
 */
export type HideableEntityType = Exclude<AccessEntityType, "clip">;

/**
 * For hidden rows: where could this user see each entity if they had hidden
 * nothing? Returns, keyed by entityRefKey(ref.id, ref.instanceId) as passed
 * in, the instance to show the entity from; a ref with no entry has no such
 * instance (restricted for the user, empty for them, deleted, or on an
 * instance they do not use). A ref with instanceId '' (a hide stored for
 * every instance) resolves to the first qualifying instance by
 * StashInstance.priority, then id, the order resolveAccessibleInstanceId
 * guesses in. One SQL round trip, one bound JSON parameter for all refs.
 */
export async function resolveVisibleApartFromOwnHides(
  userId: number,
  entityType: HideableEntityType,
  refs: ReadonlyArray<EntityRef>
): Promise<Map<string, string>> {
  const source = sourceFor(entityType);

  const unique = new Map<string, [string, string]>();
  for (const ref of refs) {
    const id = ref.id ?? "";
    const instanceId = ref.instanceId ?? "";
    if (!id) continue;
    unique.set(entityRefKey(id, instanceId), [id, instanceId]);
  }
  if (unique.size === 0) return new Map();

  // The CTE comes first so the JSON is the first bound parameter; each ref
  // then probes the entity primary key (id, stashInstanceId) by its id.
  const sql = `WITH r(id, inst) AS (
  SELECT json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]') FROM json_each(?) j
)
SELECT r.id AS id, r.inst AS requested,
  (SELECT x.stashInstanceId
     FROM ${source.table} x
     JOIN StashInstance si ON si.id = x.stashInstanceId AND si.enabled = 1
     ${source.join}
    WHERE x.id = r.id AND (r.inst = '' OR x.stashInstanceId = r.inst)
      AND ${ACCESS_WHERE_APART_FROM_OWN_HIDES}
      ${source.where}
    ORDER BY si.priority, x.stashInstanceId
    LIMIT 1) AS instanceId
FROM r`;

  const rows = await prisma.$queryRawUnsafe<
    Array<{ id: string; requested: string; instanceId: string | null }>
  >(
    sql,
    JSON.stringify([...unique.values()]),
    ...accessParams(source, userId, entityType)
  );
  const resolved = new Map<string, string>();
  for (const row of rows) {
    if (row.instanceId) {
      resolved.set(entityRefKey(row.id, row.requested), row.instanceId);
    }
  }
  return resolved;
}
