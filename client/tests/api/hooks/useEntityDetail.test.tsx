/**
 * `useEntityDetail`: a detail page's entity through the query cache, against
 * a stubbed server. Writes run the real rating and favorite mutations, so
 * the cases fail if their patch misses the detail entry.
 */
import type { ReactNode } from "react";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  renderHook as renderHookBare,
  waitFor,
} from "@testing-library/react";
import {
  type ApiStub,
  initializingResponse,
  jsonResponse,
  requestsTo,
  stubApi,
} from "@tests/helpers/stubApi";
import { must } from "@tests/testUtils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEntityDetail } from "@/api/hooks/useEntityDetail";
import { LIBRARY_READY_POLL_MS } from "@/api/hooks/useLibraryReady";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";

type Row = Record<string, unknown>;

const PERFORMER: Row = {
  id: "7",
  instanceId: "inst-b",
  name: "Alex",
  rating: 60,
  rating100: 60,
  favorite: false,
};

type Answer = (url: string, init?: RequestInit) => Response | Promise<Response>;

const found = (rows: Row[]) =>
  jsonResponse(200, {
    findPerformers: { performers: rows, count: rows.length },
  });

/** A deferred answer the test settles */
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** The server's answer to a rating write: the stored values */
const stored = (rating: number | null, favorite: boolean) =>
  jsonResponse(200, {
    success: true,
    rating: { id: 7, instanceId: "inst-b", rating, favorite },
  });

function stub(
  lookup: Answer,
  ratings: Answer = () => stored(null, false)
): ApiStub {
  return stubApi({
    "/library/performers": lookup,
    "/library/ready": () => jsonResponse(200, { ready: true }),
    "/ratings/performer/7": ratings,
  });
}

function renderHook<P>(
  callback: (props: P) => ReturnType<typeof useEntityDetail<"performer">>,
  options: { initialProps: P; client?: QueryClient }
) {
  const client = options.client ?? createQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = renderHookBare(callback, {
    wrapper,
    initialProps: options.initialProps,
  });
  return { ...rendered, client };
}

/** Renders the performer hook for `/performer/<id>`, optionally with `?instance=` */
function renderDetail(id: string, urlInstance: string | null = null) {
  return renderHook(
    (props: { id: string; urlInstance: string | null }) =>
      useEntityDetail("performer", props.id, props.urlInstance),
    { initialProps: { id, urlInstance } }
  );
}

/** A request's JSON body (every request here sends a string) */
function bodyOf(init: RequestInit | undefined): unknown {
  const body = init?.body;
  if (typeof body !== "string") throw new Error("expected a JSON body");
  return JSON.parse(body) as unknown;
}

function bodies(api: ApiStub, path: string): unknown[] {
  return api.mock.calls
    .filter(([url]) => url.replace(/^\/api/, "").split("?")[0] === path)
    .map(([, init]) => bodyOf(init));
}

/** Narrows the answer to found, failing the case otherwise */
function foundState<S extends { status: string }>(state: S) {
  if (state.status !== "found") {
    throw new Error(`expected found, got ${state.status}`);
  }
  return state as Extract<S, { status: "found" }>;
}

