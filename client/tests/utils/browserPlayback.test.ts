/**
 * What this browser can decode (item 59, MEDIA-PROXY-06).
 *
 * The player puts Direct first only for a file the browser can play. The
 * answer comes from `canPlayType`, since Direct is a progressive file, not
 * Media Source Extensions; a codec with no mapping keeps Stash's order.
 */
import {
  type MockInstance,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  canDecode,
  describePlaybackMethod,
  undecodableCodec,
} from "@/utils/browserPlayback";

type CanPlayTypeResult = "" | "maybe" | "probably";

/** A browser with H.264 and AAC, without HEVC (as Chrome on most desktops) */
function answer(type: string): CanPlayTypeResult {
  if (type.includes("hvc1") || type.includes("hev1")) return "";
  if (type.includes("avc1")) return "probably";
  if (type.includes("mp4a.40.2")) return "probably";
  if (type.includes("ac-3")) return "";
  return "";
}

let canPlayType: MockInstance<HTMLMediaElement["canPlayType"]>;

beforeEach(() => {
  canPlayType = vi
    .spyOn(HTMLMediaElement.prototype, "canPlayType")
    .mockImplementation(answer);
});

afterEach(() => {
  canPlayType.mockRestore();
});

describe("canDecode", () => {
  it("a codec the browser reports it cannot play is not decodable", () => {
    expect(canDecode({ video_codec: "hevc", audio_codec: "aac" })).toBe(false);
    expect(canDecode({ video_codec: "h265", audio_codec: null })).toBe(false);
    expect(canDecode({ video_codec: "h264", audio_codec: "aac" })).toBe(true);
    // Both HEVC spellings were asked
    const asked = canPlayType.mock.calls.map(([type]) => type);
    expect(asked.some((type) => type.includes("hvc1"))).toBe(true);
    expect(asked.some((type) => type.includes("hev1"))).toBe(true);
  });

  it("either HEVC spelling the browser plays makes it decodable", () => {
    canPlayType.mockImplementation((type) =>
      type.includes("hev1") ? "maybe" : answer(type)
    );

    expect(canDecode({ video_codec: "hevc", audio_codec: "aac" })).toBe(true);
  });

  it("an unknown codec is treated as decodable (null: keep Stash's order)", () => {
    expect(
      canDecode({ video_codec: "mpeg2video", audio_codec: "aac" })
    ).toBeNull();
    expect(canDecode({ video_codec: null, audio_codec: null })).toBeNull();
  });

  it("an audio codec the browser cannot play makes the file not decodable", () => {
    expect(canDecode({ video_codec: "h264", audio_codec: "ac3" })).toBe(false);
  });

  it("an unknown audio codec leaves the answer to the video codec", () => {
    expect(canDecode({ video_codec: "h264", audio_codec: "pcm_s16le" })).toBe(
      true
    );
  });

  it("codec names are matched without regard to case", () => {
    expect(canDecode({ video_codec: "HEVC", audio_codec: "AAC" })).toBe(false);
    expect(canDecode({ video_codec: "H264", audio_codec: "AAC" })).toBe(true);
  });
});

describe("undecodableCodec", () => {
  it("names the codec the browser cannot play, video first", () => {
    expect(undecodableCodec({ video_codec: "hevc", audio_codec: "ac3" })).toBe(
      "hevc"
    );
    expect(undecodableCodec({ video_codec: "h264", audio_codec: "ac3" })).toBe(
      "ac3"
    );
    expect(
      undecodableCodec({ video_codec: "h264", audio_codec: "aac" })
    ).toBeNull();
    expect(
      undecodableCodec({ video_codec: "mpeg2video", audio_codec: "ac3" })
    ).toBeNull();
  });
});

describe("describePlaybackMethod", () => {
  const direct = {
    url: "/api/scene/5/proxy-stream/stream?instanceId=i",
    label: "Direct stream",
  };
  const transcode = {
    url: "/api/scene/5/proxy-stream/stream.mp4?resolution=LOW&instanceId=i",
    label: "MP4 Low (240p)",
  };

  it("says Direct play when the browser decodes the file", () => {
    expect(
      describePlaybackMethod({
        sceneStreams: [direct, transcode],
        files: [{ video_codec: "h264", audio_codec: "aac" }],
      })
    ).toBe("Direct play");
  });

  it("names the codec the browser cannot play", () => {
    expect(
      describePlaybackMethod({
        sceneStreams: [direct, transcode],
        files: [{ video_codec: "hevc", audio_codec: "aac" }],
      })
    ).toBe("Transcoded: this browser cannot play HEVC");
  });

  it("says Transcoded when Stash offers no Direct stream", () => {
    expect(
      describePlaybackMethod({
        sceneStreams: [transcode],
        files: [{ video_codec: "h264", audio_codec: "aac" }],
      })
    ).toBe("Transcoded");
  });
});
