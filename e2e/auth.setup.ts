import { test as setup, expect, request } from "@playwright/test";

const AUTH_FILE = "e2e/.auth/user.json";

/**
 * Authenticate once and save the storage state (JWT cookie) for reuse
 * across all test files. Runs before any other test project.
 *
 * Uses the API directly to obtain the auth cookie, then injects it into
 * the browser context. This avoids headless Chromium quirks with form
 * filling (special characters in passwords can behave differently in
 * headed vs headless mode).
 *
 * Credentials come from environment variables (E2E_USERNAME / E2E_PASSWORD)
 * or fall back to the default admin account.
 */
setup("authenticate", async ({ page, baseURL }) => {
  const username = process.env.E2E_USERNAME || "admin";
  const password = process.env.E2E_PASSWORD || "admin123";

  // Login via API to get the auth cookie reliably
  const api = await request.newContext({ baseURL });
  try {
    const loginResponse = await api.post("/api/auth/login", {
      data: { username, password },
    });

    if (!loginResponse.ok()) {
      const body = await loginResponse.text();
      throw new Error(
        `API login failed (${loginResponse.status()}): ${body}\n` +
        `Credentials: ${username} / ${"*".repeat(password.length)}\n` +
        `Set E2E_USERNAME and E2E_PASSWORD environment variables for your dev instance.`
      );
    }

    // Extract token from the Set-Cookie header
    const setCookie = loginResponse.headers()["set-cookie"] || "";
    const tokenMatch = setCookie.match(/token=([^;]+)/);

    if (tokenMatch) {
      // Inject the auth cookie into the browser context
      const url = new URL(baseURL!);
      await page.context().addCookies([{
        name: "token",
        value: tokenMatch[1],
        domain: url.hostname,
        path: "/",
      }]);
    }

    // Complete first-login setup if needed (dismisses UserSetupModal overlay)
    await api.post("/api/user/complete-setup", {
      headers: { Cookie: setCookie.split(",")[0] },
      data: { selectedInstanceIds: [] },
    });
  } finally {
    await api.dispose();
  }

  // Navigate to verify the cookie works and the app loads
  await page.goto("/");
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 15_000,
  });

  // Verify we're authenticated by checking for a navigation element
  // that only renders for logged-in users.
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 10_000 });

  // Save the storage state (cookies + localStorage) for other tests.
  await page.context().storageState({ path: AUTH_FILE });
});
