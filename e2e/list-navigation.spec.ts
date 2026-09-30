import { type Page, type Response, expect, test } from "@playwright/test";
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
 *
 * Tag trees (item 41.8): the Tags page's hierarchy view and the scenes'
 * folder view build their trees from the compact tag tree, and a folder's
 * path names the tag's instance.
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

/** A tag as the tree endpoint sends it, as far as this spec reads it */
interface TreeTagJson {
  id: string;
  instanceId: string;
  name: string;
  parents: { id: string }[];
  gallery_count?: number;
  performers?: unknown;
}

/** Waits for the page's tag tree request and reads its tags */
async function treeTags(page: Page, open: () => Promise<unknown>) {
  const response = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/library/tags/tree" &&
      r.request().method() === "POST"
  );
  await open();
  const tree = await response;
  expect(tree.status()).toBe(200);
  return ((await tree.json()) as { tags: TreeTagJson[] }).tags;
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

  test("the Tags hierarchy view renders the tree", async ({ page }) => {
    const tags = await treeTags(page, () => page.goto("/tags?view=hierarchy"));
    // Compact rows: no tooltip relations
    expect(tags.every((t) => t.performers === undefined)).toBe(true);

    // A root with a child: the first level opens expanded
    const byKey = new Map(tags.map((t) => [`${t.id}:${t.instanceId}`, t]));
    const child = requireData(
      tags.find((t) =>
        t.parents.some(
          (p) => byKey.get(`${p.id}:${t.instanceId}`)?.parents.length === 0
        )
      ),
      "a tag under a root tag"
    );
    const root = requireData(
      child.parents
        .map((p) => byKey.get(`${p.id}:${child.instanceId}`))
        .find((p) => p?.parents.length === 0),
      "the child's root"
    );

    const tree = page.getByRole("tree", { name: "Tag hierarchy" });
    const rootItem = tree
      .getByRole("treeitem")
      .filter({ hasText: root.name })
      .first();
    await expect(rootItem).toBeVisible({ timeout: 15_000 });
    await expect(rootItem).toHaveAttribute("aria-expanded", "true");
    await expect(
      tree.getByRole("treeitem").filter({ hasText: child.name }).first()
    ).toBeVisible();
  });

  test("the folder view shows tag folders", async ({ page }) => {
    const tags = await treeTags(page, () => page.goto("/scenes?view=folder"));
    const roots = tags.filter((t) => t.parents.length === 0);
    requireData(roots.length > 0, "a root tag");

    // Folder cards are the buttons with a heading
    const folders = page.locator("button:has(h3)");
    await expect(folders.first()).toBeVisible({ timeout: 15_000 });
    const names = await folders.locator("h3").allTextContents();
    const root = requireData(
      roots.find((r) => names.includes(r.name)),
      "a root tag folder"
    );

    // Opening it puts the tag and its instance in the path
    await folders
      .filter({
        has: page.getByRole("heading", { name: root.name, exact: true }),
      })
      .first()
      .click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("folderPath") === `${root.id}:${root.instanceId}`
    );
  });

  test("opening a gallery folder shows its own galleries under its sub-folders, paged over the galleries only", async ({
    page,
  }) => {
    // The root lists folders only: no gallery page is asked for
    const galleryRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/library/galleries") {
        galleryRequests.push(request.postData() ?? "");
      }
    });
    const tags = await treeTags(page, () =>
      page.goto("/galleries?view=folder&per_page=1")
    );
    const byKey = new Map(tags.map((t) => [`${t.id}:${t.instanceId}`, t]));
    const count = (t: TreeTagJson) => t.gallery_count ?? 0;
    // The tag with the most galleries of its own, opened from its root (the
    // replay's tags are on one gallery each: the unit tests page over more)
    const target = requireData(
      [...tags].sort((a, b) => count(b) - count(a)).find((t) => count(t) >= 1),
      "a tag on a gallery"
    );
    const path: TreeTagJson[] = [target];
    for (
      let parent = target.parents[0];
      parent !== undefined && path.length < 20;
      parent = path[0]?.parents[0]
    ) {
      const tag = byKey.get(`${parent.id}:${target.instanceId}`);
      if (!tag) break;
      path.unshift(tag);
    }

    const folders = page.locator("button:has(h3)");
    await expect(folders.first()).toBeVisible({ timeout: 15_000 });
    expect(galleryRequests).toEqual([]);

    // Open each folder down to the target
    let listed: Promise<Response> | null = null;
    for (const tag of path) {
      listed = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/library/galleries" &&
          (r.request().postData() ?? "").includes(
            `"${tag.id}:${tag.instanceId}"`
          )
      );
      await folders
        .filter({
          has: page.getByRole("heading", { name: tag.name, exact: true }),
        })
        .first()
        .click();
    }
    const response = await requireData(listed, "the target folder's request");
    const body = response.request().postDataJSON() as {
      gallery_filter?: { tags?: unknown };
    };
    // The folder's own galleries: its tag at depth 0, not its sub-tags'
    expect(body.gallery_filter?.tags).toEqual({
      value: [`${target.id}:${target.instanceId}`],
      modifier: "INCLUDES",
      depth: 0,
    });
    const answer = (await response.json()) as {
      findGalleries: { count: number };
    };
    // The folder's badge was its list's total
    expect(answer.findGalleries.count).toBe(count(target));

    // One gallery a page, paged over the folder's galleries only
    const list = new ListPage(page);
    await expect(list.cards("Gallery")).toHaveCount(1, { timeout: 15_000 });
    await expect(
      page.getByText(
        `${count(target)} ${count(target) === 1 ? "gallery" : "galleries"} in this folder`
      )
    ).toBeVisible();
    await expect(
      page.getByText(`Showing 1-1 of ${count(target)} records`).first()
    ).toBeVisible();

    // Sub-folders with galleries sit above the galleries
    const children = tags.filter(
      (t) =>
        t.instanceId === target.instanceId &&
        t.parents.some((p) => p.id === target.id) &&
        count(t) > 0
    );
    for (const child of children) {
      await expect(
        folders.filter({
          has: page.getByRole("heading", { name: child.name, exact: true }),
        })
      ).toBeVisible();
    }
  });

  test("the Untagged folder lists the untagged images, its badge their total", async ({
    page,
  }) => {
    const tree = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/library/tags/tree" &&
        r.request().method() === "POST"
    );
    await page.goto("/images?view=folder");
    const treeResponse = await tree;
    // The tree counts the page's type only
    expect(treeResponse.request().postDataJSON()).toEqual({
      untagged: "image",
    });
    const { untagged } = (await treeResponse.json()) as { untagged?: number };
    const total = requireData(
      untagged !== undefined && untagged > 0 ? untagged : undefined,
      "an untagged image"
    );

    const folder = page.locator("button:has(h3)").filter({
      has: page.getByRole("heading", { name: "Untagged", exact: true }),
    });
    const noun = total === 1 ? "image" : "images";
    await expect(folder.getByLabel(`${total} ${noun}`)).toBeVisible({
      timeout: 15_000,
    });

    const listed = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/library/images" &&
        r.request().method() === "POST"
    );
    await folder.click();
    const response = await listed;
    const body = response.request().postDataJSON() as {
      image_filter?: Record<string, unknown>;
    };
    expect(body.image_filter).toEqual({
      tag_count: { value: 0, modifier: "EQUALS" },
    });
    const answer = (await response.json()) as { findImages: { count: number } };
    expect(answer.findImages.count).toBe(total);
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("folderPath") === "__untagged__"
    );
    await expect(
      page.getByText(`${total} ${noun} in this folder`)
    ).toBeVisible();
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

  // FILTERS-11: a card's count opens its list through a filter that page
  // declares. The Images page's studio filter is studioIds, which the link's
  // studioId sets; before, the link opened every image.
  test("a studio card's image count opens the images of that studio", async ({
    page,
  }) => {
    interface StudioRow {
      id: string;
      instanceId: string;
      name: string;
      image_count: number;
    }
    const imageCount = async (studio?: StudioRow) => {
      const response = await page.request.post("/api/library/images", {
        data: {
          filter: { per_page: 1 },
          ...(studio && {
            image_filter: {
              studios: {
                value: [`${studio.id}:${studio.instanceId}`],
                modifier: "INCLUDES",
              },
            },
          }),
        },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return ((await response.json()) as { findImages: { count: number } })
        .findImages.count;
    };

    const listed = await page.request.post("/api/library/studios", {
      data: { filter: { per_page: 250, sort: "name", direction: "ASC" } },
    });
    expect(listed.ok(), await listed.text()).toBeTruthy();
    const { studios } = (
      (await listed.json()) as { findStudios: { studios: StudioRow[] } }
    ).findStudios;

    // A studio with some of the library's images, not all of them, so an
    // unfiltered list cannot pass for its images
    const all = await imageCount();
    let subject: { studio: StudioRow; count: number } | undefined;
    for (const studio of studios.filter((each) => each.image_count > 0)) {
      const count = await imageCount(studio);
      if (count > 0 && count < all) {
        subject = { studio, count };
        break;
      }
    }
    const { studio, count } = requireData(
      subject,
      "a studio with some of the library's images"
    );

    const list = new ListPage(page);
    await list.goto(`/studios?q=${encodeURIComponent(studio.name)}`);
    await list.waitForResults("Studio");
    const card = list.cards("Studio").filter({
      has: page.locator(".card-title").getByText(studio.name, { exact: true }),
    });
    await expect(card).toHaveCount(1);

    const images = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/library/images" &&
        r.request().method() === "POST"
    );
    await card
      .locator(
        ".card-indicator-icon:has(svg.lucide-images) + .card-indicator-text"
      )
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/images\\?studioId=${studio.id}(&|$)`)
    );
    const response = await images;
    const sent = response.request().postDataJSON() as {
      image_filter?: { studios?: { value?: string[] } };
    };
    expect(sent.image_filter?.studios?.value).toHaveLength(1);
    expect(sent.image_filter?.studios?.value?.[0]).toMatch(
      new RegExp(`^${studio.id}(:|$)`)
    );
    const body = (await response.json()) as { findImages: { count: number } };
    expect(body.findImages.count).toBe(count);
  });
});
