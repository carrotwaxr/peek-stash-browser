import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Shared page object for all library list pages
 * (scenes, performers, studios, tags, galleries, collections, images).
 */
export class ListPage {
  readonly page: Page;
  readonly searchInput: Locator;
  /** The filter chips' row: the chips, "+ Filter" and "Clear all" */
  readonly filterBar: Locator;
  /** "+ Filter", which opens the list of fields to filter by */
  readonly addFilterButton: Locator;
  /** "Filters (n)" on a phone or a TV, which opens the filter sheet */
  readonly filtersButton: Locator;
  /** "Advanced", which opens the Advanced view (rows and groups) */
  readonly advancedButton: Locator;
  /** The Advanced view, while it is open */
  readonly advancedDialog: Locator;
  /** "Views" or "Views: <name>", the saved Views menu */
  readonly viewsButton: Locator;
  /** The filter sheet (a phone or a TV) */
  readonly sheet: Locator;
  /** The sheet's "Show N results", once the count is in */
  readonly showResults: Locator;
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
    this.addFilterButton = page.getByRole("button", { name: "Add filter" });
    this.filterBar = page.getByRole("group", { name: "Filters", exact: true });
    this.advancedButton = page.getByRole("button", {
      name: "Advanced",
      exact: true,
    });
    this.advancedDialog = page.getByRole("dialog", {
      name: "Advanced filters",
    });
    this.filtersButton = page.getByRole("button", {
      name: /^Filters( \(\d+\))?$/,
    });
    this.viewsButton = page.getByRole("button", { name: /^Views(:|$)/ });
    this.sheet = page.getByRole("dialog", { name: "Filters", exact: true });
    this.showResults = this.sheet.getByRole("button", {
      name: /^Show [\d,]+ results?$/,
    });
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

  /**
   * Adds a filter on the field named `label`: opens "+ Filter", types the
   * label and picks the first match with Enter, then waits for the field's
   * editor under its chip
   */
  async addFilter(label: string): Promise<Locator> {
    await this.addFilterButton.click();
    await this.page
      .getByRole("combobox", { name: "Find a filter" })
      .fill(label);
    await expect(
      this.page
        .getByRole("listbox", { name: "Filters" })
        .getByRole("option")
        .filter({ hasText: label })
        .first()
    ).toBeVisible();
    await this.page.keyboard.press("Enter");
    const editor = this.chipEditor(label);
    await expect(editor).toBeVisible();
    return editor;
  }

  /**
   * The open editor of the chip on the field named `label`; a unit the
   * label shows ("Penis Length (cm)") may follow
   */
  chipEditor(label: string): Locator {
    const name = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page.getByRole("dialog", {
      name: new RegExp(`^${name}( \\(.+\\))? filter$`),
    });
  }

  /** Opens the Advanced view from the bar's "Advanced" button */
  async openAdvanced(): Promise<Locator> {
    await this.advancedButton.click();
    await expect(this.advancedDialog).toBeVisible();
    return this.advancedDialog;
  }

  /** A row of the filter sheet, by its field's name (the row's heading) */
  sheetRow(label: string): Locator {
    return this.sheet.locator("[data-sheet-row]").filter({
      has: this.page.getByRole("heading", { name: label, exact: true }),
    });
  }

  /**
   * Closes the open chip editor with Escape, applying what it still waits
   * on; an open picker list takes the first Escape
   */
  async closeEditor() {
    const editor = this.page.getByRole("dialog", { name: / filter$/ });
    const pickerSearch = editor.getByPlaceholder("Type to search...");
    if (await pickerSearch.isVisible()) {
      await this.page.keyboard.press("Escape");
      await expect(pickerSearch).toHaveCount(0);
    }
    await this.page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
  }

  async toggleSortDirection() {
    await this.sortDirection.click();
  }
}
