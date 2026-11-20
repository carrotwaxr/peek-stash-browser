import { expect, test } from "@playwright/test";

/**
 * Peek served under a subfolder (issue #561): BASE_PATH=/peek makes nginx
 * strip the prefix, the entrypoint render index.html with the prefix, the
 * client use it as router basename and API prefix, and the server set the
 * session cookie on Path=/peek.
 *
 * Runs only against the production image started with BASE_PATH: set
 * E2E_BASE_PATH (for example /peek) and E2E_BASE_URL (the origin). Global
 * setup uses the unprefixed URL, which nginx serves as well. The Vite dev
 * client has no prefix handling, so hermetic runs skip this spec.
 */

const BASE_PATH = process.env.E2E_BASE_PATH ?? "";

test.describe("Served under BASE_PATH", () => {
  test.skip(
    !BASE_PATH,
    "Needs the production image with BASE_PATH (set E2E_BASE_PATH)"
  );

  // A fresh browser: the run admin's saved session is for Path=/
  test.use({ storageState: { cookies: [], origins: [] } });

  test("every request, the cookie and every route stay under the prefix", async ({
    page,
    context,
    baseURL,
  }) => {
    const username = process.env.E2E_ADMIN_USERNAME;
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!baseURL || !username || !password) {
      throw new Error(
        "baseURL, E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD are unset: playwright.config.ts and global setup set them"
      );
    }
    const origin = new URL(baseURL).origin;

    const requested: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.origin === origin)
        requested.push(`${request.method()} ${url.pathname}`);
    });

    // 1. The login page renders under the prefix, and signing in stays there
    await page.goto(`${origin}${BASE_PATH}/login`);
    await expect(page.getByLabel("Username")).toBeVisible();
    await page.getByLabel("Username").fill(username);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(
      (url) =>
        url.pathname.startsWith(`${BASE_PATH}/`) &&
        !url.pathname.endsWith("/login")
    );
    await expect(page.getByRole("navigation").first()).toBeVisible();

    // 2. The session cookie is scoped to the prefix
    const token = (await context.cookies()).find(
      (cookie) => cookie.name === "token"
    );
    expect(token?.path).toBe(BASE_PATH);

    // A new admin meets the first-sign-in setup modal, which covers the page:
    // finish it through the prefixed API (the cookie reaches only /peek)
    const api = `${origin}${BASE_PATH}/api/user`;
    const setup = await context.request.get(`${api}/setup-status`);
    expect(setup.ok()).toBe(true);
    const { instances } = (await setup.json()) as {
      instances: { id: string }[];
    };
    const done = await context.request.post(`${api}/complete-setup`, {
      data: { selectedInstanceIds: instances.map((i) => i.id) },
    });
    expect(done.ok()).toBe(true);
    await page.reload();

    // 3. A nav link goes to a prefixed route, which a reload renders
    await page
      .getByRole("link", { name: "Scenes", exact: true })
      .first()
      .click();
    await expect(page).toHaveURL(`${origin}${BASE_PATH}/scenes`);
    await page.reload();
    await expect(page).toHaveURL(`${origin}${BASE_PATH}/scenes`);
    await expect(page.getByRole("navigation").first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Scenes" }).first()
    ).toBeVisible();

    // 4. Nothing the page asked for left the prefix
    const outside = requested.filter(
      (entry) => !(entry.split(" ")[1] ?? "").startsWith(`${BASE_PATH}/`)
    );
    expect(
      outside,
      `requests outside ${BASE_PATH}/ of ${requested.join(", ")}`
    ).toEqual([]);
    expect(requested.some((entry) => entry.includes(`${BASE_PATH}/api/`))).toBe(
      true
    );

    // 5. Signing out returns to the prefixed login page
    await page.getByRole("button", { name: username, exact: true }).click();
    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page).toHaveURL(`${origin}${BASE_PATH}/login`);
    const after = requested.filter(
      (entry) => !(entry.split(" ")[1] ?? "").startsWith(`${BASE_PATH}/`)
    );
    expect(after, "requests outside the prefix, sign-out included").toEqual([]);
  });
});
