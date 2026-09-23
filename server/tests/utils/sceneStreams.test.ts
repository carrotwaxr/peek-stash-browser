/**
 * Stream lists built from Stash's recorded choices (item 1).
 *
 * The fixtures are Stash's own lists for six scenes of the prod snapshot, as
 * [label, MIME type, path file, resolution query]. Their URLs carried the
 * Stash API key, so only these four fields are kept.
 */
import { describe, expect, it } from "vitest";
import {
  buildSceneStreams,
  inferStashStreamOptions,
  summarizeStashStreams,
} from "../../utils/sceneStreams.js";

type StashEntry = [string, string, string, string | null];

// 1280x720 mp4/aac
const STASH_34446: StashEntry[] = [
  ["Direct stream", "video/mp4", "stream", null],
  ["MP4", "video/mp4", "stream.mp4", "ORIGINAL"],
  ["MP4 HD (720p)", "video/mp4", "stream.mp4", "STANDARD_HD"],
  ["MP4 Standard (480p)", "video/mp4", "stream.mp4", "STANDARD"],
  ["MP4 Low (240p)", "video/mp4", "stream.mp4", "LOW"],
  ["WEBM", "video/webm", "stream.webm", "ORIGINAL"],
  ["WEBM HD (720p)", "video/webm", "stream.webm", "STANDARD_HD"],
  ["WEBM Standard (480p)", "video/webm", "stream.webm", "STANDARD"],
  ["WEBM Low (240p)", "video/webm", "stream.webm", "LOW"],
  ["HLS", "application/vnd.apple.mpegurl", "stream.m3u8", "ORIGINAL"],
  [
    "HLS HD (720p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "STANDARD_HD",
  ],
  [
    "HLS Standard (480p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "STANDARD",
  ],
  ["HLS Low (240p)", "application/vnd.apple.mpegurl", "stream.m3u8", "LOW"],
  ["DASH", "application/dash+xml", "stream.mpd", "ORIGINAL"],
  ["DASH HD (720p)", "application/dash+xml", "stream.mpd", "STANDARD_HD"],
  ["DASH Standard (480p)", "application/dash+xml", "stream.mpd", "STANDARD"],
  ["DASH Low (240p)", "application/dash+xml", "stream.mpd", "LOW"],
];
// 720x404 mp4/aac
const STASH_34483: StashEntry[] = [
  ["Direct stream", "video/mp4", "stream", null],
  ["MP4", "video/mp4", "stream.mp4", "ORIGINAL"],
  ["MP4 Low (240p)", "video/mp4", "stream.mp4", "LOW"],
  ["WEBM", "video/webm", "stream.webm", "ORIGINAL"],
  ["WEBM Low (240p)", "video/webm", "stream.webm", "LOW"],
  ["HLS", "application/vnd.apple.mpegurl", "stream.m3u8", "ORIGINAL"],
  ["HLS Low (240p)", "application/vnd.apple.mpegurl", "stream.m3u8", "LOW"],
  ["DASH", "application/dash+xml", "stream.mpd", "ORIGINAL"],
  ["DASH Low (240p)", "application/dash+xml", "stream.mpd", "LOW"],
];
// 3840x2160 mp4/aac
const STASH_34472: StashEntry[] = [
  ["Direct stream", "video/mp4", "stream", null],
  ["MP4", "video/mp4", "stream.mp4", "ORIGINAL"],
  ["MP4 4K (2160p)", "video/mp4", "stream.mp4", "FOUR_K"],
  ["MP4 Full HD (1080p)", "video/mp4", "stream.mp4", "FULL_HD"],
  ["MP4 HD (720p)", "video/mp4", "stream.mp4", "STANDARD_HD"],
  ["MP4 Standard (480p)", "video/mp4", "stream.mp4", "STANDARD"],
  ["MP4 Low (240p)", "video/mp4", "stream.mp4", "LOW"],
  ["WEBM", "video/webm", "stream.webm", "ORIGINAL"],
  ["WEBM 4K (2160p)", "video/webm", "stream.webm", "FOUR_K"],
  ["WEBM Full HD (1080p)", "video/webm", "stream.webm", "FULL_HD"],
  ["WEBM HD (720p)", "video/webm", "stream.webm", "STANDARD_HD"],
  ["WEBM Standard (480p)", "video/webm", "stream.webm", "STANDARD"],
  ["WEBM Low (240p)", "video/webm", "stream.webm", "LOW"],
  ["HLS", "application/vnd.apple.mpegurl", "stream.m3u8", "ORIGINAL"],
  ["HLS 4K (2160p)", "application/vnd.apple.mpegurl", "stream.m3u8", "FOUR_K"],
  [
    "HLS Full HD (1080p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "FULL_HD",
  ],
  [
    "HLS HD (720p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "STANDARD_HD",
  ],
  [
    "HLS Standard (480p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "STANDARD",
  ],
  ["HLS Low (240p)", "application/vnd.apple.mpegurl", "stream.m3u8", "LOW"],
  ["DASH", "application/dash+xml", "stream.mpd", "ORIGINAL"],
  ["DASH 4K (2160p)", "application/dash+xml", "stream.mpd", "FOUR_K"],
  ["DASH Full HD (1080p)", "application/dash+xml", "stream.mpd", "FULL_HD"],
  ["DASH HD (720p)", "application/dash+xml", "stream.mpd", "STANDARD_HD"],
  ["DASH Standard (480p)", "application/dash+xml", "stream.mpd", "STANDARD"],
  ["DASH Low (240p)", "application/dash+xml", "stream.mpd", "LOW"],
];
// 720x480 mp4/ac3: the audio is invalid for mp4 and no transcode exists, so no Direct
const STASH_10107: StashEntry[] = [
  ["MP4", "video/mp4", "stream.mp4", "ORIGINAL"],
  ["MP4 Standard (480p)", "video/mp4", "stream.mp4", "STANDARD"],
  ["MP4 Low (240p)", "video/mp4", "stream.mp4", "LOW"],
  ["WEBM", "video/webm", "stream.webm", "ORIGINAL"],
  ["WEBM Standard (480p)", "video/webm", "stream.webm", "STANDARD"],
  ["WEBM Low (240p)", "video/webm", "stream.webm", "LOW"],
  ["HLS", "application/vnd.apple.mpegurl", "stream.m3u8", "ORIGINAL"],
  [
    "HLS Standard (480p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "STANDARD",
  ],
  ["HLS Low (240p)", "application/vnd.apple.mpegurl", "stream.m3u8", "LOW"],
  ["DASH", "application/dash+xml", "stream.mpd", "ORIGINAL"],
  ["DASH Standard (480p)", "application/dash+xml", "stream.mpd", "STANDARD"],
  ["DASH Low (240p)", "application/dash+xml", "stream.mpd", "LOW"],
];
// 1920x1080 mkv/ac3: MKV, no Direct
const STASH_18272: StashEntry[] = [
  ["MKV", "video/mp4", "stream.mkv", null],
  ["MP4", "video/mp4", "stream.mp4", "ORIGINAL"],
  ["MP4 Full HD (1080p)", "video/mp4", "stream.mp4", "FULL_HD"],
  ["MP4 HD (720p)", "video/mp4", "stream.mp4", "STANDARD_HD"],
  ["MP4 Standard (480p)", "video/mp4", "stream.mp4", "STANDARD"],
  ["MP4 Low (240p)", "video/mp4", "stream.mp4", "LOW"],
  ["WEBM", "video/webm", "stream.webm", "ORIGINAL"],
  ["WEBM Full HD (1080p)", "video/webm", "stream.webm", "FULL_HD"],
  ["WEBM HD (720p)", "video/webm", "stream.webm", "STANDARD_HD"],
  ["WEBM Standard (480p)", "video/webm", "stream.webm", "STANDARD"],
  ["WEBM Low (240p)", "video/webm", "stream.webm", "LOW"],
  ["HLS", "application/vnd.apple.mpegurl", "stream.m3u8", "ORIGINAL"],
  [
    "HLS Full HD (1080p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "FULL_HD",
  ],
  [
    "HLS HD (720p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "STANDARD_HD",
  ],
  [
    "HLS Standard (480p)",
    "application/vnd.apple.mpegurl",
    "stream.m3u8",
    "STANDARD",
  ],
  ["HLS Low (240p)", "application/vnd.apple.mpegurl", "stream.m3u8", "LOW"],
  ["DASH", "application/dash+xml", "stream.mpd", "ORIGINAL"],
  ["DASH Full HD (1080p)", "application/dash+xml", "stream.mpd", "FULL_HD"],
  ["DASH HD (720p)", "application/dash+xml", "stream.mpd", "STANDARD_HD"],
  ["DASH Standard (480p)", "application/dash+xml", "stream.mpd", "STANDARD"],
  ["DASH Low (240p)", "application/dash+xml", "stream.mpd", "LOW"],
];
// 720x404 avi/aac with a generated transcode, so Direct is present
const STASH_14340: StashEntry[] = [
  ["Direct stream", "video/mp4", "stream", null],
  ["MP4", "video/mp4", "stream.mp4", "ORIGINAL"],
  ["MP4 Low (240p)", "video/mp4", "stream.mp4", "LOW"],
  ["WEBM", "video/webm", "stream.webm", "ORIGINAL"],
  ["WEBM Low (240p)", "video/webm", "stream.webm", "LOW"],
  ["HLS", "application/vnd.apple.mpegurl", "stream.m3u8", "ORIGINAL"],
  ["HLS Low (240p)", "application/vnd.apple.mpegurl", "stream.m3u8", "LOW"],
  ["DASH", "application/dash+xml", "stream.mpd", "ORIGINAL"],
  ["DASH Low (240p)", "application/dash+xml", "stream.mpd", "LOW"],
];

