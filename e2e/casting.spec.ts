import {
  type BrowserContext,
  type Page,
  expect,
  request,
  test,
} from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import { requireData } from "./support/data";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Casting from the Scene page (PR 11).
 *
 * Google's Cast sender script is answered by a stub (support/castSenderStub.js)
 * that reports one device, "Stub TV", and records what the page loads on it.
 * `page.route` answers before DNS, and the `chromium` project resolves
 * www.gstatic.com to nothing, so no test reaches Google. The hermetic stack
 * serves on http://localhost, a secure context, so the page loads the sender.
 *
 * Each test runs as a throwaway user (it seeds a resume point and the cast
 * posts save-activity), signed in through the API and deleted afterwards.
 */

const STUB = readFileSync(
  path.join(__dirname, "support", "castSenderStub.js"),
  "utf-8"
);

/** The scene the user left at this point: where a cast starts */
const RESUME_SECONDS = 123;

interface SceneRow {
  id: string;
  instanceId: string;
  files?: Array<{ duration?: number | null }>;
  vr?: { projection: string } | null;
}

interface FoundScenes {
  findScenes: { scenes: SceneRow[] };
}

/** What the stub recorded for one loadMedia call */
interface CastLoad {
  url: string;
  contentType: string;
  currentTime: number;
  autoplay: boolean;
  customData: { scene: string; sender: string };
}

interface CastStubWindow {
  __castStub: { loads: CastLoad[]; finish(): void };
}

const loadsOf = (page: Page) =>
  page.evaluate(() => (window as unknown as CastStubWindow).__castStub.loads);

const scenePath = (scene: SceneRow) =>
  `/scene/${scene.id}?instance=${encodeURIComponent(scene.instanceId)}`;

const saveActivity = (url: string) =>
  url.endsWith("/api/watch-history/save-activity");

/** Looks one scene up as the Scene page does, so the user's exclusions apply */
async function findScene(
  context: BrowserContext,
  id: string,
  instanceId?: string
): Promise<SceneRow | undefined> {
  const found = (await (
    await mustOk(
      await context.request.post("/api/library/scenes", {
        data: {
          ids: [id],
          ...(instanceId && { scene_filter: { instance_id: instanceId } }),
        },
      }),
      "POST /api/library/scenes"
    )
  ).json()) as FoundScenes;
  return found.findScenes.scenes[0];
}

