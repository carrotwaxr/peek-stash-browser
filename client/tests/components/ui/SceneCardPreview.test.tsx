import type { NormalizedScene } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { createAuthValue, must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import SceneCardPreview from "@/components/ui/SceneCardPreview";
import { AuthContext } from "@/contexts/AuthContextProvider";

/** A preview whose user's settings (already loaded) prefer `quality`. */
const renderPreview = (quality: string, scene: NormalizedScene) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    queryKeys.user.settings(),
    userSettingsResponse({ preferredPreviewQuality: quality })
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={createAuthValue({ isAuthenticated: true })}>
        <SceneCardPreview scene={scene} active />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

/** SceneCardPreview renders from these fields; the rest are left out */
const scene = (instanceId: string) =>
  ({
    id: "42",
    title: "A scene",
    instanceId,
    paths: { screenshot: null, vtt: null, sprite: null },
  }) as unknown as NormalizedScene;

const fetchMock = vi.fn<typeof fetch>();

describe("SceneCardPreview", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preview and webp URLs carry the scene's instance", async () => {
    const cases = [
      { quality: "mp4", instanceId: "inst a", selector: "video" },
      { quality: "webp", instanceId: "inst a", selector: "img + img" },
      // An empty instance is still sent; the server refuses it
      { quality: "mp4", instanceId: "", selector: "video" },
    ];
    const expected = [
      "/api/proxy/scene/42/preview?instanceId=inst%20a",
      "/api/proxy/scene/42/webp?instanceId=inst%20a",
      "/api/proxy/scene/42/preview?instanceId=",
    ];

    const heads: string[] = [];
    const srcs: (string | null)[] = [];
    for (const { quality, instanceId, selector } of cases) {
      fetchMock.mockClear();
      const { container, unmount } = renderPreview(quality, scene(instanceId));
      const overlay = await waitFor(() => {
        const el = container.querySelector(selector);
        expect(el).not.toBeNull();
        return el;
      });
      const [input] = must(fetchMock.mock.calls[0], "the HEAD request");
      heads.push(input instanceof Request ? input.url : input.toString());
      srcs.push(overlay?.getAttribute("src") ?? null);
      unmount();
    }

    expect(heads).toEqual(expected);
    expect(srcs).toEqual(expected);
  });
});
