import type { NormalizedScene } from "@peek/shared-types";
import { describe, expect, it } from "vitest";
import { buildPlaybackQueue, toPlaybackEntry } from "@/utils/playbackQueue";

/**
 * A scene as a list row carries it: performers, tags, files with their codecs,
 * streams and paths, with the text lengths of a real library row.
 */
function fullScene(n: number): NormalizedScene {
  return {
    id: String(n),
    instanceId: "inst-a",
    title: `A scene title of ordinary length number ${n}`,
    code: null,
    date: "2024-05-01",
    details: "Details ".repeat(40),
    rating100: 80,
    organized: true,
    urls: ["https://example.test/a", "https://example.test/b"],
    files: [
      {
        path: `/media/library/some/deep/folder/scene-${n}.mp4`,
        basename: `scene-${n}.mp4`,
        duration: 1800 + n,
        bit_rate: 5000000,
        frame_rate: 30,
        width: 1920,
        height: 1080,
        video_codec: "h264",
        audio_codec: "aac",
        size: 1234567890,
      },
    ],
    paths: {
      screenshot: `/api/proxy/stash?path=/scene/${n}/screenshot&instanceId=inst-a`,
      preview: `/api/proxy/stash?path=/scene/${n}/preview&instanceId=inst-a`,
      sprite: `/api/proxy/stash?path=/scene/${n}/sprite&instanceId=inst-a`,
      vtt: `/api/proxy/stash?path=/scene/${n}/vtt&instanceId=inst-a`,
      chapters_vtt: null,
      stream: null,
      caption: null,
    },
    sceneStreams: [
      {
        url: `/api/scene/${n}/stream`,
        mime_type: "video/mp4",
        label: "Direct",
      },
      { url: `/api/scene/${n}/stream.m3u8`, mime_type: "x/hls", label: "HLS" },
    ],
    captions: [],
    studio: { id: "9", name: "A Studio", instanceId: "inst-a" },
    performers: Array.from({ length: 3 }, (_, i) => ({
      id: String(i),
      name: `Performer ${i}`,
      instanceId: "inst-a",
      image_path: `/api/proxy/stash?path=/performer/${i}/image&instanceId=inst-a`,
    })),
    tags: Array.from({ length: 8 }, (_, i) => ({
      id: String(i),
      name: `Tag ${i}`,
      instanceId: "inst-a",
    })),
    groups: [],
    galleries: [],
    rating: 80,
    favorite: false,
    o_counter: 2,
    play_count: 3,
    play_duration: 500,
    resume_time: 12,
    last_played_at: null,
    last_o_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  } as unknown as NormalizedScene;
}

describe("toPlaybackEntry", () => {
  it("an entry keeps sceneId, instanceId, position and the sidebar's fields only", () => {
    const entry = toPlaybackEntry(fullScene(7), 3);

    expect(entry).toEqual({
      sceneId: "7",
      instanceId: "inst-a",
      position: 3,
      scene: {
        title: "A scene title of ordinary length number 7",
        paths: {
          screenshot:
            "/api/proxy/stash?path=/scene/7/screenshot&instanceId=inst-a",
        },
        files: [{ duration: 1807, basename: "scene-7.mp4" }],
        studio: { name: "A Studio" },
      },
    });
  });

  it("a scene with no file, no studio and no title keeps empty fields", () => {
    const scene = {
      ...fullScene(1),
      title: null,
      files: [],
      studio: null,
    } as unknown as NormalizedScene;

    expect(toPlaybackEntry(scene, 0).scene).toEqual({
      title: null,
      paths: { screenshot: expect.any(String) as string },
      files: [],
      studio: null,
    });
  });
});

describe("buildPlaybackQueue", () => {
  it("a queue of 2,000 scenes serialises under 600 KB", () => {
    const scenes = Array.from({ length: 2000 }, (_, i) => fullScene(i));

    const queue = buildPlaybackQueue({
      id: "virtual-grid",
      name: "Scene Grid",
      scenes,
      currentIndex: 0,
    });

    expect(queue.scenes).toHaveLength(2000);
    expect(JSON.stringify(queue).length).toBeLessThan(600 * 1024);
  });

  it("passes currentIndex, shuffle and repeat through unchanged", () => {
    const queue = buildPlaybackQueue({
      id: "5",
      name: "Mine",
      scenes: [fullScene(1), fullScene(2)],
      currentIndex: 1,
      shuffle: true,
      repeat: "all",
    });

    expect(queue).toMatchObject({
      id: "5",
      name: "Mine",
      currentIndex: 1,
      shuffle: true,
      repeat: "all",
    });
    expect(queue.scenes.map((e) => [e.sceneId, e.position])).toEqual([
      ["1", 0],
      ["2", 1],
    ]);
  });

  it("each queue gets a key of its own", () => {
    const options = {
      id: "virtual-grid",
      name: "Grid",
      scenes: [fullScene(1)],
      currentIndex: 0,
    };

    expect(buildPlaybackQueue(options).key).not.toBe(
      buildPlaybackQueue(options).key
    );
  });

  it("leaves the options a caller does not set out of the queue", () => {
    const queue = buildPlaybackQueue({
      id: "virtual-grid",
      name: "Grid",
      scenes: [fullScene(1)],
      currentIndex: 0,
    });

    expect(queue).toEqual({
      key: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown,
      id: "virtual-grid",
      name: "Grid",
      shuffle: false,
      repeat: "none",
      scenes: expect.any(Array) as unknown,
      currentIndex: 0,
    });
  });
});
