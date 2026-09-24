import { expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";
import { runPrefix } from "./support/names";

/**
 * E2E tests for search and filter functionality.
 *
 * Covers search input behavior, URL state management,
 * filter panel interactions, and sort controls.
 */

test.describe("Search and Filter", () => {
  test("search query persists in URL across navigation", async ({ page }) => {
    // Type a search query on scenes page
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByPlaceholder("Search...").fill("my search");

    // Wait for URL to update with search param
    await expect(page).toHaveURL(/q=my/, { timeout: 5_000 });

    // Navigate away
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists", exact: true })
    ).toBeVisible({ timeout: 10_000 });

    // Navigate back to scenes with the query param
    await page.goto("/scenes?q=my+search");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Search input should have the query restored
    await expect(page.getByPlaceholder("Search...")).toHaveValue("my search");
  });

  test("a title filter narrows the results and shows a chip", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto("/scenes");
    requireData(await list.waitForResults("Scene"), "scenes");

    // A title no scene has
    await list.openFilters();
    await page.getByPlaceholder("Search title...").fill(`zzzz-${runPrefix()}`);
    await page.getByRole("button", { name: "Apply Filters" }).click();

    await expect(page.getByText("No scenes found")).toBeVisible({
      timeout: 15_000,
    });
    await expect(list.cards("Scene")).toHaveCount(0);
    const chip = page.getByRole("button", { name: /^Remove filter:/ });
    await expect(chip).toHaveCount(1);

    // Removing the chip removes the filter
    await chip.click();
    await expect(list.cards("Scene").first()).toBeVisible({ timeout: 15_000 });
    await expect(chip).toHaveCount(0);
  });

  test("sort direction toggles between ascending and descending", async ({
    page,
  }) => {
    await page.goto("/scenes");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const sortDirection = page.locator(
      '[data-tv-search-item="sort-direction"]'
    );
    await expect(sortDirection).toBeVisible();

    // Click to toggle sort direction
    await sortDirection.click();

    // URL should update with dir param (asc/desc toggle)
    await expect(page).toHaveURL(/dir=/, { timeout: 5_000 });

    // Button should still be visible after interaction
    await expect(sortDirection).toBeVisible();
  });

  test("performer page has search controls", async ({ page }) => {
    await page.goto("/performers");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Sort control should be present
    await expect(
      page.locator('[data-tv-search-item="sort-control"]')
    ).toBeVisible();

    // View mode toggle should be present
    await expect(page.locator('button[aria-label*="View mode"]')).toBeVisible();
  });

  test("gallery page has search controls", async ({ page }) => {
    await page.goto("/galleries");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("tags page has search controls", async ({ page }) => {
    await page.goto("/tags");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("studios page has search controls", async ({ page }) => {
    await page.goto("/studios");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });
  });
});
