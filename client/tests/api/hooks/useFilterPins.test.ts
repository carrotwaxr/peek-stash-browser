/**
 * Pins are one query under `user`: the defaults show until the answer, a
 * change shows before the server answers and is put back on a failure;
 * saves run in order, and a failure reads the pins again.
 */
import { type ReactNode, createElement } from "react";
import type { FilterPins, ListPins } from "@peek/shared-types";
import { LIST_KINDS, defaultPinsOf } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as api from "@/api";
import { ApiError } from "@/api/client";
import {
  useFilterPins,
  useResetPins,
  useSetPins,
} from "@/api/hooks/useFilterPins";
import { queryKeys } from "@/api/queryKeys";
import { must } from "../../testUtils";

const { mockApiGet, mockApiPut, mockApiDelete } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
  mockApiDelete: vi.fn(),
}));

vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  apiGet: mockApiGet,
  apiPut: mockApiPut,
  apiDelete: mockApiDelete,
}));

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

/** Every list's defaults, as `GET /user/filter-pins` answers */
function serverPins(overrides: Partial<FilterPins> = {}): FilterPins {
  return {
    ...(Object.fromEntries(
      LIST_KINDS.map((kind) => [kind, defaultPinsOf(kind)])
    ) as unknown as FilterPins),
    ...overrides,
  };
}

const MINE: ListPins = { fields: ["rating", "tags"], filters: [] };

/** A promise the test settles by hand */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFilterPins", () => {
  it("shows the list's defaults before the response", async () => {
    const answer = deferred<{ pins: FilterPins }>();
    mockApiGet.mockReturnValue(answer.promise);
    const { wrapper } = setup();

    const { result } = renderHook(() => useFilterPins("performer"), {
      wrapper,
    });

    expect(result.current).toEqual(defaultPinsOf("performer"));
    expect(mockApiGet).toHaveBeenCalledWith("/user/filter-pins");

    await act(async () => {
      answer.resolve({ pins: serverPins({ performer: MINE }) });
      await answer.promise;
    });
    await waitFor(() => expect(result.current).toEqual(MINE));
  });

  it("keeps the defaults when the request fails", async () => {
    mockApiGet.mockRejectedValue(new ApiError("boom", 500));
    const { wrapper, client } = setup();

    const { result } = renderHook(() => useFilterPins("scene"), { wrapper });

    await waitFor(() =>
      expect(client.getQueryState(queryKeys.user.filterPins())?.status).toBe(
        "error"
      )
    );
    expect(result.current).toEqual(defaultPinsOf("scene"));
  });

  it("every list shares one request", async () => {
    mockApiGet.mockResolvedValue({ pins: serverPins({ tag: MINE }) });
    const { wrapper } = setup();

    const { result } = renderHook(
      () => [useFilterPins("tag"), useFilterPins("studio")] as const,
      { wrapper }
    );

    await waitFor(() => expect(must(result.current[0])).toEqual(MINE));
    expect(must(result.current[1])).toEqual(defaultPinsOf("studio"));
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it("a sign-out clears the pins: the key is under user", () => {
    expect(queryKeys.user.filterPins()[0]).toBe("user");
  });
});

