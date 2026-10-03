/**
 * Player sources from the server's stream list (item 1).
 *
 * The server sends keyless Peek proxy paths; the player uses them unchanged
 * and only marks which ones need the transcode time offset.
 */
import { must } from "@tests/testUtils";
import { describe, expect, it } from "vitest";
import {
  buildPlayerSources,
  isDirectSource,
} from "@/components/video-player/playerSources";

/** A browser that plays every file */
const decodesAll = () => true;

describe("buildPlayerSources", () => {
  it("uses the server's stream paths unchanged", () => {
    const sources = buildPlayerSources(
      {
        id: "5",
        instanceId: "i",
        sceneStreams: [
          {
            url: "/api/scene/5/proxy-stream/stream?instanceId=i",
            mime_type: "video/mp4",
            label: "Direct stream",
          },
          {
            url: "/api/scene/5/proxy-stream/stream.mp4?resolution=LOW&instanceId=i",
            mime_type: "video/mp4",
            label: "MP4 Low (240p)",
          },
        ],
        files: [{ duration: 60 }],
      },
      decodesAll
    );

    expect(sources).toEqual([
      {
        src: "/api/scene/5/proxy-stream/stream?instanceId=i",
        type: "video/mp4",
        label: "Direct stream",
        offset: false,
        duration: 60,
      },
      {
        src: "/api/scene/5/proxy-stream/stream.mp4?resolution=LOW&instanceId=i",
        type: "video/mp4",
        label: "MP4 Low (240p)",
        offset: true,
        duration: 60,
      },
    ]);
  });

  it("does not offset HLS or DASH", () => {
    const sources = buildPlayerSources(
      {
        id: "5",
        instanceId: "i",
        sceneStreams: [
          {
            url: "/api/scene/5/proxy-stream/stream.m3u8?resolution=LOW&instanceId=i",
            mime_type: "application/vnd.apple.mpegurl",
            label: "HLS Low (240p)",
          },
          {
            url: "/api/scene/5/proxy-stream/stream.mpd?resolution=ORIGINAL&instanceId=i",
            mime_type: "application/dash+xml",
            label: "DASH",
          },
          {
            url: "/api/scene/5/proxy-stream/stream.webm?resolution=ORIGINAL&instanceId=i",
            mime_type: "video/webm",
            label: "WEBM",
          },
          {
            url: "/api/scene/5/proxy-stream/stream.mkv?instanceId=i",
            mime_type: "video/mp4",
            label: "MKV",
          },
        ],
        files: [{ duration: 60 }],
      },
      decodesAll
    );

    expect(sources.map((s) => s.offset)).toEqual([false, false, true, true]);
  });

  it("falls back to the proxied direct stream when sceneStreams is empty", () => {
    const sources = buildPlayerSources(
      {
        id: "5",
        instanceId: "i",
        sceneStreams: [],
        files: [{ duration: 60 }],
      },
      decodesAll
    );

    expect(sources).toEqual([
      {
        src: "/api/scene/5/proxy-stream/stream?instanceId=i",
        label: "Direct",
        offset: false,
      },
    ]);
  });

  it("the direct fallback names the instance and encodes the id", () => {
    const sources = buildPlayerSources(
      { id: "a/b 5", instanceId: "i 1" },
      decodesAll
    );

    expect(sources).toEqual([
      {
        src: "/api/scene/a%2Fb%205/proxy-stream/stream?instanceId=i+1",
        label: "Direct",
        offset: false,
      },
    ]);
  });

  it("leaves type, label and duration unset when the server omits them", () => {
    const sources = buildPlayerSources(
      {
        id: "5",
        instanceId: "i",
        sceneStreams: [
          {
            url: "/api/scene/5/proxy-stream/stream.mp4?instanceId=i",
            mime_type: null,
            label: null,
          },
        ],
        files: [{ duration: 0 }],
      },
      decodesAll
    );

    expect(sources).toEqual([
      {
        src: "/api/scene/5/proxy-stream/stream.mp4?instanceId=i",
        type: undefined,
        label: undefined,
        offset: true,
        duration: undefined,
      },
    ]);
  });

  it("leaves duration unset for a scene with no files", () => {
    const source = must(
      buildPlayerSources(
        {
          id: "5",
          instanceId: "i",
          sceneStreams: [{ url: "/api/scene/5/proxy-stream/stream" }],
        },
        decodesAll
      )[0]
    );

    expect(source.duration).toBeUndefined();
    expect(source.offset).toBe(false);
  });
  describe("ordered by what this browser decodes", () => {
    const streams = [
      {
        url: "/api/scene/5/proxy-stream/stream?instanceId=i",
        label: "Direct stream",
      },
      {
        url: "/api/scene/5/proxy-stream/stream.mkv?instanceId=i",
        label: "MKV",
      },
      {
        url: "/api/scene/5/proxy-stream/stream.mp4?resolution=LOW&instanceId=i",
        label: "MP4 Low (240p)",
      },
      {
        url: "/api/scene/5/proxy-stream/stream.webm?resolution=LOW&instanceId=i",
        label: "WEBM Low (240p)",
      },
      {
        url: "/api/scene/5/proxy-stream/stream.m3u8?resolution=LOW&instanceId=i",
        label: "HLS Low (240p)",
      },
    ];

    it("for an HEVC file this browser cannot decode, Direct and MKV move after the transcodes, in Stash's order otherwise", () => {
      const checked: unknown[] = [];
      const sources = buildPlayerSources(
        {
          id: "5",
          instanceId: "i",
          sceneStreams: streams,
          files: [{ duration: 60, video_codec: "hevc", audio_codec: "aac" }],
        },
        (file) => {
          checked.push(file);
          return false;
        }
      );

      expect(sources.map((s) => s.label)).toEqual([
        "MP4 Low (240p)",
        "WEBM Low (240p)",
        "HLS Low (240p)",
        "Direct stream",
        "MKV",
      ]);
      expect(checked).toEqual([
        { duration: 60, video_codec: "hevc", audio_codec: "aac" },
      ]);
    });

    it("for H.264 on a browser that decodes it the order is unchanged", () => {
      const sources = buildPlayerSources(
        {
          id: "5",
          instanceId: "i",
          sceneStreams: streams,
          files: [{ duration: 60, video_codec: "h264", audio_codec: "aac" }],
        },
        () => true
      );

      expect(sources.map((s) => s.label)).toEqual(streams.map((s) => s.label));
    });

    it("a codec the check does not know keeps Stash's order", () => {
      const sources = buildPlayerSources(
        {
          id: "5",
          instanceId: "i",
          sceneStreams: streams,
          files: [{ video_codec: "mpeg2video", audio_codec: "mp2" }],
        },
        () => null
      );

      expect(sources.map((s) => s.label)).toEqual(streams.map((s) => s.label));
    });
  });

  it("Direct and MKV are the direct sources; transcodes are not", () => {
    expect(
      isDirectSource("/api/scene/5/proxy-stream/stream?instanceId=i")
    ).toBe(true);
    expect(
      isDirectSource("/api/scene/5/proxy-stream/stream.mkv?instanceId=i")
    ).toBe(true);
    expect(isDirectSource("/api/scene/5/proxy-stream/stream")).toBe(true);
    expect(
      isDirectSource(
        "/api/scene/5/proxy-stream/stream.mp4?resolution=LOW&instanceId=i"
      )
    ).toBe(false);
    expect(
      isDirectSource(
        "/api/scene/5/proxy-stream/stream.m3u8?resolution=LOW&instanceId=i"
      )
    ).toBe(false);
    expect(
      isDirectSource(
        "http://host/api/scene/5/proxy-stream/stream.webm?instanceId=i"
      )
    ).toBe(false);
  });
});

