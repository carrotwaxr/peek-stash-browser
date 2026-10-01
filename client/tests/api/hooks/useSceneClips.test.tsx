/**
 * useSceneClips: one keyed query for a scene's clips, which the player's
 * timeline and the details panel share.
 */
import type { ReactNode } from "react";
import type { GetClipsForSceneResponse } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getClipsForScene } from "@/api";
import { useSceneClips } from "@/api/hooks/useSceneClips";
import { queryKeys } from "@/api/queryKeys";

vi.mock("@/api", () => ({
  getClipsForScene: vi.fn(),
}));

function createWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const newClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const answer: GetClipsForSceneResponse = { clips: [] };

describe("useSceneClips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClipsForScene).mockResolvedValue(answer);
  });

  it("the player and the details panel send one clips request per scene", async () => {
    const client = newClient();
    const { result } = renderHook(
      () => ({
        player: useSceneClips("1", "inst-a"),
        details: useSceneClips("1", "inst-a"),
      }),
      { wrapper: createWrapper(client) }
    );

    await waitFor(() => {
      expect(result.current.player.isSuccess).toBe(true);
      expect(result.current.details.isSuccess).toBe(true);
    });
    expect(getClipsForScene).toHaveBeenCalledTimes(1);
    expect(getClipsForScene).toHaveBeenCalledWith(
      "1",
      "inst-a",
      true,
      expect.any(AbortSignal)
    );
    expect(client.getQueryData(queryKeys.clips.forScene("1", "inst-a"))).toBe(
      answer
    );
  });

  it("the same scene id on another instance is its own request", async () => {
    const { result, rerender } = renderHook(
      ({ instanceId }: { instanceId: string }) =>
        useSceneClips("1", instanceId),
      {
        wrapper: createWrapper(newClient()),
        initialProps: { instanceId: "inst-a" },
      }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    rerender({ instanceId: "inst-b" });
    await waitFor(() => expect(getClipsForScene).toHaveBeenCalledTimes(2));

    expect(getClipsForScene).toHaveBeenLastCalledWith(
      "1",
      "inst-b",
      true,
      expect.any(AbortSignal)
    );
  });

  it("sends nothing without a scene", () => {
    renderHook(() => useSceneClips("", ""), {
      wrapper: createWrapper(newClient()),
    });

    expect(getClipsForScene).not.toHaveBeenCalled();
  });
});
