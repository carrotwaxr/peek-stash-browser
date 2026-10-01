import { type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { deleteUsers } from "./support/cleanup";
import { requireData } from "./support/data";
import { runPrefix } from "./support/names";
import {
  type TestUser,
  completeSetup,
  createUser,
  signIn,
} from "./support/users";

/**
 * E2E tests for the viewer's own values in the cache: a rating or favorite
 * saved on a card or on a page shows on every list afterwards, including
 * the one Back returns to. A throwaway user rates and favorites, never the
 * run admin: per-user state is the user's own, and the dev-stack library is
 * a real one. afterAll deletes the user, and its ratings go with it.
 */

test.describe("Ratings and favorites in the cache", () => {
  let viewer: TestUser;

  test.beforeAll(async ({ request }) => {
    viewer = await createUser(request, "user-data-cache");
  });

  test.afterAll(async ({ request }, testInfo) => {
    await deleteUsers(
      request,
      `${runPrefix()}-user-data-cache-${testInfo.workerIndex}-`
    );
  });

  /** Waits for the PUT that saves a rating or favorite of this entity type */
  function savedWrite(page: Page, type: string) {
    return page.waitForResponse(
      (response) =>
        response.url().includes(`/api/ratings/${type}/`) &&
        response.request().method() === "PUT" &&
        response.ok()
    );
  }

  test("a favorite and rating set on a performer card still show after opening the performer and going Back", async ({
    browser,
    baseURL,
  }) => {
    const context = await signIn(browser, baseURL, viewer);
    try {
      await completeSetup(context);
      const page = await context.newPage();
      const list = new ListPage(page);
      await list.goto("/performers");
      requireData((await list.waitForResults("Performer")) > 0, "a performer");

      const card = list.cards("Performer").first();
      const name = (
        await card.locator("a:has(.card-title)").innerText()
      ).trim();

      const favoriteSaved = savedWrite(page, "performer");
      await card.getByLabel("Add to favorites").click();
      await favoriteSaved;
      await expect(card.getByLabel("Remove from favorites")).toBeVisible();

      // The rating slider saves 300 ms after it last moves. It closes on
      // any scroll, so the card is in view before the badge is pressed
      await card.scrollIntoViewIfNeeded();
      await card.getByLabel("Not rated").click();
      await expect(page.getByText("Rate performer")).toBeVisible();
      const ratingSaved = savedWrite(page, "performer");
      await page.locator('input[type="range"]').fill("8");
      await ratingSaved;
      await page.keyboard.press("Escape");
      await expect(card.getByLabel("Rating: 8.0")).toBeVisible();

      await card.locator("a:has(.card-title)").click();
      await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(
        name,
        { timeout: 10_000 }
      );
      await page.goBack();

      const back = list.cards("Performer").first();
      await expect(back.getByLabel("Remove from favorites")).toBeVisible();
      await expect(back.getByLabel("Rating: 8.0")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("a scene favorited from its page shows the heart on the Scenes grid after Back", async ({
    browser,
    baseURL,
  }) => {
    const context = await signIn(browser, baseURL, viewer);
    try {
      await completeSetup(context);
      const page = await context.newPage();
      const list = new ListPage(page);
      await list.goto("/scenes");
      requireData((await list.waitForResults("Scene")) > 0, "a scene");

      const card = list.cards("Scene").first();
      await expect(card.getByLabel("Add to favorites")).toBeVisible();
      await card.locator("a:has(.card-title)").first().click();
      await expect(page).toHaveURL(/\/scene\//);

      const saved = savedWrite(page, "scene");
      await page
        .getByLabel("Add to favorites")
        .locator("visible=true")
        .first()
        .click();
      await saved;
      await page.goBack();

      await expect(
        list.cards("Scene").first().getByLabel("Remove from favorites")
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
