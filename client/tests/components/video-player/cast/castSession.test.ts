/**
 * The load request a Cast receiver gets: the user's signed link made
 * absolute on the browser's own origin, the scene's metadata and captions,
 * and the scene as `id:instanceId` so a later page can tell whose media
 * plays. The start time is where the user is, else their resume point.
 */
import type { SceneMediaLinkResponse } from "@peek/shared-types";
import { must } from "@tests/testUtils";
import { describe, expect, it } from "vitest";
import {
  buildLoadRequest,
  castStartTime,
} from "@/components/video-player/cast/castSession";
import { castMedia } from "./fakeCast";

const ORIGIN = "https://peek.example";

const SIGNED = "instanceId=inst-a&uid=7&exp=99&scope=media&sig=abc";

function link(
  cast: SceneMediaLinkResponse["cast"] = {
    url: `/api/scene/12/proxy-stream/stream?${SIGNED}`,
    contentType: "video/mp4",
    kind: "direct",
  }
): SceneMediaLinkResponse {
  return {
    expiresAt: "2026-10-03T22:00:00.000Z",
    streams: [],
    cast,
    captions: [
      {
        url: `/api/scene/12/caption?lang=en&type=srt&${SIGNED}`,
        lang: "en",
        type: "srt",
      },
      {
        url: `/api/scene/12/caption?lang=de&type=vtt&${SIGNED}`,
        lang: "de",
        type: "vtt",
      },
    ],
    poster: `/api/scene/12/poster?${SIGNED}`,
  };
}

const scene = {
  id: "12",
  instanceId: "inst-a",
  title: "Harbour Lights",
  performers: [{ name: "Ada" }, { name: "Grace" }],
};

describe("buildLoadRequest", () => {
  it("uses the absolute signed URL, its content type, currentTime, title, performers, poster, VTT tracks and customData.scene as id:instanceId", () => {
    const request = must(
      buildLoadRequest(castMedia(), {
        link: link(),
        origin: ORIGIN,
        scene,
        startTime: 42,
        sender: "tab-a",
      }),
      "request"
    );

    const url = `${ORIGIN}/api/scene/12/proxy-stream/stream?${SIGNED}`;
    expect(request.media.contentId).toBe(url);
    expect(request.media.contentUrl).toBe(url);
    expect(request.media.contentType).toBe("video/mp4");
    expect(request.media.streamType).toBe("BUFFERED");
    expect(request.currentTime).toBe(42);
    expect(request.autoplay).toBe(true);

    const metadata = must(request.media.metadata, "metadata");
    expect(metadata.title).toBe("Harbour Lights");
    expect(metadata.subtitle).toBe("Ada, Grace");
    expect(metadata.images?.map((image) => image.url)).toEqual([
      `${ORIGIN}/api/scene/12/poster?${SIGNED}`,
    ]);

    const tracks = must(request.media.tracks, "tracks");
    expect(
      tracks.map((track) => ({
        trackId: track.trackId,
        type: track.type,
        trackContentId: track.trackContentId,
        trackContentType: track.trackContentType,
        subtype: track.subtype,
        language: track.language,
      }))
    ).toEqual([
      {
        trackId: 1,
        type: "TEXT",
        trackContentId: `${ORIGIN}/api/scene/12/caption?lang=en&type=srt&${SIGNED}`,
        trackContentType: "text/vtt",
        subtype: "SUBTITLES",
        language: "en",
      },
      {
        trackId: 2,
        type: "TEXT",
        trackContentId: `${ORIGIN}/api/scene/12/caption?lang=de&type=vtt&${SIGNED}`,
        trackContentType: "text/vtt",
        subtype: "SUBTITLES",
        language: "de",
      },
    ]);

    expect(request.media.customData).toEqual({
      scene: "12:inst-a",
      sender: "tab-a",
    });
    // A direct file says nothing about HLS segments
    expect(request.media.hlsSegmentFormat).toBeUndefined();
    expect(request.media.hlsVideoSegmentFormat).toBeUndefined();
  });

  it("HLS sets hlsSegmentFormat TS and hlsVideoSegmentFormat MPEG2_TS", () => {
    const request = must(
      buildLoadRequest(castMedia(), {
        link: link({
          url: `/api/scene/12/proxy-stream/stream.m3u8?resolution=FULL_HD&${SIGNED}`,
          contentType: "application/x-mpegurl",
          kind: "hls",
        }),
        origin: ORIGIN,
        scene,
        startTime: 0,
        sender: "tab-a",
      }),
      "request"
    );

    expect(request.media.contentType).toBe("application/x-mpegurl");
    expect(request.media.hlsSegmentFormat).toBe("ts");
    expect(request.media.hlsVideoSegmentFormat).toBe("mpeg2_ts");
  });

  it("a scene without a title, performers or poster still loads, titled by its file", () => {
    const request = must(
      buildLoadRequest(castMedia(), {
        link: { ...link(), poster: null, captions: [] },
        origin: ORIGIN,
        scene: {
          id: "12",
          instanceId: "inst-a",
          title: "",
          files: [{ basename: "harbour.mp4" }],
        },
        startTime: 0,
        sender: "tab-a",
      }),
      "request"
    );

    expect(request.media.metadata?.title).toBe("harbour");
    expect(request.media.metadata?.subtitle).toBeUndefined();
    expect(request.media.metadata?.images).toEqual([]);
    expect(request.media.tracks).toEqual([]);
  });

  it("returns null when the scene has no source a Cast device plays", () => {
    expect(
      buildLoadRequest(castMedia(), {
        link: link(null),
        origin: ORIGIN,
        scene,
        startTime: 0,
        sender: "tab-a",
      })
    ).toBeNull();
  });

  it("the load request carries customData.sender and the showing track in activeTrackIds", () => {
    // The page shows the German WebVTT captions
    const request = must(
      buildLoadRequest(castMedia(), {
        link: link(),
        origin: ORIGIN,
        scene,
        startTime: 0,
        sender: "tab-a",
        caption: {
          kind: "captions",
          mode: "showing",
          language: "de",
          src: "/api/scene/12/caption?lang=de&type=vtt&instanceId=inst-a",
        },
      }),
      "request"
    );
    expect(request.media.customData).toEqual({
      scene: "12:inst-a",
      sender: "tab-a",
    });
    expect(request.activeTrackIds).toEqual([2]);

    // Captions off on the page: none on the TV
    const off = must(
      buildLoadRequest(castMedia(), {
        link: link(),
        origin: ORIGIN,
        scene,
        startTime: 0,
        sender: "tab-a",
        caption: null,
      }),
      "request"
    );
    expect(off.activeTrackIds).toEqual([]);
  });
});

describe("castStartTime", () => {
  it("currentTime is the local position once the player has played, else the user's resume point, else 0", () => {
    expect(
      castStartTime({ hasPlayed: true, localTime: 75, resumeTime: 300 })
    ).toBe(75);
    // Played and back at the start: the start, not the resume point
    expect(
      castStartTime({ hasPlayed: true, localTime: 0, resumeTime: 300 })
    ).toBe(0);
    expect(
      castStartTime({ hasPlayed: false, localTime: 0, resumeTime: 300 })
    ).toBe(300);
    expect(
      castStartTime({ hasPlayed: false, localTime: 0, resumeTime: null })
    ).toBe(0);
    expect(
      castStartTime({ hasPlayed: false, localTime: 0, resumeTime: undefined })
    ).toBe(0);
  });
});