const FIXTURES: Array<{
  sceneId: string;
  stash: StashEntry[];
  options: {
    direct: boolean;
    mkv: boolean;
    resolutions: string[];
  };
}> = [
  {
    sceneId: "34446",
    stash: STASH_34446,
    options: {
      direct: true,
      mkv: false,
      resolutions: ["ORIGINAL", "STANDARD_HD", "STANDARD", "LOW"],
    },
  },
  {
    sceneId: "34483",
    stash: STASH_34483,
    options: { direct: true, mkv: false, resolutions: ["ORIGINAL", "LOW"] },
  },
  {
    sceneId: "34472",
    stash: STASH_34472,
    options: {
      direct: true,
      mkv: false,
      resolutions: [
        "ORIGINAL",
        "FOUR_K",
        "FULL_HD",
        "STANDARD_HD",
        "STANDARD",
        "LOW",
      ],
    },
  },
  {
    sceneId: "10107",
    stash: STASH_10107,
    options: {
      direct: false,
      mkv: false,
      resolutions: ["ORIGINAL", "STANDARD", "LOW"],
    },
  },
  {
    sceneId: "18272",
    stash: STASH_18272,
    options: {
      direct: false,
      mkv: true,
      resolutions: ["ORIGINAL", "FULL_HD", "STANDARD_HD", "STANDARD", "LOW"],
    },
  },
  {
    sceneId: "14340",
    stash: STASH_14340,
    options: { direct: true, mkv: false, resolutions: ["ORIGINAL", "LOW"] },
  },
];

