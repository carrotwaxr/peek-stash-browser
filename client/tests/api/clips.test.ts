/**
 * Clip preview URLs carry the instance (sweep item 2), so the server checks
 * the row it will serve on a multi-instance setup. The clips list sends
 * every filter parameter the Clips page builds, modifiers included, as
 * `GET /api/clips` takes them (item 38).
 */
import { must } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "@/api/client";
import { getClipPreviewUrl, getClips } from "@/api/clips";

vi.mock("@/api/client", () => ({
  apiGet: vi.fn(),
}));

const mockApiGet = vi.mocked(apiGet);

describe("getClipPreviewUrl", () => {
  it("appends the instance", () => {
    expect(getClipPreviewUrl("5", "inst a")).toBe(
      "/api/proxy/clip/5/preview?instanceId=inst%20a"
    );
  });

  it("is unchanged without an instance", () => {
    expect(getClipPreviewUrl("5")).toBe("/api/proxy/clip/5/preview");
    expect(getClipPreviewUrl("5", "")).toBe("/api/proxy/clip/5/preview");
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

  it("sends no isGenerated for every clip", async () => {
    await getClips({ page: 1 });

    expect(mockApiGet).toHaveBeenCalledWith("/clips?page=1");
  });
});
