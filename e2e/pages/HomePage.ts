import { Page, Locator, expect } from "@playwright/test";

/**
 * Page object for the home page with carousels.
 */
export class HomePage {
  readonly page: Page;
  readonly welcomeHeading: Locator;
  readonly carousels: Locator;

  constructor(page: Page) {
    this.page = page;
    this.welcomeHeading = page.getByRole("heading", { name: /Welcome/ });
    this.carousels = page.locator(
      '[class*="carousel"], [class*="Carousel"]'
    );
  }

  async goto() {
    await this.page.goto("/");
    // Wait for either welcome heading or navigation to be visible
    await expect(
      this.page.getByRole("navigation").first()
    ).toBeVisible({ timeout: 10_000 });
  }

  async getWelcomeText(): Promise<string> {
    return (await this.welcomeHeading.textContent()) ?? "";
  }
}
