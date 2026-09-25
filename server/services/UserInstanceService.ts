/**
 * UserInstanceService
 *
 * Manages user-to-instance mappings and provides filtering logic for multi-instance support.
 *
 * Key behaviors:
 * - Users with no UserStashInstance records see ALL enabled instances (default)
 * - Users with UserStashInstance records see only those selected instances
 *   that are enabled
 * - A selection only narrows (invariant 11): when none of its instances is
 *   enabled (the admin disabled them), the user sees every enabled instance,
 *   as with no selection, rather than nothing
 * - Disabled instances are never shown regardless of user selection
 * - An instance on its first sync (no firstSyncedAt) is shown to nobody,
 *   admins included, until that sync's exclusion recompute has run; the
 *   compute itself already covers it (the scope)
 */
import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/** An instance in a user's scope, and whether its first sync is done. */
interface ScopedInstance {
  id: string;
  ready: boolean;
}

/**
 * The enabled instances, narrowed to the user's selection when it names an
 * enabled one (an empty selection, or one whose instances are all disabled,
 * means all enabled), each with whether its first sync has finished
 * (`firstSyncedAt`). Throws on a database error.
 */
async function readScope(userId: number): Promise<ScopedInstance[]> {
  // Get all enabled instances
  const enabledInstances = await prisma.stashInstance.findMany({
    where: { enabled: true },
    select: { id: true, firstSyncedAt: true },
  });
  const enabled = new Map(
    enabledInstances.map((i) => [i.id, i.firstSyncedAt !== null])
  );

  // Get user's instance selections
  const userSelections = await prisma.userStashInstance.findMany({
    where: { userId },
    select: { instanceId: true },
  });

  // The selection narrowed to the enabled instances; when that leaves none
  // (no selection, or every selected instance disabled), every enabled one
  const selected = userSelections
    .map((s) => s.instanceId)
    .filter((id) => enabled.has(id));
  const ids = selected.length > 0 ? selected : Array.from(enabled.keys());
  return ids.map((id) => ({ id, ready: enabled.get(id) === true }));
}

/**
 * A user's instance scope: the enabled instances, narrowed to the user's
 * selection when it names an enabled one (an empty selection, or one whose
 * instances are all disabled, means all enabled), whether or not their
 * first sync has finished. The exclusion compute runs
 * over it, so an instance's exclusion rows exist before it shows, and a
 * sync recomputes the users whose scope holds a changed instance. Throws on
 * a database error.
 *
 * @param userId - The user ID
 * @returns Array of instance IDs in the user's scope
 */
export async function getUserInstanceScope(userId: number): Promise<string[]> {
  return (await readScope(userId)).map((i) => i.id);
}

/**
 * The users whose scope includes `instanceId` in either of its enabled
 * states: those whose selection names it, and those whose selection names
 * no other enabled instance (no selection at all, or only disabled ones),
 * who see every enabled instance. These are the users a change to the
 * instance's enabled state, or its deletion, affects; read them before a
 * deletion removes the selection rows.
 *
 * @param instanceId - The instance ID
 * @returns The user IDs, in id order
 */
export async function getUsersSelecting(instanceId: string): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { stashInstances: { some: { instanceId } } },
        {
          stashInstances: {
            none: { instance: { enabled: true, id: { not: instanceId } } },
          },
        },
      ],
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return users.map((u) => u.id);
}

/**
 * Get the list of Stash instance IDs that a user should see content from:
 * the user's scope (getUserInstanceScope) without the instances still on
 * their first sync, or none when it cannot be read. Everything that lists,
 * counts or serves content filters by it; EntityAccessService's
 * LIVE_AND_ALLOWED_WHERE applies the same rules in SQL.
 *
 * @param userId - The user ID
 * @returns Array of instance IDs the user should see content from
 */
export async function getUserAllowedInstanceIds(
  userId: number
): Promise<string[]> {
  try {
    return (await readScope(userId)).filter((i) => i.ready).map((i) => i.id);
  } catch (error) {
    logger.error("Failed to get user allowed instance IDs", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    // On error, fallback to empty array (no content) rather than showing everything
    return [];
  }
}

/**
 * Build a SQL filter condition for instance IDs.
 *
 * Returns a WHERE clause fragment and parameter array for filtering by instance.
 *
 * @param allowedInstanceIds - Array of allowed instance IDs
 * @param columnName - The column name to filter on (e.g., "s.stashInstanceId")
 * @returns Object with sql fragment and params array
 */
export function buildInstanceFilterClause(
  allowedInstanceIds: string[],
  columnName: string = "s.stashInstanceId"
): { sql: string; params: string[] } {
  if (allowedInstanceIds.length === 0) {
    // No allowed instances = filter out everything
    return { sql: "1 = 0", params: [] };
  }

  // Build IN clause with placeholders
  const placeholders = allowedInstanceIds.map(() => "?").join(", ");
  return {
    sql: `${columnName} IN (${placeholders})`,
    params: allowedInstanceIds,
  };
}
