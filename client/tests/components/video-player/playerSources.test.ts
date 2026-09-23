/**
 * Player sources from the server's stream list (item 1).
 *
 * The server sends keyless Peek proxy paths; the player uses them unchanged
 * and only marks which ones need the transcode time offset.
 */
import { describe, expect, it } from "vitest";
import { buildPlayerSources } from "@/components/video-player/playerSources";

describe("buildPlayerSources", () => {
  it("uses the server's stream paths unchanged", () => {
    const sources = buildPlayerSources({
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
    });

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
    const sources = buildPlayerSources({
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
    });

    expect(sources.map((s) => s.offset)).toEqual([false, false, true, true]);
  });

  it("falls back to the proxied direct stream when sceneStreams is empty", () => {
    const sources = buildPlayerSources({
      id: "5",
      instanceId: "i",
      sceneStreams: [],
      files: [{ duration: 60 }],
    });

    expect(sources).toEqual([
      {
        src: "/api/scene/5/proxy-stream/stream?instanceId=i",
        label: "Direct",
        offset: false,
      },
    ]);
  });
});
