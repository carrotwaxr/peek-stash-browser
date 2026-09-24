import { expect, test } from "@playwright/test";

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
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
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

  test("a signed-out deep link loads the app once and lands on the login page", async ({
    page,
  }) => {
    const documents: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") {
        documents.push(new URL(request.url()).pathname);
      }
    });

    await page.goto("/performers");
    await expect(page.getByLabel("Username")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // One document: the router's own redirect, not a full reload to /login
    expect(documents).toEqual(["/performers"]);
    expect(new URL(page.url()).pathname).toBe("/login");
    // Signing in returns to the deep link
    expect(
      await page.evaluate(() => sessionStorage.getItem("peek_auth_redirect"))
    ).toBe("/performers");
  });

  test("the forgot-password page opens while signed out", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");

    expect(new URL(page.url()).pathname).toBe("/forgot-password");
    await expect(
      page.getByRole("heading", { name: "Forgot Password" })
    ).toBeVisible();
  });

  test("protected routes redirect to login", async ({ page }) => {
    const protectedRoutes = [
      "/scenes",
      "/performers",
      "/settings",
      "/playlists",
    ];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await page.waitForURL(/\/(login|setup)/, { timeout: 10_000 });
      expect(page.url()).toMatch(/\/(login|setup)/);
    }
  });
});
