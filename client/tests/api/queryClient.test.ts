/**
 * The query client's retries and its library-initializing hook (item 39).
 * An initializing 503 is never retried: useLibraryReady re-checks the
 * library instead. A busy database (a 503 with a short Retry-After) gets
 * one more try after that wait; queries only, never mutations.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { createQueryClient, retryDelay, shouldRetry } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";

const initializing = () =>
  new ApiError("Server is initializing", 503, { ready: false });

/** B2's answer to a busy database: 503, Retry-After 1, no `ready`. */
const busy = (retryAfterSeconds = 1) =>
  new ApiError(
    "The database is busy, try again",
    503,
    { errorType: "SERVICE_UNAVAILABLE" },
    retryAfterSeconds
  );

describe("shouldRetry", () => {
  it("never retries a library that is initializing", () => {
    expect(shouldRetry(0, initializing())).toBe(false);
  });

  it("retries a busy 503 once", () => {
    expect(shouldRetry(0, busy())).toBe(true);
    expect(shouldRetry(1, busy())).toBe(false);
  });

  it("does not retry a 503 that asks for a long wait", () => {
    expect(shouldRetry(0, busy(30))).toBe(false);
    expect(shouldRetry(0, new ApiError("Unavailable", 503))).toBe(false);
  });

  it("does not retry other HTTP errors", () => {
    for (const status of [400, 403, 404, 409, 500, 502]) {
      expect(shouldRetry(0, new ApiError("No", status))).toBe(false);
    }
  });

  it("retries a network failure three times", () => {
    const offline = new TypeError("Failed to fetch");
    expect(shouldRetry(0, offline)).toBe(true);
    expect(shouldRetry(2, offline)).toBe(true);
    expect(shouldRetry(3, offline)).toBe(false);
  });
});

describe("retryDelay", () => {
  it("waits the Retry-After of a busy 503", () => {
    expect(retryDelay(0, busy(2))).toBe(2_000);
  });

  it("backs off for a network failure, up to 10 s", () => {
    const offline = new TypeError("Failed to fetch");
    expect(retryDelay(0, offline)).toBe(1_000);
    expect(retryDelay(1, offline)).toBe(2_000);
    expect(retryDelay(5, offline)).toBe(10_000);
  });
});

describe("createQueryClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a query that finds the library initializing marks it not ready, and is asked once", async () => {
    const client = createQueryClient();
    const queryFn = vi.fn().mockRejectedValue(initializing());

    await expect(
      client.fetchQuery({
        queryKey: queryKeys.scenes.list(undefined, {}),
        queryFn,
      })
    ).rejects.toThrow("Server is initializing");

    expect(queryFn).toHaveBeenCalledOnce();
    expect(client.getQueryData(queryKeys.library.ready())).toEqual({
      ready: false,
    });
  });

  it("a busy query is asked again after the Retry-After, and its answer used", async () => {
    vi.useFakeTimers();
    const client = createQueryClient();
    const queryFn = vi
      .fn()
      .mockRejectedValueOnce(busy(1))
      .mockResolvedValueOnce({ findScenes: { scenes: [] } });

    const result = client.fetchQuery({
      queryKey: queryKeys.scenes.list(undefined, {}),
      queryFn,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(queryFn).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual({ findScenes: { scenes: [] } });
    expect(queryFn).toHaveBeenCalledTimes(2);
    // Busy is not initializing
    expect(client.getQueryData(queryKeys.library.ready())).toBeUndefined();
  });

  it("mutations are never retried", async () => {
    const client = createQueryClient();
    const mutationFn = vi.fn().mockRejectedValue(busy(1));

    await expect(
      client.getMutationCache().build(client, { mutationFn }).execute(undefined)
    ).rejects.toThrow("The database is busy");

    expect(mutationFn).toHaveBeenCalledOnce();
  });
});
