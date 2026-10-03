import {
  type APIRequestContext,
  type Locator,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { TEST_ENTITIES } from "../server/integration/stash-replay/fixture/manifest";
import { mustOk } from "./support/api";
import { requireData } from "./support/data";

/**
 * VR scenes (PR 11, V10): a scene with `vr` shows the VR button and loads the
 * VR code only at the click; any other scene, and TV mode, shows no button and
 * loads none.
 *
 * Hermetic runs serve the replay library, whose VR scene is the manifest's
 * `vrScene` (tagged with the library's VR tag, "Tag 100002") and whose
 * non-VR scene is `nonVrScene`; on the dev stack the ids do not exist and the
 * tests skip (requireData).
 *
 * Vite's dev server has no `vr` chunk: the VR code is module URLs, so it is
 * matched by URL. Headless Chromium has `navigator.xr` but reports no
 * immersive-vr support, so nothing is fetched ahead and the first request for
 * the VR code follows the click. The replay's synthetic files are WebM, which
 * Chromium decodes, and headless Chromium has WebGL2, so the fork draws its
 * canvas for real.
 */

/** The fork (videojs-vr, three.js) and the plugin that wraps it: the big chunk */
const VR_CODE = /videojs-vr|\/video-player\/vr\/vrPlugin/;
/** The small chunk with the button and the menu, fetched only on VR scenes */
const VR_UI = /\/video-player\/vr\/vrUi/;

interface SceneRow {
  id: string;
  instanceId: string;
  vr?: { projection: string; source: string } | null;
}

interface FindScenesBody {
  findScenes: { scenes: SceneRow[] };
}

const PROJECTIONS = {
  "180_LR": "180° stereo",
  "360": "360° mono",
} as const;

/** A scene of the library by the manifest's id, with its `vr` */
async function lookUp(
  request: APIRequestContext,
  id: string
): Promise<SceneRow | undefined> {
  const first = (await (
    await mustOk(
      await request.post("/api/library/scenes", {
        data: { filter: { per_page: 1 } },
      }),
      "POST /api/library/scenes"
    )
  ).json()) as FindScenesBody;
  const instanceId = first.findScenes.scenes[0]?.instanceId;
  if (!instanceId) return undefined;
  const found = (await (
    await mustOk(
      await request.post("/api/library/scenes", {
        data: { ids: [`${id}:${instanceId}`] },
      }),
      "POST /api/library/scenes by id"
    )
  ).json()) as FindScenesBody;
  return found.findScenes.scenes[0];
}

const sceneUrl = (scene: SceneRow) =>
  `/scene/${scene.id}?instance=${encodeURIComponent(scene.instanceId)}`;

/** The URLs the page requests, recorded from now on */
function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

const vrButton = (page: Page) => page.locator(".vjs-vr-button");
const vrCanvas = (page: Page) => page.locator(".video-js canvas");

/** Opens the VR menu: the control bar shows while the pointer is over it */
async function openMenu(page: Page): Promise<Locator> {
  await page.locator(".video-js").hover();
  await vrButton(page).locator("button").click();
  const menu = vrButton(page).locator(".vjs-menu-content");
  await expect(menu).toBeVisible();
  return menu;
}

/** Waits until the scene's page has put its control bar up */
async function controlBarReady(page: Page) {
  await expect(page.locator(".video-js .vjs-control-bar")).toBeAttached();
  await expect(page.locator(".vjs-big-play-button")).toBeVisible();
}

async function startPlaying(page: Page) {
  await page.locator(".vjs-big-play-button").click();
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>(".video-js video");
    return !!video && !video.paused && video.currentTime > 0;
  });
}

