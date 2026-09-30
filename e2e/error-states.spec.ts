import { expect, test } from "@playwright/test";

/**
 * E2E tests for error handling and edge cases.
 *
 * Covers invalid routes, detail pages for ids that do not exist, and special
 * characters in URL parameters. A hidden or restricted entity answers the
 * same as a missing one; an id on several servers (the choice of servers) is
 * covered at unit level, since the hermetic run has one library.
 */

/** Each detail page, the name its not-found state gives, and its list page */
const DETAIL_PAGES = [
  { path: "/performer", type: "Performer", list: "/performers" },
  { path: "/studio", type: "Studio", list: "/studios" },
  { path: "/collection", type: "Collection", list: "/collections" },
  { path: "/tag", type: "Tag", list: "/tags" },
  { path: "/gallery", type: "Gallery", list: "/galleries" },
  { path: "/scene", type: "Scene", list: "/scenes" },
];

/** No library entity has this id (the replay's ids start at 100001) */
const UNKNOWN_ID = "99999999";

test.describe("Error States", () => {
  test("non-existent route shows navigation", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-at-all");
    // The catch-all route redirects to home
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("a page whose code fails to load shows the error panel and keeps the navigation", async ({
    page,
  }) => {
    // The hermetic run serves Vite's dev server, so the lazy import is this URL
    const pageModule = "**/src/components/pages/Performers.tsx*";
    await page.route(pageModule, (route) => route.abort());

    await page.goto("/performers");

    const panel = page.getByRole("alert");
    await expect(panel).toContainText("Peek was updated", { timeout: 15_000 });
    await expect(page.getByRole("navigation").first()).toBeVisible();

    await page.unroute(pageModule);
    await panel.getByRole("button", { name: "Reload" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Performers" })
    ).toBeVisible({ timeout: 10_000 });
  });

  for (const { path, type, list } of DETAIL_PAGES) {
    test(`an unknown id on the ${type.toLowerCase()} page shows "${type} not found" with a way back`, async ({
      page,
    }) => {
      await page.goto(`${path}/${UNKNOWN_ID}`);

      await expect(
        page.getByRole("heading", { level: 1, name: `${type} not found` })
      ).toBeVisible({ timeout: 10_000 });

      const browse = page.getByRole("link", {
        name: `Browse ${list.slice(1)}`,
      });
      await expect(browse).toHaveAttribute("href", list);
      await browse.click();
      // The list page may add its own query (sort, page)
      await expect(page).toHaveURL(new RegExp(`${list}(\\?|$)`));
    });
  }

  test("special characters in URL are handled gracefully", async ({ page }) => {
    await page.goto("/scenes?q=%3Cscript%3Ealert(1)%3C/script%3E");
    // Should not crash: navigation still visible, no error panel
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("alert").filter({ hasText: /something went wrong/i })
    ).toHaveCount(0);
    // Search input should contain the decoded text (safely)
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });
  });
});
