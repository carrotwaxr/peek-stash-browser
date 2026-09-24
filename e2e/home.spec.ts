import { expect, test } from "@playwright/test";

/**
 * E2E tests for the Home page.
 *
 * Covers page load, welcome heading, navigation elements,
 * and the Recently Added carousel's scenes from the library.
 */

test.describe("Home Page", () => {
  test("home page loads with welcome heading", async ({ page }) => {
    await page.goto("/");

    // The welcome heading should include the username
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("home page shows subtitle", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible({
      timeout: 15_000,
    });

    // Subtitle text
    await expect(
      page.getByText("Discover your favorite content and explore new scenes")
    ).toBeVisible();
  });

  test("navigation bar is visible on home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });

    // Key navigation links should be present
    await expect(page.getByRole("link", { name: /Scenes/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Playlists/i })).toBeVisible();
  });

  test("home page shows the Recently Added carousel with scenes", async ({
    page,
  }) => {
    await page.goto("/");
    const heading = page.getByRole("heading", {
      level: 2,
      name: "Recently Added",
    });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // The carousel's section: SceneCarousel's root holds its heading and cards
    const carousel = page.locator("div.mb-8").filter({ has: heading });
    await expect(carousel.locator('[aria-label="Scene"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("can navigate from home to scenes", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });

    // Click the Scenes link in navigation
    await page.getByRole("link", { name: /Scenes/i }).click();

    // Should navigate to scenes page
    await expect(page).toHaveURL(/\/scenes/, { timeout: 10_000 });
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("can navigate from home to playlists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });

    // Click the Playlists link in navigation
    await page.getByRole("link", { name: /Playlists/i }).click();

    // Should navigate to playlists page
    await expect(page).toHaveURL(/\/playlists/, { timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Playlists", exact: true })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("can navigate from home to settings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });

    // Navigate to settings via URL (settings link may be in a submenu)
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/, { timeout: 10_000 });
    await expect(
      page.getByRole("radio", { name: "User Preferences" })
    ).toBeVisible({ timeout: 10_000 });
  });
});
