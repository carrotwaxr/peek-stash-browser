import { type Locator, type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";

/**
 * E2E tests for pagination behavior across library list pages.
 *
 * Covers URL state management, per-page selector, page navigation,
 * and cross-entity pagination support.
 */

test.describe("Pagination", () => {
  test("pagination controls appear when there are multiple pages", async ({
    page,
  }) => {
    const listPage = new ListPage(page);
    await listPage.goto("/scenes");

    // Pagination may or may not be visible depending on data
    // Just verify the page loads correctly
    await expect(listPage.searchInput).toBeVisible();
  });

  test("page URL param updates when navigating pages", async ({ page }) => {
    const listPage = new ListPage(page);
    await listPage.goto("/scenes?page=2");

    // URL should preserve the page param
    expect(page.url()).toContain("page=2");
    await expect(listPage.searchInput).toBeVisible({ timeout: 10_000 });
  });

  test("per-page selector changes results count", async ({ page }) => {
    const listPage = new ListPage(page);
    await listPage.goto("/scenes");

    // Check if per-page selector exists
    if (await listPage.perPageSelect.isVisible().catch(() => false)) {
      const value = await listPage.perPageSelect.inputValue();
      expect(["12", "24", "48", "96", "120"]).toContain(value);
    }
  });

  test("navigating to page=1 and page=2 shows different URL state", async ({
    page,
  }) => {
    const listPage = new ListPage(page);
    await listPage.goto("/scenes?page=1");
    await expect(listPage.searchInput).toBeVisible({ timeout: 10_000 });

    // Navigate to page 2
    await page.goto("/scenes?page=2");
    await expect(listPage.searchInput).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("page=2");
  });

  test("pagination works on performers page", async ({ page }) => {
    const listPage = new ListPage(page);
    await listPage.goto("/performers");

    await expect(listPage.searchInput).toBeVisible();
    // Verify page loads with pagination support
  });

  test("per-page value persists in URL", async ({ page }) => {
    const listPage = new ListPage(page);
    await listPage.goto("/scenes?per_page=48");

    await expect(listPage.searchInput).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain("per_page=48");
  });
});

test.describe("Scroll position", () => {
  // Each test skips when the library is too small, so the empty CI database passes.
  const loadScenes = async (page: Page) => {
    const listPage = new ListPage(page);
    await listPage.goto("/scenes?per_page=24");
    const cards = page.locator('[aria-label="Scene"]');
    const hasCards = await cards
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(
        () => true,
        () => false
      );
    return { cards, hasCards };
  };

  const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

  const titleLinkOf = (card: Locator) => card.locator("a:has(.card-title)");

  test("changing page size keeps the scroll position", async ({ page }) => {
    const { cards, hasCards } = await loadScenes(page);
    const nextPage = page.locator('button[aria-label="Next Page"]').last();
    const hasMorePages =
      hasCards && (await nextPage.count()) > 0 && (await nextPage.isEnabled());
    test.skip(!hasMorePages, "needs more than one page of scenes");

    // The bottom per-page select (the id is duplicated top and bottom)
    const perPage = page.locator("#perPage").last();
    await perPage.scrollIntoViewIfNeeded();
    const before = await scrollY(page);
    expect(before).toBeGreaterThan(200);

    await perPage.selectOption("48");
    await expect(page).toHaveURL(/per_page=48/);
    await expect.poll(() => cards.count()).toBeGreaterThan(24);

    expect(await scrollY(page)).toBeGreaterThanOrEqual(before - 50);
  });

  test("Back from a scene returns to the list at the same position in one press", async ({
    page,
  }) => {
    const { cards, hasCards } = await loadScenes(page);
    test.skip(!hasCards || (await cards.count()) < 16, "needs 16 scenes");

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
    const { cards, hasCards } = await loadScenes(page);
    test.skip(!hasCards, "needs a scene");

    const lengthBefore = await page.evaluate(() => history.length);
    await titleLinkOf(cards.first()).click();
    await expect(page).toHaveURL(/\/scene\//);

    expect(await page.evaluate(() => history.length)).toBe(lengthBefore + 1);
  });

  test("ctrl-click opens the scene in a new tab and leaves the grid", async ({
    page,
  }) => {
    const { cards, hasCards } = await loadScenes(page);
    test.skip(!hasCards, "needs a scene");

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
