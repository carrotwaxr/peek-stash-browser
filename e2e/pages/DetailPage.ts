import { Page, Locator, expect } from "@playwright/test";

/**
 * Shared page object for entity detail pages
 * (scene detail, performer detail, etc.).
 */
export class DetailPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly backButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { level: 1 }).first();
    this.backButton = page.locator(
      'button[aria-label="Back"], a[aria-label="Back"]'
    );
  }

  async waitForLoad() {
    await expect(this.heading).toBeVisible({ timeout: 10_000 });
  }

  async getTitle(): Promise<string> {
    return (await this.heading.textContent()) ?? "";
  }

  async hasMetadata(): Promise<boolean> {
    // Check if there's any metadata section (varies by entity type)
    return this.page
      .locator('[class*="metadata"], [class*="detail"], [class*="info"]')
      .first()
      .isVisible()
      .catch(() => false);
  }
}
