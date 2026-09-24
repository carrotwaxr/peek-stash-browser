import { expect, request, test as setup } from "@playwright/test";
import { mustOk } from "./global-setup";

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
 * It signs in as the run admin that global setup created and named in
 * E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD, never as a real account.
 */
setup("authenticate", async ({ page, baseURL }) => {
  const username = process.env.E2E_ADMIN_USERNAME;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD are unset: global setup (e2e/global-setup.ts) sets them"
    );
  }

  // Login via API to get the auth cookie reliably
  const api = await request.newContext({ baseURL });
  try {
    const loginResponse = await api.post("/api/auth/login", {
      data: { username, password },
    });

    if (!loginResponse.ok()) {
      const body = await loginResponse.text();
      throw new Error(
        `API login failed (${loginResponse.status()}) for the run admin ${username}: ${body}`
      );
    }

    // Extract token from the Set-Cookie header
    const setCookie = loginResponse.headers()["set-cookie"] || "";
    const token = setCookie.match(/token=([^;]+)/)?.[1];

    if (token) {
      // Inject the auth cookie into the browser context
      const url = new URL(baseURL!);
      await page.context().addCookies([
        {
          name: "token",
          value: token,
          domain: url.hostname,
          path: "/",
        },
      ]);
    }

    // Complete first-login setup (dismisses the UserSetupModal overlay). With
    // two or more instances it needs a selection: all of them, as a new admin
    // would pick to see the whole library.
    const cookie = { Cookie: setCookie.split(",")[0] ?? "" };
    const status = await mustOk(
      await api.get("/api/user/setup-status", { headers: cookie }),
      "GET /api/user/setup-status"
    );
    const { instances } = (await status.json()) as {
      instances: { id: string }[];
    };
    await mustOk(
      await api.post("/api/user/complete-setup", {
        headers: cookie,
        data: { selectedInstanceIds: instances.map((i) => i.id) },
      }),
      "POST /api/user/complete-setup"
    );
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
  await expect(page.getByRole("navigation").first()).toBeVisible({
    timeout: 10_000,
  });

  // Save the storage state (cookies + localStorage) for other tests.
  await page.context().storageState({ path: AUTH_FILE });
});