describe("useSetPins", () => {
  it("puts the list's pins on its route", async () => {
    mockApiGet.mockResolvedValue({ pins: serverPins() });
    mockApiPut.mockResolvedValue({});
    const { wrapper } = setup();
    const { result } = renderHook(() => useSetPins(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ kind: "studio", pins: MINE });
    });

    expect(mockApiPut).toHaveBeenCalledWith("/user/filter-pins/studio", MINE);
  });

  it("a pin change is shown before the server answers", async () => {
    mockApiGet.mockResolvedValue({ pins: serverPins() });
    const write = deferred<unknown>();
    mockApiPut.mockReturnValue(write.promise);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ pins: useFilterPins("scene"), set: useSetPins() }),
      { wrapper }
    );
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.pins).toEqual(defaultPinsOf("scene"))
    );

    act(() => {
      result.current.set.mutate({ kind: "scene", pins: MINE });
    });

    await waitFor(() => expect(result.current.pins).toEqual(MINE));
    expect(result.current.set.isPending).toBe(true);

    await act(async () => {
      write.resolve({});
      await write.promise;
    });
  });

  it("a change made before the first answer is not lost", async () => {
    const first = deferred<{ pins: FilterPins }>();
    mockApiGet.mockReturnValue(first.promise);
    mockApiPut.mockReturnValue(new Promise(() => {}));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ pins: useFilterPins("gallery"), set: useSetPins() }),
      { wrapper }
    );

    act(() => {
      result.current.set.mutate({ kind: "gallery", pins: MINE });
    });

    await waitFor(() => expect(result.current.pins).toEqual(MINE));
  });

  it("and rolled back on a 500", async () => {
    mockApiGet.mockResolvedValue({ pins: serverPins() });
    mockApiPut.mockRejectedValue(new ApiError("boom", 500));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ pins: useFilterPins("scene"), set: useSetPins() }),
      { wrapper }
    );
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(result.current.pins).toEqual(defaultPinsOf("scene"))
    );

    act(() => {
      result.current.set.mutate({ kind: "scene", pins: MINE });
    });

    await waitFor(() => expect(result.current.set.isError).toBe(true));
    expect(result.current.pins).toEqual(defaultPinsOf("scene"));
  });

  it("a failed save is read again from the server", async () => {
    mockApiGet.mockResolvedValue({ pins: serverPins() });
    mockApiPut.mockRejectedValue(new ApiError("boom", 500));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ pins: useFilterPins("scene"), set: useSetPins() }),
      { wrapper }
    );
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.set.mutate({ kind: "scene", pins: MINE });
    });

    await waitFor(() => expect(result.current.set.isError).toBe(true));
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(2));
    expect(result.current.pins).toEqual(defaultPinsOf("scene"));
  });

  it("overlapping saves run one after another, and an earlier one failing does not undo a later one", async () => {
    mockApiGet.mockResolvedValue({ pins: serverPins() });
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    mockApiPut
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({
        pins: useFilterPins("scene"),
        a: useSetPins(),
        b: useSetPins(),
      }),
      { wrapper }
    );
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
    const ONE: ListPins = { fields: ["rating"], filters: [] };
    const TWO: ListPins = { fields: ["rating", "tags"], filters: [] };

    act(() => {
      result.current.a.mutate({ kind: "scene", pins: ONE });
      result.current.b.mutate({ kind: "scene", pins: TWO });
    });
    await waitFor(() => expect(result.current.pins).toEqual(TWO));
    // The second waits for the first
    expect(mockApiPut).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.reject(new ApiError("boom", 500));
      await first.promise.catch(() => undefined);
    });
    await waitFor(() => expect(result.current.a.isError).toBe(true));
    expect(result.current.pins).toEqual(TWO);
    await waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(2));
    expect(mockApiPut).toHaveBeenLastCalledWith("/user/filter-pins/scene", TWO);

    await act(async () => {
      second.resolve({});
      await second.promise;
    });
    await waitFor(() => expect(result.current.b.isSuccess).toBe(true));
    expect(result.current.pins).toEqual(TWO);
  });

  it("changes only the one list's entry", async () => {
    const stored = serverPins({ tag: MINE });
    mockApiGet.mockResolvedValue({ pins: stored });
    mockApiPut.mockResolvedValue({});
    const { wrapper, client } = setup();
    const { result } = renderHook(
      () => ({ tags: useFilterPins("tag"), set: useSetPins() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.tags).toEqual(MINE));

    await act(async () => {
      await result.current.set.mutateAsync({
        kind: "scene",
        pins: { fields: [], filters: [] },
      });
    });

    const cached = client.getQueryData<{ pins: FilterPins }>(
      queryKeys.user.filterPins()
    );
    expect(cached?.pins.tag).toEqual(MINE);
    expect(cached?.pins.scene).toEqual({ fields: [], filters: [] });
  });
});

describe("useResetPins", () => {
  it("deletes the list's entry and shows its defaults", async () => {
    mockApiGet.mockResolvedValue({ pins: serverPins({ group: MINE }) });
    mockApiDelete.mockResolvedValue({});
    const { wrapper } = setup();
    const { result } = renderHook(
      () => ({ pins: useFilterPins("group"), reset: useResetPins() }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.pins).toEqual(MINE));

    await act(async () => {
      await result.current.reset.mutateAsync("group");
    });

    expect(mockApiDelete).toHaveBeenCalledWith("/user/filter-pins/group");
    await waitFor(() =>
      expect(result.current.pins).toEqual(defaultPinsOf("group"))
    );
  });
});
