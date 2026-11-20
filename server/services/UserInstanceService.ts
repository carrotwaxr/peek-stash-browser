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
 * - An admin can limit a USER to an allow-list (User.instanceAccessLimited
 *   plus UserInstanceAccess rows): a limited non-admin's scope is the enabled
 *   instances they are allowed, narrowed by their selection. A selection
 *   naming no allowed instance means all allowed, and an empty allow-list
 *   means nothing, never everything. Admins are never limited
 * - Disabled instances are never shown regardless of user selection
 * - An instance on its first sync (no firstSyncedAt) is shown to nobody,
 *   admins included, until that sync's exclusion recompute has run; the
 *   compute itself already covers it (the scope)
 */
import prisma from "../prisma/singleton.js";

/** An instance in a user's scope, and whether its first sync is done. */
interface ScopedInstance {
  id: string;
  ready: boolean;
}

/**
 * The instance allow-list an admin set for a user (#439): the allowed
 * instance ids, enabled or not, for a limited non-admin user; `null` for an
 * unlimited user, an admin (never limited, whatever the flag) or a missing
 * user. An empty array is a limited user with no server: they see nothing.
 * Throws on a database error.
 */
export async function getUserInstanceAccess(
  userId: number
): Promise<string[] | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      instanceAccessLimited: true,
      instanceAccess: { select: { instanceId: true } },
    },
  });
  if (!user || user.role === "ADMIN" || !user.instanceAccessLimited) {
    return null;
  }
  return user.instanceAccess.map((a) => a.instanceId);
}

/**
 * The enabled instances, narrowed to the user's allow-list when an admin
 * limited them, then to the user's selection when it names an accessible
 * one (an empty selection, or one whose instances are all disabled or not
 * allowed, means all accessible), each with whether its first sync has
 * finished (`firstSyncedAt`). Throws on a database error.
 */
async function readScope(userId: number): Promise<ScopedInstance[]> {
  // Get all enabled instances, and the user's allow-list if they are limited
  const [enabledInstances, access] = await Promise.all([
    prisma.stashInstance.findMany({
      where: { enabled: true },
      select: { id: true, firstSyncedAt: true },
    }),
    getUserInstanceAccess(userId),
  ]);
  // Only the allowed instances count as enabled for a limited user, so the
  // selection filter and its fallback both see just those
  const allowed = access === null ? null : new Set(access);
  const enabled = new Map(
    enabledInstances
      .filter((i) => allowed === null || allowed.has(i.id))
      .map((i) => [i.id, i.firstSyncedAt !== null])
  );

  // Get user's instance selections
  const userSelections = await prisma.userStashInstance.findMany({
    where: { userId },
    select: { instanceId: true },
  });

  // The selection narrowed to the accessible instances; when that leaves none
  // (no selection, or every selected instance disabled or not allowed), every
  // accessible one
  const selected = userSelections
    .map((s) => s.instanceId)
    .filter((id) => enabled.has(id));
  const ids = selected.length > 0 ? selected : Array.from(enabled.keys());
  return ids.map((id) => ({ id, ready: enabled.get(id) === true }));
}

/**
 * A user's instance scope: the enabled instances (for a limited user, the
 * allowed ones, see getUserInstanceAccess), narrowed to the user's
 * selection when it names an accessible one (an empty selection, or one
 * whose instances are all disabled or not allowed, means all accessible),
 * whether or not their first sync has finished. The exclusion compute runs
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
 * who see every enabled instance; a limited USER without access to the
 * instance is left out of both. These are the users a change to the
 * instance's enabled state, or its deletion, affects; read them before a
 * deletion removes the selection rows.
 *
 * @param instanceId - The instance ID
 * @returns The user IDs, in id order
 */
export async function getUsersSelecting(instanceId: string): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: {
      AND: [
        {
          OR: [
            { stashInstances: { some: { instanceId } } },
            {
              stashInstances: {
                none: { instance: { enabled: true, id: { not: instanceId } } },
              },
            },
          ],
        },
        // A limited USER without access to the instance never sees it
        {
          NOT: {
            role: "USER",
            instanceAccessLimited: true,
            instanceAccess: { none: { instanceId } },
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
 * their first sync. Everything that lists, counts or serves content filters
 * by it; EntityAccessService's LIVE_AND_ALLOWED_WHERE applies the same rules
 * in SQL. Throws on a database error: a caller must not read a failed lookup
 * as "no instances" (the routes would answer "initializing" for an outage).
 *
 * @param userId - The user ID
 * @returns Array of instance IDs the user should see content from
 */
export async function getUserAllowedInstanceIds(
  userId: number
): Promise<string[]> {
  return (await readScope(userId)).filter((i) => i.ready).map((i) => i.id);
}

/**
 * Every enabled instance past its first sync, whatever any user's selection:
 * the instances an admin's Content Restrictions editor lists, since an admin
 * restricts another user on any server (selection is a viewing preference,
 * not access). Throws on a database error.
 *
 * @returns Array of instance IDs
 */
export async function getEnabledSyncedInstanceIds(): Promise<string[]> {
  const instances = await prisma.stashInstance.findMany({
    where: { enabled: true, firstSyncedAt: { not: null } },
    select: { id: true },
  });
  return instances.map((i) => i.id);
}
