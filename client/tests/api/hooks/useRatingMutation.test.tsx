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
import { useUpdateRating } from "@/api/hooks/useRatingMutation";
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

const updateRating = vi.mocked(libraryApi.updateRating);
const updateFavorite = vi.mocked(libraryApi.updateFavorite);

/** The server's answer to a write: the user's stored values */
function answer(
  id: string,
  instanceId: string,
  values: { rating?: number | null; favorite?: boolean }
): UpdateRatingResponse {
  return {
    success: true,
    rating: {
      id: Number(id),
      instanceId,
      rating: values.rating ?? null,
      favorite: values.favorite ?? false,
    },
  };
}

/** A deferred promise, to hold a write open */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function performer(
  instanceId: string,
  rating: number | null,
  favorite = false
) {
  return {
    id: "7",
    instanceId,
    name: "Alex",
    rating,
    rating100: rating,
    favorite,
  };
}

describe("useUpdateRating", () => {
  let client: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactNode;

  /** Seeds the cached list page, the Home carousel, and both detail keys */
  const listKey = queryKeys.performers.list(undefined, { page: 1 });
  const carouselKey = queryKeys.homeCarousels.byKey("recent");
  const bareDetailKey = queryKeys.performers.detail(undefined, "7");
  const namedDetailKey = queryKeys.performers.detail("inst-1", "7");

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

  /** Mounts the query so it is active and counts its fetches */
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

  async function seedAll(rating: number | null = 20) {
    const mounted = await Promise.all([
      mount(listKey, {
        findPerformers: {
          count: 2,
          performers: [
            performer("inst-1", rating),
            performer("inst-2", rating),
          ],
        },
      }),
      mount(bareDetailKey, performer("inst-1", rating)),
      mount(namedDetailKey, performer("inst-1", rating)),
    ]);
    return mounted;
  }

  it("a saved rating shows on the cached list page, Home's carousel and the detail entry without a refetch", async () => {
    const sceneRow = (instanceId: string, rating: number | null) => ({
      id: "7",
      instanceId,
      title: "Scene",
      rating,
      rating100: rating,
      favorite: false,
    });
    const sceneList = queryKeys.scenes.list(undefined, { page: 1 });
    const sceneDetail = queryKeys.scenes.detail(undefined, "7");
    const mounted = await Promise.all([
      mount(sceneList, {
        findScenes: {
          count: 2,
          scenes: [sceneRow("inst-1", 20), sceneRow("inst-2", 20)],
        },
      }),
      mount(carouselKey, { scenes: [sceneRow("inst-1", 20)] }),
      mount(sceneDetail, sceneRow("inst-1", 20)),
    ]);
    updateRating.mockResolvedValue(answer("7", "inst-1", { rating: 85 }));
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "scene",
        entityId: "7",
        rating: 85,
        instanceId: "inst-1",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateRating).toHaveBeenCalledWith("scene", "7", 85, "inst-1");
    expect(client.getQueryData(sceneList)).toEqual({
      findScenes: {
        count: 2,
        scenes: [sceneRow("inst-1", 85), sceneRow("inst-2", 20)],
      },
    });
    expect(client.getQueryData(carouselKey)).toEqual({
      scenes: [sceneRow("inst-1", 85)],
    });
    expect(client.getQueryData(sceneDetail)).toEqual(sceneRow("inst-1", 85));
    for (const { queryFn } of mounted) expect(queryFn).toHaveBeenCalledTimes(1);
    // Marked stale, so the next visit fetches the truth
    expect(client.getQueryState(sceneList)?.isInvalidated).toBe(true);
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("the cached detail entry (bare-id and instance-named keys) shows the new rating before the server answers", async () => {
    const mounted = await seedAll();
    const write = deferred<UpdateRatingResponse>();
    updateRating.mockReturnValue(write.promise);
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 85,
        instanceId: "inst-1",
      });
    });

    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(
        performer("inst-1", 85)
      )
    );
    expect(client.getQueryData(namedDetailKey)).toEqual(
      performer("inst-1", 85)
    );
    expect(result.current.isPending).toBe(true);

    write.resolve(answer("7", "inst-1", { rating: 85 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("a failed save puts every patched row and the detail entry back", async () => {
    const mounted = await seedAll();
    updateRating.mockRejectedValue(new Error("Server error"));
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 85,
        instanceId: "inst-1",
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(client.getQueryData(listKey)).toEqual({
      findPerformers: {
        count: 2,
        performers: [performer("inst-1", 20), performer("inst-2", 20)],
      },
    });
    expect(client.getQueryData(bareDetailKey)).toEqual(performer("inst-1", 20));
    expect(client.getQueryData(namedDetailKey)).toEqual(
      performer("inst-1", 20)
    );
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("the same id on another instance keeps its rating", async () => {
    const mounted = await seedAll();
    updateRating.mockResolvedValue(answer("7", "inst-1", { rating: 85 }));
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 85,
        instanceId: "inst-1",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(client.getQueryData(listKey)).toMatchObject({
      findPerformers: {
        performers: [{ instanceId: "inst-1" }, performer("inst-2", 20)],
      },
    });
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("a favorite answer does not overwrite a rating still being saved", async () => {
    const mounted = await seedAll();
    const ratingWrite = deferred<UpdateRatingResponse>();
    updateRating.mockReturnValue(ratingWrite.promise);
    // The server's favorite answer carries the rating it stored before
    // the rating write landed
    updateFavorite.mockResolvedValue(
      answer("7", "inst-1", { rating: 20, favorite: true })
    );
    const rating = renderHook(() => useUpdateRating(), { wrapper });
    const favorite = renderHook(() => useUpdateFavorite(), { wrapper });

    await actAsync(() => {
      rating.result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 85,
        instanceId: "inst-1",
      });
    });
    await actAsync(() => {
      favorite.result.current.mutate({
        entityType: "performer",
        entityId: "7",
        favorite: true,
        instanceId: "inst-1",
      });
    });
    await waitFor(() => expect(favorite.result.current.isSuccess).toBe(true));

    expect(client.getQueryData(bareDetailKey)).toEqual(
      performer("inst-1", 85, true)
    );

    ratingWrite.resolve(answer("7", "inst-1", { rating: 85, favorite: true }));
    await waitFor(() => expect(rating.result.current.isSuccess).toBe(true));
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("a list fetch started while the save is open does not undo the new rating", async () => {
    const mounted = await seedAll();
    const write = deferred<UpdateRatingResponse>();
    updateRating.mockReturnValue(write.promise);
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 85,
        instanceId: "inst-1",
      });
    });
    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(
        performer("inst-1", 85)
      )
    );

    // A refetch that began before the save landed answers with the old value
    const oldList = {
      findPerformers: {
        count: 2,
        performers: [performer("inst-1", 20), performer("inst-2", 20)],
      },
    };
    const fetching = client.fetchQuery({
      queryKey: listKey,
      queryFn: () =>
        new Promise((resolve) => setTimeout(() => resolve(oldList), 20)),
      staleTime: 0,
    });
    write.resolve(answer("7", "inst-1", { rating: 85 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await fetching.catch(() => undefined);

    expect(client.getQueryData(listKey)).toMatchObject({
      findPerformers: { performers: [{ rating100: 85 }, { rating100: 20 }] },
    });
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("a failed save does not undo a newer save of the same entity", async () => {
    const mounted = await seedAll();
    const first = deferred<UpdateRatingResponse>();
    const second = deferred<UpdateRatingResponse>();
    updateRating
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 60,
        instanceId: "inst-1",
      });
    });
    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(
        performer("inst-1", 60)
      )
    );
    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 90,
        instanceId: "inst-1",
      });
    });
    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(
        performer("inst-1", 90)
      )
    );

    first.reject(new Error("Server error"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(client.getQueryData(bareDetailKey)).toEqual(performer("inst-1", 90));

    second.resolve(answer("7", "inst-1", { rating: 90 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(bareDetailKey)).toEqual(performer("inst-1", 90));

    // Both failing puts back the rating from before the first
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("two failed saves put back the rating from before the first", async () => {
    const mounted = await seedAll();
    const first = deferred<UpdateRatingResponse>();
    const second = deferred<UpdateRatingResponse>();
    updateRating
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 60,
        instanceId: "inst-1",
      });
    });
    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(
        performer("inst-1", 60)
      )
    );
    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: 90,
        instanceId: "inst-1",
      });
    });
    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(
        performer("inst-1", 90)
      )
    );

    first.reject(new Error("Server error"));
    second.reject(new Error("Server error"));
    await waitFor(() =>
      expect(client.getQueryData(bareDetailKey)).toEqual(
        performer("inst-1", 20)
      )
    );
    for (const { unsubscribe } of mounted) unsubscribe();
  });

  it("clears a rating with null", async () => {
    const mounted = await seedAll();
    updateRating.mockResolvedValue(answer("7", "inst-1", { rating: null }));
    const { result } = renderHook(() => useUpdateRating(), { wrapper });

    await actAsync(() => {
      result.current.mutate({
        entityType: "performer",
        entityId: "7",
        rating: null,
        instanceId: "inst-1",
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(updateRating).toHaveBeenCalledWith("performer", "7", null, "inst-1");
    expect(client.getQueryData(bareDetailKey)).toEqual(
      performer("inst-1", null)
    );
    for (const { unsubscribe } of mounted) unsubscribe();
  });
});
