import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  isLibraryInitializing,
  markLibraryNotReady,
  useLibraryReady,
} from "../api/hooks/useLibraryReady";
import { type EntityMatch, describeLookupFailure } from "../api/lookupFailure";

// Moved to api/lookupFailure; re-exported until B15 retires this hook
export {
  describeLookupFailure,
  type EntityMatch,
  type LookupFailure,
} from "../api/lookupFailure";

export type EntityLookupStatus =
  | "loading"
  | "found"
  | "notFound"
  | "ambiguous"
  | "error";

/** Where a detail page's lookup stands */
export interface EntityLookup<T> {
  status: EntityLookupStatus;
  /** The entity, when found */
  entity?: T;
  /** Each server's entity with this id, when ambiguous */
  matches?: EntityMatch[];
  /** What went wrong, when error */
  error?: unknown;
  /** Asks again (after an error) */
  retry: () => void;
}

/**
 * One entity by id, or null when there is none the user can see. `signal`
 * aborts the request when the page moves on.
 */
export type FetchById<T> = (
  id: string,
  instanceId: string | null,
  signal: AbortSignal
) => Promise<T | null>;

/** A settled lookup and the request it answers */
interface Settled<T> {
  id: string;
  instanceId: string | null;
  attempt: number;
  result: Omit<EntityLookup<T>, "retry">;
}

/**
 * Looks up the entity a detail page shows, by the id and instance in its URL.
 *
 * Each id (and each retry) gets its own request with its own AbortController;
 * moving to another id aborts the last request, and an answer for anything
 * but the current id is never applied. Until the current id's answer
 * arrives the status is "loading", so a page never shows the previous
 * entity under the new id.
 *
 * While the library is initializing (the server's 503 `ready: false`) the
 * status stays "loading": the library is marked not ready, which starts
 * `useLibraryReady`'s re-check, and the lookup runs again once it is ready.
 *
 * `fetchById` must keep its identity between renders (a `libraryApi`
 * function, say): a new one starts a new request.
 */
export function useEntityLookup<T>(
  fetchById: FetchById<T>,
  id: string | undefined,
  instanceId: string | null
): EntityLookup<T> {
  const queryClient = useQueryClient();
  const { ready } = useLibraryReady();
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    // Wait for the library: the re-check runs the lookup again when it is ready
    if (!id || !ready) return undefined;
    const controller = new AbortController();
    const settle = (result: Settled<T>["result"]) => {
      // Aborted: the page has moved to another id, or unmounted
      if (controller.signal.aborted) return;
      setSettled({ id, instanceId, attempt, result });
    };
    fetchById(id, instanceId, controller.signal).then(
      (entity) => {
        settle(
          entity === null ? { status: "notFound" } : { status: "found", entity }
        );
      },
      (err: unknown) => {
        if (isLibraryInitializing(err)) {
          if (!controller.signal.aborted) markLibraryNotReady(queryClient);
          return;
        }
        settle(describeLookupFailure(err));
      }
    );
    return () => {
      controller.abort();
    };
  }, [fetchById, id, instanceId, attempt, ready, queryClient]);

  if (!id) return { status: "notFound", retry };
  const current =
    ready &&
    settled?.id === id &&
    settled.instanceId === instanceId &&
    settled.attempt === attempt
      ? settled.result
      : null;
  return current ? { ...current, retry } : { status: "loading", retry };
}
