/**
 * The Stash replay server (sweep item 83): Peek's own StashClient against
 * it, its strict failures, its stats, and every media route Peek proxies,
 * served from the generated test-pattern samples.
 */
import { statSync } from "fs";
import {
  type MockInstance,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { StashClient } from "../../../graphql/StashClient.js";
import { CriterionModifier } from "../../../graphql/generated/graphql.js";
import { deriveSecondLibrary } from "../../../integration/stash-replay/library.js";
import {
  type ReplayServer,
  startStashReplay,
} from "../../../integration/stash-replay/server.js";
import { must } from "../../helpers/must.js";
import { fixtureLibrary } from "./fixtureLibrary.js";

const API_KEY = "replay-test-key";
const SECOND_KEY = "replay-test-key-second";

function sampleSize(name: string): number {
  return statSync(
    new URL(
      `../../../integration/stash-replay/samples/${name}`,
      import.meta.url
    )
  ).size;
}

let replay: ReplayServer;
let graphqlUrl: string;
let origin: string;
let stderr: MockInstance<typeof process.stderr.write>;

beforeAll(async () => {
  const library = fixtureLibrary();
  replay = await startStashReplay([
    { name: "test", library, apiKey: API_KEY },
    {
      name: "second",
      library: deriveSecondLibrary(library, {
        idOffset: 100000,
        sceneCount: 12,
      }),
      apiKey: SECOND_KEY,
    },
  ]);
  graphqlUrl = must(replay.libraries[0], "the test library").url;
  origin = new URL(graphqlUrl).origin;
});

afterAll(async () => {
  await replay.close();
});

beforeEach(() => {
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stderr.mockRestore();
});

function client(apiKey = API_KEY): StashClient {
  return new StashClient({ url: graphqlUrl, apiKey });
}

function parseJson(body: string): unknown {
  return JSON.parse(body) as unknown;
}

async function graphql(
  query: string,
  apiKey = API_KEY
): Promise<{ status: number; body: string }> {
  const response = await fetch(graphqlUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ApiKey: apiKey },
    body: JSON.stringify({ query }),
  });
  return { status: response.status, body: await response.text() };
}

function media(path: string, headers: Record<string, string> = {}) {
  return fetch(`${origin}${path}`, {
    headers: { ApiKey: API_KEY, ...headers },
  });
}

describe("GraphQL", () => {
  it("FindSceneIDs paging", async () => {
    const stash = client();

    const first = await stash.findSceneIDs({
      filter: { page: 1, per_page: 3 },
    });
    const second = await stash.findSceneIDs({
      filter: { page: 2, per_page: 3 },
    });

    expect(first.findScenes.count).toBe(4);
    expect(first.findScenes.scenes.map((scene) => scene.id)).toEqual([
      "100001",
      "100002",
      "100003",
    ]);
    expect(second.findScenes.scenes.map((scene) => scene.id)).toEqual([
      "100004",
    ]);
  });

  it("a FindScenesCompact change count past the newest updated_at is 0", async () => {
    const changedSince = async (value: string) =>
      (
        await client().findScenesCompact({
          filter: { page: 1, per_page: 0 },
          scene_filter: {
            updated_at: { modifier: CriterionModifier.GreaterThan, value },
          },
        })
      ).findScenes;

    // Scene 100002 is the newest, at 2004-01-26T08:04:35+00:00
    expect(await changedSince("2004-01-26T08:04:35.999")).toMatchObject({
      count: 0,
      scenes: [],
    });
    expect((await changedSince("2004-01-26T08:04:34.999")).count).toBe(1);
  });

  it("a wrong ApiKey gets 401", async () => {
    const { status } = await graphql(
      "query Version { version { version } }",
      "wrong-key"
    );

    expect(status).toBe(401);
    await expect(client("wrong-key").version()).rejects.toThrow();
  });

  it("answers Version and Configuration", async () => {
    const stash = client();

    expect((await stash.version()).version).toEqual({
      version: "v0.0.0-replay",
      hash: "00000000",
      build_time: "2000-01-01 00:00:00",
    });
    expect(
      (await stash.configuration()).configuration.general.stashes
    ).toHaveLength(2);
  });

  it('sceneUpdate is refused and stats().mutations equals ["sceneUpdate"]', async () => {
    const refusal =
      "stash-replay refuses the mutation sceneUpdate (operation sceneUpdate): the replay is read-only.";

    await expect(
      client().sceneUpdate({ input: { id: "100001", rating100: 80 } })
    ).rejects.toThrow(refusal);

    expect(replay.stats().mutations).toEqual(["sceneUpdate"]);
    expect(stderr).toHaveBeenCalledWith(`${refusal}\n`);
  });

  it("an unsupported query is recorded", async () => {
    const { status, body } = await graphql(
      'query SearchScenes { findScenes(filter: { q: "Scene" }) { count } }'
    );
    const message =
      "stash-replay cannot answer SearchScenes: findScenes(filter.q) is not evaluated by the replay; teach server/integration/stash-replay/library.ts.";

    expect(status).toBe(200);
    expect(parseJson(body)).toEqual({ data: null, errors: [{ message }] });
    expect(replay.stats().unsupported).toContain(message);
    expect(stderr).toHaveBeenCalledWith(`${message}\n`);
  });

  it("a field the fixture lacks names the path and the fixture commands", async () => {
    const { body } = await graphql(
      "query MissingField { findScenes { scenes { id interactive } } }"
    );

    expect(body).toContain(
      "stash-replay cannot answer MissingField: the fixture has no findScenes.scenes[].interactive."
    );
    expect(body).toContain("npm run fixtures:generate");
  });

  it("{{STASH_ORIGIN}} is rewritten to the request host", async () => {
    const { body } = await graphql(
      'query Paths { findScenes(ids: ["100001"]) { scenes { paths { screenshot } } } }'
    );

    expect(body).not.toContain("{{STASH_ORIGIN}}");
    expect(parseJson(body)).toEqual({
      data: {
        findScenes: {
          scenes: [
            {
              paths: {
                screenshot: `${origin}/scene/100001/screenshot?t=1072915200`,
              },
            },
          ],
        },
      },
    });
  });
});

