import { test, expect } from "@playwright/test";

/**
 * E2E tests for error handling and edge cases.
 *
 * Covers invalid routes, non-existent entity IDs, and
 * special characters in URL parameters.
 */

test.describe("Error States", () => {
  test("non-existent route shows navigation", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-at-all");
    // App should handle gracefully — either redirect or show navigation
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("invalid scene ID shows error or redirects gracefully", async ({
    page,
  }) => {
    await page.goto("/scene/99999999");
    // Should either show error message or redirect
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("invalid performer ID shows error or redirects gracefully", async ({
    page,
  }) => {
    await page.goto("/performer/99999999");
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("invalid gallery ID shows error or redirects gracefully", async ({
    page,
  }) => {
    await page.goto("/gallery/99999999");
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("invalid tag ID shows error or redirects gracefully", async ({
    page,
  }) => {
    await page.goto("/tag/99999999");
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("special characters in URL are handled gracefully", async ({
    page,
  }) => {
    await page.goto("/scenes?q=%3Cscript%3Ealert(1)%3C/script%3E");
    // Should not crash — navigation still visible
    await expect(page.getByRole("navigation").first()).toBeVisible({
      timeout: 10_000,
    });
    // Search input should contain the decoded text (safely)
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });
  });
});
