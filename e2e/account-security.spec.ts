import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  expect,
  request,
  test,
} from "@playwright/test";

/**
 * E2E tests for recovery keys shown once and sessions ending on a password
 * change (sweep item 8).
 *
 * Each test creates its own user through the admin session from storage
 * state and deletes it afterwards. The user signs in through the API and the
 * cookie is injected, as auth.setup.ts does.
 */

const KEY_PATTERN = /^([A-Z2-9]{4}-){6}[A-Z2-9]{4}$/;
const ACCOUNT_TAB = "/settings?section=user&tab=account";

interface TestUser {
  id: number;
  username: string;
  password: string;
}

test.describe("Account security", () => {
  const createdUserIds: number[] = [];
  let userCount = 0;

  test.afterEach(async ({ page }) => {
    for (const id of createdUserIds.splice(0)) {
      await page.request.delete(`/api/user/${id}`);
    }
  });

  async function createUser(admin: APIRequestContext): Promise<TestUser> {
    // Parallel workers can share a millisecond: the worker index keeps n unique
    const n = `${test.info().workerIndex}${++userCount}`;
    const username = `e2e-sec-${Date.now()}-${n}`;
    const password = "E2eSecurity1";
    const res = await admin.post("/api/user/create", {
      data: { username, password, role: "USER" },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const { user } = (await res.json()) as { user: { id: number } };
    createdUserIds.push(user.id);
    return { id: user.id, username, password };
  }

  /** A fresh browser context signed in as the user. */
  async function signIn(
    browser: Browser,
    baseURL: string,
    user: TestUser
  ): Promise<BrowserContext> {
    const api = await request.newContext({ baseURL });
    try {
      const res = await api.post("/api/auth/login", {
        data: { username: user.username, password: user.password },
      });
      expect(res.ok(), await res.text()).toBeTruthy();
      const token = (res.headers()["set-cookie"] || "").match(
        /token=([^;]+)/
      )?.[1];
      expect(token).toBeTruthy();

      const context = await browser.newContext({ baseURL });
      await context.addCookies([
        {
          name: "token",
          value: token!,
          domain: new URL(baseURL).hostname,
          path: "/",
        },
      ]);
      return context;
    } finally {
      await api.dispose();
    }
  }

  /** Finish first sign-in setup through the API so the modal stays away. */
  async function completeSetup(context: BrowserContext): Promise<void> {
    const status = await context.request.get("/api/user/setup-status");
    const { instances } = (await status.json()) as {
      instances: Array<{ id: string }>;
    };
    const res = await context.request.post("/api/user/complete-setup", {
      data: { selectedInstanceIds: instances.map((i) => i.id) },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }

  test("the recovery key is shown once", async ({ page, browser, baseURL }) => {
    const user = await createUser(page.request);
    const context = await signIn(browser, baseURL!, user);
    try {
      const userPage = await context.newPage();

      // First sign-in: the modal asks to continue before it creates a key
      await userPage.goto("/");
      const continueButton = userPage.getByRole("button", {
        name: "Continue",
        exact: true,
      });
      await expect(continueButton).toBeVisible({ timeout: 15_000 });
      await expect(userPage.getByText("Your Recovery Key")).toHaveCount(0);
      await continueButton.click();

      await expect(userPage.getByText("Your Recovery Key")).toBeVisible();
      const firstKey = userPage.getByText(KEY_PATTERN);
      await expect(firstKey).toBeVisible();
      const setupKey = (await firstKey.textContent())!.trim();
      await userPage
        .getByRole("button", { name: "Get Started", exact: true })
        .click();
      await expect(userPage.getByText("Your Recovery Key")).toHaveCount(0);

      // Settings say a key exists but cannot show it
      await userPage.goto(ACCOUNT_TAB);
      await expect(userPage.getByText("A recovery key is set.")).toBeVisible();
      await expect(userPage.getByText(setupKey)).toHaveCount(0);

      // Creating a new key needs the current password and shows it once
      await userPage
        .getByLabel("Confirm with your current password")
        .fill(user.password);
      await userPage
        .getByRole("button", { name: "Create new key", exact: true })
        .click();
      const shownKey = userPage.getByText(KEY_PATTERN);
      await expect(shownKey).toBeVisible();
      const newKey = (await shownKey.textContent())!.trim();
      expect(newKey).not.toBe(setupKey);

      await userPage.reload();
      await expect(userPage.getByText("A recovery key is set.")).toBeVisible();
      await expect(userPage.getByText(newKey)).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("changing the password signs out the user's other session", async ({
    page,
    browser,
    baseURL,
  }) => {
    const user = await createUser(page.request);
    const contextA = await signIn(browser, baseURL!, user);
    const contextB = await signIn(browser, baseURL!, user);
    try {
      await completeSetup(contextA);
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();

      // Both sessions work
      await pageB.goto("/");
      await expect(pageB.getByRole("navigation").first()).toBeVisible({
        timeout: 15_000,
      });
      await pageA.goto(ACCOUNT_TAB);
      await expect(
        pageA.getByRole("heading", { name: "Change Password" })
      ).toBeVisible({ timeout: 15_000 });

      // Tokens carry whole seconds: change the password in a later one
      await pageA.waitForTimeout(1100);

      const newPassword = "E2eSecurity2";
      await pageA
        .getByLabel("Current Password", { exact: true })
        .fill(user.password);
      await pageA.getByLabel("New Password", { exact: true }).fill(newPassword);
      await pageA
        .getByLabel("Confirm New Password", { exact: true })
        .fill(newPassword);
      await pageA
        .getByRole("button", { name: "Change Password", exact: true })
        .click();
      await expect(
        pageA.getByText("Password changed successfully!")
      ).toBeVisible();

      // This session stays signed in
      await pageA.reload();
      await expect(
        pageA.getByRole("heading", { name: "Change Password" })
      ).toBeVisible({ timeout: 15_000 });
      expect(new URL(pageA.url()).pathname).toBe("/settings");

      // The other session is signed out
      await pageB.goto("/");
      await expect(pageB).toHaveURL(/\/login/, { timeout: 15_000 });
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
