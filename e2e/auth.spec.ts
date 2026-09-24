import { expect, test } from "@playwright/test";
import {
  type TestUser,
  completeSetup,
  createUser,
  deleteUser,
  signIn,
} from "./support/users";

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

  // Sign Out sits in a different menu at each width: the top bar's user menu
  // below 1024px (UserMenu.tsx), the collapsed sidebar's flyout up to 1279px,
  // and the expanded sidebar's menu, under the username, from 1280px (the
  // suite's width). Each gets a run.
  const layouts = [
    { layout: "top bar", width: 800, menu: () => "User menu" },
    { layout: "collapsed sidebar", width: 1100, menu: () => "User menu" },
    {
      layout: "expanded sidebar",
      width: 1280,
      menu: (user: TestUser) => user.username,
    },
  ];

  for (const { layout, width, menu } of layouts) {
    test(`logout redirects to login page (${layout})`, async ({
      request,
      browser,
      baseURL,
    }) => {
      // A throwaway user, so signing out leaves the run admin's session alone
      const user = await createUser(request, "logout");
      try {
        const context = await signIn(browser, baseURL, user);
        try {
          await completeSetup(context);
          const page = await context.newPage();
          await page.setViewportSize({ width, height: 720 });
          await page.goto("/");
          await page
            .getByRole("button", { name: menu(user), exact: true })
            .click();
          await page.getByRole("button", { name: "Sign Out" }).click();
          await expect(page).toHaveURL(/\/login/);

          // The session cookie is gone, so a protected route goes back to the
          // login page
          await page.goto("/scenes");
          await expect(page).toHaveURL(/\/login/);
          const cookies = await context.cookies();
          expect(cookies.map((cookie) => cookie.name)).not.toContain("token");
        } finally {
          await context.close();
        }
      } finally {
        await deleteUser(request, user.id);
      }
    });
  }
});

test.describe("Unauthenticated access", () => {
  // Use empty storage state — no auth cookies
  test.use({ storageState: { cookies: [], origins: [] } });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/");
    // Setup is complete in every mode, so /setup would be a bug
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toMatch(/\/login/);
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

  test("protected routes redirect to login", async ({ context }) => {
    const protectedRoutes = [
      "/scenes",
      "/performers",
      "/settings",
      "/playlists",
    ];

    for (const route of protectedRoutes) {
      // A fresh page per route: a stray second navigation left by one route
      // fails that route's assertions rather than interrupting the next goto
      const page = await context.newPage();
      await page.goto(route);
      await expect(page, `${route} redirects to login`).toHaveURL(/\/login/);
      await expect(page.getByLabel("Username")).toBeVisible();
      await page.close();
    }
  });
});
