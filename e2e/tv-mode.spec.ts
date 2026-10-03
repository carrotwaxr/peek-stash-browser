import {
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import { requireData } from "./support/data";
import { rowOf } from "./support/filterRows";
import { uniqueName } from "./support/names";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";

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

/** Focuses `target` with `key` (checked before each press), at most `max` presses */
async function reach(
  page: Page,
  key: string,
  target: Locator,
  max: number
): Promise<boolean> {
  const there = () => target.evaluate((el) => el === document.activeElement);
  if (await there()) return true;
  return pressUntil(page, key, there, max);
}

/**
 * From the sheet's focused + Filter: OK opens its menu, the field's name is
 * typed and OK picks it (a new row, focus in it)
 */
async function pickInSheet(page: Page, label: string) {
  await page.keyboard.press("Enter");
  const find = page.getByRole("combobox", { name: "Find a filter" });
  await expect(find).toBeFocused();
  await page.keyboard.type(label);
  await expect(
    page
      .getByRole("listbox", { name: "Filters" })
      .getByRole("option", { name: label, exact: true })
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(find).toHaveCount(0);
}

/**
 * A throwaway user in TV mode on a 1920 px page, for a test that changes
 * per-user state (pins, Views)
 */
async function tvUser(
  browser: Browser,
  baseURL: string | undefined,
  request: APIRequestContext,
  purpose: string
) {
  const user = await createUser(request, purpose);
  const context = await signIn(browser, baseURL, user);
  await completeSetup(context);
  await context.addInitScript(() => {
    localStorage.setItem("peek-tv-mode", "true");
  });
  const page = await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  return { user, context, page };
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

  test("the view-mode menu opens with OK and the D-pad picks Wall", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");

    await list.viewModeButton.focus();
    await page.keyboard.press("Enter");
    // Focus is on the current mode (Grid), inside the menu
    await expect(page.getByRole("option", { name: "Grid view" })).toBeFocused();

    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option", { name: "Wall view" })).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/[?&]view=wall(&|$)/);
    await expect(list.viewModeButton).toBeFocused();
  });

  test("`/` focuses the search box, and Down from it lands on the first pin", async ({
    page,
  }) => {
    const { list, cards } = await openScenes(page, "/scenes");

    await cards.first().focus();
    await page.keyboard.press("/");
    await expect(list.searchInput).toBeFocused();
    await expect(list.searchInput).toHaveValue("");

    await page.keyboard.press("ArrowDown");
    const first = list.filterBar.locator("button").first();
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute("aria-pressed", /true|false/);
  });

  test("with the D-pad, the pinned Tags chip opens the sheet at Tags; pick a tag; Show N applies", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");

    // Enter on the pinned field's empty chip opens the sheet at its row
    const chip = page.getByRole("button", {
      name: "Edit filter: Tags",
      exact: true,
    });
    await chip.focus();
    await page.keyboard.press("Enter");
    await expect(list.sheet).toBeVisible();
    const row = list.sheetRow("Tags");
    await expect(row.locator(":focus")).toHaveCount(1);

    // Down to the picker; Enter opens its list, already holding a page of
    // tags, so nothing need be typed
    const picker = row.getByRole("button", { name: /^Tags: Select tags/ });
    expect(
      await reach(page, "ArrowDown", picker, 3),
      "Down reaches the picker"
    ).toBe(true);
    await page.keyboard.press("Enter");
    const search = row.getByPlaceholder("Type to search...");
    await expect(search).toBeFocused();
    const dropdown = search.locator(
      "xpath=ancestor::div[contains(@class, 'absolute')][1]"
    );
    await expect(dropdown.getByRole("button").first()).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press("ArrowDown");
    const option = focused(page);
    await expect(option).toHaveAttribute("aria-pressed", "false");
    const tagName = (await option.innerText()).trim();
    await page.keyboard.press("Enter");
    await expect(option).toHaveAttribute("aria-pressed", "true");
    // Nothing applies before Show N
    expect(page.url()).not.toMatch(/[?&]tagIds=/);

    // Escape closes the list, back on the picker, inside the sheet
    await page.keyboard.press("Escape");
    await expect(search).toHaveCount(0);
    await expect(list.sheet).toBeVisible();
    await expect(row.getByRole("button", { name: /^Tags: / })).toBeFocused();

    // Down reaches Show N results; OK applies and closes the sheet
    await expect(list.showResults).toBeVisible({ timeout: 15_000 });
    expect(
      await reach(page, "ArrowDown", list.showResults, 6),
      "Down reaches Show N results"
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(list.sheet).toHaveCount(0);
    await expect(page).toHaveURL(/[?&]tagIds=/);
    await expect(
      page.getByRole("button", { name: /^Edit filter: Tags: / })
    ).toContainText(tagName);
  });

  test("in the sheet, Right crosses a number range's Min and Max; Space and Enter (a remote's OK) tick an Orientation box", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");

    // "Filters" opens the sheet; Down reaches its + Filter
    await list.filtersButton.focus();
    await page.keyboard.press("Enter");
    await expect(list.sheet).toBeVisible();
    const add = list.sheet.getByRole("button", { name: "Add filter" });
    expect(
      await reach(page, "ArrowDown", add, 12),
      "Down reaches + Filter"
    ).toBe(true);

    // An empty number field hands Left and Right on
    await pickInSheet(page, "Bitrate (Mbps)");
    const bitrate = list.sheetRow("Bitrate (Mbps)");
    const min = bitrate.getByPlaceholder("Min");
    const max = bitrate.getByPlaceholder("Max");
    await expect(min).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await expect(max).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(min).toBeFocused();

    // Down from the row reaches + Filter again; the Orientation row opens on
    // its first box
    expect(
      await reach(page, "ArrowDown", add, 4),
      "Down reaches + Filter"
    ).toBe(true);
    await pickInSheet(page, "Orientation");
    const orientation = list.sheetRow("Orientation");
    const landscape = orientation.getByRole("checkbox", { name: "Landscape" });
    await expect(landscape).toBeFocused();
    await page.keyboard.press("Space");
    await expect(landscape).toBeChecked();

    // Down reaches the next box; Enter ticks and unticks it
    const portrait = orientation.getByRole("checkbox", { name: "Portrait" });
    await page.keyboard.press("ArrowDown");
    await expect(portrait).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(portrait).toBeChecked();
    await page.keyboard.press("Enter");
    await expect(portrait).not.toBeChecked();
    await expect(portrait).toBeFocused();

    // Show N applies the box ticked, not the empty range
    expect(
      await reach(page, "ArrowDown", list.showResults, 8),
      "Down reaches Show N results"
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/[?&]orientation=LANDSCAPE(&|$)/);
    expect(page.url()).not.toMatch(/[?&]bitrate/i);
  });

  test("`f` opens the sheet at + Filter, and the D-pad stays inside its open menu", async ({
    page,
  }) => {
    const { list, cards } = await openScenes(page, "/scenes");

    await cards.first().focus();
    await page.keyboard.press("f");
    await expect(list.sheet).toBeVisible();
    const add = list.sheet.getByRole("button", { name: "Add filter" });
    await expect(add).toBeFocused();

    // The menu over the sheet: Up from its search box has nowhere to go
    // inside it, so focus stays, never on the rows behind
    await page.keyboard.press("Enter");
    const find = page.getByRole("combobox", { name: "Find a filter" });
    await expect(find).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(find).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(find).toBeFocused();

    // Down into the fields and back; Escape closes the menu onto + Filter
    await page.keyboard.press("ArrowDown");
    const fields = page.getByRole("listbox", { name: "Filters" });
    await expect(fields.getByRole("option").first()).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(find).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(find).toHaveCount(0);
    await expect(add).toBeFocused();
    await expect(list.sheet).toBeVisible();
  });

  test("a pinned filter toggles with OK and the list follows", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");

    // The seeded Unwatched pin, reached along the chip row
    const unwatched = list.filterBar.getByRole("button", {
      name: "Unwatched",
      exact: true,
    });
    await expect(unwatched).toHaveAttribute("aria-pressed", "false");
    await list.searchInput.focus();
    await page.keyboard.press("ArrowDown");
    expect(
      await reach(page, "ArrowRight", unwatched, 6),
      "Right reaches Unwatched"
    ).toBe(true);

    const filtered = page.waitForRequest(
      (request) =>
        request.url().endsWith("/api/library/scenes") &&
        request.method() === "POST" &&
        JSON.stringify(request.postDataJSON()).includes('"watched"')
    );
    await page.keyboard.press("Enter");
    await filtered;
    await expect(page).toHaveURL(/[?&]watched=false(&|$)/);
    await expect(unwatched).toHaveAttribute("aria-pressed", "true");
    await expect(unwatched).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page).not.toHaveURL(/[?&]watched=/);
    await expect(unwatched).toHaveAttribute("aria-pressed", "false");
  });

  test("pin Studios from the sheet by D-pad", async ({
    browser,
    baseURL,
    request,
  }) => {
    // Pins are per-user state: a throwaway user of its own
    const { context, page, user } = await tvUser(
      browser,
      baseURL,
      request,
      "tv-pin"
    );
    try {
      const { list } = await openScenes(page, "/scenes");
      const studios = page.getByRole("button", {
        name: "Edit filter: Studios",
        exact: true,
      });
      await expect(studios).toHaveCount(0);

      // + Filter in the bar opens the sheet at its + Filter; pick Studios
      await list.addFilterButton.focus();
      await page.keyboard.press("Enter");
      await expect(list.sheet).toBeVisible();
      await expect(
        list.sheet.getByRole("button", { name: "Add filter" })
      ).toBeFocused();
      await pickInSheet(page, "Studios");
      const row = list.sheetRow("Studios");
      await expect(row.locator(":focus")).toHaveCount(1);

      // Up to the row's header: Pin, then OK
      const pin = row.getByRole("button", { name: "Pin Studios" });
      await page.keyboard.press("ArrowUp");
      expect(
        (await reach(page, "ArrowLeft", pin, 3)) ||
          (await reach(page, "ArrowRight", pin, 3)),
        "Up, then along the header, reaches Pin"
      ).toBe(true);
      await page.keyboard.press("Enter");
      await expect(
        row.getByRole("button", { name: "Unpin Studios" })
      ).toBeVisible();

      // Closed, the pinned chip sits with the pinned fields, before every
      // other chip and the row's buttons
      await page.keyboard.press("Escape");
      await expect(list.sheet).toHaveCount(0);
      await expect(studios).toBeVisible();
      const names = await list.filterBar
        .locator("button")
        .evaluateAll((els) =>
          els.map((el) => el.getAttribute("aria-label") ?? el.textContent)
        );
      const at = names.indexOf("Edit filter: Studios");
      expect(at).toBeGreaterThan(0);
      expect(
        names.slice(0, at).every((name) => !/^Filters/.test(name ?? ""))
      ).toBe(true);
      expect(
        names.findIndex((name) => /^Filters/.test(name ?? ""))
      ).toBeGreaterThan(at);

      // Still pinned after a reload
      await page.reload();
      await expect(studios).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
      await deleteUser(request, user.id);
    }
  });

  test("the Views menu opens with OK and a view loads", async ({
    browser,
    baseURL,
    request,
  }) => {
    // Views are per-user state: a throwaway user of its own
    const { context, page, user } = await tvUser(
      browser,
      baseURL,
      request,
      "tv-views"
    );
    try {
      const name = uniqueName("by title");
      const saved = await mustOk(
        await context.request.post("/api/user/filter-presets", {
          data: {
            artifactType: "scene",
            context: "scene",
            name,
            filters: {},
            sort: "title",
            direction: "ASC",
            viewMode: "grid",
            zoomLevel: "medium",
            gridDensity: "medium",
            tableColumns: null,
            perPage: 24,
            setAsDefault: false,
          },
        }),
        "Saving a scene View"
      );
      const { preset } = (await saved.json()) as { preset: { id: string } };

      const { list } = await openScenes(page, "/scenes");
      await list.viewsButton.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Views" });
      await expect(dialog).toBeVisible();
      const view = dialog.getByRole("button", { name });
      await expect(view).toBeFocused();

      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(
        new RegExp(`[?&]savedView=${preset.id}(&|$)`)
      );
      await expect(page).toHaveURL(/[?&]sort=title(&|$)/);
      await expect(list.viewsButton).toHaveAccessibleName(`Views: ${name}`);
      await expect(list.viewsButton).toBeFocused();
    } finally {
      await context.close();
      await deleteUser(request, user.id);
    }
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
  test("with the D-pad, open Advanced, add a group, pick a field and Apply", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes");

    // Along the chip row from + Filter: Advanced is the next button
    await list.addFilterButton.focus();
    expect(
      await reach(page, "ArrowRight", list.advancedButton, 4),
      "Right reaches Advanced"
    ).toBe(true);
    await page.keyboard.press("Enter");
    const dialog = list.advancedDialog;
    await expect(dialog).toBeVisible();

    // Down to the top level's waiting row; OK opens its field select, Down
    // picks the first field (Title Search) and OK takes it: a row, with focus
    // in its value
    const waiting = dialog.getByLabel("Add a filter to top level", {
      exact: true,
    });
    expect(
      await reach(page, "ArrowDown", waiting, 6),
      "Down reaches the field select"
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(waiting).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const fieldId = await dialog
      .locator('select[id$="-field"]')
      .first()
      .getAttribute("id");
    const row = rowOf(dialog, requireData(fieldId, "the new row's field"));
    await expect(row.field).toHaveValue("title");
    await expect(row.value).toBeFocused();

    // Every control of the row is reachable along it (Title Search takes no
    // condition), and back to the value
    expect(
      await reach(page, "ArrowLeft", row.field, 3),
      "Left reaches the field"
    ).toBe(true);
    expect(
      await reach(page, "ArrowRight", row.actions, 6),
      "Right reaches Row actions"
    ).toBe(true);
    expect(
      await reach(page, "ArrowLeft", row.value, 3),
      "Left returns to the value"
    ).toBe(true);
    await page.keyboard.type("zz");
    await expect(row.value).toHaveValue("zz");

    // Down to Add group; OK adds Group 1 with focus in its Match select
    const addGroup = dialog.getByRole("button", { name: "Add group" });
    expect(
      await reach(page, "ArrowDown", addGroup, 6),
      "Down reaches Add group"
    ).toBe(true);
    await page.keyboard.press("Enter");
    const group = dialog.getByRole("group", { name: "Group 1" });
    await expect(group).toBeVisible();
    const match = group.getByLabel("Match for Group 1");
    await expect(match).toBeFocused();

    // Every control of the group: Match, Remove group, its waiting row
    const removeGroup = group.getByRole("button", { name: "Remove group" });
    expect(
      await reach(page, "ArrowRight", removeGroup, 3),
      "Right reaches Remove group"
    ).toBe(true);
    const groupWaiting = group.getByLabel("Add a filter to Group 1", {
      exact: true,
    });
    expect(
      await reach(page, "ArrowDown", groupWaiting, 3),
      "Down reaches the group's field select"
    ).toBe(true);

    // Up to the row's Row actions: OK opens the menu, Down to "Move to group
    // 1", OK moves the row into the group
    expect(
      await reach(page, "ArrowUp", row.field, 10),
      "Up reaches the row"
    ).toBe(true);
    expect(
      await reach(page, "ArrowRight", row.actions, 6),
      "Right reaches Row actions"
    ).toBe(true);
    await page.keyboard.press("Enter");
    const moveTo = page.getByRole("menuitem", { name: "Move to group 1" });
    await expect(moveTo).toBeVisible();
    expect(
      await reach(page, "ArrowDown", moveTo, 3),
      "Down reaches Move to group 1"
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(group.locator(`[id="${fieldId}"]`)).toHaveCount(1);
    await expect(row.field).toBeFocused();

    // Down to the footer: Cancel, then Right to Apply, and OK applies
    const cancel = dialog.getByRole("button", { name: "Cancel" });
    const apply = dialog.getByRole("button", { name: "Apply" });
    expect(
      await reach(page, "ArrowDown", cancel, 12),
      "Down reaches Cancel"
    ).toBe(true);
    expect(
      await reach(page, "ArrowRight", apply, 2),
      "Right reaches Apply"
    ).toBe(true);
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);

    // The group is in the URL, with the row in it
    const params = new URL(page.url()).searchParams;
    expect(params.get("g1")).toBe("all");
    expect(params.get("g1.title")).toBe("zz");
    expect(params.get("title")).toBeNull();
    await expect(
      page.getByRole("button", { name: /^Edit filter group/ })
    ).toBeVisible();
  });
});
