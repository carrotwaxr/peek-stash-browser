import type { ReactNode } from "react";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  renderHook as renderHookBare,
  waitFor,
} from "@testing-library/react";
import { actAsync, must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/api/client";
import { LIBRARY_READY_POLL_MS } from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import {
  type EntityMatch,
  type FetchById,
  useEntityLookup,
} from "@/hooks/useEntityLookup";
import { jsonResponse, stubApi } from "../helpers/stubApi";

/** Renders under one query client, as the app does */
function renderHook<T, P = undefined>(
  callback: (props: P) => T,
  options: { initialProps?: P; client?: QueryClient } = {}
) {
  const client = options.client ?? createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHookBare(callback, {
    wrapper,
    ...("initialProps" in options
      ? { initialProps: options.initialProps as P }
      : {}),
  });
}

interface Entity {
  id: string;
  name: string;
}

interface PendingCall {
  id: string;
  instanceId: string | null;
  signal: AbortSignal;
  resolve: (entity: Entity | null) => void;
}

/** A fetch whose calls each wait until the test answers them */
function deferredFetch() {
  const calls: PendingCall[] = [];
  const fetchById = vi.fn<FetchById<Entity>>(
    (id, instanceId, signal) =>
      new Promise<Entity | null>((resolve) => {
        calls.push({ id, instanceId, signal, resolve });
      })
  );
  return { fetchById, calls };
}

const MATCHES: EntityMatch[] = [
  { id: "7", name: "Jane Doe", instanceId: "inst-a" },
  { id: "7", name: "Jane Doe", instanceId: "inst-b" },
];

describe("useEntityLookup", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("the library-initializing 503 is loading, marks the library not ready, and asks again once it is ready", async () => {
    vi.useFakeTimers();
    const client = createQueryClient();
    const ready = stubApi({
      "/library/ready": () => jsonResponse(200, { ready: true }),
    });
    const fetchById = vi
      .fn<FetchById<Entity>>()
      .mockRejectedValueOnce(
        new ApiError("Server is initializing", 503, { ready: false })
      )
      .mockResolvedValue({ id: "7", name: "Jane Doe" });
    const { result } = renderHook(
      () => useEntityLookup(fetchById, "7", "inst-a"),
      { client }
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.status).toBe("loading");
    expect(client.getQueryData(queryKeys.library.ready())).toEqual({
      ready: false,
    });
    expect(fetchById).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIBRARY_READY_POLL_MS + 50);
    });
    expect(ready).toHaveBeenCalled();
    expect(fetchById).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("found");
  });

  it("a found entity gives found with the entity", async () => {
    const fetchById = vi
      .fn<FetchById<Entity>>()
      .mockResolvedValue({ id: "7", name: "Jane Doe" });

    const { result } = renderHook(() =>
      useEntityLookup(fetchById, "7", "inst-a")
    );

    expect(result.current.status).toBe("loading");
    await waitFor(() => {
      expect(result.current.status).toBe("found");
    });
    expect(result.current.entity).toEqual({ id: "7", name: "Jane Doe" });
    const call = must(fetchById.mock.calls[0], "the lookup");
    expect(call[0]).toBe("7");
    expect(call[1]).toBe("inst-a");
    expect(call[2]).toBeInstanceOf(AbortSignal);
  });

  it("an empty result gives notFound", async () => {
    const fetchById = vi.fn<FetchById<Entity>>().mockResolvedValue(null);

    const { result } = renderHook(() =>
      useEntityLookup(fetchById, "99999999", null)
    );

    await waitFor(() => {
      expect(result.current.status).toBe("notFound");
    });
    expect(result.current.entity).toBeUndefined();
  });

  it("a 404 gives notFound", async () => {
    const fetchById = vi
      .fn<FetchById<Entity>>()
      .mockRejectedValue(new ApiError("Not found", 404));

    const { result } = renderHook(() => useEntityLookup(fetchById, "7", null));

    await waitFor(() => {
      expect(result.current.status).toBe("notFound");
    });
  });

  it("a missing id gives notFound without a request", () => {
    const fetchById = vi.fn<FetchById<Entity>>();

    const { result } = renderHook(() =>
      useEntityLookup(fetchById, undefined, null)
    );

    expect(result.current.status).toBe("notFound");
    expect(fetchById).not.toHaveBeenCalled();
  });

  it("a 400 with matches gives ambiguous with the matches", async () => {
    const fetchById = vi.fn<FetchById<Entity>>().mockRejectedValue(
      new ApiError("Ambiguous lookup", 400, {
        error: "Ambiguous lookup",
        message: "Multiple performers found with ID 7.",
        matches: MATCHES,
      })
    );

    const { result } = renderHook(() => useEntityLookup(fetchById, "7", null));

    await waitFor(() => {
      expect(result.current.status).toBe("ambiguous");
    });
    expect(result.current.matches).toEqual(MATCHES);
    expect(result.current.entity).toBeUndefined();
  });

  it.each([
    ["an empty matches list", []],
    ["a match without an instance", [{ id: "7", name: "Jane Doe" }]],
    ["a non-object match", ["7"]],
  ])("a 400 with %s gives error, not ambiguous", async (_case, matches) => {
    const fetchById = vi
      .fn<FetchById<Entity>>()
      .mockRejectedValue(new ApiError("Ambiguous lookup", 400, { matches }));

    const { result } = renderHook(() => useEntityLookup(fetchById, "7", null));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.matches).toBeUndefined();
  });

  it("a 400 without matches gives error", async () => {
    const refused = new ApiError("Invalid request", 400, {
      error: "Invalid request",
    });
    const fetchById = vi.fn<FetchById<Entity>>().mockRejectedValue(refused);

    const { result } = renderHook(() => useEntityLookup(fetchById, "7", null));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe(refused);
    expect(result.current.matches).toBeUndefined();
  });

  it("an error gives error, and retry asks again", async () => {
    const down = new ApiError("Stash is not answering", 502);
    const fetchById = vi
      .fn<FetchById<Entity>>()
      .mockRejectedValueOnce(down)
      .mockResolvedValueOnce({ id: "7", name: "Jane Doe" });

    const { result } = renderHook(() => useEntityLookup(fetchById, "7", null));

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current.error).toBe(down);

    await actAsync(() => result.current.retry());

    await waitFor(() => {
      expect(result.current.status).toBe("found");
    });
    expect(result.current.entity).toEqual({ id: "7", name: "Jane Doe" });
    expect(fetchById).toHaveBeenCalledTimes(2);
  });

  it("a slower response for the first id does not replace the second id's", async () => {
    const { fetchById, calls } = deferredFetch();

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useEntityLookup(fetchById, id, null),
      { initialProps: { id: "1" } }
    );
    rerender({ id: "2" });

    const first = must(calls[0], "the first id's request");
    const second = must(calls[1], "the second id's request");
    expect(first.id).toBe("1");
    expect(second.id).toBe("2");
    // Leaving the first id aborts its request
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);

    await actAsync(() => second.resolve({ id: "2", name: "Second" }));
    expect(result.current.status).toBe("found");
    expect(result.current.entity).toEqual({ id: "2", name: "Second" });

    // The first id's answer arrives late (a fetch that ignored its signal)
    await actAsync(() => first.resolve({ id: "1", name: "First" }));
    expect(result.current.status).toBe("found");
    expect(result.current.entity).toEqual({ id: "2", name: "Second" });
  });

  it("a new id shows loading, not the previous id's entity", async () => {
    const { fetchById, calls } = deferredFetch();

    const { result, rerender } = renderHook(
      ({ id, instanceId }: { id: string; instanceId: string | null }) =>
        useEntityLookup(fetchById, id, instanceId),
      { initialProps: { id: "1", instanceId: "inst-a" } }
    );
    await actAsync(() =>
      must(calls[0], "the first request").resolve({ id: "1", name: "First" })
    );
    expect(result.current.status).toBe("found");

    // The same id on another server is another entity
    rerender({ id: "1", instanceId: "inst-b" });

    expect(result.current.status).toBe("loading");
    expect(result.current.entity).toBeUndefined();
    expect(must(calls[1], "the second request").instanceId).toBe("inst-b");
  });
});
