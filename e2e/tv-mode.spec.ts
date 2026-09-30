import { type Locator, type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";

/**
 * E2E tests for TV mode's arrow keys (item 50): focus moves to the item
 * nearest in the arrow's direction, measured from the rendered layout, on
 * every page. At 1920 px the scene grid has more CSS columns than the old
 * JavaScript column table assumed.
 *
 * TV mode is a browser preference (localStorage), so the run admin's server
 * state is untouched. The replay library has 361 scenes; a dev-stack library
 * with fewer skips (requireData).
 */

test.use({ viewport: { width: 1920, height: 1080 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("peek-tv-mode", "true");
  });
});

/** The focused element */
const focused = (page: Page) => page.locator(":focus");

/** The centre of an element's box (a focused card is scaled around it) */
async function centre(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("the element has no box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The index of the focused element among the cards, -1 when it is none */
const focusedCardIndex = (cards: Locator) =>
  cards.evaluateAll((els) =>
    els.findIndex((el) => el === document.activeElement)
  );

/** Presses `key` until `reached` holds, at most `max` times */
async function pressUntil(
  page: Page,
  key: string,
  reached: () => Promise<boolean>,
  max: number
): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key);
    if (await reached()) return true;
  }
  return false;
}

/** Opens the scene list at `path` and waits for its cards */
async function openScenes(page: Page, path: string) {
  const list = new ListPage(page);
  await list.goto(path);
  requireData(await list.waitForResults("Scene"), "scenes");
  return { list, cards: list.cards("Scene") };
}

test.describe("TV mode", () => {
  test("Down from the first scene card focuses the card directly below it", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?per_page=24");
    requireData((await cards.count()) >= 12 || null, "12 scenes");

    const first = cards.first();
    await first.focus();
    const from = await centre(first);

    await page.keyboard.press("ArrowDown");
    await expect(focused(page)).toHaveAttribute("aria-label", "Scene");
    const to = await centre(focused(page));
    expect(Math.abs(to.x - from.x)).toBeLessThanOrEqual(2);
    expect(to.y).toBeGreaterThan(from.y);
  });

  test("Down from the last full row reaches the short last row", async ({
    page,
  }) => {
    // 13 cards leave a short last row at any column count but 1 and 13
    const { cards } = await openScenes(page, "/scenes?per_page=13");
    const count = await cards.count();
    requireData(count === 13 || null, "13 scenes");

    // Layout positions: offsetTop ignores the focused card's scale
    const tops = await cards.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).offsetTop)
    );
    const columns = tops.filter((top) => top === tops[0]).length;
    requireData(count % columns !== 0 || null, "a short last row");
    const shortRowStart = count - (count % columns);

    // The last card of the last full row
    await cards.nth(shortRowStart - 1).focus();
    await page.keyboard.press("ArrowDown");
    expect(await focusedCardIndex(cards)).toBeGreaterThanOrEqual(shortRowStart);
  });

  test("Left from the first column focuses a sidebar link; Right returns to the grid", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?per_page=24");

    await cards.first().focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("aside :focus")).toHaveCount(1);

    await page.keyboard.press("ArrowRight");
    await expect(focused(page)).toHaveAttribute("aria-label", "Scene");
  });

  test("typing a two-word search in TV mode keeps the space", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");

    await list.searchInput.focus();
    await page.keyboard.type("two words");
    await expect(list.searchInput).toHaveValue("two words");
  });

  test("on a performer page, arrows reach the tab bar and a tab's cards", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto("/performers?sort=scene_count&dir=DESC");
    requireData(await list.waitForResults("Performer"), "performers");
    await list.cards("Performer").first().locator("a:has(.card-title)").click();
    await expect(page).toHaveURL(/\/performer\//);

    const sceneCards = page.locator('main [aria-label="Scene"]');
    requireData(
      (await sceneCards
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => true)
        .catch(() => false)) || null,
      "a performer with scenes"
    );
    // The active tab marks the tab bar
    const tabBar = page.locator('button[aria-current="page"]').locator("..");

    await sceneCards.first().focus();
    const reachedTabs = await pressUntil(
      page,
      "ArrowUp",
      async () => (await tabBar.locator(":focus").count()) === 1,
      12
    );
    expect(reachedTabs, "Up reaches the tab bar").toBe(true);

    const reachedCards = await pressUntil(
      page,
      "ArrowDown",
      async () => (await focused(page).getAttribute("aria-label")) === "Scene",
      12
    );
    expect(reachedCards, "Down reaches the tab's cards").toBe(true);
  });

  test("on Galleries, arrows move between gallery cards", async ({ page }) => {
    const list = new ListPage(page);
    await list.goto("/galleries");
    requireData(
      (await list.waitForResults("Gallery")) >= 2 || null,
      "two galleries"
    );
    const cards = list.cards("Gallery");

    await cards.first().focus();
    await expect(cards.first()).toBeFocused();
    const from = await centre(cards.first());
    await page.keyboard.press("ArrowRight");
    await expect(focused(page)).toHaveAttribute("aria-label", "Gallery");
    const to = await centre(focused(page));
    expect(to.x).toBeGreaterThan(from.x);
  });

  test("Enter on a focused scene card opens the scene with Next available", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?per_page=24");
    requireData((await cards.count()) >= 2 || null, "two scenes");

    await cards.first().focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/scene\//);
    await expect(page.getByText("Up Next")).toBeVisible({ timeout: 15_000 });
  });

  test("PageDown moves to page 2", async ({ page }) => {
    const { list, cards } = await openScenes(page, "/scenes?per_page=12");
    requireData(await list.nextPage.isEnabled(), "more than one page");

    await cards.first().focus();
    await page.keyboard.press("PageDown");
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  });

  test("an arrow press costs under a frame with 120 cards", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?per_page=120");
    requireData((await cards.count()) >= 120 || null, "120 scenes");

    // Time the whole keydown: the dispatcher, the candidate scan, focus and
    // scroll. Right from the first card, twenty times; performance.now() is
    // coarse, so the mean comes from the total.
    const { total, max } = await cards.first().evaluate((first) => {
      let sum = 0;
      let longest = 0;
      for (let i = 0; i < 20; i++) {
        (first as HTMLElement).focus();
        const event = new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        });
        const start = performance.now();
        first.dispatchEvent(event);
        const took = performance.now() - start;
        sum += took;
        longest = Math.max(longest, took);
      }
      return { total: sum, max: longest };
    });
    const mean = total / 20;
    const summary = `mean ${mean.toFixed(2)} ms, max ${max.toFixed(2)} ms over 20 presses at 120 cards, 1920 px`;
    test.info().annotations.push({ type: "moveFocus", description: summary });
    console.log(`moveFocus: ${summary}`);
    // The focus moved, so the scan ran
    await expect(cards.nth(1)).toBeFocused();
    expect(mean).toBeLessThan(16);
  });
});
