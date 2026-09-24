import { expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { requireData } from "./support/data";
import { runPrefix } from "./support/names";

/**
 * Card to Back on the library lists (LG-34): opening a card and pressing Back
 * once returns to the same list, showing the same first card. Scenes have
 * this test, with the scroll position, in pagination.spec.ts.
 *
 * Empty results (LG-34): a search that matches nothing shows the list's empty
 * state and no card.
 */

/** The lists covered here, and their cards' label */
const LISTS = [
  { entity: "performer", list: "/performers", label: "Performer" },
  { entity: "studio", list: "/studios", label: "Studio" },
  { entity: "tag", list: "/tags", label: "Tag" },
  { entity: "gallery", list: "/galleries", label: "Gallery" },
  { entity: "group", list: "/collections", label: "Group" },
];

test.describe("List navigation", () => {
  for (const { entity, list: listPath, label } of LISTS) {
    test(`Back from a ${entity} returns to its list in one press`, async ({
      page,
    }) => {
      const list = new ListPage(page);
      await list.goto(listPath);
      const n = await list.waitForResults(label);
      requireData(n > 0, `a ${entity}`);

      const listUrl = new URL(page.url());
      const firstCard = list.cards(label).first();
      const titleLink = firstCard.locator("a:has(.card-title)");
      const href = await titleLink.getAttribute("href");
      expect(href, `the first ${entity} card's title link`).toBeTruthy();

      await titleLink.click();
      await expect(page).toHaveURL(String(href));

      await page.goBack();
      await expect(page).toHaveURL(
        (url) =>
          url.pathname === listUrl.pathname && url.search === listUrl.search
      );
      await expect(firstCard).toBeVisible({ timeout: 15_000 });
      await expect(titleLink).toHaveAttribute("href", String(href));
    });
  }

  // The other list pages have no empty state yet (LG-13): their empty-results
  // tests come with item 57, one per page here
  test("a scene search that matches nothing shows the empty state", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto(`/scenes?q=zzzz-${runPrefix()}`);

    await expect(page.getByText("No scenes found")).toBeVisible({
      timeout: 15_000,
    });
    await expect(list.cards("Scene")).toHaveCount(0);
  });
});
