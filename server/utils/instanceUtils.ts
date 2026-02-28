/**
 * Groups items by their instanceId, extracting entity IDs for batch lookups.
 *
 * Items with null/empty instanceId are grouped under `defaultInstanceId`.
 * This ensures queries against entity tables (which always have a real stashInstanceId)
 * don't silently fail by filtering on "".
 *
 * @param items - Array of items that have an instanceId field
 * @param getInstanceId - Accessor for the item's instanceId (may be null/empty)
 * @param getEntityId - Accessor for the item's entity ID
 * @param defaultInstanceId - Fallback for null/empty instanceId values
 * @returns Map from instanceId to array of entity IDs
 */
export function groupIdsByInstance<T>(
  items: T[],
  getInstanceId: (item: T) => string | null | undefined,
  getEntityId: (item: T) => string,
  defaultInstanceId: string
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const item of items) {
    const instId = getInstanceId(item) || defaultInstanceId;
    const ids = map.get(instId);
    if (ids) {
      ids.push(getEntityId(item));
    } else {
      map.set(instId, [getEntityId(item)]);
    }
  }
  return map;
}
