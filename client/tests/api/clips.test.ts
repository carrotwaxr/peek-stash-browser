/**
 * Clip preview URLs carry the instance (sweep item 2), so the server checks
 * the row it will serve on a multi-instance setup. The clips list posts the
 * request the Clips page builds, as `POST /api/library/clips` takes it
 * (item 38, F16).
 */
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost } from "@/api/client";
import { findClips, getClipPreviewUrl, getClipsForScene } from "@/api/clips";

vi.mock("@/api/client", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  // The query client registers its library-stamp listener here
  setLibraryStampListener: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);
const mockApiPost = vi.mocked(apiPost);

describe("getClipPreviewUrl", () => {
  it("getClipPreviewUrl always names the instance", () => {
    expect(getClipPreviewUrl("5", "inst a")).toBe(
      "/api/proxy/clip/5/preview?instanceId=inst%20a"
    );
    // An empty instance is sent as it is, and the server refuses it
    expect(getClipPreviewUrl("5", "")).toBe(
      "/api/proxy/clip/5/preview?instanceId="
    );
  });
});

describe("findClips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiPost.mockResolvedValue({});
  });

  it("posts the request, its clip_filter and paging as they are", async () => {
    const request = {
      filter: {
        page: 2,
        per_page: 48,
        sort: "title" as const,
        direction: "ASC" as const,
        q: "kiss",
        count: false as const,
      },
      clip_filter: {
        scenes: { value: ["9:server-a"] },
        tags: { value: ["1:server-a"], modifier: "INCLUDES_ALL" as const },
        is_generated: false,
      },
    };

    await findClips(request);

    expect(mockApiPost).toHaveBeenCalledWith("/library/clips", request);
  });
});

describe("getClipsForScene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({});
  });

  it("always names the scene's instance", async () => {
    await getClipsForScene("42", "inst a");

    expect(mockApiGet).toHaveBeenCalledWith(
      "/scenes/42/clips?instanceId=inst+a",
      undefined
    );
  });

  it("passes the caller's abort signal through", async () => {
    const controller = new AbortController();

    await getClipsForScene("42", "server-a", false, controller.signal);

    expect(mockApiGet).toHaveBeenCalledWith(
      "/scenes/42/clips?instanceId=server-a",
      controller.signal
    );
  });

  it("asks for ungenerated clips too on request", async () => {
    await getClipsForScene("42", "server-a", true);

    const url = must(mockApiGet.mock.calls[0])[0];
    expect(url.startsWith("/scenes/42/clips?")).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(url.split("?")[1]))).toEqual({
      includeUngenerated: "true",
      instanceId: "server-a",
    });
  });
});
