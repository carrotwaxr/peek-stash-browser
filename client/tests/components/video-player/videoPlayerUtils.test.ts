/**
 * Caption tracks the player adds are Peek URLs: under a base path they
 * start with it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("@/utils/basePath");
  vi.resetModules();
});

const tracksFor = async (prefix: string) => {
  vi.resetModules();
  vi.doMock("@/utils/basePath", () => ({
    BASE_PATH: prefix,
    API_PATH: `${prefix}/api`,
    withBase: (path: string) => `${prefix}${path}`,
    stripBase: (pathname: string) => pathname,
  }));
  const { setupSubtitles } =
    await import("@/components/video-player/videoPlayerUtils");
  const addTextTrack = vi.fn<(options: { src: string }) => void>();
  const player = {
    isDisposed: () => false,
    sourceSelector: () => ({ addTextTrack }),
  };
  setupSubtitles(
    player,
    "12",
    [{ language_code: "en", caption_type: "srt" }],
    "inst a"
  );
  return addTextTrack.mock.calls.map(([options]) => options.src);
};

describe("setupSubtitles", () => {
  it("builds the caption URL from API_PATH", async () => {
    expect(await tracksFor("/peek")).toEqual([
      "/peek/api/scene/12/caption?lang=en&type=srt&instanceId=inst%20a",
    ]);
  });

  it("without a base path the URL is the root one", async () => {
    expect(await tracksFor("")).toEqual([
      "/api/scene/12/caption?lang=en&type=srt&instanceId=inst%20a",
    ]);
  });
});
