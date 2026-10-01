import type { NormalizedScene } from "@peek/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { createAuthValue, must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import SceneCardPreview from "@/components/ui/SceneCardPreview";
import { AuthContext } from "@/contexts/AuthContextProvider";
import { clearPreviewProbeCache } from "@/utils/previewProbeCache";

/** A preview whose user's settings (already loaded) prefer `quality`. */
const renderPreview = (
  quality: string,
  scene: NormalizedScene,
  active = true
) => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    queryKeys.user.settings(),
    userSettingsResponse({ preferredPreviewQuality: quality })
  );
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={createAuthValue({ isAuthenticated: true })}>
        <SceneCardPreview scene={scene} active={active} />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return {
    ...rendered,
    /** The same preview, with a new active state */
    setActive: (next: boolean) =>
      rendered.rerender(
        <QueryClientProvider client={queryClient}>
          <AuthContext.Provider
            value={createAuthValue({ isAuthenticated: true })}
          >
            <SceneCardPreview scene={scene} active={next} />
          </AuthContext.Provider>
        </QueryClientProvider>
      ),
  };
};

/** SceneCardPreview renders from these fields; the rest are left out */
const scene = (instanceId: string) =>
  ({
    id: "42",
    title: "A scene",
    instanceId,
    paths: { screenshot: null, vtt: null, sprite: null },
  }) as unknown as NormalizedScene;

/** Spies on the media element, restored after each test */
const mediaSpies: { mockRestore: () => void }[] = [];
const fetchMock = vi.fn<typeof fetch>();

describe("SceneCardPreview", () => {
  beforeEach(() => {
    clearPreviewProbeCache();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mediaSpies.forEach((spy) => spy.mockRestore());
    mediaSpies.length = 0;
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

  it("hovering the same card twice sends one HEAD", async () => {
    const first = renderPreview("mp4", scene("inst-a"));
    await waitFor(() => {
      expect(first.container.querySelector("video")).not.toBeNull();
    });
    first.unmount();

    // The grid remounts the card (a page change, a scroll back): same scene
    const second = renderPreview("mp4", scene("inst-a"));
    await waitFor(() => {
      expect(second.container.querySelector("video")).not.toBeNull();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a missing preview is remembered too, and falls back without a second HEAD", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const first = renderPreview("mp4", scene("inst-a"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();
    const second = renderPreview("mp4", scene("inst-a"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.container.querySelector("video")).toBeNull();
  });

  it("leaving the card clears the video's src before unmount", async () => {
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => {});
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => {});
    mediaSpies.push(pause, load);

    const view = renderPreview("mp4", scene("inst-a"));
    const video = await waitFor(() => {
      const el = view.container.querySelector("video");
      expect(el).not.toBeNull();
      return el;
    });
    expect(video?.getAttribute("src")).toContain("/preview");

    view.setActive(false);

    expect(view.container.querySelector("video")).toBeNull();
    expect(video?.hasAttribute("src")).toBe(false);
    expect(pause).toHaveBeenCalled();
    expect(load).toHaveBeenCalled();
  });
});
