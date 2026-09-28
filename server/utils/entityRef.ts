/**
 * The in-memory spelling of a Stash entity's id (item 77).
 *
 * One entity id has three spellings: in the database a bare `id` beside its
 * `stashInstanceId`; in the API, URLs and filter values `"id:instanceId"`
 * (`shared/types/instanceAwareId.ts`); and in memory the key built here.
 * Two Stash servers reuse small ids, so every key carries the instance.
 * Lint rejects a key built by hand (a template or string holding `\0`)
 * outside this file.
 */

/** One Stash entity on one instance. */
export interface EntityRef {
  id: string;
  instanceId: string;
}

/** The separator of in-memory keys: never in an id or an instance id. */
export const KEY_SEP = "\0";

/** The in-memory key of an entity: `${id}\0${instanceId}`. */
export function entityKey(id: string, instanceId: string): string {
  return `${id}${KEY_SEP}${instanceId}`;
}

/**
 * A key of several parts that is not one entity (type + id + instance, a
 * relation's two ids).
 */
export function compositeKey(...parts: string[]): string {
  return parts.join(KEY_SEP);
}

/** Refs without duplicates, in first-seen order. */
export function distinctRefs(refs: Iterable<EntityRef>): EntityRef[] {
  const byKey = new Map<string, EntityRef>();
  for (const ref of refs) {
    const key = entityKey(ref.id, ref.instanceId);
    if (!byKey.has(key)) byKey.set(key, ref);
  }
  return Array.from(byKey.values());
}

/**
 * Refs as one JSON parameter of [id, instanceId] pairs, which a statement
 * reads with `json_each(?)` and `json_extract(j.value, '$[0]')`/`'$[1]'`.
 */
export function pairsJson(refs: readonly EntityRef[]): string {
  return JSON.stringify(refs.map((ref) => [ref.id, ref.instanceId]));
}