const ALL_RESOLUTIONS = [
  "ORIGINAL",
  "FOUR_K",
  "FULL_HD",
  "STANDARD_HD",
  "STANDARD",
  "LOW",
];

describe("sceneStreams", () => {
  it.each(FIXTURES)(
    "summarizeStashStreams reads direct, mkv and resolutions from Stash's labels (scene $sceneId)",
    ({ stash, options }) => {
      expect(summarizeStashStreams(stash.map(([label]) => label))).toEqual(
        options
      );
    }
  );

  it.each(FIXTURES)(
    "buildSceneStreams(summarizeStashStreams(labels)) reproduces Stash's list (scene $sceneId)",
    ({ sceneId, stash }) => {
      const streams = buildSceneStreams(
        sceneId,
        "inst-1",
        summarizeStashStreams(stash.map(([label]) => label))
      );

      expect(streams.map((s) => [s.label, s.mime_type])).toEqual(
        stash.map(([label, mime]) => [label, mime])
      );
      expect(streams.map((s) => s.url)).toEqual(
        stash.map(([, , file, resolution]) =>
          resolution
            ? `/api/scene/${sceneId}/proxy-stream/${file}?resolution=${resolution}&instanceId=inst-1`
            : `/api/scene/${sceneId}/proxy-stream/${file}?instanceId=inst-1`
        )
      );
    }
  );

  it("inferStashStreamOptions follows Stash's rules when nothing is stored", () => {
    const file = (
      path: string | null,
      audioCodec: string | null,
      width: number | null = 1280,
      height: number | null = 720
    ) => ({ path, audioCodec, width, height });

    // Direct only when the audio is valid for the container
    expect(inferStashStreamOptions(file("/v/a.mp4", "aac"))).toMatchObject({
      direct: true,
      mkv: false,
    });
    expect(inferStashStreamOptions(file("/v/a.MP4", "AAC")).direct).toBe(true);
    expect(inferStashStreamOptions(file("/v/a.m4v", "mp3")).direct).toBe(true);
    expect(inferStashStreamOptions(file("/v/a.mov", "opus")).direct).toBe(true);
    expect(inferStashStreamOptions(file("/v/a.mp4", null)).direct).toBe(true);
    expect(inferStashStreamOptions(file("/v/a.mp4", "")).direct).toBe(true);
    expect(inferStashStreamOptions(file("/v/a.mp4", "ac3"))).toMatchObject({
      direct: false,
      mkv: false,
    });
    expect(inferStashStreamOptions(file("/v/a.mkv", "ac3"))).toMatchObject({
      direct: false,
      mkv: true,
    });
    expect(inferStashStreamOptions(file("/v/a.mkv", "vorbis"))).toMatchObject({
      direct: true,
      mkv: true,
    });
    expect(inferStashStreamOptions(file("/v/a.webm", "aac")).direct).toBe(
      false
    );
    expect(inferStashStreamOptions(file("/v/a.webm", "opus")).direct).toBe(
      true
    );
    // An unknown container never gets Direct
    expect(inferStashStreamOptions(file("/v/a.avi", "aac")).direct).toBe(false);
    expect(inferStashStreamOptions(file(null, "aac")).direct).toBe(false);

    // Tiers from the shorter side
    expect(
      inferStashStreamOptions(file("/v/a.mp4", "aac", 1280, 720)).resolutions
    ).toEqual(["ORIGINAL", "STANDARD_HD", "STANDARD", "LOW"]);
    expect(
      inferStashStreamOptions(file("/v/a.mp4", "aac", 3840, 2160)).resolutions
    ).toEqual(ALL_RESOLUTIONS);
    expect(
      inferStashStreamOptions(file("/v/a.mp4", "aac", 1080, 1920)).resolutions
    ).toEqual(["ORIGINAL", "FULL_HD", "STANDARD_HD", "STANDARD", "LOW"]);
    expect(
      inferStashStreamOptions(file("/v/a.mp4", "aac", 720, 404)).resolutions
    ).toEqual(["ORIGINAL", "LOW"]);
    expect(
      inferStashStreamOptions(file("/v/a.mp4", "aac", 200, 150)).resolutions
    ).toEqual(["ORIGINAL"]);

    // Unknown dimensions: every tier
    expect(
      inferStashStreamOptions(file("/v/a.mp4", "aac", null, null)).resolutions
    ).toEqual(ALL_RESOLUTIONS);
    expect(
      inferStashStreamOptions(file("/v/a.mp4", "aac", 0, 0)).resolutions
    ).toEqual(ALL_RESOLUTIONS);
  });
});