test.describe("Casting", () => {
  const created: TestUser[] = [];

  test.afterAll(async ({ request: admin }) => {
    for (const { id } of created.splice(0)) {
      await deleteUser(admin, id);
    }
  });

  /** A throwaway user's page, with the Cast sender stubbed */
  async function castingPage(
    browser: Parameters<typeof signIn>[0],
    baseURL: string | undefined,
    admin: Parameters<typeof createUser>[0]
  ) {
    const user = await createUser(admin, "casting");
    created.push(user);
    const context = await signIn(browser, baseURL, user);
    await completeSetup(context);
    const page = await context.newPage();
    await page.route("https://www.gstatic.com/cv/js/sender/**", (route) =>
      route.fulfill({ contentType: "application/javascript", body: STUB })
    );
    return { context, page };
  }

  /**
   * Opens the grid's first scene with the grid as its queue, then leaves a
   * resume point on it and reloads (the reload keeps the queue), so the
   * cast has a place to start from.
   */
  async function openQueueScene(context: BrowserContext, page: Page) {
    const list = new ListPage(page);
    await list.goto("/scenes");
    await list.waitForResults("Scene");
    await list.cards("Scene").first().locator("a:has(.card-title)").click();
    await expect(page).toHaveURL(/\/scene\//);
    // The hermetic stack has one instance, so the id alone finds the scene
    const id = /\/scene\/([^/?]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!id) throw new Error(`The page is on no scene: ${page.url()}`);
    const scene = requireData(
      await findScene(context, id),
      "the grid's first scene"
    );
    const { instanceId } = scene;
    requireData(
      (scene.files?.[0]?.duration ?? 0) > RESUME_SECONDS + 60
        ? scene
        : undefined,
      "a first scene longer than the resume point"
    );
    await mustOk(
      await context.request.post("/api/watch-history/save-activity", {
        data: {
          instanceId,
          sceneId: id,
          resumeTime: RESUME_SECONDS,
          playDuration: RESUME_SECONDS,
        },
      }),
      "POST /api/watch-history/save-activity"
    );
    await page.reload();
    await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
    return scene;
  }

  /** The Cast button, which shows once the stub reports its device */
  const castButton = (page: Page) => page.locator(".vjs-cast-button");

  test("the Cast button appears with a stub device, and starting a session sends a load request whose link is absolute, signed and plays with no cookie", async ({
    browser,
    baseURL,
    request: admin,
  }) => {
    test.setTimeout(90_000); // an HLS link is a transcode on demand
    const { context, page } = await castingPage(browser, baseURL, admin);
    const scene = await openQueueScene(context, page);

    await expect(castButton(page)).toBeVisible({ timeout: 15_000 });
    expect(await loadsOf(page)).toHaveLength(0);
    await castButton(page).click();

    await expect.poll(async () => (await loadsOf(page)).length).toBe(1);
    const [load] = await loadsOf(page);
    const sent = requireData(load, "a load request");
    // Absolute, on this origin, with the user's signed link
    expect(sent.url).toMatch(/^http:\/\/localhost:\d+\/api\/scene\//);
    expect(new URL(sent.url).origin).toBe(new URL(baseURL ?? "").origin);
    expect(sent.url).toContain(`/scene/${scene.id}/`);
    expect(sent.url).toContain("sig=");
    expect(sent.url).not.toContain("apikey");
    // The user's resume point, since this page has not played
    expect(sent.currentTime).toBe(RESUME_SECONDS);
    expect(sent.autoplay).toBe(true);
    expect(sent.customData.scene).toBe(`${scene.id}:${scene.instanceId}`);
    await expect(page.locator(".vjs-cast-status")).toHaveText(
      "Casting to Stub TV"
    );

    // The device has no cookie: the link alone plays
    const device = await request.newContext({
      storageState: { cookies: [], origins: [] },
    });
    try {
      const played = await device.get(sent.url, {
        headers: { Range: "bytes=0-1023" },
        timeout: 60_000,
      });
      expect([200, 206]).toContain(played.status());
      expect(played.headers()["content-type"]).toMatch(
        /^(video\/|application\/(vnd\.apple\.mpegurl|x-mpegurl))/i
      );
    } finally {
      await device.dispose();
    }
  });

  test("with page.clock, exactly one save-activity per 10 s while the TV plays, and none from the local player", async ({
    browser,
    baseURL,
    request: admin,
  }) => {
    const { context, page } = await castingPage(browser, baseURL, admin);
    await page.clock.install();
    const scene = await openQueueScene(context, page);
    const saves: { resumeTime: number; playDuration: number }[] = [];
    page.on("request", (sent) => {
      if (sent.method() === "POST" && saveActivity(sent.url())) {
        saves.push(
          sent.postDataJSON() as { resumeTime: number; playDuration: number }
        );
      }
    });

    await expect(castButton(page)).toBeVisible({ timeout: 15_000 });
    // From here time moves only when the test moves it
    await page.clock.pauseAt(new Date(Date.now() + 60_000));
    await castButton(page).click();
    await expect.poll(async () => (await loadsOf(page)).length).toBe(1);
    expect(saves).toHaveLength(0);

    await page.clock.runFor(9_000);
    await page.clock.runFor(500);
    expect(saves).toHaveLength(0);
    await page.clock.runFor(500);
    await expect.poll(() => saves.length).toBe(1);
    // The TV's position, not the local player's (which never played)
    expect(saves[0]).toMatchObject({
      resumeTime: RESUME_SECONDS + 10,
      playDuration: 10,
    });

    await page.clock.runFor(9_000);
    expect(saves).toHaveLength(1);
    await page.clock.runFor(1_000);
    await expect.poll(() => saves.length).toBe(2);
    expect(saves[1]).toMatchObject({
      resumeTime: RESUME_SECONDS + 20,
      playDuration: 10,
    });
    expect(scene.id).toBeTruthy();
  });

  test("Next in the queue sidebar while casting sends a second load request for the next scene", async ({
    browser,
    baseURL,
    request: admin,
  }) => {
    const { context, page } = await castingPage(browser, baseURL, admin);
    await openQueueScene(context, page);
    await expect(castButton(page)).toBeVisible({ timeout: 15_000 });
    await castButton(page).click();
    await expect.poll(async () => (await loadsOf(page)).length).toBe(1);
    const [first] = await loadsOf(page);

    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Browsing", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await sidebar
      .getByText("Up Next", { exact: true })
      .locator("..")
      .locator("h4")
      .click();

    await expect.poll(async () => (await loadsOf(page)).length).toBe(2);
    const loads = await loadsOf(page);
    const next = requireData(loads[1], "a second load request");
    expect(next.customData.scene).not.toBe(first?.customData.scene);
    expect(next.currentTime).toBe(0);
    // The page's scene is the one on the TV
    const pageScene = /\/scene\/([^/?]+)/.exec(
      new URL(page.url()).pathname
    )?.[1];
    expect(next.customData.scene.split(":")[0]).toBe(pageScene);
    expect(next.url).toContain("sig=");
  });

  test("a scene that finishes on the TV steps the queue and loads the next scene", async ({
    browser,
    baseURL,
    request: admin,
  }) => {
    const { context, page } = await castingPage(browser, baseURL, admin);
    await openQueueScene(context, page);
    await expect(castButton(page)).toBeVisible({ timeout: 15_000 });
    await castButton(page).click();
    await expect.poll(async () => (await loadsOf(page)).length).toBe(1);
    const [first] = await loadsOf(page);

    await page.evaluate(() =>
      (window as unknown as CastStubWindow).__castStub.finish()
    );

    await expect.poll(async () => (await loadsOf(page)).length).toBe(2);
    const next = requireData((await loadsOf(page))[1], "a second load");
    expect(next.customData.scene).not.toBe(first?.customData.scene);
    expect(next.currentTime).toBe(0);
    // The scene that finished was playing: the next one plays on
    expect(next.autoplay).toBe(true);
    await expect(page.locator(".vjs-cast-status")).toHaveText(
      "Casting to Stub TV"
    );
  });

  /** The replay's VR scene, opened with the Cast and VR buttons both shown */
  async function openVrScene(
    context: BrowserContext,
    page: Page,
    viewport: { width: number; height: number }
  ) {
    await page.setViewportSize(viewport);
    // The replay's VR scene: the first scene whose lookup answers a projection
    const found = (await (
      await mustOk(
        await context.request.post("/api/library/scenes", {
          data: { filter: { per_page: 1 } },
        }),
        "POST /api/library/scenes"
      )
    ).json()) as FoundScenes;
    const instanceId = requireData(
      found.findScenes.scenes[0]?.instanceId,
      "a scene"
    );
    const vrScene = requireData(
      await findScene(context, "100010", instanceId),
      "the replay's VR scene"
    );
    requireData(vrScene.vr ?? undefined, "the VR scene's projection");

    await page.goto(scenePath(vrScene));
    await expect(page.locator(".vjs-vr-button")).toBeVisible({
      timeout: 15_000,
    });
    await expect(castButton(page)).toBeVisible({ timeout: 15_000 });
  }

  test("at 390 px with a stub device on a VR scene, the fullscreen toggle lies inside the player", async ({
    browser,
    baseURL,
    request: admin,
  }) => {
    const { context, page } = await castingPage(browser, baseURL, admin);
    await openVrScene(context, page, { width: 390, height: 844 });
    const player = page.locator(".video-js").first();

    const bounds = requireData(await player.boundingBox(), "the player's box");
    const toggle = requireData(
      await page.locator(".vjs-fullscreen-control").boundingBox(),
      "the fullscreen toggle's box"
    );
    expect(toggle.x).toBeGreaterThanOrEqual(bounds.x);
    expect(toggle.x + toggle.width).toBeLessThanOrEqual(
      bounds.x + bounds.width + 0.5
    );
    // The control bar's seek buttons give way (the big buttons seek)
    const display = await page
      .locator(".vjs-control-bar .vjs-seek-button")
      .evaluateAll((buttons) =>
        buttons.map((button) => getComputedStyle(button).display)
      );
    expect(display.length).toBeGreaterThan(0);
    expect(display.every((value) => value === "none")).toBe(true);
  });

  // The Scene page's player is 552 px wide at 1280 px (the Recommended
  // sidebar has the rest), so the bar answers the player's width, not the
  // viewport's
  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`at ${viewport.width} px with the Cast and VR buttons, every control lies inside the player and fullscreen shows`, async ({
      browser,
      baseURL,
      request: admin,
    }) => {
      const { context, page } = await castingPage(browser, baseURL, admin);
      await openVrScene(context, page, viewport);
      // The bar shows while the pointer is over the player
      await page.locator(".video-js").first().hover();

      const bounds = requireData(
        await page.locator(".video-js").first().boundingBox(),
        "the player's box"
      );
      const controls = await page
        .locator(".video-js .vjs-control-bar > *")
        .evaluateAll((children) =>
          children
            .filter((child) => {
              const box = child.getBoundingClientRect();
              // The progress bar floats above the bar and spans the player
              return (
                !child.classList.contains("vjs-progress-control") &&
                box.width > 0 &&
                box.height > 0 &&
                getComputedStyle(child).display !== "none" &&
                getComputedStyle(child).visibility !== "hidden"
              );
            })
            .map((child) => {
              const box = child.getBoundingClientRect();
              return {
                name: child.className.split(" ").slice(0, 2).join(" "),
                left: box.left,
                right: box.right,
              };
            })
        );
      expect(controls.length).toBeGreaterThan(0);
      const outside = controls.filter(
        (control) =>
          control.left < bounds.x - 0.5 ||
          control.right > bounds.x + bounds.width + 0.5
      );
      expect(outside, `controls outside the player's box`).toEqual([]);

      const fullscreen = page.locator(".vjs-fullscreen-control");
      await expect(fullscreen).toBeVisible();
      const toggle = requireData(
        await fullscreen.boundingBox(),
        "the fullscreen toggle's box"
      );
      expect(toggle.x + toggle.width).toBeLessThanOrEqual(
        bounds.x + bounds.width + 0.5
      );
      // The buttons that matter stay
      for (const kept of [
        ".vjs-play-control",
        ".vjs-volume-panel",
        ".vjs-vr-button",
        ".vjs-cast-button",
      ]) {
        await expect(page.locator(kept).first()).toBeVisible();
      }
    });
  }
});
