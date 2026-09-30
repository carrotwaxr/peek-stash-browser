import type { NormalizedScene } from "@peek/shared-types";
import { render, waitFor } from "@testing-library/react";
import { must } from "@tests/testUtils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SceneCardPreview from "@/components/ui/SceneCardPreview";

const auth = vi.hoisted(() => ({ preferredPreviewQuality: "mp4" }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { preferredPreviewQuality: auth.preferredPreviewQuality },
  }),
}));

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
      auth.preferredPreviewQuality = quality;
      fetchMock.mockClear();
      const { container, unmount } = render(
        <SceneCardPreview scene={scene(instanceId)} active />
      );
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
