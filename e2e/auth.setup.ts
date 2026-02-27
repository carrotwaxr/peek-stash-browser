import { test as setup, expect } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/user.json";

/**
 * Authenticate once and save the storage state (JWT cookie) for reuse
 * across all test files. Runs before any other test project.
 *
 * Credentials come from environment variables (E2E_USERNAME / E2E_PASSWORD)
 * or fall back to the default admin account.
 */
setup("authenticate", async ({ page }) => {
  const username = process.env.E2E_USERNAME || "admin";
  const password = process.env.E2E_PASSWORD || "admin123";

  await page.goto("/login");

  // The login page heading is "Peek Stash Browser"
  await expect(
    page.getByRole("heading", { name: /peek stash browser/i })
  ).toBeVisible();

  // Labels are sr-only but accessible to getByLabel
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Wait for redirect away from login page — confirms auth succeeded.
  // The app uses window.location.href (full page nav), so wait for URL change.
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  // Verify we're authenticated by checking for a navigation element
  // that only renders for logged-in users.
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 10_000 });

  // Save the storage state (cookies + localStorage) for other tests.
  await page.context().storageState({ path: AUTH_FILE });
});
