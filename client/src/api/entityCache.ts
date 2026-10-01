/**
 * The viewer's own values on an entity (rating, favorite, O count) as the
 * cache holds them. A write patches every cached row and detail entry of
 * that entity in place, so every list, carousel and detail page shows the
 * new value at once without a request; `markLibraryStale` then lets each
 * list fetch the truth on its next visit.
 */
import type { RatableEntityType } from "@peek/shared-types";
import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** One entity on one Stash instance */
export interface EntityRef {
  type: RatableEntityType;
  id: string;
  instanceId: string;
}

/** The viewer's new values; a field left out is not touched */
export interface UserDataPatch {
  rating100?: number | null;
  favorite?: boolean;
  oCount?: number;
}

/**
 * The query roots that can hold rows of each type. Within a root only that
 * type's own rows carry rating, favorite or O fields (nested refs carry
 * none, `shared/types/entities.ts`), so root plus field presence is a safe
 * test without a type tag on the rows.
 */
const ROOTS: Record<RatableEntityType, readonly string[]> = {
  scene: ["scenes", "homeCarousel", "carousels", "watchHistory", "playlists"],
  performer: ["performers"],
  studio: ["studios"],
  tag: ["tags"],
  gallery: ["galleries"],
  group: ["groups"],
  image: ["images"],
};

/**
 * The row keys each patch field writes. Every normalized row carries both
 * `rating` and `rating100` (the same viewer value); scenes count O in
 * `o_counter`, images in `oCounter`.
 */
const FIELD_KEYS: Record<keyof UserDataPatch, readonly string[]> = {
  rating100: ["rating100", "rating"],
  favorite: ["favorite"],
  oCount: ["o_counter", "oCounter"],
};

/**
 * Cancels the requests in flight under the roots that hold the entity's
 * type. Called around a write: a list fetch that began before the server
 * stored the value would answer with the old one and undo the patch.
 */
export function cancelEntityQueries(
  client: QueryClient,
  type: RatableEntityType
): Promise<void> {
  const roots = ROOTS[type];
  return client.cancelQueries({
    predicate: (query) => {
      const [root] = query.queryKey;
      return typeof root === "string" && roots.includes(root);
    },
  });
}

const PATCH_FIELDS = Object.keys(FIELD_KEYS) as Array<keyof UserDataPatch>;

type Row = Record<string, unknown>;

function isPlainObject(value: unknown): value is Row {
  if (value === null || typeof value !== "object") return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Whether the row has the key itself (rows are plain objects) */
function hasKey(row: Row, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function isEntity(value: Row, ref: EntityRef): boolean {
  return value.id === ref.id && value.instanceId === ref.instanceId;
}

/** A copy of the row with the patch's values in the keys it already has, or undefined when nothing changes */
function patchRow(row: Row, patch: UserDataPatch): Row | undefined {
  let next: Row | undefined;
  for (const field of PATCH_FIELDS) {
    const value = patch[field];
    if (value === undefined) continue;
    for (const key of FIELD_KEYS[field]) {
      if (!hasKey(row, key) || row[key] === value) continue;
      next ??= { ...row };
      next[key] = value;
    }
  }
  return next;
}

/** Records the row's current values for the patched fields not yet recorded */
function recordPrevious(
  row: Row,
  patch: UserDataPatch,
  previous: UserDataPatch
): void {
  if (patch.rating100 !== undefined && !("rating100" in previous)) {
    const key = FIELD_KEYS.rating100.find((k) => hasKey(row, k));
    const value = key === undefined ? undefined : row[key];
    if (value === null || typeof value === "number") previous.rating100 = value;
  }
  if (patch.favorite !== undefined && !("favorite" in previous)) {
    if (typeof row.favorite === "boolean") previous.favorite = row.favorite;
  }
  if (patch.oCount !== undefined && !("oCount" in previous)) {
    const key = FIELD_KEYS.oCount.find((k) => hasKey(row, k));
    const value = key === undefined ? undefined : row[key];
    if (typeof value === "number") previous.oCount = value;
  }
}

/**
 * Walks arrays and plain objects, patching each row of the entity.
 * Copy-on-write: the value itself comes back when nothing under it
 * changed, so untouched branches keep their identity.
 */
function walk(
  value: unknown,
  ref: EntityRef,
  patch: UserDataPatch,
  onMatch: (row: Row) => void
): unknown {
  if (Array.isArray(value)) {
    let next: unknown[] | undefined;
    value.forEach((item: unknown, index) => {
      const patched = walk(item, ref, patch, onMatch);
      if (patched === item) return;
      next ??= value.slice();
      next[index] = patched;
    });
    return next ?? value;
  }
  if (!isPlainObject(value)) return value;
  let next: Row | undefined;
  if (isEntity(value, ref)) {
    onMatch(value);
    next = patchRow(value, patch);
  }
  for (const [key, child] of Object.entries(value)) {
    const patched = walk(child, ref, patch, onMatch);
    if (patched === child) continue;
    next ??= { ...value };
    next[key] = patched;
  }
  return next ?? value;
}

/**
 * Writes the viewer's new values into every cached row and detail entry of
 * the entity (matched by `id` and `instanceId` in the data, so a bare-id
 * detail key is covered); refetches nothing. Queries where nothing changed
 * keep their data and `dataUpdatedAt`.
 *
 * Returns a rollback for a failed write: it writes the entity's previous
 * values (read from the first matched row) back into the queries this
 * patch changed, through the same walk, so a refetch that landed in
 * between keeps its other rows.
 */
export function patchEntityInCache(
  client: QueryClient,
  ref: EntityRef,
  patch: UserDataPatch
): () => void {
  const roots = ROOTS[ref.type];
  const previous: UserDataPatch = {};
  const changed: QueryKey[] = [];
  const queries = client.getQueryCache().findAll({
    predicate: (query) => {
      const [root] = query.queryKey;
      return typeof root === "string" && roots.includes(root);
    },
  });
  for (const query of queries) {
    const data: unknown = query.state.data;
    if (data === undefined) continue;
    const next = walk(data, ref, patch, (row) =>
      recordPrevious(row, patch, previous)
    );
    if (next === data) continue;
    client.setQueryData(query.queryKey, next);
    changed.push(query.queryKey);
  }

  return () => {
    for (const key of changed) {
      const data: unknown = client.getQueryData(key);
      if (data === undefined) continue;
      const next = walk(data, ref, previous, () => {});
      if (next !== data) client.setQueryData(key, next);
    }
  };
}
