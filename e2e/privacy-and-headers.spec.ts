import { type Page, chromium, expect, test } from "@playwright/test";

/**
 * Privacy and security headers (item 84: SEC-18, CS-32).
 *
 * Peek serves its own fonts, so the browser contacts no third party while
 * browsing. The bundled nginx sends a CSP and the other security headers on
 * every response. The dev stack (Vite) sends no headers and injects inline
 * HMR scripts, so the header and CSP tests run only against the production
 * image: set E2E_PROD_IMAGE=1 and point E2E_BASE_URL at it.
 */

const PROD_ONLY = "Needs the production image (set E2E_PROD_IMAGE)";

interface SceneRow {
  id: string;
  instanceId: string;
  captions?: unknown[];
}

interface FindScenesBody {
  findScenes: { scenes: SceneRow[] };
}

interface CspViolation {
  page: string;
  blockedURI: string;
  violatedDirective: string;
  sourceFile: string;
  lineNumber: number;
}

/** A scene with captions from the first page, else the first scene. */
async function pickScene(page: Page): Promise<SceneRow | null> {
  const found = await page.request.post("/api/library/scenes", {
    data: { filter: { per_page: 100 } },
  });
  if (!found.ok()) return null;
  const { scenes } = ((await found.json()) as FindScenesBody).findScenes;
  return scenes.find((s) => (s.captions?.length ?? 0) > 0) ?? scenes[0] ?? null;
}

const scenePath = (scene: SceneRow) =>
  `/scene/${scene.id}?instance=${encodeURIComponent(scene.instanceId)}`;

test("loads no third-party resources on Home, Scenes and a scene page", async ({
  page,
  baseURL,
}) => {
  const appOrigin = new URL(baseURL!).origin;
  const offOrigin: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (new URL(url).origin !== appOrigin) offOrigin.push(url);
  });

  await page.goto("/", { waitUntil: "networkidle" });
  await page.goto("/scenes", { waitUntil: "networkidle" });

  const scene = await pickScene(page);
  if (scene) {
    await page.goto(scenePath(scene), { waitUntil: "networkidle" });
  }

  expect(offOrigin).toEqual([]);

  const interFaces = await page.evaluate(
    async () => (await document.fonts.load('16px "Inter"')).length
  );
  expect(interFaces).toBeGreaterThan(0);
});

test("the app document carries the security headers", async ({ page }) => {
  test.skip(!process.env.E2E_PROD_IMAGE, PROD_ONLY);

  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'self'"
  );
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(headers["referrer-policy"]).toBe("same-origin");
  expect(headers["cache-control"]).toContain("no-cache");

  const health = await page.request.get("/api/health");
  expect(health.headers()["x-powered-by"]).toBeUndefined();
});

/**
 * A page in installed Chrome, signed in like the project's own pages.
 * Playwright refuses use({ channel }) inside a describe (it forces a new
 * worker), so this fixture launches Chrome itself.
 */
const chromeTest = test.extend<{ chromePage: Page }>({
  chromePage: async ({ baseURL }, use, testInfo) => {
    const browser = await chromium.launch({ channel: "chrome" });
    try {
      const context = await browser.newContext({
        baseURL,
        storageState: testInfo.project.use.storageState,
      });
      await use(await context.newPage());
    } finally {
      await browser.close();
    }
  },
});

