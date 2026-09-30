/**
 * useSetupStatus: the one GET /setup/status query (item 24, CS-04). While
 * the server restarts or runs its upgrade's migrations the request fails;
 * the query keeps retrying with back-off and never turns the failure into
 * "setup is not complete".
 */
import type { ReactNode } from "react";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { useSetupStatus } from "@/api/hooks/useSetupStatus";
import { createQueryClient } from "@/api/queryClient";
import { jsonResponse, requestsTo, stubApi } from "../../helpers/stubApi";

const wrapperFor =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

const STATUS = {
  setupComplete: true,
  hasUsers: true,
  hasStashInstance: true,
  stashInstanceCount: 2,
};

describe("useSetupStatus", () => {
  let client: QueryClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = createQueryClient();
  });

  afterEach(() => {
    client.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps retrying a 502 and a network error with backoff and never reports setupComplete false, then resolves on the first 200", async () => {
    const answers: Array<() => Response> = [
      () => jsonResponse(502, { error: "Bad Gateway" }),
      () => {
        throw new TypeError("Failed to fetch");
      },
      () => jsonResponse(502, { error: "Bad Gateway" }),
      () => jsonResponse(200, STATUS),
    ];
    const fetchMock = stubApi({
      "/setup/status": () => {
        const next = answers.shift();
        if (!next) throw new Error("asked too often");
        return next();
      },
    });
    const calls = () => requestsTo(fetchMock, "/setup/status").length;

    const { result } = renderHook(() => useSetupStatus(), {
      wrapper: wrapperFor(client),
    });

    // The first answer is a 502: a retry waits 1 s
    await advance(50);
    expect(calls()).toBe(1);
    expect(result.current.isPending).toBe(true);
    expect(result.current.failureCount).toBe(1);
    expect(result.current.failureReason).toBeInstanceOf(ApiError);
    expect((result.current.failureReason as ApiError).status).toBe(502);
    expect(result.current.data).toBeUndefined();

    await advance(1_000);
    expect(calls()).toBe(2);
    // The network error: the next wait is 2 s
    expect(result.current.failureCount).toBe(2);
    await advance(1_900);
    expect(calls()).toBe(2);
    await advance(200);
    expect(calls()).toBe(3);
    expect(result.current.failureCount).toBe(3);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toBeUndefined();

    // Then 4 s, and the 200
    await advance(4_100);
    expect(calls()).toBe(4);
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual(STATUS);

    // Loaded once: nothing more is asked
    await advance(60_000);
    expect(calls()).toBe(4);
  });

  it("retries past the default retry count and caps the wait at 10 s", async () => {
    let failures = 8;
    const fetchMock = stubApi({
      "/setup/status": () =>
        failures-- > 0
          ? jsonResponse(500, { error: "Failed to check setup status" })
          : jsonResponse(200, STATUS),
    });
    const calls = () => requestsTo(fetchMock, "/setup/status").length;

    const { result } = renderHook(() => useSetupStatus(), {
      wrapper: wrapperFor(client),
    });

    // 1 + 2 + 4 + 8 + 10 + 10 + 10 + 10 s of waits before the ninth request
    await advance(50);
    await advance(1_000 + 2_000 + 4_000 + 8_000 + 10_000 * 3);
    expect(calls()).toBe(8);
    expect(result.current.isPending).toBe(true);
    await advance(10_000);
    expect(calls()).toBe(9);
    expect(result.current.data).toEqual(STATUS);
  });
});
