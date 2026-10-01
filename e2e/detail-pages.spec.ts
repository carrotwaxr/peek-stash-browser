import { type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";

/**
 * E2E tests for entity detail pages.
 *
 * Each list's first card opens the detail page it links to, whose heading
 * names the entity the card showed; a tag's and a studio's page link their
 * parents and children. Hermetic runs assert on the replay library; a
 * dev-stack library without the entity skips (requireData).
 */

/**
 * Opens the first card on the Collections page sorted by scene count, the
 * collection with the most scenes, and waits for its heading; returns the
 * collection's name
 */
async function openFirstCollection(page: Page): Promise<string> {
  const list = new ListPage(page);
  await list.goto("/collections?sort=scene_count&dir=DESC");
  const n = await list.waitForResults("Group");
  requireData(n > 0, "a collection");

  const titleLink = list.cards("Group").first().locator("a:has(.card-title)");
  const name = (await titleLink.innerText()).trim();
  await titleLink.click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(
    name,
    { timeout: 10_000 }
  );
  return name;
}

interface GalleryRow {
  id: string;
  instanceId: string;
  image_count: number;
  relation_totals?: { scenes?: number };
}

interface FindGalleriesBody {
  findGalleries: { galleries: GalleryRow[] };
}

/** A tag or studio's parent or child as its row carries it */
interface HierarchyRef {
  id: string;
  instanceId: string;
  name: string;
}

interface FindTagsBody {
  findTags: {
    tags: Array<
      HierarchyRef & { parents: HierarchyRef[]; image_count: number }
    >;
  };
}

/** What a list's images request asked for */
interface ImagesRequest {
  filter?: { sort?: string; direction?: string };
  image_filter?: { tags?: { value?: string[] } };
}

/** The body of the next images request the page sends */
async function nextImagesRequest(page: Page): Promise<ImagesRequest> {
  const response = await page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/library/images") &&
      r.request().method() === "POST" &&
      r.ok()
  );
  return response.request().postDataJSON() as ImagesRequest;
}

interface FindStudiosBody {
  findStudios: {
    studios: Array<HierarchyRef & { parent_studio: HierarchyRef | null }>;
  };
}

/** A detail page's path on the entity's own instance */
const detailPath = (entity: "tag" | "studio", ref: HierarchyRef) =>
  `/${entity}/${ref.id}?instance=${encodeURIComponent(ref.instanceId)}`;

/** The card under a detail page's heading of that title */
const cardTitled = (page: Page, title: string) =>
  page
    .getByRole("heading", { level: 3, name: title, exact: true })
    .locator("..");

interface FindPerformersBody {
  findPerformers: { performers: Array<{ id: string; instanceId: string }> };
}

/** The list page of each entity with a detail page, and its cards' label */
const ENTITIES = [
  { entity: "performer", list: "/performers", label: "Performer" },
  { entity: "studio", list: "/studios", label: "Studio" },
  { entity: "tag", list: "/tags", label: "Tag" },
  { entity: "gallery", list: "/galleries", label: "Gallery" },
  { entity: "group", list: "/collections", label: "Group" },
  { entity: "scene", list: "/scenes", label: "Scene" },
];

