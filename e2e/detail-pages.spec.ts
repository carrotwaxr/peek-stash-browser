import { type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";

/**
 * E2E tests for entity detail pages.
 *
 * Each list's first card opens the detail page it links to, whose heading
 * names the entity the card showed. Hermetic runs assert on the replay
 * library; a dev-stack library without the entity skips (requireData).
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
