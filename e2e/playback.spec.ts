import { expect, test } from "@playwright/test";

/**
 * Scene playback stream list (item 1).
 *
 * The Scene page gets its stream list from the server as keyless Peek proxy
 * paths built from Stash's own choices for that file. Headless Chromium lacks
 * H.264, so this checks the requests, not decoded frames.
 */

interface SceneStream {
  url: string;
  label?: string | null;
}

interface SceneRow {
  id: string;
  instanceId: string;
  files?: Array<{ height?: number | null }>;
  sceneStreams?: SceneStream[];
}

interface FindScenesBody {
  findScenes: { scenes: SceneRow[] };
}

test("a scene below 720p gets proxied stream paths without HD tiers and its first stream loads", async ({
  page,
}) => {
  const found = await page.request.post("/api/library/scenes", {
    data: {
      filter: { per_page: 1 },
      scene_filter: { resolution: { value: "720p", modifier: "LESS_THAN" } },
    },
  });
  expect(found.ok(), await found.text()).toBeTruthy();
  const scene = ((await found.json()) as FindScenesBody).findScenes.scenes[0];
  test.skip(
    !scene || !scene.files?.[0]?.height,
    "No scene below 720p with known dimensions (empty database)"
  );

  const detailResponse = page.waitForResponse((r) => {
    if (r.request().method() !== "POST") return false;
    if (!new URL(r.url()).pathname.endsWith("/api/library/scenes")) {
      return false;
    }
    const body = r.request().postDataJSON() as { ids?: unknown[] } | null;
    return body?.ids?.length === 1;
  });
  // Direct play, or for a scene without a Direct entry its first transcode or
  // the HLS fallback; a preload request counts as well as one after the click.
  const streamResponse = page.waitForResponse(
    (r) =>
      /\/proxy-stream\/stream(\?|\.)/.test(r.url()) &&
      (r.status() === 200 || r.status() === 206),
    { timeout: 20_000 }
  );
  // Awaited below; this only keeps an early failure from also reporting it.
  streamResponse.catch(() => undefined);

  await page.goto(
    `/scene/${scene.id}?instance=${encodeURIComponent(scene.instanceId)}`
  );

  const response = await detailResponse;
  const text = await response.text();
  const detail = (JSON.parse(text) as FindScenesBody).findScenes.scenes[0];
  expect(detail.sceneStreams?.length ?? 0).toBeGreaterThan(0);
  for (const stream of detail.sceneStreams ?? []) {
    expect(stream.url).toMatch(/^\/api\/scene\//);
    expect(stream.label ?? "").not.toMatch(/\((720p|1080p|2160p)\)/);
  }
  expect(text).not.toContain("apikey");

  await page.locator(".vjs-big-play-button").click();
  await streamResponse;
});
