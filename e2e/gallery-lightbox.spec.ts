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
 * gallery skips (requireData). An Images page address naming an image
 * beyond its first page opens that image; one naming an image the user
 * cannot see drops the name and says so.
 */

/**
 * The image id a wall tile links to: its href opens the viewer on the image
 * in the list it shows on (its own address with `image=<id:instance>`)
 */
const linkedImageId = (href: string | null): string | undefined => {
  const url = new URL(href ?? "", "http://peek.invalid");
  return url.searchParams.get("image")?.split(":")[0];
};

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
      //    reloaded list puts it (each wall item links to its image)
      await userPage.goto(galleryUrl);
      const wallItems = userPage.locator(".wall-item");
      await expect(wallItems.first()).toBeVisible({ timeout: 15_000 });
      const hrefs = await wallItems.evaluateAll((items) =>
        items.map((a) => a.getAttribute("href"))
      );
      const ids = hrefs.map(linkedImageId);
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

  test("Back closes the lightbox and stays on the gallery", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Opening an image records a view: a throwaway user's, deleted with it
    const user = await createUser(page.request, "lightbox-back");
    userId = user.id;

    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const userPage = await context.newPage();

      // 1. Open the first gallery and wait for its images
      const list = new ListPage(userPage);
      await list.goto("/galleries");
      const galleries = await list.waitForResults("Gallery");
      requireData(galleries > 0, "a gallery");
      await list.cards("Gallery").first().locator("a:has(.card-title)").click();
      const firstImage = userPage.locator(".wall-item").first();
      await expect(firstImage).toBeVisible({ timeout: 15_000 });
      const galleryUrl = userPage.url();
      const imageId = linkedImageId(await firstImage.getAttribute("href"));
      expect(imageId, "the first image's id").toBeTruthy();

      // 2. Opening the image puts it in the address as "id:instance"
      await firstImage.click();
      const viewer = userPage.getByRole("dialog", { name: "Image viewer" });
      await expect(viewer).toBeVisible();
      await expect
        .poll(() => new URL(userPage.url()).searchParams.get("image"))
        .toMatch(new RegExp(`^${String(imageId)}:.+`));
      const imageUrl = userPage.url();

      // 3. Back closes the viewer and stays on the gallery
      await userPage.goBack();
      await expect(viewer).toBeHidden();
      expect(userPage.url()).toBe(galleryUrl);
      await expect(firstImage).toBeVisible();

      // 4. The image's address opens the viewer straight on it
      await userPage.goto(imageUrl);
      await expect(viewer).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test("closing the viewer leaves no dead Back step", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Opening an image records a view: a throwaway user's, deleted with it
    const user = await createUser(page.request, "lightbox-close");
    userId = user.id;

    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const userPage = await context.newPage();

      // 1. From the galleries list, open the first gallery
      const list = new ListPage(userPage);
      await list.goto("/galleries");
      const galleries = await list.waitForResults("Gallery");
      requireData(galleries > 0, "a gallery");
      await list.cards("Gallery").first().locator("a:has(.card-title)").click();
      const firstImage = userPage.locator(".wall-item").first();
      await expect(firstImage).toBeVisible({ timeout: 15_000 });
      const galleryUrl = userPage.url();

      // 2. Open an image and close the viewer with its own control
      await firstImage.click();
      const viewer = userPage.getByRole("dialog", { name: "Image viewer" });
      await expect(viewer).toBeVisible();
      await expect(userPage).toHaveURL(/[?&]image=/);
      await userPage.keyboard.press("Escape");
      await expect(viewer).toBeHidden();
      await expect(userPage).toHaveURL(galleryUrl);

      // 3. One Back leaves the gallery for the list
      await userPage.goBack();
      await expect(userPage).toHaveURL(/\/galleries(\?|$)/);
    } finally {
      await context.close();
    }
  });

  test("r then 4 in the lightbox rates the image and leaves the gallery unrated", async ({
    page,
    browser,
    baseURL,
  }) => {
    const user = await createUser(page.request, "lightbox-rate");
    userId = user.id;

    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const userPage = await context.newPage();

      // 1. Open the first gallery; its page has r-then-number hotkeys of its own
      const list = new ListPage(userPage);
      await list.goto("/galleries");
      const galleries = await list.waitForResults("Gallery");
      requireData(galleries > 0, "a gallery");
      await list.cards("Gallery").first().locator("a:has(.card-title)").click();
      const firstImage = userPage.locator(".wall-item").first();
      await expect(firstImage).toBeVisible({ timeout: 15_000 });
      const galleryId = /\/gallery\/([^/?]+)/.exec(userPage.url())?.[1];
      expect(galleryId, `the gallery id in ${userPage.url()}`).toBeTruthy();

      // 2. Open the lightbox and press r then 4
      await firstImage.click();
      await expect(
        userPage.getByRole("dialog", { name: "Image viewer" })
      ).toBeVisible();
      const [ratingResponse] = await Promise.all([
        userPage.waitForResponse(
          (r) =>
            r.request().method() === "PUT" &&
            r.url().includes("/api/ratings/image/") &&
            r.ok()
        ),
        (async () => {
          await userPage.keyboard.press("r");
          await userPage.keyboard.press("4");
        })(),
      ]);
      const body = ratingResponse.request().postDataJSON() as {
        rating: number | null;
        instanceId: string;
      };
      expect(body.rating).toBe(80);

      // 3. The gallery behind the lightbox kept no rating
      const listed = await userPage.request.post("/api/library/galleries", {
        data: { ids: [`${String(galleryId)}:${body.instanceId}`] },
      });
      expect(listed.ok(), await listed.text()).toBeTruthy();
      const rows = (
        (await listed.json()) as {
          findGalleries: { galleries: { rating100: number | null }[] };
        }
      ).findGalleries.galleries;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.rating100 ?? null).toBeNull();

      // 4. The lightbox's info drawer shows the image's new rating (80 = 8.0)
      await userPage.getByRole("button", { name: "Show image info" }).click();
      await expect(
        userPage.getByRole("button", { name: "Rating: 8.0", exact: true })
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("a link to an image beyond the Images page's first page opens it in the viewer", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Opening an image records a view: a throwaway user's, deleted with it
    const user = await createUser(page.request, "lightbox-link");
    userId = user.id;

    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const userPage = await context.newPage();

      // 1. The Images page's own request, and its first page: a small page,
      //    so the replay's few images reach a second one
      const PER_PAGE = 4;
      const list = new ListPage(userPage);
      const [firstPage] = await Promise.all([
        userPage.waitForResponse(
          (r) =>
            r.url().includes("/api/library/images") &&
            r.request().method() === "POST" &&
            r.ok()
        ),
        list.goto(`/images?per_page=${PER_PAGE}`),
      ]);
      await list.waitForResults("Image");
      const request = firstPage.request().postDataJSON() as {
        filter?: Record<string, unknown>;
      };

      // 2. The first image of the second page, by the same request
      const second = await userPage.request.post("/api/library/images", {
        data: { ...request, filter: { ...request.filter, page: 2 } },
      });
      expect(second.ok(), await second.text()).toBeTruthy();
      const target = requireData(
        (
          (await second.json()) as {
            findImages: { images: { id: string; instanceId: string }[] };
          }
        ).findImages.images[0],
        "a second page of images"
      );

      // 3. Its link opens the viewer on it
      await userPage.goto(
        `/images?per_page=${PER_PAGE}&image=${encodeURIComponent(`${target.id}:${target.instanceId}`)}`
      );
      const viewer = userPage.getByRole("dialog", { name: "Image viewer" });
      await expect(viewer).toBeVisible({ timeout: 15_000 });
      const src = await userPage
        .locator(".react-transform-component img")
        .getAttribute("src");
      const path = new URL(String(src), userPage.url()).searchParams.get(
        "path"
      );
      expect(path, `the viewer's image (src ${src})`).toMatch(
        new RegExp(`^/image/${target.id}/`)
      );
      expect(new URL(userPage.url()).searchParams.get("image")).toBe(
        `${target.id}:${target.instanceId}`
      );
    } finally {
      await context.close();
    }
  });

  test("a link to an image the user cannot see opens the list and says so", async ({
    page,
  }) => {
    // The viewer never opens, so nothing is recorded: the run admin will do
    const list = new ListPage(page);
    await list.goto("/images?image=no-such-image%3Ano-such-instance");
    const images = await list.waitForResults("Image");
    requireData(images > 0, "an image");

    await expect(
      page.getByText("That image is no longer available")
    ).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.get("image"))
      .toBeNull();
    await expect(
      page.getByRole("dialog", { name: "Image viewer" })
    ).toBeHidden();
  });
});
