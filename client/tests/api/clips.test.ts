/**
 * Clip preview URLs carry the instance (sweep item 2), so the server checks
 * the row it will serve on a multi-instance setup. The clips list sends
 * every filter parameter the Clips page builds, modifiers included, as
 * `GET /api/clips` takes them (item 38).
 */
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api/client";
import { getClipPreviewUrl, getClips, getClipsForScene } from "@/api/clips";

vi.mock("@/api/client", () => ({
  apiGet: vi.fn(),
  // The query client registers its library-stamp listener here
  setLibraryStampListener: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);

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

describe("getClips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({});
  });

  it("sends each filter with its modifier, lists comma-joined", async () => {
    await getClips({
      page: 2,
      perPage: 48,
      sortBy: "title",
      sortDir: "asc",
      q: "kiss",
      sceneId: "9:server-a",
      tagIds: ["1:server-a", "2:server-a"],
      tagIdsModifier: "INCLUDES_ALL",
      sceneTagIds: ["3:server-a"],
      sceneTagIdsModifier: "EXCLUDES",
      performerIds: ["4:server-a"],
      performerIdsModifier: "EXCLUDES",
      studioId: "5:server-a",
      isGenerated: false,
    });

    const url = must(mockApiGet.mock.calls[0])[0];
    expect(url.startsWith("/clips?")).toBe(true);
    expect(
      Object.fromEntries(new URLSearchParams(url.slice("/clips?".length)))
    ).toEqual({
      page: "2",
      perPage: "48",
      sortBy: "title",
      sortDir: "asc",
      q: "kiss",
      sceneId: "9:server-a",
      tagIds: "1:server-a,2:server-a",
      tagIdsModifier: "INCLUDES_ALL",
      sceneTagIds: "3:server-a",
      sceneTagIdsModifier: "EXCLUDES",
      performerIds: "4:server-a",
      performerIdsModifier: "EXCLUDES",
      studioId: "5:server-a",
      isGenerated: "false",
    });
  });

  it("sends count=false for a page alone, and nothing for a counted page", async () => {
    await getClips({ page: 2, count: false });
    await getClips({ page: 1 });

    expect(mockApiGet).toHaveBeenNthCalledWith(1, "/clips?page=2&count=false");
    expect(mockApiGet).toHaveBeenNthCalledWith(2, "/clips?page=1");
  });

  it("sends no isGenerated for every clip", async () => {
    await getClips({ page: 1 });

    expect(mockApiGet).toHaveBeenCalledWith("/clips?page=1");
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
