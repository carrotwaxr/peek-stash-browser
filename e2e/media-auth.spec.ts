import { type Page, expect, request, test } from "@playwright/test";
import { requireData } from "./support/data";

/**
 * Media behind the session (item 2).
 *
 * Thumbnails, previews, streams and captions need a Peek session; the
 * external player gets a personal signed link that works without one. Every
 * test plays the library's first scene (requireData: the replay library has
 * one; on the dev stack an empty library skips).
 * Expiry itself is covered by the fake-clock unit tests: e2e cannot wait 12
 * hours.
 */

interface SceneRow {
  id: string;
  instanceId: string;
}

interface FindScenesBody {
  findScenes: { scenes: SceneRow[] };
}

async function firstScene(page: Page): Promise<SceneRow> {
  const found = await page.request.post("/api/library/scenes", {
    data: { filter: { per_page: 1 } },
  });
  expect(found.ok(), await found.text()).toBeTruthy();
  const body = (await found.json()) as FindScenesBody;
  return requireData(body.findScenes.scenes[0], "scenes");
}

const scenePath = (scene: SceneRow) =>
  `/scene/${scene.id}?instance=${encodeURIComponent(scene.instanceId)}`;

/**
 * A request context with no session. Inside the test runner, newContext()
 * inherits the project's `use` options, including the saved storageState,
 * so the empty state must be explicit.
 */
const anonymousContext = (baseURL: string | undefined) =>
  request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });

test("grid thumbnails load with the session", async ({ page }) => {
  await firstScene(page); // the grid has a thumbnail to load

  const proxied = page.waitForResponse(
    (r) => r.url().includes("/api/proxy/") && r.status() === 200,
    { timeout: 20_000 }
  );
  proxied.catch(() => undefined);

  await page.goto("/scenes");

  const img = page.locator('img[src*="/api/proxy/"]').first();
  await expect(img).toBeAttached({ timeout: 15_000 });
  await expect
    .poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), {
      timeout: 15_000,
    })
    .toBeGreaterThan(0);
  await proxied;
});

test("the scene page's first stream request succeeds", async ({ page }) => {
  const scene = await firstScene(page);

  // Direct play, or for a scene without a Direct entry its first transcode
  const streamResponse = page.waitForResponse(
    (r) =>
      /\/proxy-stream\/stream(\?|\.)/.test(r.url()) &&
      (r.status() === 200 || r.status() === 206),
    { timeout: 20_000 }
  );
  streamResponse.catch(() => undefined);

  await page.goto(scenePath(scene));
  await page.locator(".vjs-big-play-button").click();
  await streamResponse;
});

test("HLS playlist and first segment load with the session and 401 without", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000); // Stash transcodes the playlist and segment on demand
  const scene = await firstScene(page);

  const playlistPath = `/api/scene/${scene.id}/proxy-stream/stream.m3u8?resolution=LOW&instanceId=${encodeURIComponent(scene.instanceId)}`;
  const playlist = await page.request.get(playlistPath, { timeout: 30_000 });
  expect(playlist.status(), await playlist.text()).toBe(200);

  const segmentPath = (await playlist.text())
    .split("\n")
    .find((line) => /\/proxy-stream\/stream\.m3u8\/0\.ts/.test(line));
  expect(segmentPath, "first segment line").toBeTruthy();

  const segment = await page.request.get(segmentPath!, { timeout: 30_000 });
  expect(segment.status()).toBe(200);
  // Stash spells it video/MP2T
  expect(segment.headers()["content-type"]?.toLowerCase()).toContain(
    "video/mp2t"
  );

  const anonymous = await anonymousContext(baseURL);
  try {
    expect((await anonymous.get(playlistPath)).status()).toBe(401);
    expect((await anonymous.get(segmentPath!)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});

test("the external-player link plays logged out and a tampered one fails", async ({
  page,
  baseURL,
}) => {
  const scene = await firstScene(page);

  await page.goto(scenePath(scene));
  const vlc = page.locator('a[aria-label="Open in VLC"]');
  await expect(vlc).toHaveAttribute("href", /sig=/, { timeout: 15_000 });
  const url = (await vlc.getAttribute("href"))!.replace(/^vlc:\/\//, "");
  expect(url).toContain("sig=");

  const anonymous = await anonymousContext(baseURL);
  try {
    const played = await anonymous.get(url, {
      headers: { Range: "bytes=0-1023" },
    });
    expect([200, 206]).toContain(played.status());
    expect(played.headers()["content-type"]).toMatch(/^video\//);

    const tampered = url.slice(0, -1) + (url.endsWith("A") ? "B" : "A");
    expect((await anonymous.get(tampered)).status()).toBe(401);
  } finally {
    await anonymous.dispose();
  }
});

test("a paused video whose session expired sends the user to login with a message", async ({
  page,
}) => {
  const scene = await firstScene(page);

  await page.goto(scenePath(scene));
  const playerEl = page.locator(".video-js").first();
  await expect(playerEl).toBeAttached({ timeout: 15_000 });

  // Start the way a user does. Headless Chromium lacks the file's codec, so
  // the player may already be on its HLS fallback, which starts by itself;
  // either way, end up paused with a source loaded.
  const play = page.locator(".vjs-big-play-button");
  if (await play.isVisible()) {
    await play.click();
  }
  await page.waitForFunction(
    () => {
      const player = (document.querySelector(".video-js") as any)?.player;
      return Boolean(player && player.currentSrc() && player.readyState() >= 1);
    },
    undefined,
    { timeout: 20_000 }
  );
  await playerEl.evaluate((el) => (el as any).player.pause());

  await page.context().clearCookies();

  // Play again once the buffer is gone: the player has to ask the server for
  // the media again, and the server now answers 401. The replay's test
  // pattern is small enough to sit whole in Chromium's media cache, which
  // answers a reload of the same URL itself, so the reload gets a new one.
  await playerEl.evaluate((el) => {
    const player = (el as any).player;
    const source = player.currentSource();
    const src = `${source.src}${source.src.includes("?") ? "&" : "?"}reload=${Date.now()}`;
    player.src({ ...source, src });
    void player.play();
  });

  await page.waitForURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByRole("status")).toContainText("Your session expired");
});
