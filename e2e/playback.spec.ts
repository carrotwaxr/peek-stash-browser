import { expect, test } from "@playwright/test";
import { requireData } from "./support/data";

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
      scene_filter: {
        resolution: { value: "STANDARD_HD", modifier: "LESS_THAN" },
      },
    },
  });
  expect(found.ok(), await found.text()).toBeTruthy();
  const first = ((await found.json()) as FindScenesBody).findScenes.scenes[0];
  const scene = requireData(
    first?.files?.[0]?.height ? first : undefined,
    "scenes below 720p with known dimensions"
  );

  const detailResponse = page.waitForResponse((r) => {
    if (r.request().method() !== "POST") return false;
    if (!new URL(r.url()).pathname.endsWith("/api/library/scenes")) {
      return false;
    }
    const body = r.request().postDataJSON() as { ids?: unknown[] } | null;
    return body?.ids?.length === 1;
  });
  // The first source this browser can play: Direct, or the first transcode
  // when it cannot decode the file (headless Chromium has no H.264) or Stash
  // offers no Direct; a preload request counts as well as one after the click.
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

test("player keys reach the real player: m mutes with focus in the player, and not with focus on a button outside it", async ({
  page,
}) => {
  const found = await page.request.post("/api/library/scenes", {
    data: { filter: { per_page: 1 } },
  });
  expect(found.ok(), await found.text()).toBeTruthy();
  const first = ((await found.json()) as FindScenesBody).findScenes.scenes[0];
  const scene = requireData(first, "a scene to open");

  await page.goto(
    `/scene/${scene.id}?instance=${encodeURIComponent(scene.instanceId)}`
  );

  // The keys act through the real video.js element; the replay's H.264
  // stream cannot decode here, so the check reads `muted`, which needs none.
  const player = page.locator(".video-js").first();
  const video = player.locator("video").first();
  await expect(video).toBeAttached();
  await expect(video).toHaveJSProperty("muted", false);

  // Focus on a control inside the player, as a keyboard user has it.
  const inside = player.locator("button").first();
  await inside.focus();
  await expect(inside).toBeFocused();
  await page.keyboard.press("m");
  await expect(video).toHaveJSProperty("muted", true);
  await page.keyboard.press("m");
  await expect(video).toHaveJSProperty("muted", false);

  // A button outside the player keeps the key to itself: `m` does not reach it.
  const outside = page.locator("button:visible:not(.video-js *)").first();
  await outside.focus();
  await expect(outside).toBeFocused();
  await page.keyboard.press("m");
  // Give a wrongly delivered key time to land before asserting it did not.
  await page.waitForTimeout(500);
  await expect(video).toHaveJSProperty("muted", false);
});
