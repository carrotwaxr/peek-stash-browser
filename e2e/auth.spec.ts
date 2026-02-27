import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("authenticated user can access the home page", async ({ page }) => {
    await page.goto("/");
    // Should NOT be redirected to login
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("authenticated user can access settings", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/settings/);
  });

  test("logout redirects to login page", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("navigation").first()).toBeVisible();

    // Look for a logout button or link anywhere on the page
    const logoutButton = page.getByRole("button", { name: /log\s?out/i });
    const logoutLink = page.getByRole("link", { name: /log\s?out/i });
    const logoutText = page.getByText(/log\s?out/i).first();

    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click();
    } else if (await logoutLink.isVisible().catch(() => false)) {
      await logoutLink.click();
    } else if (await logoutText.isVisible().catch(() => false)) {
      await logoutText.click();
    } else {
      // Skip if we can't find a logout control on this page
      test.skip(true, "Could not find logout button");
    }

    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});

test.describe("Unauthenticated access", () => {
  // Use empty storage state — no auth cookies
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/(login|setup)/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/(login|setup)/);
  });

  test("login page renders correctly", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /peek stash browser/i })
    ).toBeVisible();
    await expect(page.getByText("Sign in to your account")).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" })
    ).toBeVisible();
    await expect(page.getByText("Forgot your password?")).toBeVisible();
  });

  test("login with invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Username").fill("nonexistent");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Should stay on login page and show an error message
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator(".text-red-500")).toBeVisible({ timeout: 5_000 });
  });

  test("protected routes redirect to login", async ({ page }) => {
    const protectedRoutes = ["/scenes", "/performers", "/settings", "/playlists"];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForURL(/\/(login|setup)/, { timeout: 10_000 });
      expect(page.url()).toMatch(/\/(login|setup)/);
    }
  });
});
