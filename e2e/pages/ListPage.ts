import { Page, Locator, expect } from "@playwright/test";

/**
 * Shared page object for all library list pages
 * (scenes, performers, studios, tags, galleries, collections, images).
 */
export class ListPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly filtersButton: Locator;
  readonly sortControl: Locator;
  readonly sortDirection: Locator;
  readonly viewModeButton: Locator;
  readonly perPageSelect: Locator;
  readonly paginationNext: Locator;
  readonly paginationPrev: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByPlaceholder("Search...");
    this.filtersButton = page.locator('[data-tv-search-item="filters-button"]');
    this.sortControl = page.locator('[data-tv-search-item="sort-control"]');
    this.sortDirection = page.locator(
      '[data-tv-search-item="sort-direction"]'
    );
    this.viewModeButton = page.locator('button[aria-label*="View mode"]');
    this.perPageSelect = page.locator("#perPage");
    this.paginationNext = page.locator('button[aria-label="Next page"]');
    this.paginationPrev = page.locator('button[aria-label="Previous page"]');
  }

  async goto(path: string) {
    await this.page.goto(path);
    await expect(this.searchInput).toBeVisible({ timeout: 10_000 });
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await expect(this.page).toHaveURL(
      new RegExp(`q=${encodeURIComponent(query).replace(/\+/g, "\\+")}`),
      { timeout: 5_000 }
    );
  }

  async clearSearch() {
    await this.searchInput.clear();
  }

  async openFilters() {
    await this.filtersButton.click();
  }

  async toggleSortDirection() {
    await this.sortDirection.click();
  }

  async hasCards(): Promise<boolean> {
    return this.page
      .locator("[class*='card'], [class*='Card'], table tbody tr")
      .first()
      .isVisible()
      .catch(() => false);
  }

  async getPageHeading(): Promise<string> {
    const heading = this.page.getByRole("heading", { level: 1 }).first();
    return (await heading.textContent()) ?? "";
  }
}
