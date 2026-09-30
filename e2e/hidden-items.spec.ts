import { type Locator, type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import {
  type TestUser,
  completeSetup,
  createUser,
  deleteUser,
  signIn,
} from "./support/users";

/**
 * E2E test for the Hidden Items page (item 36): a user hides a scene and a
 * performer from their cards, the page lists both with thumbnails and the
 * Scenes tab counts one, and restoring the scene lists it on /scenes again.
 *
 * Runs as a throwaway user: hiding is per-user state.
 */

interface HiddenPage {
  items: Array<{
    entityType: string;
    entityId: string;
    instanceId: string;
    summary: { name: string | null; imageUrl: string | null } | null;
  }>;
}

interface FoundScenes {
  findScenes: { scenes: Array<{ performers: Array<{ name: string }> }> };
}

/**
 * Opens a card's menu and hides it through the confirmation dialog. The menu
 * closes on any scroll, and scrolling the card into view can still be
 * settling when it opens, so opening it is retried until the dialog shows.
 */
async function hideFromCard(page: Page, card: Locator, label: string) {
  const confirm = page.getByRole("button", { name: "Hide", exact: true });
  await card.scrollIntoViewIfNeeded();
  await expect(async () => {
    await card.hover();
    await card.getByRole("button", { name: "More options" }).click();
    await page
      .getByRole("button", { name: `Hide ${label}` })
      .click({ timeout: 2_000 });
    await expect(confirm).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  // The performer card renders its dialog inside the card, which scales while
  // hovered, so the button never reads as stable
  await confirm.click({ force: true });
  await expect(page.getByText(/has been hidden/).first()).toBeVisible({
    timeout: 10_000,
  });
}

test.describe("Hidden Items", () => {
  const created: TestUser[] = [];

  test.afterAll(async ({ request }) => {
    for (const { id } of created.splice(0)) {
      await deleteUser(request, id);
    }
  });

  test("hides a scene and a performer from their cards, lists them with thumbnails, and restores the scene", async ({
    browser,
    baseURL,
    request,
  }) => {
    const user = await createUser(request, "hidden-items");
    created.push(user);
    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const page = await context.newPage();
      const list = new ListPage(page);
      const hiddenList = async () =>
        (await (
          await mustOk(
            await context.request.get("/api/user/hidden-entities"),
            "GET /api/user/hidden-entities"
          )
        ).json()) as HiddenPage;

      // A scene, hidden from its card
      await list.goto("/scenes");
      expect(await list.waitForResults("Scene")).toBeGreaterThan(0);
      await hideFromCard(page, list.cards("Scene").first(), "Scene");
      const [hiddenScene] = (await hiddenList()).items;
      expect(hiddenScene?.entityType).toBe("scene");
      const sceneName = hiddenScene?.summary?.name ?? "";
      expect(sceneName).not.toBe("");

      // A performer not in that scene (hiding one in it would hide the
      // scene again through its cascade), hidden from its card
      const found = (await (
        await mustOk(
          await request.post("/api/library/scenes", {
            data: {
              ids: [`${hiddenScene?.entityId}:${hiddenScene?.instanceId}`],
            },
          }),
          "POST /api/library/scenes"
        )
      ).json()) as FoundScenes;
      const inScene = new Set(
        (found.findScenes.scenes[0]?.performers ?? []).map((p) => p.name)
      );
      await list.goto("/performers");
      expect(await list.waitForResults("Performer")).toBeGreaterThan(0);
      const performerCards = list.cards("Performer");
      let performerCard: Locator | undefined;
      let performerName = "";
      for (let i = 0; i < (await performerCards.count()); i++) {
        const card = performerCards.nth(i);
        const name =
          (await card.locator(".card-title").first().textContent())?.trim() ??
          "";
        if (name && !inScene.has(name)) {
          performerCard = card;
          performerName = name;
          break;
        }
      }
      if (!performerCard) {
        throw new Error("Every listed performer appears in the hidden scene");
      }
      await hideFromCard(page, performerCard, "Performer");

      // Both listed, each with the thumbnail the server named
      await page.goto("/hidden-items");
      await expect(
        page.getByRole("heading", { name: "Hidden Items" })
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        page.getByRole("button", { name: /^Scenes\s*1$/ })
      ).toBeVisible({ timeout: 10_000 });
      for (const name of [sceneName, performerName]) {
        const thumbnail = page.getByRole("img", { name, exact: true });
        await expect(thumbnail).toBeVisible({ timeout: 10_000 });
        await expect(thumbnail).toHaveAttribute(
          "src",
          /^\/api\/proxy\/stash\?path=.+&instanceId=.+/
        );
        await expect
          .poll(() =>
            thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth)
          )
          .toBeGreaterThan(0);
      }

      // Restore the scene: it lists on /scenes again
      const sceneRow = page
        .locator("div.rounded.border")
        .filter({ has: page.getByText(sceneName, { exact: true }) });
      await sceneRow.getByRole("button", { name: "Restore" }).click();
      await expect(page.getByText(sceneName, { exact: true })).toHaveCount(0, {
        timeout: 15_000,
      });
      await expect(
        page.getByText(performerName, { exact: true }).first()
      ).toBeVisible();

      await list.goto(`/scenes?q=${encodeURIComponent(sceneName)}`);
      await expect(
        list.cards("Scene").filter({ hasText: sceneName }).first()
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });
});
