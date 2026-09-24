import { type Locator, type Page, expect } from "@playwright/test";

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
  // The pagination bar shows above and below the grid, so its controls
  // (and the #perPage id) appear twice: these take the bottom one
  readonly perPage: Locator;
  readonly nextPage: Locator;
  readonly previousPage: Locator;
  /** "No scenes found" and the like, when nothing matches */
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;
    this.searchInput = page.getByPlaceholder("Search...");
    this.filtersButton = page.locator('[data-tv-search-item="filters-button"]');
    this.sortControl = page.locator('[data-tv-search-item="sort-control"]');
    this.sortDirection = page.locator('[data-tv-search-item="sort-direction"]');
    this.viewModeButton = page.locator('button[aria-label*="View mode"]');
    this.perPage = page.locator("#perPage").last();
    this.nextPage = page.locator('button[aria-label="Next Page"]').last();
    this.previousPage = page
      .locator('button[aria-label="Previous Page"]')
      .last();
    this.emptyState = page.getByText(/^No .+ found/);
  }

  /**
   * The cards of one entity type: CardContainer sets each card's aria-label
   * to its type ("Scene", "Performer", "Gallery", ...)
   */
  cards(label: string): Locator {
    return this.page.locator(`[aria-label="${label}"]`);
  }

  /** Waits for the first card or the empty state, then counts the cards */
  async waitForResults(label: string): Promise<number> {
    await expect(this.cards(label).first().or(this.emptyState)).toBeVisible({
      timeout: 15_000,
    });
    return this.cards(label).count();
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
}
