/**
 * UserInstanceService
 *
 * Manages user-to-instance mappings and provides filtering logic for multi-instance support.
 *
 * Key behaviors:
 * - Users with no UserStashInstance records see ALL enabled instances (default)
 * - Users with UserStashInstance records see only those selected instances
 * - Disabled instances are never shown regardless of user selection
 */

import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";

/**
 * Get the list of Stash instance IDs that a user should see content from.
 *
 * Logic:
 * 1. Get all enabled Stash instances
 * 2. Check if user has any instance selections
 * 3. If user has selections, filter to only those instances (intersected with enabled)
 * 4. If user has no selections, return all enabled instances
 *
 * @param userId - The user ID
 * @returns Array of instance IDs the user should see content from
 */
export async function getUserAllowedInstanceIds(userId: number): Promise<string[]> {
  try {
    // Get all enabled instances
    const enabledInstances = await prisma.stashInstance.findMany({
      where: { enabled: true },
      select: { id: true },
    });
    const enabledIds = new Set(enabledInstances.map(i => i.id));

    // Get user's instance selections
    const userSelections = await prisma.userStashInstance.findMany({
      where: { userId },
      select: { instanceId: true },
    });

    if (userSelections.length === 0) {
      // No selections = see all enabled instances
      return Array.from(enabledIds);
    }

    // Filter user selections to only enabled instances
    const allowedIds = userSelections
      .map(s => s.instanceId)
      .filter(id => enabledIds.has(id));

    return allowedIds;
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

