import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/client";

/**
 * One entity a single-id lookup matched on one server. The server answers a
 * lookup without an instance that finds the id on several servers with a 400
 * listing these (`AmbiguousLookupResponse`).
 */
export interface EntityMatch {
  id: string;
  instanceId: string;
  name?: string | null;
  title?: string | null;
}

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

/** A failed lookup: not found, a choice of servers, or an error */
export type LookupFailure =
  | { status: "notFound" }
  | { status: "ambiguous"; matches: EntityMatch[] }
  | { status: "error"; error: unknown };

/**
 * One entity by id, or null when there is none the user can see. `signal`
 * aborts the request when the page moves on.
 */
export type FetchById<T> = (
  id: string,
  instanceId: string | null,
  signal: AbortSignal
) => Promise<T | null>;

function isEntityMatch(value: unknown): value is EntityMatch {
  if (!value || typeof value !== "object") return false;
  const match = value as Record<string, unknown>;
  return typeof match.id === "string" && typeof match.instanceId === "string";
}

/** The matches of an ambiguous-lookup 400, or null for any other body */
function readMatches(data: Record<string, unknown>): EntityMatch[] | null {
  const { matches } = data;
  if (!Array.isArray(matches) || matches.length === 0) return null;
  return matches.every(isEntityMatch) ? matches : null;
}

/**
 * What a failed lookup means for the page: a 404 is not found (as is a
 * missing, hidden or restricted entity, which the server leaves out); a 400
 * listing matches is a choice of servers; anything else is an error to show
 * with Retry.
 */
export function describeLookupFailure(err: unknown): LookupFailure {
  if (err instanceof ApiError) {
    if (err.status === 404) return { status: "notFound" };
    const matches = err.status === 400 ? readMatches(err.data) : null;
    if (matches) return { status: "ambiguous", matches };
  }
  return { status: "error", error: err };
}

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
 * `fetchById` must keep its identity between renders (a `libraryApi`
 * function, say): a new one starts a new request.
 */
export function useEntityLookup<T>(
  fetchById: FetchById<T>,
  id: string | undefined,
  instanceId: string | null
): EntityLookup<T> {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);

  const retry = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!id) return undefined;
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
        settle(describeLookupFailure(err));
      }
    );
    return () => {
      controller.abort();
    };
  }, [fetchById, id, instanceId, attempt]);

  if (!id) return { status: "notFound", retry };
  const current =
    settled?.id === id &&
    settled.instanceId === instanceId &&
    settled.attempt === attempt
      ? settled.result
      : null;
  return current ? { ...current, retry } : { status: "loading", retry };
}
