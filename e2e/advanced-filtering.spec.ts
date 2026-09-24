import { expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";

/**
 * E2E tests for the filter panel and for combining search with sort and view
 * mode in the URL.
 */

test.describe("Advanced Filtering", () => {
  test("the filter panel opens and closes", async ({ page }) => {
    const list = new ListPage(page);
    await list.goto("/scenes");
    const applyFilters = page.getByRole("button", { name: "Apply Filters" });

    // Filters toggles the panel open and closed
    await list.openFilters();
    await expect(applyFilters).toBeVisible();
    await list.filtersButton.click();
    await expect(applyFilters).toHaveCount(0);

    // Cancel closes it too
    await list.openFilters();
    await expect(applyFilters).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(applyFilters).toHaveCount(0);
  });

  test("search and filter combined maintain URL state", async ({ page }) => {
    const list = new ListPage(page);
    await list.goto("/scenes?q=test&sort=title&dir=asc");

    // Both should be preserved
    expect(page.url()).toContain("q=test");
    expect(page.url()).toContain("sort=title");
    expect(page.url()).toContain("dir=asc");

    // Search input should show the query
    await expect(list.searchInput).toHaveValue("test");
  });

  test("changing sort preserves search query", async ({ page }) => {
    const list = new ListPage(page);
    await list.goto("/scenes?q=filter-test");

    // The page does not write the URL on load, so dir= appears only once the
    // click has been applied
    await list.toggleSortDirection();
    await expect(page).toHaveURL(/[?&]dir=/);
    expect(new URL(page.url()).searchParams.get("q")).toBe("filter-test");
  });

  test("the performers filter panel lists its own filters", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto("/performers");

    await list.openFilters();
    await expect(
      page.getByRole("button", { name: "Apply Filters" })
    ).toBeVisible();
    await expect(page.locator("label", { hasText: /^Gender$/ })).toBeVisible();
  });

  test("the tags filter panel lists its own filters", async ({ page }) => {
    const list = new ListPage(page);
    await list.goto("/tags");

    await list.openFilters();
    await expect(
      page.getByRole("button", { name: "Apply Filters" })
    ).toBeVisible();
    // A tag filter the scene panel does not have
    await expect(
      page.locator("label", { hasText: /^Description Search$/ })
    ).toBeVisible();
  });

  test("view mode persists in URL across filter changes", async ({ page }) => {
    const list = new ListPage(page);
    await list.goto("/scenes?view=table");

    await list.searchInput.fill("preserve-view");

    await expect(page).toHaveURL(/[?&]q=preserve-view(&|$)/);
    expect(new URL(page.url()).searchParams.get("view")).toBe("table");
    await expect(
      page.locator('button[aria-label="View mode: Table view"]')
    ).toBeVisible();
  });

  test("clearing the search on the galleries page removes it from the URL", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto("/galleries?q=clear-test");
    await expect(list.searchInput).toHaveValue("clear-test");

    await list.clearSearch();

    // After the debounce, the URL has no q
    await page.waitForURL((url) => !url.searchParams.has("q"), {
      timeout: 5_000,
    });
    await expect(list.searchInput).toHaveValue("");
  });
});
