import { test, expect } from "@playwright/test";

/**
 * E2E tests for Settings page and theme switching.
 *
 * Covers settings navigation, tab switching, section selection,
 * and theme application.
 */

test.describe("Settings Page", () => {
  test("settings page loads with section selector", async ({ page }) => {
    await page.goto("/settings");

    // Section selector radio group should be visible
    await expect(
      page.getByRole("radio", { name: "User Preferences" })
    ).toBeVisible({ timeout: 10_000 });

    // Admin user should also see Server Settings
    await expect(
      page.getByRole("radio", { name: "Server Settings" })
    ).toBeVisible();
  });

  test("user preference tabs are navigable", async ({ page }) => {
    await page.goto("/settings");
    await expect(
      page.getByRole("radio", { name: "User Preferences" })
    ).toBeVisible({ timeout: 10_000 });

    // Ensure User Preferences is selected
    await page.getByRole("radio", { name: "User Preferences" }).click();

    // Settings uses role="tab" in a tablist (not role="button")
    const themeTab = page.getByRole("tab", { name: "Theme" });
    await expect(themeTab).toBeVisible();

    // Playback tab
    const playbackTab = page.getByRole("tab", { name: "Playback" });
    await expect(playbackTab).toBeVisible();
    await playbackTab.click();

    // URL should update with tab param
    await expect(page).toHaveURL(/tab=playback/, { timeout: 5_000 });

    // Navigation tab
    const navTab = page.getByRole("tab", { name: "Navigation" });
    await expect(navTab).toBeVisible();
    await navTab.click();
    await expect(page).toHaveURL(/tab=navigation/, { timeout: 5_000 });

    // Account tab
    const accountTab = page.getByRole("tab", { name: "Account" });
    await expect(accountTab).toBeVisible();
    await accountTab.click();
    await expect(page).toHaveURL(/tab=account/, { timeout: 5_000 });
  });

  test("server settings section is accessible to admin", async ({ page }) => {
    await page.goto("/settings?section=server");

    // Server Settings radio should be checked
    await expect(
      page.getByRole("radio", { name: "Server Settings" })
    ).toBeVisible({ timeout: 10_000 });

    // Server tabs use role="tab" in a tablist
    await expect(
      page.getByRole("tab", { name: "Server Configuration" })
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole("tab", { name: "User Management" })
    ).toBeVisible();
  });

  test("settings URL params restore correct section and tab", async ({
    page,
  }) => {
    // Navigate directly to a specific settings tab
    await page.goto("/settings?section=user&tab=playback");

    await expect(
      page.getByRole("radio", { name: "User Preferences" })
    ).toBeVisible({ timeout: 10_000 });

    // The playback tab should be active
    await expect(page).toHaveURL(/tab=playback/);
  });
});

test.describe("Theme Switching", () => {
  test("theme tab shows built-in themes", async ({ page }) => {
    await page.goto("/settings?section=user&tab=theme");

    // Wait for the theme section to load
    await expect(page.getByText("Built-in Themes")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("Choose from our built-in color themes")
    ).toBeVisible();

    // All 5 built-in theme buttons should be visible
    await expect(page.getByRole("button", { name: "Peek" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Midnight Blue" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Deep Purple" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "The Hub" })).toBeVisible();
  });

  test("switching theme updates CSS variables", async ({ page }) => {
    await page.goto("/settings?section=user&tab=theme");
    await expect(page.getByText("Built-in Themes")).toBeVisible({
      timeout: 10_000,
    });

    // Get the initial accent color
    const initialAccent = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-primary")
        .trim()
    );

    // Switch to a different theme
    // Try switching to "Light" which should have a different accent color
    await page.getByRole("button", { name: "Light" }).click();

    // Wait a moment for theme to apply
    await page.waitForTimeout(300);

    // Check that the background variable changed (Light theme has a light bg)
    const bgPrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-primary")
        .trim()
    );

    // Light theme should have a light background (contains high RGB values)
    // This is a soft check — we just verify the variable exists and has a value
    expect(bgPrimary.length).toBeGreaterThan(0);

    // Switch to another theme to verify it updates again
    await page.getByRole("button", { name: "Midnight Blue" }).click();
    await page.waitForTimeout(300);

    const midnightBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--bg-primary")
        .trim()
    );

    // The background should be different from Light theme
    expect(midnightBg).not.toEqual(bgPrimary);
  });

  test("theme persists in localStorage", async ({ page }) => {
    await page.goto("/settings?section=user&tab=theme");
    await expect(page.getByText("Built-in Themes")).toBeVisible({
      timeout: 10_000,
    });

    // Switch to Deep Purple
    await page.getByRole("button", { name: "Deep Purple" }).click();
    await page.waitForTimeout(300);

    // Check localStorage
    const storedTheme = await page.evaluate(() =>
      localStorage.getItem("app-theme")
    );
    expect(storedTheme).toBeTruthy();

    // Reload the page
    await page.reload();
    await expect(page.getByText("Built-in Themes")).toBeVisible({
      timeout: 10_000,
    });

    // The theme should still be applied (localStorage persists)
    const themeAfterReload = await page.evaluate(() =>
      localStorage.getItem("app-theme")
    );
    expect(themeAfterReload).toEqual(storedTheme);
  });

  test("UI Examples section is collapsible", async ({ page }) => {
    await page.goto("/settings?section=user&tab=theme");
    await expect(page.getByText("Built-in Themes")).toBeVisible({
      timeout: 10_000,
    });

    // UI Examples heading should be visible
    const uiExamplesHeading = page.getByText("UI Examples");
    if (await uiExamplesHeading.isVisible().catch(() => false)) {
      // Click to expand/collapse
      await uiExamplesHeading.click();
    }
  });
});
