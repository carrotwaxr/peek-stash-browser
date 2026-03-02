/**
 * Composite key utilities for multi-instance entity identification.
 *
 * Stash entities are uniquely identified by a composite of entity ID and
 * instance ID, serialized as "entityId:instanceId". These helpers
 * create and parse that format consistently across the codebase.
 */

/**
 * Create a composite key from an entity ID and optional instance ID.
 * Returns "entityId:instanceId" when instanceId is truthy, otherwise
 * returns the bare id (coerced to string).
 *
 * @param {string|number} id - The entity ID
 * @param {string} [instanceId] - The Stash instance ID
 * @returns {string} Composite key string
 */
export const makeCompositeKey = (id, instanceId) =>
  instanceId ? `${id}:${instanceId}` : String(id);

/**
 * Parse a composite key back to its component parts.
 * Handles both "entityId:instanceId" and bare "entityId" formats.
 * Only splits on the first colon, so instance IDs containing colons
 * (e.g. UUIDs in some formats) are preserved intact.
 *
 * @param {string} key - The composite key to parse
 * @returns {{ id: string, instanceId: string|undefined }}
 */
export const parseCompositeKey = (key) => {
  if (!key) return { id: key, instanceId: undefined };
  const str = String(key);
  const colonIdx = str.indexOf(":");
  if (colonIdx === -1) return { id: str, instanceId: undefined };
  return { id: str.substring(0, colonIdx), instanceId: str.substring(colonIdx + 1) };
};
