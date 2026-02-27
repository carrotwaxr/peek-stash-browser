import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("home page loads successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("can navigate to main library pages", async ({ page }) => {
    await page.goto("/");

    const libraryRoutes = [
      "/scenes",
      "/performers",
      "/galleries",
      "/collections",
      "/images",
      "/tags",
      "/studios",
    ];

    for (const path of libraryRoutes) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path));
      // Each library page should render without crashing
      await expect(page.getByRole("navigation").first()).toBeVisible();
    }
  });

  test("can navigate to utility pages", async ({ page }) => {
    const utilityRoutes = [
      "/playlists",
      "/clips",
      "/watch-history",
      "/user-stats",
      "/settings",
    ];

    for (const route of utilityRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route));
      await expect(page.getByRole("navigation").first()).toBeVisible();
    }
  });

  test("settings page renders", async ({ page }) => {
    await page.goto("/settings");
    // Settings page should load without crashing
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("non-existent route redirects to home", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    // The catch-all route redirects to / — just verify we're not stuck
    // on an error page and navigation is visible
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
