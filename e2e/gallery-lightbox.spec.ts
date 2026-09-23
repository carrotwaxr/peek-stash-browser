import {
  type Browser,
  type BrowserContext,
  expect,
  request,
  test,
} from "@playwright/test";

/**
 * E2E test for the gallery lightbox O count (sweep item 11).
 *
 * Gallery images come from the images search, which returns the user's own
 * O count. The test presses O in the lightbox, reloads the gallery and
 * expects the drawer to show the new count.
 *
 * It runs as a throwaway user created through the admin session from storage
 * state and deleted afterwards. The user's view history is deleted with it,
 * so the O press and the recorded view leave the database as it was. It
 * returns early when there is no gallery with images (the CI database is
 * empty).
 */

const PASSWORD = "E2eLightbox1";

/** A fresh browser context signed in as the user, first-login setup done. */
async function signIn(
  browser: Browser,
  baseURL: string,
  username: string
): Promise<BrowserContext> {
  const api = await request.newContext({ baseURL });
  let token: string | undefined;
  try {
    const res = await api.post("/api/auth/login", {
      data: { username, password: PASSWORD },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    token = (res.headers()["set-cookie"] || "").match(/token=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
  } finally {
    await api.dispose();
  }

  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    {
      name: "token",
      value: token!,
      domain: new URL(baseURL).hostname,
      path: "/",
    },
  ]);

  const status = await context.request.get("/api/user/setup-status");
  const { instances } = (await status.json()) as {
    instances: Array<{ id: string }>;
  };
  const setup = await context.request.post("/api/user/complete-setup", {
    data: { selectedInstanceIds: instances.map((i) => i.id) },
  });
  expect(setup.ok(), await setup.text()).toBeTruthy();
  return context;
}

test.describe("Gallery lightbox", () => {
  let userId: number | undefined;

  test.afterEach(async ({ page }) => {
    if (userId !== undefined) {
      await page.request.delete(`/api/user/${userId}`);
      userId = undefined;
    }
  });

  test("gallery lightbox shows the user's O count after a reload", async ({
    page,
    browser,
    baseURL,
  }) => {
    const username = `e2e-lightbox-${Date.now()}-${test.info().workerIndex}`;
    const created = await page.request.post("/api/user/create", {
      data: { username, password: PASSWORD, role: "USER" },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    userId = ((await created.json()) as { user: { id: number } }).user.id;

    const context = await signIn(browser, baseURL!, username);
    try {
      const userPage = await context.newPage();

      // 1. Open the first gallery
      await userPage.goto("/galleries");
      await expect(userPage.getByPlaceholder("Search...")).toBeVisible({
        timeout: 10_000,
      });
      const galleryLink = userPage.locator('a[href*="/gallery/"]').first();
      const hasGalleries = await galleryLink
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      if (!hasGalleries) return;
      await galleryLink.click();

      // 2. Wait for its images and remember the page
      const firstImage = userPage.locator(".wall-item").first();
      const hasImages = await firstImage
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!hasImages) return;
      const galleryUrl = userPage.url();

      // 3. Open the lightbox and its info drawer
      await firstImage.click();
      await userPage.getByRole("button", { name: "Show image info" }).click();

      // 4. Press O and read the count the server stored
      const oButton = userPage.getByRole("button", {
        name: /^Increment O counter/,
      });
      const [response] = await Promise.all([
        userPage.waitForResponse(
          (r) =>
            r.url().includes("/api/image-view-history/increment-o") && r.ok()
        ),
        oButton.click(),
      ]);
      const { oCount } = (await response.json()) as { oCount: number };
      expect(oCount).toBeGreaterThanOrEqual(1);

      // 5. Reload the gallery and reopen the same image
      await userPage.goto(galleryUrl);
      await userPage.locator(".wall-item").first().click();
      await userPage.getByRole("button", { name: "Show image info" }).click();

      // 6. The drawer shows the user's own count
      await expect(
        userPage.getByRole("button", {
          name: `Increment O counter (current: ${oCount})`,
          exact: true,
        })
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
