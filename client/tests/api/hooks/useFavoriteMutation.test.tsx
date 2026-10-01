import type { ReactNode } from "react";
import type { UpdateRatingResponse } from "@peek/shared-types";
import {
  type QueryClient,
  QueryClientProvider,
  QueryObserver,
} from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateFavorite } from "@/api/hooks/useFavoriteMutation";
import { libraryApi } from "@/api/library";
import { createQueryClient } from "@/api/queryClient";
import { queryKeys } from "@/api/queryKeys";
import { actAsync } from "../../testUtils";

vi.mock("@/api/library", () => ({
  libraryApi: {
    updateRating: vi.fn(),
    updateFavorite: vi.fn(),
  },
}));

const updateFavorite = vi.mocked(libraryApi.updateFavorite);

function answer(favorite: boolean): UpdateRatingResponse {
  return {
    success: true,
    rating: { id: 7, instanceId: "inst-1", rating: null, favorite },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function studio(instanceId: string, favorite: boolean) {
  return {
    id: "7",
    instanceId,
    name: "Studio",
    rating: null,
    rating100: null,
    favorite,
  };
}

describe("useUpdateFavorite", () => {
  let client: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactNode;

  const listKey = queryKeys.studios.list(undefined, { page: 1 });
  const bareDetailKey = queryKeys.studios.detail(undefined, "7");
  const namedDetailKey = queryKeys.studios.detail("inst-1", "7");

  beforeEach(() => {
    client = createQueryClient();
    client.setDefaultOptions({
      queries: { retry: false },
      mutations: { retry: false },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    client.clear();
  });

  async function mount(key: readonly unknown[], data: unknown) {
    const queryFn = vi.fn(() => Promise.resolve(data));
    const observer = new QueryObserver(client, {
      queryKey: key,
      queryFn,
      staleTime: Infinity,
    });
    const unsubscribe = observer.subscribe(() => {});
    await waitFor(() => expect(client.getQueryData(key)).toBeDefined());
    return { queryFn, unsubscribe };
  }

  async function seedAll() {
    return Promise.all([
      mount(listKey, {
        findStudios: {
          count: 2,
          studios: [studio("inst-1", false), studio("inst-2", false)],
        },
      }),
      mount(bareDetailKey, studio("inst-1", false)),
      mount(namedDetailKey, studio("inst-1", false)),
    ]);
  }

  it("a saved favorite shows on the cached list page and the detail entry without a refetch", async () => {
    const mounted = await seedAll();
    updateFavorite.mockResolvedValue(answer(true));
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "studio",
        entityId: "7",
        favorite: true,
        instanceId: "inst-1",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateFavorite).toHaveBeenCalledWith("studio", "7", true, "inst-1");
    expect(client.getQueryData(listKey)).toEqual({
      findStudios: {
        count: 2,
        studios: [studio("inst-1", true), studio("inst-2", false)],
      },
    });
    expect(client.getQueryData(bareDetailKey)).toEqual(studio("inst-1", true));
    for (const { queryFn } of mounted) expect(queryFn).toHaveBeenCalledTimes(1);
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("the cached detail entry (bare-id and instance-named keys) shows the new favorite before the server answers", async () => {
    const mounted = await seedAll();
    const write = deferred<UpdateRatingResponse>();
    updateFavorite.mockReturnValue(write.promise);
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "studio",
        entityId: "7",
        favorite: true,
        instanceId: "inst-1",
      });
    });

    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(studio("inst-1", true))
    );
    expect(client.getQueryData(namedDetailKey)).toEqual(studio("inst-1", true));

    write.resolve(answer(true));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("a failed save puts every patched row and the detail entry back", async () => {
    const mounted = await seedAll();
    updateFavorite.mockRejectedValue(new Error("Server error"));
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "studio",
        entityId: "7",
        favorite: true,
        instanceId: "inst-1",
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(client.getQueryData(listKey)).toEqual({
      findStudios: {
        count: 2,
        studios: [studio("inst-1", false), studio("inst-2", false)],
      },
    });
    expect(client.getQueryData(bareDetailKey)).toEqual(studio("inst-1", false));
    expect(client.getQueryData(namedDetailKey)).toEqual(
      studio("inst-1", false)
    );
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("the same id on another instance keeps its favorite", async () => {
    const mounted = await seedAll();
    updateFavorite.mockResolvedValue(answer(true));
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "studio",
        entityId: "7",
        favorite: true,
        instanceId: "inst-1",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(listKey)).toMatchObject({
      findStudios: { studios: [{ favorite: true }, studio("inst-2", false)] },
    });
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("a failed toggle does not undo a newer toggle of the same entity", async () => {
    const mounted = await seedAll();
    const first = deferred<UpdateRatingResponse>();
    const second = deferred<UpdateRatingResponse>();
    updateFavorite
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useUpdateFavorite(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "studio",
        entityId: "7",
        favorite: true,
        instanceId: "inst-1",
      });
    });
    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(studio("inst-1", true))
    );
    await actAsync(() => {
      result.current.mutate({
        entityType: "studio",
        entityId: "7",
        favorite: false,
        instanceId: "inst-1",
      });
    });

    first.reject(new Error("Server error"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getQueryData(bareDetailKey)).toEqual(studio("inst-1", false));

    second.resolve(answer(false));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const { unsubscribe } of mounted) unsubscribe();
  });
});
