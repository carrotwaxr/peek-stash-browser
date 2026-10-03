/**
 * The count-only request behind "Show N results": the list's body without
 * its paging and sort, one key for requests that differ only in those, the
 * last number kept while the next loads.
 */
import { type ReactNode, createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import { useListCount } from "@/api/hooks/useListCount";
import { queryKeys } from "@/api/queryKeys";
import { must } from "../../testUtils";

type Post = (
  path: string,
  body?: unknown,
  signal?: AbortSignal
) => Promise<unknown>;

const { mockApiPost } = vi.hoisted(() => ({ mockApiPost: vi.fn<Post>() }));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiPost: mockApiPost,
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

const REQUEST = {
  scene_filter: { rating100: { value: 80, modifier: "GREATER_THAN" } },
  filter: {
    page: 3,
    per_page: 40,
    sort: "date",
    direction: "DESC",
    q: "beach",
  },
};

const BODY = {
  scene_filter: REQUEST.scene_filter,
  filter: { q: "beach" },
};

/** A promise the test settles by hand */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useListCount", () => {
  it("posts the request without page, per page, sort and direction", async () => {
    mockApiPost.mockResolvedValue({ count: 42 });
    const { wrapper } = setup();

    const { result } = renderHook(
      () => useListCount("scene", REQUEST, { enabled: true }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.data).toBe(42));
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    const [path, body] = must(mockApiPost.mock.calls[0]);
    expect(path).toBe("/library/scenes/count");
    expect(body).toEqual(BODY);
  });

  it("each list posts to its own plural", async () => {
    mockApiPost.mockResolvedValue({ count: 1 });
    const { wrapper } = setup();
    const kinds = [
      ["scene", "scenes"],
      ["performer", "performers"],
      ["studio", "studios"],
      ["tag", "tags"],
      ["group", "groups"],
      ["gallery", "galleries"],
      ["image", "images"],
      ["clip", "clips"],
    ] as const;

    for (const [kind] of kinds) {
      renderHook(() => useListCount(kind, { filter: {} }, { enabled: true }), {
        wrapper,
      });
    }

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(8));
    expect(mockApiPost.mock.calls.map((call) => call[0]).sort()).toEqual(
      kinds.map(([, plural]) => `/library/${plural}/count`).sort()
    );
  });

  it("two requests that differ only in page, size or sort share one key and one request", async () => {
    mockApiPost.mockResolvedValue({ count: 7 });
    const { wrapper, client } = setup();

    const { result } = renderHook(
      () => [
        useListCount("scene", REQUEST, { enabled: true }),
        useListCount(
          "scene",
          {
            ...REQUEST,
            filter: { ...REQUEST.filter, page: 9, sort: "title" },
          },
          { enabled: true }
        ),
      ],
      { wrapper }
    );

    await waitFor(() => expect(must(result.current[1]).data).toBe(7));
    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });

  it("keys under the list's root, apart from the total the pages cache", async () => {
    mockApiPost.mockResolvedValue({ count: 5 });
    const { wrapper, client } = setup();

    renderHook(() => useListCount("tag", { filter: { q: "x" } }, {}), {
      wrapper,
    });

    await waitFor(() => expect(mockApiPost).toHaveBeenCalled());
    const key = must(client.getQueryCache().getAll()[0]).queryKey;
    expect(key).toEqual(
      queryKeys.listCount("tags", "/library/tags/count", { filter: { q: "x" } })
    );
    expect(key).toEqual([
      "tags",
      undefined,
      "count",
      "/library/tags/count",
      { filter: { q: "x" } },
    ]);
  });

  it("a path override posts there and keys apart", async () => {
    mockApiPost.mockResolvedValue({ count: 3 });
    const { wrapper, client } = setup();

    const { result } = renderHook(
      () => [
        useListCount("scene", REQUEST, { enabled: true }),
        useListCount("scene", REQUEST, {
          enabled: true,
          path: "/library/scenes/recommended/count",
        }),
      ],
      { wrapper }
    );

    await waitFor(() => expect(must(result.current[1]).data).toBe(3));
    expect(mockApiPost.mock.calls.map((call) => call[0]).sort()).toEqual([
      "/library/scenes/count",
      "/library/scenes/recommended/count",
    ]);
    expect(client.getQueryCache().getAll()).toHaveLength(2);
  });

  it("sends nothing for a null request or while disabled", async () => {
    mockApiPost.mockResolvedValue({ count: 1 });
    const { wrapper } = setup();

    renderHook(() => useListCount("scene", null, { enabled: true }), {
      wrapper,
    });
    renderHook(() => useListCount("scene", REQUEST, { enabled: false }), {
      wrapper,
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("keeps the previous number while the next request loads", async () => {
    const second = deferred<{ count: number }>();
    mockApiPost
      .mockResolvedValueOnce({ count: 10 })
      .mockReturnValueOnce(second.promise);
    const { wrapper } = setup();

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useListCount("scene", { filter: { q } }, { enabled: true }),
      { wrapper, initialProps: { q: "a" } }
    );
    await waitFor(() => expect(result.current.data).toBe(10));

    rerender({ q: "ab" });

    await waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBe(10);
    expect(result.current.isPlaceholderData).toBe(true);

    await act(async () => {
      second.resolve({ count: 4 });
      await second.promise;
    });
    await waitFor(() => expect(result.current.data).toBe(4));
  });

  it("aborts a superseded request through its signal", async () => {
    let firstSignal: AbortSignal | undefined;
    mockApiPost
      .mockImplementationOnce((_path, _body, signal) => {
        firstSignal = signal;
        return new Promise(() => {});
      })
      .mockResolvedValueOnce({ count: 2 });
    const { wrapper } = setup();

    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useListCount("scene", { filter: { q } }, { enabled: true }),
      { wrapper, initialProps: { q: "a" } }
    );
    await waitFor(() => expect(firstSignal).toBeDefined());

    rerender({ q: "ab" });

    await waitFor(() => expect(result.current.data).toBe(2));
    expect(firstSignal?.aborted).toBe(true);
  });
});
