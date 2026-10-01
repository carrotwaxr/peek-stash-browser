/**
 * The playlist query hooks: one keyed read per page, queue and list, and
 * every write marks the playlist's queries stale (B10).
 */
import { type ReactNode } from "react";
import type {
  GetPlaylistQueueResponse,
  GetPlaylistResponse,
  GetUserPlaylistsResponse,
} from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouterWithQuery } from "@tests/helpers/MemoryRouterWithQuery";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as clientModule from "@/api/client";
import {
  useAddScenesToPlaylist,
  useMovePlaylistItem,
  usePlaylist,
  usePlaylistQueue,
  usePlaylists,
  useRemovePlaylistItems,
  useRemoveUnavailableItems,
  useSharedPlaylists,
  useSortPlaylist,
  useUpdatePlaylist,
} from "@/api/hooks/usePlaylists";
import { queryKeys } from "@/api/queryKeys";

const { mockApiGet, mockApiPost, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
  mockApiPut: vi.fn(),
}));

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof clientModule>()),
  apiGet: mockApiGet,
  apiPost: mockApiPost,
  apiPut: mockApiPut,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouterWithQuery>{children}</MemoryRouterWithQuery>
);

function playlistResponse(page: number): GetPlaylistResponse {
  return {
    playlist: {
      id: 7,
      userId: 1,
      name: `Page ${page}`,
      description: null,
      shuffle: false,
      repeat: "none",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      items: [],
    },
    totalItems: 120,
    page,
    perPage: 50,
    isOwner: true,
    accessLevel: "owner",
  };
}

const emptyList: GetUserPlaylistsResponse = { playlists: [] };
const emptyQueue: GetPlaylistQueueResponse = { entries: [] };

function getsTo(prefix: string): number {
  return mockApiGet.mock.calls.filter(([path]) =>
    String(path).startsWith(prefix)
  ).length;
}

describe("usePlaylist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks GET /playlists/:id with page, per_page, sort and direction and keeps the previous page while the next loads", async () => {
    let releasePage2: (value: GetPlaylistResponse) => void = () => {};
    mockApiGet.mockImplementation((path: string) =>
      path.includes("page=2")
        ? new Promise<GetPlaylistResponse>((resolve) => {
            releasePage2 = resolve;
          })
        : Promise.resolve(playlistResponse(1))
    );

    const { result, rerender } = renderHook(
      ({ page }: { page: number }) =>
        usePlaylist(7, {
          page,
          perPage: 50,
          sort: "rating",
          direction: "DESC",
        }),
      { wrapper, initialProps: { page: 1 } }
    );

    await waitFor(() => expect(result.current.data?.page).toBe(1));
    const [firstPath] = mockApiGet.mock.calls[0] as [string];
    const url = new URL(firstPath, "http://peek.test");
    expect(url.pathname).toBe("/playlists/7");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "1",
      per_page: "50",
      sort: "rating",
      direction: "DESC",
    });

    rerender({ page: 2 });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(true));
    expect(result.current.data?.page).toBe(1);

    act(() => {
      releasePage2(playlistResponse(2));
    });
    await waitFor(() => expect(result.current.data?.page).toBe(2));
    expect(result.current.isPlaceholderData).toBe(false);
  });
});

describe("usePlaylistQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(emptyQueue);
  });

  it("keys on the playlist and the sort", async () => {
    const { result, rerender } = renderHook(
      ({ id, sort }: { id: number; sort: string }) => {
        const queue = usePlaylistQueue(id, { sort, direction: "ASC" });
        return { queue, client: useQueryClient() };
      },
      { wrapper, initialProps: { id: 7, sort: "position" } }
    );
    await waitFor(() => expect(result.current.queue.isSuccess).toBe(true));
    expect(mockApiGet).toHaveBeenLastCalledWith(
      "/playlists/7/queue?sort=position&direction=ASC",
      expect.anything()
    );

    rerender({ id: 7, sort: "random_42" });
    await waitFor(() => expect(getsTo("/playlists/7/queue")).toBe(2));
    expect(mockApiGet).toHaveBeenLastCalledWith(
      "/playlists/7/queue?sort=random_42&direction=ASC",
      expect.anything()
    );

    rerender({ id: 8, sort: "random_42" });
    await waitFor(() => expect(getsTo("/playlists/8/queue")).toBe(1));

    const { client } = result.current;
    expect(
      client.getQueryData(queryKeys.playlists.queue(7, "position", "ASC"))
    ).toEqual(emptyQueue);
    expect(
      client.getQueryData(queryKeys.playlists.queue(7, "random_42", "ASC"))
    ).toEqual(emptyQueue);
    expect(
      client.getQueryData(queryKeys.playlists.queue(8, "position", "ASC"))
    ).toBeUndefined();
  });
});

