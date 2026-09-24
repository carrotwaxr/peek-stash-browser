import { type Locator, type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";

/**
 * E2E tests for pagination on the scene list: Next and Previous, the page and
 * per_page URL parameters, the per-page selector, and the scroll position and
 * history around them.
 *
 * The replay library has 361 scenes, so every page here is full; a dev-stack
 * library with a single page skips (requireData).
 */

/** A card's title text */
const titleOf = (card: Locator) => card.locator(".card-title");

/** Opens the scene list at `path` and waits for its cards */
async function openScenes(page: Page, path: string) {
  const list = new ListPage(page);
  await list.goto(path);
  requireData(await list.waitForResults("Scene"), "scenes");
  return { list, cards: list.cards("Scene") };
}

/** Fails, or skips on the dev stack, unless the list has a second page */
async function requireSecondPage(list: ListPage) {
  requireData(await list.nextPage.isEnabled(), "more than one page of scenes");
}

test.describe("Pagination", () => {
  test("Next and Previous move between pages", async ({ page }) => {
    const { list, cards } = await openScenes(page, "/scenes?per_page=12");
    await requireSecondPage(list);
    const firstTitle = (await titleOf(cards.first()).innerText()).trim();

    await list.nextPage.click();
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(titleOf(cards.first())).not.toHaveText(firstTitle);

    await list.previousPage.click();
    await expect(page).toHaveURL((url) => {
      const pageParam = url.searchParams.get("page");
      return pageParam === null || pageParam === "1";
    });
    await expect(titleOf(cards.first())).toHaveText(firstTitle);
  });

  test("page=2 in the URL opens the second page", async ({ page }) => {
    // App bug: a URL whose only parameters are page and per_page opens page 1
    // (useFilterState's initialize sets currentPage: 1 unless the URL holds
    // another parameter, such as sort). Remove this line with the fix.
    test.fail();
    const { list, cards } = await openScenes(page, "/scenes?per_page=24");
    requireData((await cards.count()) >= 13, "13 scenes");
    const thirteenth = (await titleOf(cards.nth(12)).innerText()).trim();

    await list.goto("/scenes?page=2&per_page=12");
    await expect(titleOf(cards.first())).toHaveText(thirteenth, {
      timeout: 10_000,
    });
  });

  test("choosing 48 per page shows up to 48 cards and writes per_page", async ({
    page,
  }) => {
    const { list, cards } = await openScenes(page, "/scenes");
    await requireSecondPage(list);

    await list.perPage.selectOption("48");
    await expect(page).toHaveURL(/[?&]per_page=48(&|$)/);
    await expect.poll(() => cards.count()).toBeGreaterThan(24);
    expect(await cards.count()).toBeLessThanOrEqual(48);
  });

  test("per_page in the URL sets the selector and the card count", async ({
    page,
  }) => {
    const { list, cards } = await openScenes(page, "/scenes?per_page=12");
    await requireSecondPage(list);

    await expect(cards).toHaveCount(12);
    await expect(list.perPage).toHaveValue("12");
  });
});

test.describe("Scroll position", () => {
  const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

  const titleLinkOf = (card: Locator) => card.locator("a:has(.card-title)");

  test("changing page size keeps the scroll position", async ({ page }) => {
    const { list, cards } = await openScenes(page, "/scenes?per_page=24");
    await requireSecondPage(list);

    await list.perPage.scrollIntoViewIfNeeded();
    const before = await scrollY(page);
    expect(before).toBeGreaterThan(200);

    await list.perPage.selectOption("48");
    await expect(page).toHaveURL(/per_page=48/);
    await expect.poll(() => cards.count()).toBeGreaterThan(24);

    expect(await scrollY(page)).toBeGreaterThanOrEqual(before - 50);
  });

  test("Back from a scene returns to the list at the same position in one press", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?per_page=24");
    requireData((await cards.count()) >= 16, "16 scenes");

    const card = cards.nth(15);
    await card.scrollIntoViewIfNeeded();
    const before = await scrollY(page);

    await titleLinkOf(card).click();
    await expect(page).toHaveURL(/\/scene\//);

    await page.goBack();
    await expect(page).toHaveURL(/\/scenes\?per_page=24$/);
    await expect
      .poll(async () => Math.abs((await scrollY(page)) - before), {
        timeout: 10_000,
      })
      .toBeLessThanOrEqual(100);
  });

  test("opening a scene from the grid adds exactly one history entry", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?per_page=24");

    const lengthBefore = await page.evaluate(() => history.length);
    await titleLinkOf(cards.first()).click();
    await expect(page).toHaveURL(/\/scene\//);

    expect(await page.evaluate(() => history.length)).toBe(lengthBefore + 1);
  });

  test("ctrl-click opens the scene in a new tab and leaves the grid", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?per_page=24");

    const link = titleLinkOf(cards.first());
    const [newPage] = await Promise.all([
      page.context().waitForEvent("page"),
      link.click({ modifiers: ["ControlOrMeta"] }),
    ]);
    await newPage.waitForURL(/\/scene\//);

    // Give a stray in-app navigation time to happen before checking.
    await page.waitForTimeout(500);
    expect(new URL(page.url()).pathname).toBe("/scenes");
    await newPage.close();
  });
});