test.describe("in installed Chrome", () => {
  // Bundled Chromium has no H.264, so video.js never starts the HLS worker the CSP must allow
  // Skipped at group level, so CI never needs Chrome installed
  chromeTest.skip(!process.env.E2E_PROD_IMAGE, PROD_ONLY);

  chromeTest(
    "browsing and playback raise no CSP violations",
    async ({ chromePage: page }) => {
      test.setTimeout(180_000); // Stash transcodes the HLS playlist and segments on demand

      await page.addInitScript(() => {
        const w = window as unknown as { __csp: unknown[] };
        w.__csp = [];
        document.addEventListener("securitypolicyviolation", (e) => {
          w.__csp.push({
            page: location.pathname,
            blockedURI: e.blockedURI,
            violatedDirective: e.violatedDirective,
            sourceFile: e.sourceFile,
            lineNumber: e.lineNumber,
          });
        });
      });

      // Each document starts a fresh window.__csp, so collect before leaving it
      const violations: CspViolation[] = [];
      const collect = async () => {
        violations.push(
          ...(await page.evaluate(
            () => (window as unknown as { __csp: CspViolation[] }).__csp
          ))
        );
      };

      // Home and Scenes
      await page.goto("/", { waitUntil: "networkidle" });
      await collect();
      await page.goto("/scenes", { waitUntil: "networkidle" });
      await collect();

      // A scene: Direct play, then a transcoded HLS quality (MediaSource and the
      // transmuxer worker), then captions if it has any
      const scene = await pickScene(page);
      if (scene) {
        // Direct play, or for a scene without a Direct entry its first transcode
        const directRequest = page.waitForRequest(
          (r) => /\/proxy-stream\/stream(\?|\.)/.test(r.url()),
          { timeout: 20_000 }
        );
        directRequest.catch(() => undefined);
        // A caption in the browser's language loads with the page, so listen now
        const hasCaptions = (scene.captions?.length ?? 0) > 0;
        const captionResponse = hasCaptions
          ? page.waitForResponse(
              (r) =>
                /\/api\/scene\/[^/]+\/caption\?/.test(r.url()) &&
                r.status() === 200,
              { timeout: 150_000 }
            )
          : null;
        captionResponse?.catch(() => undefined);
        await page.goto(scenePath(scene));
        await page.locator(".vjs-big-play-button").click();
        await directRequest;

        const hlsSegment = page.waitForResponse(
          (r) => /\/proxy-stream\/stream\.m3u8\/\d+\.ts/.test(r.url()),
          { timeout: 90_000 }
        );
        hlsSegment.catch(() => undefined);
        const hlsLabel = await page.locator(".video-js").evaluate((el) => {
          const player = (el as any).player;
          const sources: Array<{ src: string; label?: string }> =
            player.sourceSelector().sources;
          const hls = sources.filter((s) => s.src.includes("/stream.m3u8"));
          const source =
            hls.find((s) => s.src.includes("resolution=LOW")) ??
            hls[hls.length - 1];
          if (!source) return null;
          player.src(source);
          void player.play();
          return source.label ?? source.src;
        });
        expect(hlsLabel, "the scene offers an HLS transcode").toBeTruthy();
        expect((await hlsSegment).status()).toBe(200);
        // The segment reaches the transmuxer worker and then the MediaSource
        await page.waitForFunction(
          () =>
            Boolean(
              (document.querySelector(".video-js") as any)?.player?.tech(true)
                ?.vhs
            ),
          undefined,
          { timeout: 10_000 }
        );
        await page.waitForTimeout(2_000);

        if (captionResponse) {
          await page.locator(".video-js").evaluate((el) => {
            const tracks = (el as any).player.textTracks();
            for (let i = 0; i < tracks.length; i++) {
              if (
                tracks[i].kind === "captions" ||
                tracks[i].kind === "subtitles"
              ) {
                tracks[i].mode = "showing";
                return;
              }
            }
          });
          await captionResponse;
        }
        await collect();
      }

      // The images lightbox
      await page.goto("/images", { waitUntil: "networkidle" });
      const firstImage = page.locator('img[src*="/api/proxy/"]').first();
      const hasImages = await firstImage
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (hasImages) {
        await firstImage.click();
        await expect(
          page.getByRole("button", { name: "Close lightbox" })
        ).toBeVisible({ timeout: 10_000 });
        await page.waitForLoadState("networkidle");
      }
      await collect();

      // Settings > Theme > the custom theme editor
      await page.goto("/settings?section=user&tab=theme", {
        waitUntil: "networkidle",
      });
      await page
        .getByRole("button", { name: /^Create (Theme|Your First Theme)$/ })
        .first()
        .click();
      await expect(page.getByText("Create Custom Theme")).toBeVisible({
        timeout: 10_000,
      });
      await page.waitForLoadState("networkidle");
      await collect();

      expect(violations).toEqual([]);
    }
  );
});