describe("usePlaylists and useSharedPlaylists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue(emptyList);
  });

  it("send containsScene when asked, and read the shared route", async () => {
    const { result } = renderHook(
      () => ({
        mine: usePlaylists({ containsScene: "5:inst-a" }),
        shared: useSharedPlaylists(),
      }),
      { wrapper }
    );
    await waitFor(() => {
      expect(result.current.mine.isSuccess).toBe(true);
      expect(result.current.shared.isSuccess).toBe(true);
    });
    const paths = mockApiGet.mock.calls.map(([path]) => String(path));
    expect(paths).toContain("/playlists?containsScene=5%3Ainst-a");
    expect(paths).toContain("/playlists/shared");
  });
});

/** Every mutation hook, how it is called, and the request it sends. */
const MUTATIONS = [
  {
    name: "useAddScenesToPlaylist",
    useIt: useAddScenesToPlaylist,
    variables: {
      playlistId: 7,
      scenes: [{ sceneId: "1", instanceId: "a" }],
    },
    method: mockApiPost,
    path: "/playlists/7/items/bulk",
    body: { scenes: [{ sceneId: "1", instanceId: "a" }] },
    answer: { added: 1, alreadyInPlaylist: 0, unavailable: 0 },
  },
  {
    name: "useMovePlaylistItem",
    useIt: useMovePlaylistItem,
    variables: { playlistId: 7, itemId: 33, index: 2 },
    method: mockApiPut,
    path: "/playlists/7/items/33/position",
    body: { index: 2 },
    answer: { success: true },
  },
  {
    name: "useRemovePlaylistItems",
    useIt: useRemovePlaylistItems,
    variables: { playlistId: 7, itemIds: [3, 4] },
    method: mockApiPost,
    path: "/playlists/7/items/remove",
    body: { itemIds: [3, 4] },
    answer: { removed: 2 },
  },
  {
    name: "useSortPlaylist",
    useIt: useSortPlaylist,
    variables: { playlistId: 7, sort: "rating", direction: "DESC" as const },
    method: mockApiPost,
    path: "/playlists/7/sort",
    body: { sort: "rating", direction: "DESC" },
    answer: { success: true, itemCount: 2 },
  },
  {
    name: "useUpdatePlaylist",
    useIt: useUpdatePlaylist,
    variables: { playlistId: 7, description: null, shuffle: true },
    method: mockApiPut,
    path: "/playlists/7",
    body: { description: null, shuffle: true },
    answer: { playlist: playlistResponse(1).playlist },
  },
  {
    name: "useRemoveUnavailableItems",
    useIt: useRemoveUnavailableItems,
    variables: { playlistId: 7 },
    method: mockApiPost,
    path: "/playlists/7/items/remove-unavailable",
    body: undefined,
    answer: { removed: 1 },
  },
] as const;

/** Mounts one reader per kind of playlist query beside a mutation hook. */
function Readers() {
  usePlaylists();
  usePlaylist(7, { page: 1, perPage: 50 });
  usePlaylistQueue(7, {});
  return null;
}

describe("playlist mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.includes("/queue")
          ? emptyQueue
          : path.startsWith("/playlists/7")
            ? playlistResponse(1)
            : emptyList
      )
    );
  });

  it.each(MUTATIONS)(
    "a successful $name sends its request and invalidates the playlist's queries and the playlists list",
    async ({ useIt, variables, method, path, body, answer }) => {
      method.mockResolvedValue(answer);
      const mutationRef: { current: ReturnType<typeof useIt> | null } = {
        current: null,
      };
      function Mutating() {
        mutationRef.current = useIt();
        return null;
      }
      render(
        <MemoryRouterWithQuery>
          <Readers />
          <Mutating />
        </MemoryRouterWithQuery>
      );
      await waitFor(() => expect(getsTo("/playlists")).toBe(3));

      await act(async () => {
        await (
          mutationRef.current as unknown as {
            mutateAsync: (v: unknown) => Promise<unknown>;
          }
        ).mutateAsync(variables);
      });

      if (body === undefined) {
        expect(method).toHaveBeenCalledWith(path);
      } else {
        expect(method).toHaveBeenCalledWith(path, body);
      }
      // The list, the page and the queue each ran again
      await waitFor(() => expect(getsTo("/playlists")).toBe(6));
      expect(
        mockApiGet.mock.calls.filter(([p]) => String(p).includes("/queue"))
      ).toHaveLength(2);
      expect(
        mockApiGet.mock.calls.filter(([p]) =>
          String(p).startsWith("/playlists/7?")
        )
      ).toHaveLength(2);
    }
  );

  it("a failed write leaves the playlist's queries alone", async () => {
    mockApiPost.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(
      () => {
        usePlaylist(7, { page: 1, perPage: 50 });
        return useRemovePlaylistItems();
      },
      { wrapper }
    );
    await waitFor(() => expect(getsTo("/playlists/7")).toBe(1));
    await act(async () => {
      await result.current
        .mutateAsync({ playlistId: 7, itemIds: [1] })
        .catch(() => undefined);
    });
    expect(getsTo("/playlists/7")).toBe(1);
  });
});
