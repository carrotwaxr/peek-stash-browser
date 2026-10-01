import { type Page, expect, test } from "@playwright/test";
import {
  type TestUser,
  completeSetup,
  createUser,
  deleteUser,
  signIn,
} from "./support/users";

/**
 * E2E tests for Settings page and theme switching.
 *
 * Covers settings navigation, tab switching, section selection,
 * and theme application. Choosing a theme saves it to the account, so those
 * tests run as a throwaway user, never the run admin every test shares.
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

    // The Playback tab is the selected one
    await expect(page.getByRole("tab", { name: "Playback" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
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

  test("UI Examples expands and collapses", async ({ page }) => {
    await page.goto("/settings?section=user&tab=theme");
    await expect(page.getByText("Built-in Themes")).toBeVisible({
      timeout: 10_000,
    });
    const uiExamples = page.getByRole("button", { name: "UI Examples" });
    const content = page.getByText(
      "UI examples from original Settings page will be added here"
    );
    await expect(content).toHaveCount(0);

    await uiExamples.click();
    await expect(content).toBeVisible();

    await uiExamples.click();
    await expect(content).toHaveCount(0);
  });
});

/** The root's value of a theme variable */
const rootVariable = (page: Page, name: string) =>
  page.evaluate(
    (variable) =>
      getComputedStyle(document.documentElement)
        .getPropertyValue(variable)
        .trim(),
    name
  );

/** Opens the Theme tab and waits for its built-in themes */
async function openThemeTab(page: Page) {
  await page.goto("/settings?section=user&tab=theme");
  await expect(page.getByText("Built-in Themes")).toBeVisible({
    timeout: 10_000,
  });
}

/** Chooses a built-in theme and waits for the account to save it */
async function chooseTheme(page: Page, name: string) {
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/user/settings") &&
      response.request().method() === "PUT"
  );
  await page.getByRole("button", { name }).click();
  expect((await saved).ok()).toBe(true);
}

test.describe("Theme follows the account", () => {
  let viewer: TestUser;

  test.beforeAll(async ({ request, browser, baseURL }) => {
    viewer = await createUser(request, "theme");
    const context = await signIn(browser, baseURL, viewer);
    try {
      await completeSetup(context);
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ request }) => {
    await deleteUser(request, viewer.id);
  });

  test("switching theme updates CSS variables", async ({
    browser,
    baseURL,
  }) => {
    const context = await signIn(browser, baseURL, viewer);
    try {
      const page = await context.newPage();
      await openThemeTab(page);

      await chooseTheme(page, "Light");
      const lightBackground = await rootVariable(page, "--bg-primary");
      expect(lightBackground.length).toBeGreaterThan(0);

      await chooseTheme(page, "Midnight Blue");
      await expect
        .poll(() => rootVariable(page, "--bg-primary"))
        .not.toEqual(lightBackground);
    } finally {
      await context.close();
    }
  });

  test("theme follows the account", async ({ browser, baseURL }) => {
    const first = await signIn(browser, baseURL, viewer);
    let chosenBackground = "";
    try {
      const page = await first.newPage();
      await openThemeTab(page);
      await chooseTheme(page, "Deep Purple");
      chosenBackground = await rootVariable(page, "--bg-primary");

      // The same browser paints it again after a reload
      await page.reload();
      await expect
        .poll(() => rootVariable(page, "--bg-primary"))
        .toBe(chosenBackground);
    } finally {
      await first.close();
    }

    // Another browser, with nothing in its storage, paints the account's theme
    const second = await signIn(browser, baseURL, viewer);
    try {
      const page = await second.newPage();
      await page.goto("/");
      await expect
        .poll(() => rootVariable(page, "--bg-primary"), { timeout: 10_000 })
        .toBe(chosenBackground);
      expect(await page.evaluate(() => localStorage.getItem("app-theme"))).toBe(
        "deepPurple"
      );
    } finally {
      await second.close();
    }
  });
});
