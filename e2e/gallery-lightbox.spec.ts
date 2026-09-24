import { expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";

/**
 * E2E test for the gallery lightbox O count (sweep item 11).
 *
 * Gallery images come from the images search, which returns the user's own
 * O count. The test presses O in the lightbox, reloads the gallery and
 * expects the drawer to show the new count.
 *
 * It runs as a throwaway user created through the admin session from storage
 * state and deleted afterwards. The user's view history is deleted with it,
 * so the O press and the recorded view leave the database as it was. The
 * replay library's galleries have images; a dev-stack library without a
 * gallery skips (requireData).
 */

test.describe("Gallery lightbox", () => {
  let userId: number | undefined;

  test.afterEach(async ({ page }) => {
    if (userId !== undefined) {
      await deleteUser(page.request, userId);
      userId = undefined;
    }
  });

  test("gallery lightbox shows the user's O count after a reload", async ({
    page,
    browser,
    baseURL,
  }) => {
    const user = await createUser(page.request, "lightbox");
    userId = user.id;

    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const userPage = await context.newPage();

      // 1. Open the first gallery
      const list = new ListPage(userPage);
      await list.goto("/galleries");
      const galleries = await list.waitForResults("Gallery");
      requireData(galleries > 0, "a gallery");
      await list.cards("Gallery").first().locator("a:has(.card-title)").click();

      // 2. Wait for its images and remember the page
      const firstImage = userPage.locator(".wall-item").first();
      await expect(firstImage).toBeVisible({ timeout: 15_000 });
      const galleryUrl = userPage.url();

      // 3. Open the lightbox and its info drawer
      await firstImage.click();
      await userPage.getByRole("button", { name: "Show image info" }).click();

      // 4. The image the lightbox shows: its full-size src goes through
      //    Peek's media proxy, /api/proxy/stash?path=/image/<id>/image
      const src = await userPage
        .locator(".react-transform-component img")
        .getAttribute("src");
      const path = new URL(String(src), userPage.url()).searchParams.get(
        "path"
      );
      const currentImageId = /^\/image\/([^/?]+)\//.exec(path ?? "")?.[1];
      expect(
        currentImageId,
        `the lightbox image's id (src ${src})`
      ).toBeTruthy();

      // 5. Press O and read the count the server stored for that image
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
      expect(response.request().postDataJSON()).toMatchObject({
        imageId: currentImageId,
      });
      const { oCount } = (await response.json()) as { oCount: number };
      expect(oCount).toBeGreaterThanOrEqual(1);

      // 6. Reload the gallery and reopen the same image, wherever the
      //    reloaded list puts it (each wall item links to /image/<id>)
      await userPage.goto(galleryUrl);
      const wallItems = userPage.locator(".wall-item");
      await expect(wallItems.first()).toBeVisible({ timeout: 15_000 });
      const ids = await wallItems.evaluateAll((items) =>
        items.map(
          (a) => /^\/image\/([^/?]+)/.exec(a.getAttribute("href") ?? "")?.[1]
        )
      );
      const index = ids.indexOf(currentImageId);
      expect(
        index,
        `image ${currentImageId} in ${ids.join(", ")}`
      ).toBeGreaterThanOrEqual(0);
      await wallItems.nth(index).click();
      await userPage.getByRole("button", { name: "Show image info" }).click();

      // 7. The drawer shows the user's own count
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