test.describe("a VR scene", () => {
  let scene: SceneRow;

  test.beforeEach(async ({ page }) => {
    const found = requireData(
      await lookUp(page.request, TEST_ENTITIES.vrScene),
      "a scene with the VR tag"
    );
    expect(found.vr, "the VR scene answers a projection").toBeTruthy();
    scene = found;
  });

  test("shows the VR button, loads no VR code until the click, and draws a canvas once the video has metadata", async ({
    page,
  }) => {
    const urls = recordRequests(page);
    await page.goto(sceneUrl(scene));
    await controlBarReady(page);

    await expect(vrButton(page)).toBeAttached();
    expect(urls.filter((url) => VR_UI.test(url))).not.toHaveLength(0);
    expect(urls.filter((url) => VR_CODE.test(url))).toEqual([]);
    await expect(vrCanvas(page)).toHaveCount(0);

    const menu = await openMenu(page);
    await menu.getByRole("menuitemcheckbox", { name: "VR view" }).click();

    // The code is requested at the click. The fork draws its canvas on
    // `loadedmetadata`, and Peek's player preloads nothing, so before play
    // there is no metadata and no canvas yet: pressing play brings it
    await expect(
      vrButton(page).locator('[role="menuitemcheckbox"]')
    ).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(() => urls.filter((url) => VR_CODE.test(url)).length)
      .toBeGreaterThan(0);
    await startPlaying(page);
    await expect(vrCanvas(page).first()).toBeAttached({ timeout: 15_000 });
  });

  test("draws the canvas when VR is turned on after play has started", async ({
    page,
  }) => {
    const urls = recordRequests(page);
    await page.goto(sceneUrl(scene));
    await controlBarReady(page);
    await startPlaying(page);
    expect(urls.filter((url) => VR_CODE.test(url))).toEqual([]);

    const menu = await openMenu(page);
    await menu.getByRole("menuitemcheckbox", { name: "VR view" }).click();

    await expect(vrCanvas(page).first()).toBeAttached({ timeout: 15_000 });
    expect(urls.filter((url) => VR_CODE.test(url))).not.toHaveLength(0);
  });

  test("keeps the projection pick over a reload", async ({ page }) => {
    const pick = scene.vr?.projection === "360" ? "180_LR" : "360";
    const other = pick === "360" ? "180_LR" : "360";
    // The menu closes after a pick, and a closed menu is hidden from the
    // role queries: read the radios by their ARIA state
    // (a selected item's text carries a ", selected" note for screen readers)
    const radio = (key: keyof typeof PROJECTIONS) =>
      vrButton(page)
        .locator('[role="menuitemradio"]')
        .filter({
          has: page.locator(".vjs-menu-item-text", {
            hasText: new RegExp(`^${PROJECTIONS[key]}$`),
          }),
        });

    await page.goto(sceneUrl(scene));
    await controlBarReady(page);
    await expect(vrButton(page)).toBeAttached();

    const menu = await openMenu(page);
    await menu
      .getByRole("menuitemradio", { name: PROJECTIONS[pick], exact: true })
      .click();
    await expect(radio(pick)).toHaveAttribute("aria-checked", "true");
    await expect(radio(other)).toHaveAttribute("aria-checked", "false");

    await page.reload();
    await controlBarReady(page);
    await expect(vrButton(page)).toBeAttached();

    await openMenu(page);
    await expect(radio(pick)).toHaveAttribute("aria-checked", "true");
    await expect(radio(other)).toHaveAttribute("aria-checked", "false");
  });

  test("shows no VR button in TV mode and loads no VR code", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("peek-tv-mode", "true");
    });
    const urls = recordRequests(page);
    await page.goto(sceneUrl(scene));
    await controlBarReady(page);

    await expect(vrButton(page)).toHaveCount(0);
    expect(urls.filter((url) => VR_UI.test(url) || VR_CODE.test(url))).toEqual(
      []
    );
  });
});

test("a scene without the VR tag shows no VR button and loads no VR code", async ({
  page,
}) => {
  const scene = requireData(
    await lookUp(page.request, TEST_ENTITIES.nonVrScene),
    "a scene without the VR tag"
  );
  expect(scene.vr ?? null, "the scene has no vr").toBeNull();

  const urls = recordRequests(page);
  await page.goto(sceneUrl(scene));
  await controlBarReady(page);

  await expect(vrButton(page)).toHaveCount(0);
  expect(urls.filter((url) => VR_UI.test(url) || VR_CODE.test(url))).toEqual(
    []
  );
});
