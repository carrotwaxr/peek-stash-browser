/**
 * The cache side of a rating or favorite write, shared by `useUpdateRating`
 * and `useUpdateFavorite`: patch every cached row of the entity at once
 * (`patchEntityInCache`), settle with the server's answer, roll back a
 * failure, and mark the library stale.
 *
 * Writes to one field of one entity can overlap (a second click while the
 * first is on its way). They share a slot: only the last to settle writes
 * the cache, so an earlier answer or failure never undoes a newer value,
 * and a failure of every overlapping write restores the value from before
 * the first. Requests in flight for the entity's lists are cancelled
 * around each write, since they may carry the value from before it.
 */
import type { QueryClient } from "@tanstack/react-query";
import { makeCompositeKey } from "../utils/compositeKey";
import {
  type EntityRef,
  type UserDataPatch,
  cancelEntityQueries,
  patchEntityInCache,
} from "./entityCache";
import { markLibraryStale } from "./hooks/useLibraryReady";

/** The viewer's value a write sets */
export type UserDataField = "rating100" | "favorite";

interface Slot {
  /** Writes begun and not yet answered (success or error) */
  open: number;
  /** Puts back the value from before the first open write */
  baseline?: () => void;
  /** The server's answer to the last write that succeeded */
  confirmed?: UserDataPatch;
}

const slots = new WeakMap<QueryClient, Map<string, Slot>>();

function slotKey(ref: EntityRef, field: UserDataField): string {
  return [field, ref.type, makeCompositeKey(ref.id, ref.instanceId)].join("|");
}

function slotOf(client: QueryClient, ref: EntityRef, field: UserDataField) {
  let byKey = slots.get(client);
  if (!byKey) {
    byKey = new Map();
    slots.set(client, byKey);
  }
  const key = slotKey(ref, field);
  let slot = byKey.get(key);
  if (!slot) {
    slot = { open: 0 };
    byKey.set(key, slot);
  }
  return { slot, release: () => byKey.delete(key) };
}

/** `onMutate`: shows the new value in every cached row of the entity */
export async function beginUserDataWrite(
  client: QueryClient,
  ref: EntityRef,
  field: UserDataField,
  patch: UserDataPatch
): Promise<void> {
  const { slot } = slotOf(client, ref, field);
  const first = slot.open === 0;
  if (first) slot.confirmed = undefined;
  slot.open += 1;
  await cancelEntityQueries(client, ref.type);
  const rollback = patchEntityInCache(client, ref, patch);
  if (first) slot.baseline = rollback;
}

/** `onSuccess`: writes the server's value, unless another write is still open */
export async function confirmUserDataWrite(
  client: QueryClient,
  ref: EntityRef,
  field: UserDataField,
  stored: UserDataPatch
): Promise<void> {
  const { slot } = slotOf(client, ref, field);
  slot.open -= 1;
  slot.confirmed = stored;
  if (slot.open > 0) return;
  await cancelEntityQueries(client, ref.type);
  if (slot.open > 0) return;
  patchEntityInCache(client, ref, stored);
}

/** `onError`: puts the value back, unless another write is still open */
export function failUserDataWrite(
  client: QueryClient,
  ref: EntityRef,
  field: UserDataField
): void {
  const { slot } = slotOf(client, ref, field);
  slot.open -= 1;
  if (slot.open > 0) return;
  if (slot.confirmed) patchEntityInCache(client, ref, slot.confirmed);
  else slot.baseline?.();
}

/** `onSettled`: forgets an idle slot and marks the library stale, fetching nothing */
export async function endUserDataWrite(
  client: QueryClient,
  ref: EntityRef,
  field: UserDataField
): Promise<void> {
  const { slot, release } = slotOf(client, ref, field);
  if (slot.open <= 0) release();
  await markLibraryStale(client);
}
