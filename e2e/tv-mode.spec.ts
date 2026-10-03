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
    await list.goto("/performers?sort=scenes_count&dir=DESC");
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

  test("on a performer page, Up from the first card passes the tab's controls before the tab bar", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto("/performers?sort=scenes_count&dir=DESC");
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
    const tabBar = page.locator('button[aria-current="page"]').locator("..");
    requireData(
      (await tabBar.locator("button").count()) >= 2 || null,
      "a performer with two tabs"
    );

    await sceneCards.first().focus();
    // Each Up stops on the tab's controls or pager (between the tab bar and
    // the cards) until it reaches the tab bar, never above it first. Boxes
    // are measured together at each stop, since focus scrolls the page.
    const stops: string[] = [];
    let reachedTabs = false;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("ArrowUp");
      reachedTabs = (await tabBar.locator(":focus").count()) === 1;
      if (reachedTabs) break;
      const [bar, stop, card] = await Promise.all([
        tabBar.boundingBox(),
        focused(page).boundingBox(),
        sceneCards.first().boundingBox(),
      ]);
      if (!bar || !stop || !card) throw new Error("an element has no box");
      const label = await focused(page).evaluate(
        (el) => el.getAttribute("aria-label") ?? el.textContent ?? el.tagName
      );
      stops.push(label);
      expect(
        stop.y,
        `stop ${i + 1} (${label}) lies below the tab bar`
      ).toBeGreaterThanOrEqual(bar.y + bar.height);
      expect(
        stop.y + stop.height,
        `stop ${i + 1} (${label}) lies above the cards`
      ).toBeLessThanOrEqual(card.y);
    }
    expect(reachedTabs, "Up reaches the tab bar").toBe(true);
    expect(
      stops.length,
      "the controls come before the tab bar"
    ).toBeGreaterThan(0);
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

  test("the tag hierarchy takes focus; arrows move through it, up to its controls and left to the sidebar", async ({
    page,
  }) => {
    await page.goto("/tags?view=hierarchy");
    const tree = page.getByRole("tree", { name: "Tag hierarchy" });
    const rows = tree.getByRole("treeitem");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    requireData((await rows.count()) >= 2 || null, "two tags");

    // The first row takes the page's first focus
    await expect(rows.first()).toBeFocused();

    // Down moves real focus with the highlight
    await page.keyboard.press("ArrowDown");
    await expect(rows.nth(1)).toBeFocused();
    await expect(rows.nth(1)).toHaveAttribute("aria-selected", "true");

    // Up to the first row, then out of the tree to the controls above it
    await page.keyboard.press("ArrowUp");
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(page.locator("main :focus")).toHaveCount(1);
    await expect(tree.locator(":focus")).toHaveCount(0);

    // Down from the controls enters the tree at its first row
    await page.keyboard.press("ArrowDown");
    await expect(rows.first()).toBeFocused();

    // Left on a root closes it when open, then reaches the sidebar
    if ((await rows.first().getAttribute("aria-expanded")) === "true") {
      await page.keyboard.press("ArrowLeft");
      await expect(rows.first()).toHaveAttribute("aria-expanded", "false");
      await expect(rows.first()).toBeFocused();
    }
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator("aside :focus")).toHaveCount(1);
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

  test("Enter on a similar scene card opens that scene with focus in its player", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?per_page=24");
    await cards.first().focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/scene\//);

    /** Whether focus is inside the player */
    const inPlayer = () =>
      page.evaluate(
        () => document.activeElement?.closest(".video-js") !== null
      );
    await expect.poll(inPlayer, { timeout: 15_000 }).toBe(true);

    // The Similar Scenes tab's cards, not the sidebar's
    const similar = page.locator('main [aria-label="Scene"]:not(aside *)');
    requireData(
      await similar
        .first()
        .waitFor({ timeout: 15_000 })
        .then(
          () => true,
          () => null
        ),
      "a similar scene"
    );
    const from = page.url();
    const card = similar.first();
    await card.focus();
    await expect(card).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(from);

    // The new scene's player takes focus from the card that opened it
    await expect.poll(inPlayer, { timeout: 15_000 }).toBe(true);
  });

  test("PageDown moves to page 2", async ({ page }) => {
    const { list, cards } = await openScenes(page, "/scenes?per_page=12");
    requireData(await list.nextPage.isEnabled(), "more than one page");

    await cards.first().focus();
    await page.keyboard.press("PageDown");
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  });

  test("arrows reach the sort select and leave it without changing its value", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");
    const select = list.sortControl.locator("select");
    const before = await select.inputValue();
    const url = page.url();

    // The sort direction button sits right of the select
    await list.sortDirection.locator("button").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(select).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(select).not.toBeFocused();
    await expect(select).toHaveValue(before);
    expect(page.url()).toBe(url);
  });

  test("with the D-pad, open Filters, open Tags, pick a tag and apply", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");
    const tagCondition = page.locator("#filter-tagIds");
    const tagPicker = page.getByRole("button", { name: /^Tags/ });

    // Enter on the Filters button opens the panel
    await list.filtersButton.locator("button").focus();
    await page.keyboard.press("Enter");
    await expect(tagCondition).toBeVisible();

    // Down reaches the panel's first section header; Down from there walks
    // the first column: Title, the Tags condition, then the Tags picker,
    // whose right neighbour is the Performer Tags picker (the arrows move by
    // position)
    const sectionHeader = page.getByRole("button", { name: "Common Filters" });
    const reachedHeader = await pressUntil(
      page,
      "ArrowDown",
      () => sectionHeader.evaluate((el) => el === document.activeElement),
      10
    );
    expect(reachedHeader, "Down reaches the panel's section header").toBe(true);
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#filter-title")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(tagCondition).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(tagPicker).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(
      page.getByRole("button", { name: /^Performer Tags/ })
    ).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(tagPicker).toBeFocused();

    // Enter opens the list with focus in its search box; Down reaches an option
    await page.keyboard.press("Enter");
    await expect(page.getByPlaceholder("Type to search...")).toBeFocused();
    await expect(tagPicker).toHaveAttribute("aria-expanded", "true");
    const dropdown = page
      .getByPlaceholder("Type to search...")
      .locator("xpath=ancestor::div[contains(@class, 'absolute')]");
    await expect(dropdown.getByRole("button").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("ArrowDown");
    const option = focused(page);
    await expect(option).toHaveAttribute("aria-pressed", "false");
    const tagName = (await option.innerText()).trim();
    await page.keyboard.press("Enter");
    await expect(option).toHaveAttribute("aria-pressed", "true");

    // Escape closes the list, not the panel, and returns focus to the picker
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Type to search...")).toHaveCount(0);
    await expect(tagPicker).toBeFocused();
    await expect(tagCondition).toBeVisible();

    // Down to the panel's buttons, then Apply
    const apply = page.getByRole("button", { name: "Apply Filters" });
    const reachedButtons = await pressUntil(
      page,
      "ArrowDown",
      async () =>
        ["Cancel", "Apply Filters"].includes(
          await focused(page).evaluate((el) => el.textContent?.trim() ?? "")
        ),
      40
    );
    expect(reachedButtons, "arrows reach the panel's buttons").toBe(true);
    if (!(await apply.evaluate((el) => el === document.activeElement))) {
      await page.keyboard.press("ArrowRight");
    }
    await expect(apply).toBeFocused();
    await page.keyboard.press("Enter");

    // The filter is applied, and its chip names the tag
    await expect(page).toHaveURL(/[?&]tagIds=/);
    await expect(
      page.getByRole("button", { name: /^Edit filter: Tags/ })
    ).toContainText(tagName);
  });

  test("Right crosses the number fields of a filter row to the Orientation boxes; Space and Enter (a remote's OK) tick them", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");
    await list.filtersButton.locator("button").focus();
    await page.keyboard.press("Enter");
    const section = page.getByRole("button", {
      name: "Video Properties",
      exact: true,
    });
    await section.focus();
    if ((await section.getAttribute("aria-expanded")) === "false") {
      await page.keyboard.press("Enter");
    }

    // Resolution, then Bitrate's Min and Max, Frame Rate's Min and Max:
    // an empty number field hands Left and Right on
    await page.keyboard.press("ArrowDown");
    await expect(page.locator("#filter-resolution")).toBeFocused();
    const landscape = page.getByRole("checkbox", { name: "Landscape" });
    const reached = await pressUntil(
      page,
      "ArrowRight",
      () => landscape.evaluate((el) => el === document.activeElement),
      6
    );
    expect(reached, "Right reaches the Orientation boxes").toBe(true);
    await page.keyboard.press("Space");
    await expect(landscape).toBeChecked();

    const portrait = page.getByRole("checkbox", { name: "Portrait" });
    await page.keyboard.press("ArrowDown");
    await expect(portrait).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(portrait).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(portrait).not.toBeChecked();
    await expect(portrait).toBeFocused();
  });

  test("Up and Down leave a range slider; Left and Right change it", async ({
    page,
  }) => {
    // Minimum Play Percent: a range input, saved only by the tab's Save
    await page.goto("/settings?section=user&tab=playback");
    const range = page.locator("#minimumPlayPercent");
    await expect(range).toBeVisible({ timeout: 10_000 });
    const before = Number(await range.inputValue());

    await range.focus();
    await page.keyboard.press(before >= 100 ? "ArrowLeft" : "ArrowRight");
    const changed = Number(await range.inputValue());
    expect(changed).not.toBe(before);
    await expect(range).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(range).not.toBeFocused();
    await expect(range).toHaveValue(String(changed));

    await range.focus();
    await page.keyboard.press("ArrowUp");
    await expect(range).not.toBeFocused();
    await expect(range).toHaveValue(String(changed));
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
