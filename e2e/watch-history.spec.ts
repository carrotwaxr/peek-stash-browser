import { type Locator, type Page, expect, test } from "@playwright/test";
import { mustOk } from "./support/api";
import { requireData } from "./support/data";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Continue Watching and Watch History list the right scenes (item 49).
 *
 * A throwaway user watches three scenes through the API, as the player
 * would: one it finished (and played once), one it left at 40%, and one it
 * left after 1% (an accidental click). Continue Watching shows only the 40%
 * scene; Watch History's All lists all three, In Progress the 40% scene and
 * Completed the finished one.
 */

interface SceneRow {
  id: string;
  instanceId: string;
  files?: Array<{ duration?: number | null }>;
}

interface FoundScenes {
  findScenes: { scenes: SceneRow[] };
}

/** The scene's anchors: its card or row's title and thumbnail links */
const sceneLinks = (page: Page | Locator, scene: SceneRow) =>
  page.locator(`a[href="/scene/${scene.id}"], a[href^="/scene/${scene.id}?"]`);

const durationOf = (scene: SceneRow) => scene.files?.[0]?.duration ?? 0;

test.describe("Watch history", () => {
  const created: TestUser[] = [];

  test.afterAll(async ({ request }) => {
    for (const { id } of created.splice(0)) {
      await deleteUser(request, id);
    }
  });

  test("Continue Watching shows the scenes left before the last 10%, and Watch History splits All, In Progress and Completed", async ({
    browser,
    baseURL,
    request,
  }) => {
    const user = await createUser(request, "watch-history");
    created.push(user);
    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);

      const found = (await (
        await mustOk(
          await context.request.post("/api/library/scenes", {
            data: { filter: { per_page: 40 } },
          }),
          "POST /api/library/scenes"
        )
      ).json()) as FoundScenes;
      const withDuration = found.findScenes.scenes.filter(
        (scene) => durationOf(scene) > 0
      );
      const [finished, partial, glance] = withDuration;
      if (!finished || !partial || !glance) {
        requireData(undefined, "three scenes with a duration");
        return;
      }

      const activity = async (
        scene: SceneRow,
        resumeFraction: number,
        playFraction: number
      ) => {
        await mustOk(
          await context.request.post("/api/watch-history/save-activity", {
            data: {
              instanceId: scene.instanceId,
              sceneId: scene.id,
              resumeTime: resumeFraction * durationOf(scene),
              playDuration: playFraction * durationOf(scene),
            },
          }),
          "POST /api/watch-history/save-activity"
        );
      };
      // Finished: watched to the end (the resume point resets), then counted
      // as a play, as the player does (save-activity never changes the count)
      await activity(finished, 0, 0.98);
      await mustOk(
        await context.request.post("/api/watch-history/increment-play-count", {
          data: { instanceId: finished.instanceId, sceneId: finished.id },
        }),
        "POST /api/watch-history/increment-play-count"
      );
      await activity(partial, 0.4, 0.4);
      await activity(glance, 0.01, 0.01);

      const page = await context.newPage();

      // Home: Continue Watching holds the scenes left at 40% and 1% (a
      // resume point before the last 10% is in progress, however little was
      // watched), not the finished one
      await page.goto("/");
      const heading = page.getByRole("heading", {
        level: 2,
        name: "Continue Watching",
      });
      await expect(heading).toBeVisible({ timeout: 15_000 });
      const carousel = page.locator("div.mb-8").filter({ has: heading });
      await expect(sceneLinks(carousel, partial).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(sceneLinks(carousel, glance).first()).toBeVisible();
      await expect(sceneLinks(carousel, finished)).toHaveCount(0);

      // Watch History: All lists all three
      await page.goto("/watch-history");
      for (const scene of [finished, partial, glance]) {
        await expect(sceneLinks(page, scene).first()).toBeVisible({
          timeout: 15_000,
        });
      }

      // In Progress: the 40% and 1% scenes, the same as Continue Watching
      await page.getByLabel("Filter:").selectOption("in_progress");
      await expect(page).toHaveURL(/[?&]view=in_progress(&|$)/);
      await expect(sceneLinks(page, partial).first()).toBeVisible();
      await expect(sceneLinks(page, glance).first()).toBeVisible();
      await expect(sceneLinks(page, finished)).toHaveCount(0);

      // Completed: the finished scene only
      await page.getByLabel("Filter:").selectOption("completed");
      await expect(page).toHaveURL(/[?&]view=completed(&|$)/);
      await expect(sceneLinks(page, finished).first()).toBeVisible();
      await expect(sceneLinks(page, partial)).toHaveCount(0);
      await expect(sceneLinks(page, glance)).toHaveCount(0);

      // Back returns to In Progress
      await page.goBack();
      await expect(page).toHaveURL(/[?&]view=in_progress(&|$)/);
      await expect(sceneLinks(page, partial).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
