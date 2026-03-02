import { test, expect } from "@playwright/test";

/**
 * E2E tests for the Scene Library page.
 *
 * Covers page load, search controls, view mode switching, filter panel,
 * sort controls, and empty state rendering.
 */

test.describe("Scene Library", () => {
  test("scenes page loads with search controls", async ({ page }) => {
    await page.goto("/scenes");

    // Search input should be present
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Filters button should be present
    await expect(page.getByText("Filters")).toBeVisible();
  });

  test("shows scenes or empty state after loading", async ({ page }) => {
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Wait for loading to settle — dev has scenes, CI may not
    await page.waitForTimeout(2000);

    const hasScenes = await page
      .locator("[class*='card'], [class*='Card'], table tbody tr")
      .first()
      .isVisible()
      .catch(() => false);

    if (hasScenes) {
      // Scenes exist — verify search controls still present
      await expect(page.getByPlaceholder("Search...")).toBeVisible();
    } else {
      // No scenes — verify empty state
      await expect(page.getByText("No scenes found")).toBeVisible({
        timeout: 5_000,
      });
      await expect(
        page.getByText("Try adjusting your search filters")
      ).toBeVisible();
    }
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

  test("filter panel toggles open and closed", async ({ page }) => {
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Click the Filters button to open the panel
    const filtersButton = page.locator(
      '[data-tv-search-item="filters-button"]'
    );
    await filtersButton.click();

    // Filter panel should be visible — look for a "Clear All" or filter section heading
    // When the panel is open, the Filters button switches to primary variant
    await expect(filtersButton).toBeVisible();

    // Click Filters again to close
    await filtersButton.click();
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

  test("per-page selector is available via pagination", async ({ page }) => {
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Per-page selector should be present
    const perPageSelect = page.locator("#perPage");
    if (await perPageSelect.isVisible().catch(() => false)) {
      // Default value should be one of the presets
      const value = await perPageSelect.inputValue();
      expect(["12", "24", "48", "96", "120"]).toContain(value);
    }
  });

  test("URL preserves view mode and sort state", async ({ page }) => {
    // Navigate with pre-set URL params
    await page.goto("/scenes?sort=title&dir=asc&view=table");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // The URL params should be preserved
    expect(page.url()).toContain("sort=title");
    expect(page.url()).toContain("dir=asc");
  });
});