describe("health and stats", () => {
  it("/healthz answers 200", async () => {
    const response = await fetch(`${origin}/healthz`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });

  it("/__replay/stats on each library's port gives mutations, unsupported and that library's counts", async () => {
    const [test, second] = replay.libraries;
    const statsOn = async (url: string) =>
      (await fetch(new URL("/__replay/stats", url))).json() as Promise<unknown>;

    expect(replay.statsUrl).toBe(`${origin}/__replay/stats`);
    expect(await statsOn(must(test, "test").url)).toEqual({
      ...replay.stats(),
      counts: {
        scene: 4,
        performer: 2,
        studio: 2,
        tag: 2,
        group: 1,
        gallery: 1,
        image: 2,
        clip: 1,
      },
    });
    expect(await statsOn(must(second, "second").url)).toEqual({
      ...replay.stats(),
      counts: {
        scene: 12,
        performer: 2,
        studio: 2,
        tag: 2,
        group: 1,
        gallery: 1,
        image: 2,
        clip: 1,
      },
    });
  });
});

describe("media", () => {
  /** A file route: its content type, a full 200, and a 206 for the first KiB. */
  async function expectFile(path: string, contentType: string, sample: string) {
    const size = sampleSize(sample);
    const full = await media(path);
    const partial = await media(path, { Range: "bytes=0-1023" });

    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe(contentType);
    expect((await full.arrayBuffer()).byteLength).toBe(size);
    expect(partial.status).toBe(206);
    expect(partial.headers.get("content-type")).toBe(contentType);
    expect(partial.headers.get("content-range")).toBe(`bytes 0-1023/${size}`);
    expect((await partial.arrayBuffer()).byteLength).toBe(1024);
  }

  it("/scene/:id/screenshot is image/jpeg", async () => {
    await expectFile(
      "/scene/100001/screenshot?t=1",
      "image/jpeg",
      "sample.jpg"
    );
  });

  it("the other image routes are image/jpeg", async () => {
    for (const path of [
      "/performer/100001/image",
      "/studio/100002/image?default=true",
      "/tag/100001/image",
      "/group/100001/frontimage",
      "/group/100001/backimage",
      "/gallery/100001/cover",
      "/image/100002/thumbnail",
      "/image/100002/preview",
      "/image/100002/image",
      "/scene/100001/scene_marker/100001/screenshot",
    ]) {
      const response = await media(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type"), path).toBe("image/jpeg");
    }
  });

  it("/scene/:id/webp is image/webp", async () => {
    await expectFile("/scene/100001/webp", "image/webp", "sample.webp");
  });

  it("/scene/:id/preview is video/webm", async () => {
    await expectFile("/scene/100001/preview", "video/webm", "sample.webm");
  });

  it("/scene/:id/stream and stream.mp4 are video/webm", async () => {
    await expectFile("/scene/100001/stream", "video/webm", "sample.webm");
    await expectFile("/scene/100001/stream.mp4", "video/webm", "sample.webm");
    await expectFile("/scene/100001/stream.webm", "video/webm", "sample.webm");
    await expectFile("/scene/100001/stream.mkv", "video/webm", "sample.webm");
  });

  it("stream.m3u8 holds /scene/<id>/stream.m3u8/0.ts?resolution=STANDARD", async () => {
    const response = await media(
      "/scene/100001/stream.m3u8?resolution=STANDARD"
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.apple.mpegurl"
    );
    expect((await response.text()).split("\n")).toEqual([
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXT-X-TARGETDURATION:2",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXTINF:2.000,",
      "/scene/100001/stream.m3u8/0.ts?resolution=STANDARD",
      "#EXT-X-ENDLIST",
      "",
    ]);
  });

  it("stream.m3u8/0.ts is video/MP2T", async () => {
    await expectFile(
      "/scene/100001/stream.m3u8/0.ts?resolution=STANDARD",
      "video/MP2T",
      "sample.mpegts"
    );
  });

  it("vtt/thumbs has 16 cues whose #xywh= values fall inside a 512x288 sprite", async () => {
    const response = await media("/scene/100001/vtt/thumbs");
    const body = await response.text();
    const boxes = [
      ...body.matchAll(/_sprite\.jpg#xywh=(\d+),(\d+),(\d+),(\d+)/g),
    ].map((match) => match.slice(1).map(Number));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/vtt");
    expect(body.startsWith("WEBVTT\n")).toBe(true);
    expect(body.match(/-->/g)).toHaveLength(16);
    expect(body).toContain("0a1b2c3d4e5f0001_sprite.jpg#xywh=0,0,128,72");
    expect(boxes).toHaveLength(16);
    expect(
      boxes.filter(
        ([x = -1, y = -1, w = 0, h = 0]) =>
          x < 0 || y < 0 || x + w > 512 || y + h > 288
      )
    ).toEqual([]);
  });

  it("vtt/sprite is image/jpeg", async () => {
    await expectFile("/scene/100001/vtt/sprite", "image/jpeg", "sprite.jpg");
  });

  it("a marker preview returns 206 whose Content-Range total is over 5120, which ClipPreviewProber needs", async () => {
    const response = await media("/scene/100001/scene_marker/100001/preview", {
      Range: "bytes=0-0",
    });
    const total = Number(
      /\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1]
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("video/webm");
    expect(total).toBeGreaterThan(5120);
    await expectFile(
      "/scene/100001/scene_marker/100001/stream",
      "video/webm",
      "sample.webm"
    );
  });

  it("caption gives text/vtt for a scene with captions and 404 without", async () => {
    const withCaptions = await media("/scene/100001/caption?lang=en&type=vtt");
    const without = await media("/scene/100002/caption?lang=en&type=vtt");

    expect(withCaptions.status).toBe(200);
    expect(withCaptions.headers.get("content-type")).toBe("text/vtt");
    expect((await withCaptions.text()).match(/-->/g)).toHaveLength(2);
    expect(without.status).toBe(404);
  });

  it("takes the key as an apikey query parameter", async () => {
    const response = await fetch(
      `${origin}/scene/100001/screenshot?apikey=${API_KEY}`
    );

    expect(response.status).toBe(200);
  });

  it("answers 416 for an unsatisfiable range", async () => {
    const size = sampleSize("sample.webm");
    const response = await media("/scene/100001/stream", {
      Range: `bytes=${size}-`,
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${size}`);
  });

  it("a missing key gets 401, an unknown id 404, and an unknown path 404 recorded in unsupported", async () => {
    const missingKey = await fetch(`${origin}/scene/100001/screenshot`);
    const unknownId = await media("/scene/999999/screenshot");
    const unknownMarker = await media(
      "/scene/100001/scene_marker/999999/preview"
    );
    const unknownPath = await media("/scene/100001/funscript?t=1");

    expect(missingKey.status).toBe(401);
    expect(unknownId.status).toBe(404);
    expect(unknownMarker.status).toBe(404);
    expect(unknownPath.status).toBe(404);
    expect(replay.stats().unsupported).toContain("/scene/:id/funscript");
    expect(replay.stats().unsupported).not.toContain("/scene/:id/screenshot");
    expect(stderr).toHaveBeenCalledWith(
      "stash-replay cannot answer GET /scene/:id/funscript: the replay serves no such route; teach server/integration/stash-replay/media.ts.\n"
    );
  });
});