describe("useEntityDetail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("found: answers the typed entity, its instance and ref", async () => {
    const api = stub(() => found([PERFORMER]));

    const { result } = renderDetail("7", "inst-b");

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("found"));
    const state = foundState(result.current);
    expect(state.entity.name).toBe("Alex");
    expect(state.instanceId).toBe("inst-b");
    expect(state.ref).toBe("7:inst-b");
    expect(state.rating).toBe(60);
    expect(state.favorite).toBe(false);
    expect(bodies(api, "/library/performers")).toEqual([
      { ids: ["7"], performer_filter: { instance_id: "inst-b" } },
    ]);
  });

  it("a bare-id link reads the entity's own instance for writes; the instance-named key is seeded", async () => {
    const api = stub(
      () => found([PERFORMER]),
      () => stored(80, false)
    );

    const { result, client } = renderDetail("7");

    await waitFor(() => expect(result.current.status).toBe("found"));
    expect(bodies(api, "/library/performers")).toEqual([{ ids: ["7"] }]);
    expect(foundState(result.current).instanceId).toBe("inst-b");
    expect(
      client.getQueryData(queryKeys.performers.detail("inst-b", "7"))
    ).toEqual(PERFORMER);

    act(() => foundState(result.current).setRating(80));

    await waitFor(() =>
      expect(bodies(api, "/ratings/performer/7")).toHaveLength(1)
    );
    expect(bodies(api, "/ratings/performer/7")).toEqual([
      { rating: 80, instanceId: "inst-b" },
    ]);
  });

  it("an empty answer is notFound; a 404 is notFound", async () => {
    stub(() => found([]));
    const empty = renderDetail("7");
    await waitFor(() => expect(empty.result.current.status).toBe("notFound"));
    empty.unmount();
    vi.unstubAllGlobals();

    stub(() => jsonResponse(404, { error: "Not found" }));
    const missing = renderDetail("7");
    await waitFor(() => expect(missing.result.current.status).toBe("notFound"));
  });

  it("a 400 with matches is ambiguous with the matches", async () => {
    const matches = [
      { id: "7", instanceId: "inst-a", name: "Alex on A" },
      { id: "7", instanceId: "inst-b", name: "Alex on B" },
    ];
    stub(() => jsonResponse(400, { error: "On several servers", matches }));

    const { result } = renderDetail("7");

    await waitFor(() => expect(result.current.status).toBe("ambiguous"));
    expect(result.current).toEqual({ status: "ambiguous", matches });
  });

  it("a 500 is error; retry asks again", async () => {
    let calls = 0;
    const api = stub(() =>
      calls++ === 0 ? jsonResponse(500, { error: "Down" }) : found([PERFORMER])
    );

    const { result } = renderDetail("7", "inst-b");

    await waitFor(() => expect(result.current.status).toBe("error"));
    const state = result.current;
    if (state.status !== "error") throw new Error("expected error");
    act(() => state.retry());

    await waitFor(() => expect(result.current.status).toBe("found"));
    expect(requestsTo(api, "/library/performers")).toHaveLength(2);
  });

  it("a 503 ready:false reads loading, then found once /library/ready says ready", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const api = stub(() =>
      calls++ === 0 ? initializingResponse() : found([PERFORMER])
    );

    const { result, client } = renderDetail("7", "inst-b");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result.current.status).toBe("loading");
    expect(client.getQueryData(queryKeys.library.ready())).toEqual({
      ready: false,
    });
    expect(requestsTo(api, "/library/performers")).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIBRARY_READY_POLL_MS + 50);
    });
    expect(requestsTo(api, "/library/ready").length).toBeGreaterThan(0);
    expect(requestsTo(api, "/library/performers")).toHaveLength(2);
    expect(result.current.status).toBe("found");
  });

  it("a new id reads loading at once and never the previous entity", async () => {
    const next = deferred();
    stub((_url, init) => {
      const { ids } = bodyOf(init) as { ids: string[] };
      return ids[0] === "7" ? found([PERFORMER]) : next.promise;
    });

    const { result, rerender } = renderDetail("7", "inst-b");
    await waitFor(() => expect(result.current.status).toBe("found"));

    rerender({ id: "8", urlInstance: "inst-b" });

    expect(result.current.status).toBe("loading");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(result.current.status).toBe("loading");

    await act(async () => {
      next.resolve(found([{ ...PERFORMER, id: "8", name: "Blair" }]));
      await next.promise;
    });
    await waitFor(() => expect(result.current.status).toBe("found"));
    expect(foundState(result.current).entity.name).toBe("Blair");
  });

  it("unmounting aborts the lookup", async () => {
    const signals: AbortSignal[] = [];
    stub((_url, init) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    });

    const { unmount } = renderDetail("7", "inst-b");
    await waitFor(() => expect(signals).toHaveLength(1));

    unmount();

    expect(must(signals[0], "the lookup's signal").aborted).toBe(true);
  });

  it("setRating patches the cached detail before the server answers and PUTs on the entity's instance", async () => {
    const answer = deferred();
    const api = stub(
      () => found([PERFORMER]),
      () => answer.promise
    );

    const { result, client } = renderDetail("7");
    await waitFor(() => expect(result.current.status).toBe("found"));

    act(() => foundState(result.current).setRating(80));

    await waitFor(() => expect(foundState(result.current).rating).toBe(80));
    expect(
      client.getQueryData(queryKeys.performers.detail(undefined, "7"))
    ).toMatchObject({ rating: 80, rating100: 80 });
    expect(
      client.getQueryData(queryKeys.performers.detail("inst-b", "7"))
    ).toMatchObject({ rating: 80, rating100: 80 });
    await waitFor(() =>
      expect(bodies(api, "/ratings/performer/7")).toEqual([
        { rating: 80, instanceId: "inst-b" },
      ])
    );

    await act(async () => {
      answer.resolve(stored(80, false));
      await answer.promise;
    });
    await waitFor(() => expect(foundState(result.current).rating).toBe(80));
    expect(requestsTo(api, "/library/performers")).toHaveLength(1);
  });

  it("a failed setRating puts the old rating back", async () => {
    const answer = deferred();
    stub(
      () => found([PERFORMER]),
      () => answer.promise
    );

    const { result } = renderDetail("7");
    await waitFor(() => expect(result.current.status).toBe("found"));

    act(() => foundState(result.current).setRating(100));
    await waitFor(() => expect(foundState(result.current).rating).toBe(100));

    await act(async () => {
      answer.resolve(jsonResponse(500, { error: "Down" }));
      await answer.promise;
    });

    await waitFor(() => expect(foundState(result.current).rating).toBe(60));
  });

  it("toggleFavorite likewise", async () => {
    const answers = [deferred(), deferred()];
    let call = 0;
    const api = stub(
      () => found([PERFORMER]),
      () => must(answers[call++], "an answer").promise
    );
    const [first, second] = [
      must(answers[0], "first"),
      must(answers[1], "second"),
    ];

    const { result } = renderDetail("7");
    await waitFor(() => expect(result.current.status).toBe("found"));

    // Kept once the server stores it
    act(() => foundState(result.current).toggleFavorite());
    await waitFor(() => expect(foundState(result.current).favorite).toBe(true));
    await waitFor(() =>
      expect(bodies(api, "/ratings/performer/7")).toEqual([
        { favorite: true, instanceId: "inst-b" },
      ])
    );
    await act(async () => {
      first.resolve(stored(60, true));
      await first.promise;
    });
    await waitFor(() => expect(foundState(result.current).favorite).toBe(true));

    // Put back when the server refuses
    act(() => foundState(result.current).toggleFavorite());
    await waitFor(() =>
      expect(foundState(result.current).favorite).toBe(false)
    );
    await act(async () => {
      second.resolve(jsonResponse(500, { error: "Down" }));
      await second.promise;
    });
    await waitFor(() => expect(foundState(result.current).favorite).toBe(true));
    expect(bodies(api, "/ratings/performer/7")).toEqual([
      { favorite: true, instanceId: "inst-b" },
      { favorite: false, instanceId: "inst-b" },
    ]);
  });

  it("r then 4 rates 80 only once found", async () => {
    const lookup = deferred();
    const api = stub(
      () => lookup.promise,
      () => stored(80, false)
    );

    const { result } = renderDetail("7");
    await waitFor(() =>
      expect(requestsTo(api, "/library/performers")).toHaveLength(1)
    );

    fireEvent.keyDown(document.body, { key: "r" });
    fireEvent.keyDown(document.body, { key: "4" });
    expect(requestsTo(api, "/ratings/performer/7")).toHaveLength(0);

    await act(async () => {
      lookup.resolve(found([PERFORMER]));
      await lookup.promise;
    });
    await waitFor(() => expect(result.current.status).toBe("found"));

    fireEvent.keyDown(document.body, { key: "r" });
    fireEvent.keyDown(document.body, { key: "4" });

    await waitFor(() =>
      expect(bodies(api, "/ratings/performer/7")).toEqual([
        { rating: 80, instanceId: "inst-b" },
      ])
    );
    await waitFor(() => expect(foundState(result.current).rating).toBe(80));
  });
});
