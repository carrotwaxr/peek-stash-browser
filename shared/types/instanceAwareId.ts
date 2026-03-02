/**
 * InstanceAwareId — Branded type for composite entity keys.
 *
 * Format: "entityId:instanceId" (e.g., "82:abc-123-def")
 *
 * Provides compile-time enforcement that entity references in filter
 * values include the instance ID, preventing the recurring multi-instance
 * collision bugs (#361, #368, #390, #400).
 *
 * At runtime this is just a string — the brand exists only in the type system.
 */

/** Branded composite key: "entityId:instanceId" */
export type InstanceAwareId = string & { readonly __brand: "InstanceAwareId" };

/**
 * Create a composite entity reference from an entity ID and instance ID.
 *
 * @param id - The entity ID (string or number)
 * @param instanceId - The Stash instance ID
 * @returns Branded composite key "id:instanceId"
 */
export function makeEntityRef(id: string | number, instanceId: string): InstanceAwareId {
  return `${id}:${instanceId}` as InstanceAwareId;
}

/**
 * Parse a composite entity reference back to its components.
 * Only splits on the first colon so instance IDs containing colons
 * (e.g. UUIDs) are preserved intact.
 *
 * @param ref - A composite key string ("id:instanceId") or bare ID
 * @returns Parsed components; instanceId is undefined for bare IDs
 */
export function parseEntityRef(ref: string): { id: string; instanceId: string | undefined } {
  if (!ref) return { id: ref, instanceId: undefined };
  const str = String(ref);
  const colonIdx = str.indexOf(":");
  if (colonIdx === -1) return { id: str, instanceId: undefined };
  return { id: str.substring(0, colonIdx), instanceId: str.substring(colonIdx + 1) };
}

/**
 * Type guard: checks if a string matches the "id:instanceId" composite format.
 */
export function isEntityRef(value: string): value is InstanceAwareId {
  return typeof value === "string" && value.includes(":");
}

/**
 * Assert that a string is a valid composite key, returning the branded type.
 * Throws if the value doesn't contain a colon separator.
 */
export function assertEntityRef(value: string): InstanceAwareId {
  if (!value.includes(":")) {
    throw new Error(`Expected composite key "id:instanceId", got "${value}"`);
  }
  return value as InstanceAwareId;
}

/**
 * Coerce a string array to InstanceAwareId[] at API boundaries.
 *
 * This is an explicit trust boundary — the caller acknowledges these
 * values are entity references (potentially composite keys from the client).
 * The runtime behavior is unchanged; composite key parsing already handles
 * both bare and composite formats.
 *
 * Use at route handlers where filter values arrive from the client.
 */
export function coerceEntityRefs(values: string[]): InstanceAwareId[] {
  return values as InstanceAwareId[];
}