describe("buildPlayerSources with the signed media link's streams", () => {
  const sceneStreams = [
    {
      url: "/api/scene/5/proxy-stream/stream?instanceId=i",
      mime_type: "video/mp4",
      label: "Direct stream",
    },
    {
      url: "/api/scene/5/proxy-stream/stream.mp4?resolution=LOW&instanceId=i",
      mime_type: "video/mp4",
      label: "MP4 Low (240p)",
    },
    {
      url: "/api/scene/5/proxy-stream/stream.mpd?instanceId=i",
      mime_type: "application/dash+xml",
      label: "DASH",
    },
    {
      url: "/api/scene/5/proxy-stream/stream.m3u8?resolution=LOW&instanceId=i",
      mime_type: "application/vnd.apple.mpegurl",
      label: "HLS Low (240p)",
    },
  ];
  const scene = { id: "5", instanceId: "i", sceneStreams };
  const signed = [
    {
      url: "/api/scene/5/proxy-stream/stream?instanceId=i&uid=1&exp=9&scope=media&sig=a",
      mime_type: "video/mp4",
      label: "Direct stream",
    },
    {
      url: "/api/scene/5/proxy-stream/stream.m3u8?resolution=LOW&instanceId=i&uid=1&exp=9&scope=media&sig=b",
      mime_type: "application/vnd.apple.mpegurl",
      label: "HLS Low (240p)",
    },
  ];

  it("has the session list's labels and order; Direct and HLS carry sig, DASH and the transcodes do not", () => {
    const plain = buildPlayerSources(scene, decodesAll);
    const sources = buildPlayerSources(scene, decodesAll, signed);

    expect(sources.map((s) => s.label)).toEqual(plain.map((s) => s.label));
    const origin = window.location.origin;
    expect(
      sources.map((s) => [
        s.label,
        new URL(s.src, origin).searchParams.has("sig"),
      ])
    ).toEqual([
      ["Direct stream", true],
      ["MP4 Low (240p)", false],
      ["DASH", false],
      ["HLS Low (240p)", true],
    ]);
    // Absolute, so a device that takes the stream over (AirPlay) can fetch it
    expect(must(sources[0]).src).toBe(origin + must(signed[0]).url);
    expect(must(sources[1]).src).toBe(must(plain[1]).src);
    expect(must(sources[2]).src).toBe(must(plain[2]).src);
    expect(sources.map((s) => s.offset)).toEqual(plain.map((s) => s.offset));
  });

  it("keeps the reordering for a file this browser cannot decode", () => {
    const sources = buildPlayerSources(
      { ...scene, files: [{ video_codec: "hevc" }] },
      () => false,
      signed
    );

    expect(sources.map((s) => s.label)).toEqual([
      "MP4 Low (240p)",
      "DASH",
      "HLS Low (240p)",
      "Direct stream",
    ]);
    expect(isDirectSource(must(sources[3]).src)).toBe(true);
    expect(must(sources[3]).src).toContain("sig=a");
  });

  it("without signed streams no source carries sig", () => {
    const sources = buildPlayerSources(scene, decodesAll);

    for (const source of sources) expect(source.src).not.toContain("sig=");
  });
});
