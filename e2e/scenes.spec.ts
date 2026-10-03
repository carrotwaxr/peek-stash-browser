import { expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";

/**
 * E2E tests for the Scene Library page.
 *
 * Covers page load, the scene grid, search controls, view mode switching,
 * and sort controls. The filter panel is in advanced-filtering.spec.ts,
 * pagination in pagination.spec.ts, and empty results in
 * list-navigation.spec.ts.
 */

test.describe("Scene Library", () => {
  test("scenes page loads with search controls", async ({ page }) => {
    await page.goto("/scenes");

    // Search input should be present
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // + Filter should be present
    await expect(
      page.getByRole("button", { name: "Add filter" })
    ).toBeVisible();
  });

  test("the scene grid shows cards", async ({ page }) => {
    const list = new ListPage(page);
    await list.goto("/scenes");
    requireData(await list.waitForResults("Scene"), "scenes");
  });

  test("search input accepts text and updates URL", async ({ page }) => {
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Type a search query
    await page.getByPlaceholder("Search...").fill("test query");

    // Wait for debounce (300ms) and URL update
    await expect(page).toHaveURL(/q=test/, { timeout: 5_000 });
  });

  test("search clear button removes query", async ({ page }) => {
    // Navigate with a pre-set query
    await page.goto("/scenes?q=existing");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // The search input should have the query value
    await expect(page.getByPlaceholder("Search...")).toHaveValue("existing");

    // Clear the search using the clear button (X icon next to input)
    // The clear button appears when there's text in the input
    const clearButton = page.locator(
      '[data-tv-search-item="search-input"] button'
    );
    if (await clearButton.isVisible().catch(() => false)) {
      await clearButton.click();
      // URL should no longer have the q param
      await expect(page).not.toHaveURL(/q=existing/, { timeout: 5_000 });
    }
  });

  test("view mode toggle switches between views", async ({ page }) => {
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Open the view mode dropdown
    const viewModeButton = page.locator('button[aria-label*="View mode"]');
    await expect(viewModeButton).toBeVisible();
    await viewModeButton.click();

    // The dropdown should appear with view options
    const viewModeMenu = page.locator('[role="listbox"]');
    await expect(viewModeMenu).toBeVisible();

    // Should have multiple view options
    const options = viewModeMenu.locator('[role="option"]');
    await expect(options).toHaveCount(5); // grid, wall, table, timeline, folder

    // Switch to Table view
    await options.filter({ hasText: "Table" }).click();

    // The dropdown should close
    await expect(viewModeMenu).not.toBeVisible();

    // The view mode button label should update
    await expect(
      page.locator('button[aria-label="View mode: Table view"]')
    ).toBeVisible();
  });

  test("sort controls are accessible", async ({ page }) => {
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Sort control should be present
    const sortControl = page.locator('[data-tv-search-item="sort-control"]');
    await expect(sortControl).toBeVisible();

    // Sort direction toggle should be present
    const sortDirection = page.locator(
      '[data-tv-search-item="sort-direction"]'
    );
    await expect(sortDirection).toBeVisible();

    // Click sort direction to toggle
    await sortDirection.click();
  });

  test("view mode and sort are restored from the URL", async ({ page }) => {
    // The URL as the app writes it: the direction in capitals
    const list = new ListPage(page);
    await list.goto("/scenes?sort=title&dir=ASC&view=table");

    await expect(
      page.locator('button[aria-label="View mode: Table view"]')
    ).toBeVisible();
    // Sorted by Title, ascending (the direction button shows an up arrow)
    await expect(list.sortControl.locator("select")).toHaveValue("title");
    await expect(list.sortControl.locator("select option:checked")).toHaveText(
      "Title"
    );
    await expect(
      list.sortDirection.locator("svg.lucide-arrow-up")
    ).toBeVisible();
  });
});

test.describe("Scene page", () => {
  interface FoundScenes {
    findScenes: { scenes: Array<{ id: string; instanceId: string }> };
  }

  test("a scene page requests similar scenes once", async ({ page }) => {
    const found = await page.request.post("/api/library/scenes", {
      data: { filter: { per_page: 1 } },
    });
    expect(found.ok(), await found.text()).toBeTruthy();
    const scene = requireData(
      ((await found.json()) as FoundScenes).findScenes.scenes[0],
      "scenes"
    );
    const url = `/scene/${scene.id}?instance=${encodeURIComponent(scene.instanceId)}`;

    // Desktop mounts the Recommended sidebar beside the Similar Scenes tab;
    // mobile has the tab alone. Each layout asks for page 1 once.
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      let similarRequests = 0;
      const count = (request: { url(): string }) => {
        if (request.url().includes("/similar?")) similarRequests += 1;
      };
      page.on("request", count);
      const firstResponse = page.waitForResponse((r) =>
        r.url().includes("/similar?")
      );
      await page.goto(url);
      await firstResponse;
      await expect(
        page.getByRole("button", { name: /^Similar Scenes/ })
      ).toBeVisible({ timeout: 10_000 });
      // A second request, if any, follows the first within the same render
      await page.waitForTimeout(1_000);
      page.off("request", count);

      expect(similarRequests, `at ${viewport.width}px`).toBe(1);
    }
  });
});