test.describe("Detail Pages", () => {
  for (const { entity, list: listPath, label } of ENTITIES) {
    test(`${entity} card opens its detail page`, async ({ page }) => {
      const list = new ListPage(page);
      await list.goto(listPath);
      const n = await list.waitForResults(label);
      requireData(n > 0, `a ${entity}`);

      const titleLink = list.cards(label).first().locator("a:has(.card-title)");
      const title = (await titleLink.innerText()).trim();
      const href = await titleLink.getAttribute("href");
      expect(href, `the first ${entity} card's title link`).toBeTruthy();

      await titleLink.click();
      await expect(page).toHaveURL(String(href));
      // The page's own heading comes first; the scenes section below has one
      await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(
        title,
        { timeout: 10_000 }
      );
      await expect(page.getByRole("navigation").first()).toBeVisible();
    });
  }

  test("a collection's first scene shows that collection on its Collections tab", async ({
    page,
  }) => {
    const name = await openFirstCollection(page);

    // A collection with scenes opens on its Scenes tab
    const collection = new ListPage(page);
    const scenes = await collection.waitForResults("Scene");
    requireData(scenes > 0, "a collection with scenes");
    await collection
      .cards("Scene")
      .first()
      .locator("a:has(.card-title)")
      .click();
    await expect(page).toHaveURL(/\/scene\//);

    // The scene page asks for the collections holding "id:instanceId"
    await page.getByRole("button", { name: /^Collections\b/ }).click();
    await expect(
      collection.cards("Group").filter({ hasText: name }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("a collection's Performers tab lists a performer", async ({ page }) => {
    await openFirstCollection(page);

    const tab = page.getByRole("button", { name: /^Performers\b/ });
    const hasTab = await tab
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(
        () => true,
        () => false
      );
    requireData(hasTab, "a collection with performers");
    await tab.click();

    const performers = new ListPage(page);
    await expect(performers.cards("Performer").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("a gallery with scenes shows its Scenes tab, which lists them", async ({
    page,
  }) => {
    // Gallery rows count the scenes the user can see (relation_totals)
    const listed = await page.request.post("/api/library/galleries", {
      data: { filter: { per_page: 250, sort: "title", direction: "ASC" } },
    });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const rows = ((await listed.json()) as FindGalleriesBody).findGalleries
      .galleries;
    const gallery = requireData(
      rows.find(
        (row) => row.image_count > 0 && (row.relation_totals?.scenes ?? 0) > 0
      ),
      "a gallery with images and scenes"
    );
    const sceneCount = gallery.relation_totals?.scenes ?? 0;

    await page.goto(
      `/gallery/${gallery.id}?instance=${encodeURIComponent(gallery.instanceId)}`
    );
    const tab = page.getByRole("button", {
      name: new RegExp(`^Scenes\\s*${sceneCount}$`),
    });
    await expect(tab).toBeVisible({ timeout: 10_000 });
    await tab.click();

    await expect(page).toHaveURL(/[?&]tab=scenes\b/);
    const scenes = new ListPage(page);
    await expect(scenes.cards("Scene").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("a parent tag's page lists its child tags and offers its sub-tags; the child's page names the parent", async ({
    page,
  }) => {
    const listed = await page.request.post("/api/library/tags", {
      data: { filter: { per_page: 250 } },
    });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const child = requireData(
      ((await listed.json()) as FindTagsBody).findTags.tags.find(
        (tag) => tag.parents.length > 0
      ),
      "a tag with a parent"
    );
    const parent = requireData(child.parents[0], "the tag's parent");

    await page.goto(detailPath("tag", parent));
    await expect(
      cardTitled(page, "Child Tags").getByRole("link", {
        name: child.name,
        exact: true,
      })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("checkbox", { name: /^Include sub-tags \(\d+\)$/ })
    ).toBeVisible();

    await page.goto(detailPath("tag", child));
    await expect(
      cardTitled(page, "Parent Tags").getByRole("link", {
        name: parent.name,
        exact: true,
      })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("a tag's Images tab lists the tag's images, opens the viewer, and keeps a default preset saved there to itself", async ({
    browser,
    baseURL,
    request,
  }) => {
    // The preset is per-user state: a throwaway user of its own
    const user = await createUser(request, "tag-images");
    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const listed = await context.request.post("/api/library/tags", {
        data: { filter: { per_page: 250 } },
      });
      expect(listed.ok(), await listed.text()).toBeTruthy();
      const tag = requireData(
        ((await listed.json()) as FindTagsBody).findTags.tags.find(
          (row) => row.image_count > 0
        ),
        "a tag with images"
      );
      const tabPath = `${detailPath("tag", tag)}&tab=images`;
      const page = await context.newPage();
      const list = new ListPage(page);

      // 1. The tab asks for this tag's images and lists them
      const firstRequest = nextImagesRequest(page);
      await page.goto(tabPath);
      expect((await firstRequest).image_filter?.tags?.value).toEqual([
        `${tag.id}:${tag.instanceId}`,
      ]);
      requireData((await list.waitForResults("Image")) > 0, "tag images");

      // 2. A card opens the viewer on the tab
      // The card's thumbnail loads once it is in view
      const card = list.cards("Image").first();
      await card.scrollIntoViewIfNeeded();
      await card.locator("img").first().click();
      const viewer = page.getByRole("dialog", { name: "Image viewer" });
      await expect(viewer).toBeVisible();
      await expect(page).toHaveURL(/[?&]image=/);
      await page.keyboard.press("Escape");
      await expect(viewer).toBeHidden();

      // 3. A sort by file size saved there as the default
      await page.goto(`${tabPath}&sort=filesize&dir=DESC`);
      await list.waitForResults("Image");
      await page.getByRole("button", { name: "Save Preset" }).click();
      const dialog = page.getByRole("dialog", { name: "Save Filter Preset" });
      await dialog.getByPlaceholder("Enter preset name...").fill("By size");
      await dialog
        .getByRole("checkbox", { name: /Set as default for Tag pages/ })
        .check();
      const saved = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/user/filter-presets") &&
          r.request().method() === "POST" &&
          r.ok()
      );
      await dialog.getByRole("button", { name: "Save" }).click();
      await saved;

      // 4. The tab opens with it; the Images page does not
      const tabRequest = nextImagesRequest(page);
      await page.goto(tabPath);
      expect((await tabRequest).filter).toMatchObject({
        sort: "filesize",
        direction: "DESC",
      });
      const imagesRequest = nextImagesRequest(page);
      await page.goto("/images");
      expect((await imagesRequest).filter?.sort).not.toBe("filesize");
    } finally {
      await context.close();
      await deleteUser(request, user.id);
    }
  });

  test("a child studio's page names its parent; the parent's page lists it and offers its sub-studios", async ({
    page,
  }) => {
    const listed = await page.request.post("/api/library/studios", {
      data: { filter: { per_page: 250 } },
    });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const child = requireData(
      ((await listed.json()) as FindStudiosBody).findStudios.studios.find(
        (studio) => studio.parent_studio !== null
      ),
      "a studio with a parent"
    );
    const parent = requireData(child.parent_studio, "the studio's parent");

    await page.goto(detailPath("studio", child));
    await expect(
      cardTitled(page, "Parent Studio").getByRole("link", {
        name: parent.name,
        exact: true,
      })
    ).toBeVisible({ timeout: 10_000 });

    await page.goto(detailPath("studio", parent));
    await expect(
      cardTitled(page, "Child Studios").getByRole("link", {
        name: child.name,
        exact: true,
      })
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("checkbox", { name: /^Include sub-studios \(\s*\d+\)$/ })
    ).toBeVisible();
  });

  test("the timeline view on a performer page shows bars", async ({ page }) => {
    // The performer with the most scenes, opened from an instance-qualified
    // link, so the timeline asks for the performer as "id:instanceId"
    const found = await page.request.post("/api/library/performers", {
      data: { filter: { per_page: 1, sort: "scene_count", direction: "DESC" } },
    });
    expect(found.ok(), await found.text()).toBeTruthy();
    const [performer] = ((await found.json()) as FindPerformersBody)
      .findPerformers.performers;
    const { id, instanceId } = requireData(performer, "a performer");
    await page.goto(
      `/performer/${id}?instance=${encodeURIComponent(instanceId)}`
    );

    const scenes = new ListPage(page);
    const n = await scenes.waitForResults("Scene");
    requireData(n > 0, "a performer with scenes");
    await scenes.viewModeButton.click();
    await page.getByRole("option", { name: "Timeline view" }).click();

    const timeline = page.getByRole("listbox", { name: "Timeline" });
    await expect(timeline.getByRole("option").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("a favourite filter on a performer's Scenes tab does not follow to the Galleries tab", async ({
    page,
  }) => {
    // The performer with the most galleries, on its Scenes tab with a scene
    // filter and a page in the URL
    const found = await page.request.post("/api/library/performers", {
      data: {
        filter: { per_page: 1, sort: "gallery_count", direction: "DESC" },
      },
    });
    expect(found.ok(), await found.text()).toBeTruthy();
    const [performer] = ((await found.json()) as FindPerformersBody)
      .findPerformers.performers;
    const { id, instanceId } = requireData(performer, "a performer");
    const instance = encodeURIComponent(instanceId);
    await page.goto(
      `/performer/${id}?instance=${instance}&tab=scenes&favorite=true&sort=title&page=2`
    );

    const galleries = page.getByRole("button", { name: /^Galleries\b/ });
    const scenes = page.getByRole("button", { name: /^Scenes\b/ });
    await expect(scenes.or(galleries).first()).toBeVisible({ timeout: 10_000 });
    requireData(
      (await galleries.count()) > 0 && (await scenes.count()) > 0,
      "a performer with scenes and galleries"
    );
    await expect(page).toHaveURL(/[?&]favorite=true\b/);

    await galleries.click();

    await expect(page).toHaveURL(/[?&]tab=galleries\b/);
    await expect(page).toHaveURL(new RegExp(`[?&]instance=${instance}`));
    await expect(page).not.toHaveURL(/[?&](favorite|sort|page)=/);
  });

  test("images page loads and shows content or empty state", async ({
    page,
  }) => {
    await page.goto("/images");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    // Images don't have detail pages via URL — they open lightbox
    // Just verify the page loads correctly
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("direct navigation to detail pages shows content or error", async ({
    page,
  }) => {
    // These should not crash even with invalid IDs
    const detailPaths = ["/performer/1", "/studio/1", "/tag/1", "/gallery/1"];

    for (const path of detailPaths) {
      await page.goto(path);
      // Should show navigation (app didn't crash)
      await expect(page.getByRole("navigation").first()).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test("a statistic on a performer page scrolls down to its tab", async ({
    page,
  }) => {
    await page.goto("/performers");
    await expect(page.getByPlaceholder("Search...")).toBeVisible({
      timeout: 10_000,
    });

    const performerLinks = page.locator('a[href*="/performer/"]');
    const hasPerformers = await performerLinks
      .first()
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(
        () => true,
        () => false
      );
    requireData(hasPerformers, "performers");

    // The count beside "Images:" is a button only when the performer has
    // images, so open the first listed performer that has some.
    const hrefs = [
      ...new Set(
        await performerLinks.evaluateAll((links) =>
          links.map((a) => a.getAttribute("href") ?? "")
        )
      ),
    ].slice(0, 10);
    const stat = page.getByText("Images:", { exact: true });
    const statButton = stat.locator("..").getByRole("button");
    let found = false;
    for (const href of hrefs) {
      await page.goto(href);
      await expect(page.getByText("Scenes:", { exact: true })).toBeVisible({
        timeout: 10_000,
      });
      if ((await statButton.count()) > 0) {
        found = true;
        break;
      }
    }
    requireData(found, "listed performers with images");

    await stat.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    const canScroll = await page.evaluate(
      (y) =>
        document.documentElement.scrollHeight - window.innerHeight >= y + 100,
      before
    );
    requireData(canScroll, "performer pages tall enough to scroll");

    await statButton.click();

    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 })
      .toBeGreaterThan(before);
  });
});
