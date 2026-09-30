import { expect, test } from "@playwright/test";

/** Each page, and the level 1 heading it shows */
const LIBRARY_PAGES = [
  { path: "/scenes", title: "All Scenes" },
  { path: "/performers", title: "Performers" },
  { path: "/galleries", title: "Galleries" },
  { path: "/collections", title: "Collections" },
  { path: "/images", title: "Images" },
  { path: "/tags", title: "Tags" },
  { path: "/studios", title: "Studios" },
];

const UTILITY_PAGES = [
  { path: "/playlists", title: "Playlists" },
  { path: "/clips", title: "All Clips" },
  { path: "/watch-history", title: "Watch History" },
  { path: "/user-stats", title: "My Stats" },
  { path: "/settings", title: "Settings" },
];

test.describe("Navigation", () => {
  test("home page loads successfully", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  for (const { path, title } of [...LIBRARY_PAGES, ...UTILITY_PAGES]) {
    test(`${path} renders its heading and no error panel`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path));
      await expect(
        page.getByRole("heading", { level: 1, name: title })
      ).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("navigation").first()).toBeVisible();
      await expect(
        page.getByRole("alert").filter({ hasText: /something went wrong/i })
      ).toHaveCount(0);
    });
  }

  test("non-existent route redirects to home", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    // The catch-all route redirects to /
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
});
