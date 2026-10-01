/**
 * useLibraryReady: the one library-initializing state (item 39, LG-14).
 * A request that finds the library initializing marks it not ready; the
 * hook then re-checks GET /library/ready every 5 seconds and, once it says
 * ready, refetches the library's lists and carousels.
 */
import type { ReactNode } from "react";
import {
  type QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { actAsync, must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LIBRARY_READY_POLL_MS,
  invalidateLibraryQueries,
  markLibraryNotReady,
  useLibraryReady,
} from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import { jsonResponse, requestsTo, stubApi } from "../../helpers/stubApi";

const wrapperFor =
  (client: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

/** Moves the clock on, running the timers and promises due by then. */
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

/**
 * Lets what is due now finish: TanStack Query tells React about a change
 * on a timer a millisecond later.
 */
const settle = () => advance(50);

describe("useLibraryReady", () => {
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

  it("asks nothing while no request has found the library initializing", async () => {
    const fetchMock = stubApi({
      "/library/ready": () => jsonResponse(200, { ready: true }),
    });

    const { result } = renderHook(() => useLibraryReady(), {
      wrapper: wrapperFor(client),
    });
    await advance(60_000);

    expect(result.current.ready).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("polls every 5 s while not ready and stops once ready", async () => {
    const answers = [false, false, true];
    const fetchMock = stubApi({
      "/library/ready": () =>
        jsonResponse(200, { ready: must(answers.shift(), "a ready answer") }),
    });
    const checks = () => requestsTo(fetchMock, "/library/ready").length;
    markLibraryNotReady(client);

    const { result } = renderHook(() => useLibraryReady(), {
      wrapper: wrapperFor(client),
    });
    expect(LIBRARY_READY_POLL_MS).toBe(5_000);
    expect(result.current.ready).toBe(false);

    // A request has just found it initializing: the first check waits 5 s
    await advance(4_900);
    expect(checks()).toBe(0);
    await advance(200);
    expect(checks()).toBe(1);
    expect(result.current.ready).toBe(false);

    await advance(5_000);
    expect(checks()).toBe(2);
    expect(result.current.ready).toBe(false);

    await advance(5_000);
    expect(checks()).toBe(3);
    expect(result.current.ready).toBe(true);

    // Ready: no more checks
    await advance(60_000);
    expect(checks()).toBe(3);
  });

  it("invalidates list queries when the library becomes ready", async () => {
    stubApi({ "/library/ready": () => jsonResponse(200, { ready: true }) });
    const sceneList = vi.fn().mockResolvedValue({ findScenes: { scenes: [] } });
    const performerList = vi.fn().mockResolvedValue({ findPerformers: {} });
    const carousel = vi.fn().mockResolvedValue([]);
    const customCarousel = vi.fn().mockResolvedValue({ scenes: [] });
    const clips = vi.fn().mockResolvedValue({ clips: [] });
    const stats = vi.fn().mockResolvedValue({});

    renderHook(
      () => {
        useQuery({
          queryKey: queryKeys.scenes.list(undefined, { page: 1 }),
          queryFn: sceneList,
        });
        useQuery({
          queryKey: queryKeys.performers.list(undefined, { page: 1 }),
          queryFn: performerList,
        });
        useQuery({
          queryKey: queryKeys.homeCarousels.byKey("recentlyAddedScenes"),
          queryFn: carousel,
        });
        useQuery({
          queryKey: queryKeys.carousels.execute("7"),
          queryFn: customCarousel,
        });
        useQuery({ queryKey: queryKeys.clips.list({}), queryFn: clips });
        useQuery({ queryKey: queryKeys.user.stats(), queryFn: stats });
        return useLibraryReady();
      },
      { wrapper: wrapperFor(client) }
    );
    await settle();
    for (const fn of [
      sceneList,
      performerList,
      carousel,
      customCarousel,
      clips,
      stats,
    ]) {
      expect(fn).toHaveBeenCalledOnce();
    }

    await actAsync(() => markLibraryNotReady(client));
    await advance(LIBRARY_READY_POLL_MS + 100);

    // The library's lists and carousels load again; the user's own data does not
    for (const fn of [
      sceneList,
      performerList,
      carousel,
      customCarousel,
      clips,
    ]) {
      expect(fn).toHaveBeenCalledTimes(2);
    }
    expect(stats).toHaveBeenCalledOnce();
  });

  it("the library predicate matches watchHistory keys", async () => {
    stubApi({ "/library/ready": () => jsonResponse(200, { ready: true }) });
    const watched = vi.fn().mockResolvedValue({ scenes: [] });

    renderHook(
      () => {
        useQuery({
          queryKey: queryKeys.watchHistory.scenes({
            view: "in_progress",
            sort: "recent",
            page: 1,
            perPage: 12,
          }),
          queryFn: watched,
        });
        return useLibraryReady();
      },
      { wrapper: wrapperFor(client) }
    );
    await settle();
    expect(watched).toHaveBeenCalledOnce();

    // Hides, restores and instance changes invalidate the library queries
    await actAsync(() => {
      void invalidateLibraryQueries(client);
    });
    await settle();

    expect(watched).toHaveBeenCalledTimes(2);
  });

  it("becoming ready does not refetch an external player link or a non-library query", async () => {
    stubApi({ "/library/ready": () => jsonResponse(200, { ready: true }) });
    const link = vi.fn().mockResolvedValue({ url: "x" });
    const other = vi.fn().mockResolvedValue({});
    const sceneList = vi.fn().mockResolvedValue({ findScenes: { scenes: [] } });

    renderHook(
      () => {
        useQuery({
          queryKey: queryKeys.scenes.externalPlayerLink("a", "7"),
          queryFn: link,
        });
        useQuery({ queryKey: [42, "odd"], queryFn: other });
        useQuery({
          queryKey: queryKeys.scenes.list(undefined, { page: 1 }),
          queryFn: sceneList,
        });
        return useLibraryReady();
      },
      { wrapper: wrapperFor(client) }
    );
    await settle();
    await actAsync(() => markLibraryNotReady(client));
    await advance(LIBRARY_READY_POLL_MS + 100);

    expect(sceneList).toHaveBeenCalledTimes(2);
    expect(link).toHaveBeenCalledOnce();
    expect(other).toHaveBeenCalledOnce();
  });

  it("marking it not ready twice does not push the next check back", async () => {
    const fetchMock = stubApi({
      "/library/ready": () => jsonResponse(200, { ready: true }),
    });
    markLibraryNotReady(client);
    renderHook(() => useLibraryReady(), { wrapper: wrapperFor(client) });

    await advance(4_000);
    // Another carousel's request finds it initializing too
    await actAsync(() => markLibraryNotReady(client));
    await advance(1_100);

    expect(requestsTo(fetchMock, "/library/ready")).toHaveLength(1);
  });
});
