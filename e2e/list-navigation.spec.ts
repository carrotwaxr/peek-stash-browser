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
 *
 * Relationship indicators (item 41.2): the studios with the most scenes, the
 * heaviest page for tooltip relations, render their cards with counts from
 * relation_totals; each card lists at most 12 related entities per kind.
 */

/** A studio as the list endpoint sends it, as far as this spec reads it */
interface StudioJson {
  name: string;
  scene_count: number;
  performers?: unknown[];
  groups?: unknown[];
  galleries?: unknown[];
  relation_totals?: {
    performers?: number;
    groups?: number;
    galleries?: number;
  };
}

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

  test("Studios sorted by scene count render with relationship indicators", async ({
    page,
  }) => {
    const list = new ListPage(page);
    const sorted = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/library/studios" &&
        r.request().method() === "POST" &&
        (
          r.request().postDataJSON() as {
            filter?: { sort?: unknown };
          } | null
        )?.filter?.sort === "scenes_count"
    );
    await list.goto("/studios?sort=scenes_count&dir=DESC");
    const response = await sorted;
    expect(response.status()).toBe(200);
    const { findStudios } = (await response.json()) as {
      findStudios: { studios: StudioJson[] };
    };

    const n = await list.waitForResults("Studio");
    expect(n).toBe(findStudios.studios.length);
    for (const studio of findStudios.studios) {
      expect(studio.relation_totals, studio.name).toBeDefined();
      // The studio card's performers indicator only counts them
      expect(studio.performers, studio.name).toBeUndefined();
      expect(studio.groups?.length ?? 0, studio.name).toBeLessThanOrEqual(12);
      expect(studio.galleries?.length ?? 0, studio.name).toBeLessThanOrEqual(
        12
      );
    }

    // The first card, the studio with the most scenes, counts its scenes and
    // the performers relation_totals names
    const first = requireData(findStudios.studios[0], "a studio");
    const performers = requireData(
      first.relation_totals?.performers,
      "a studio with performers"
    );
    const counts = list.cards("Studio").first().locator(".card-indicator-text");
    await expect(counts.first()).toBeVisible();
    const shown = await counts.allTextContents();
    expect(shown).toContain(String(first.scene_count));
    expect(shown).toContain(String(performers));
  });

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
