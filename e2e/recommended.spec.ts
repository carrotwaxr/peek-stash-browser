import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import { deleteUsers } from "./support/cleanup";
import { requireData } from "./support/data";
import { runPrefix } from "./support/names";
import {
  type TestUser,
  completeSetup,
  createUser,
  signIn,
} from "./support/users";

/**
 * E2E tests for the Recommended page as a list page: Grid, Wall and Table,
 * the page size at the top and bottom, the chip bar, a View of its own, a
 * group of rows, the phone's filter sheet and TV mode's PageDown. The page
 * lists the user's top 500 scenes; a filter or a search works within them,
 * and the page says so.
 *
 * Recommended is the user's own data: a throwaway user favourites a
 * performer of the replay in beforeAll, and every case runs as that user,
 * never the run admin. afterAll deletes the user, and the favourite with it.
 */

const RECOMMENDED_LIMIT = 500;

interface Ref {
  id: string;
  instanceId: string;
}

interface SceneRow extends Ref {
  title: string;
}

interface TagRef extends Ref {
  name: string;
}

const refOf = (tag: Ref) => `${tag.id}:${tag.instanceId}`;

/** Recommended's list endpoint, as the page calls it (not `/count`) */
const isRecommendedList = (url: string, method: string) =>
  new URL(url).pathname === "/api/library/scenes/recommended" &&
  method === "POST";

/** Recommended's count endpoint, which the filter sheet asks */
const isRecommendedCount = (url: string, method: string) =>
  new URL(url).pathname === "/api/library/scenes/recommended/count" &&
  method === "POST";

/** The scene ids a page's links name, in page order, each once */
const sceneIdsOn = (scope: Locator): Promise<string[]> =>
  scope.locator('a[href^="/scene/"]').evaluateAll((links) => {
    const ids: string[] = [];
    for (const link of links) {
      const id = /^\/scene\/([^/?]+)/.exec(
        link.getAttribute("href") ?? ""
      )?.[1];
      if (id && !ids.includes(id)) ids.push(id);
    }
    return ids;
  });

/** The ids of the scenes the list shows, once it has settled on `count` of them */
async function settledIds(page: Page, count: number): Promise<string[]> {
  const main = page.locator("main");
  await expect.poll(async () => (await sceneIdsOn(main)).length).toBe(count);
  return sceneIdsOn(main);
}

/** The total the pagination bar reads ("Showing 1-12 of 361 records") */
async function shownTotal(page: Page, list: ListPage): Promise<number> {
  const info = page.getByText(/of [\d,]+ records/).first();
  await expect(info.or(list.emptyState)).toBeVisible({ timeout: 15_000 });
  if (await list.emptyState.isVisible()) return 0;
  const text = (await info.textContent()) ?? "";
  return Number(/of ([\d,]+) records/.exec(text)?.[1]?.replace(/,/g, ""));
}

/** The list settles on this total (a page change shows the old one until the answer) */
async function expectShown(page: Page, list: ListPage, total: number) {
  await expect
    .poll(() => shownTotal(page, list), { timeout: 15_000 })
    .toBe(total);
}

/** Every scene of the user's top list, in rank order, as the API pages it */
async function rankedScenes(
  api: APIRequestContext,
  perPage = 250
): Promise<SceneRow[]> {
  const scenes: SceneRow[] = [];
  for (let page = 1; ; page++) {
    const response = await mustOk(
      await api.post("/api/library/scenes/recommended", {
        data: { filter: { page, per_page: perPage, sort: "recommended" } },
      }),
      "POST /api/library/scenes/recommended"
    );
    const body = (await response.json()) as {
      scenes: SceneRow[];
      count: number;
    };
    scenes.push(...body.scenes);
    if (scenes.length >= body.count || body.scenes.length === 0) break;
  }
  return scenes;
}

/** One page of the ranked list, with the page size the page uses */
async function rankedPage(
  api: APIRequestContext,
  page: number,
  perPage: number
): Promise<string[]> {
  const response = await mustOk(
    await api.post("/api/library/scenes/recommended", {
      data: { filter: { page, per_page: perPage, sort: "recommended" } },
    }),
    "POST /api/library/scenes/recommended"
  );
  return ((await response.json()) as { scenes: SceneRow[] }).scenes.map(
    (scene) => scene.id
  );
}

/**
 * The scenes holding one tag, as the Scenes list answers for that single
 * rule (a row carries only some of its scene's tags, so the rows cannot be
 * read for them)
 */
async function scenesWith(
  api: APIRequestContext,
  tag: TagRef
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let page = 1; page <= 20; page++) {
    const response = await mustOk(
      await api.post("/api/library/scenes", {
        data: {
          filter: { per_page: 250, page, sort: "title", direction: "ASC" },
          where: {
            match: "all",
            rules: [
              {
                field: "tags",
                criterion: { value: [refOf(tag)], modifier: "INCLUDES" },
              },
            ],
          },
        },
      }),
      "POST /api/library/scenes"
    );
    const { findScenes } = (await response.json()) as {
      findScenes: { scenes: Ref[] };
    };
    for (const scene of findScenes.scenes) ids.add(scene.id);
    if (findScenes.scenes.length < 250) break;
  }
  return ids;
}

/** The scenes of one performer, as the Scenes list answers for that rule */
async function scenesOf(
  api: APIRequestContext,
  performer: Ref
): Promise<Set<string>> {
  const response = await mustOk(
    await api.post("/api/library/scenes", {
      data: {
        filter: { per_page: 250, sort: "title", direction: "ASC" },
        where: {
          match: "all",
          rules: [
            {
              field: "performers",
              criterion: { value: [refOf(performer)], modifier: "INCLUDES" },
            },
          ],
        },
      },
    }),
    "POST /api/library/scenes"
  );
  const { findScenes } = (await response.json()) as {
    findScenes: { scenes: Ref[] };
  };
  return new Set(findScenes.scenes.map((scene) => scene.id));
}

/** A tag that holds scenes, and the scenes of the rank that hold it */
interface TagReach {
  tag: TagRef;
  ids: Set<string>;
}

/**
 * The tags that hold some of the ranked scenes but not all of them (the
 * ten largest by scene count), each with the ranked scenes holding it
 */
async function narrowingTags(
  api: APIRequestContext,
  ranked: readonly SceneRow[]
): Promise<TagReach[]> {
  const response = await mustOk(
    await api.post("/api/library/tags", {
      data: {
        filter: { per_page: 10, sort: "scenes_count", direction: "DESC" },
      },
    }),
    "POST /api/library/tags"
  );
  const { findTags } = (await response.json()) as {
    findTags: { tags: TagRef[] };
  };
  const inRank = new Set(ranked.map((scene) => scene.id));
  const reaches: TagReach[] = [];
  for (const tag of findTags.tags) {
    const ids = new Set(
      [...(await scenesWith(api, tag))].filter((id) => inRank.has(id))
    );
    if (ids.size > 1 && ids.size < ranked.length) reaches.push({ tag, ids });
  }
  return reaches.sort((x, y) => y.ids.size - x.ids.size);
}

/** The sort select's shown value */
const sortValue = (list: ListPage) => list.sortControl.locator("select");

test.describe("Recommended", () => {
  let viewer: TestUser;
  let favourite: Ref;

  test.beforeAll(async ({ request, browser, baseURL }) => {
    viewer = await createUser(request, "recommended");
    const context = await signIn(browser, baseURL, viewer);
    try {
      await completeSetup(context);
      // The performer with the most scenes, as the user's one favourite
      const found = await mustOk(
        await context.request.post("/api/library/performers", {
          data: {
            filter: { per_page: 1, sort: "scenes_count", direction: "DESC" },
          },
        }),
        "POST /api/library/performers"
      );
      favourite = requireData(
        (
          (await found.json()) as {
            findPerformers: { performers: Ref[] };
          }
        ).findPerformers.performers[0],
        "a performer"
      );
      await mustOk(
        await context.request.put(`/api/ratings/performer/${favourite.id}`, {
          data: { favorite: true, instanceId: favourite.instanceId },
        }),
        "Favoriting a performer"
      );
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ request }, testInfo) => {
    await deleteUsers(
      request,
      `${runPrefix()}-recommended-${testInfo.workerIndex}-`
    );
  });

  /** A page of the viewer's, signed in, with first sign-in done */
  async function open(
    browser: Browser,
    baseURL: string | undefined,
    options: { viewport?: { width: number; height: number }; tv?: boolean } = {}
  ): Promise<{ context: BrowserContext; page: Page; list: ListPage }> {
    const context = await signIn(browser, baseURL, viewer);
    if (options.tv) {
      await context.addInitScript(() => {
        localStorage.setItem("peek-tv-mode", "true");
      });
    }
    const page = await context.newPage();
    if (options.viewport) await page.setViewportSize(options.viewport);
    return { context, page, list: new ListPage(page) };
  }

  /** Opens Recommended at `path` and waits for its first cards */
  async function openRecommended(list: ListPage, path = "/recommended") {
    await list.goto(path);
    requireData(await list.waitForResults("Scene"), "recommended scenes");
  }

  test("Recommended lists scenes in rank order and pages with the page size at the top and bottom", async ({
    browser,
    baseURL,
  }) => {
    const { context, page, list } = await open(browser, baseURL);
    try {
      await openRecommended(list, "/recommended?per_page=12");
      const ranked = await rankedScenes(context.request);
      requireData(
        ranked.length > 24 || null,
        "more than 24 recommended scenes"
      );

      // Rank first: the sort offers Recommended and starts on it
      await expect(sortValue(list)).toHaveValue("recommended");
      await expect(sortValue(list).locator("option").first()).toHaveText(
        "Recommended"
      );

      // The rank puts the favourite performer's scenes first: the top scene
      // is one of theirs
      const hers = await scenesOf(context.request, favourite);
      expect(hers.size).toBeGreaterThan(0);
      expect(hers.has(requireData(ranked[0], "a recommended scene").id)).toBe(
        true
      );

      // The first page is the first 12 of the rank
      const first = await settledIds(page, 12);
      expect(first).toEqual(ranked.slice(0, 12).map((scene) => scene.id));
      await expectShown(page, list, ranked.length);

      // The page size is offered above and below the cards, and both work
      const sizes = page.locator("#perPage");
      await expect(sizes).toHaveCount(2);
      await sizes.first().selectOption("48");
      await expect(page).toHaveURL(/[?&]per_page=48(&|$)/);
      expect(await settledIds(page, 48)).toEqual(
        ranked.slice(0, 48).map((scene) => scene.id)
      );
      await expect(sizes.last()).toHaveValue("48");
      await sizes.last().selectOption("12");
      await expect(page).toHaveURL(/[?&]per_page=12(&|$)/);
      await expect(sizes.first()).toHaveValue("12");
      await settledIds(page, 12);

      // Next and Previous, above and below, move through the rank
      await page.locator('button[aria-label="Next Page"]').first().click();
      await expect(page).toHaveURL(/[?&]page=2(&|$)/);
      const second = await rankedPage(context.request, 2, 12);
      await expect.poll(() => sceneIdsOn(page.locator("main"))).toEqual(second);
      await list.nextPage.click();
      await expect(page).toHaveURL(/[?&]page=3(&|$)/);
      await expect
        .poll(() => sceneIdsOn(page.locator("main")))
        .toEqual(await rankedPage(context.request, 3, 12));
      await list.previousPage.click();
      await expect(page).toHaveURL(/[?&]page=2(&|$)/);
      await expect.poll(() => sceneIdsOn(page.locator("main"))).toEqual(second);
    } finally {
      await context.close();
    }
  });

  test("a chip filter narrows the list and the notice says it filters within the top 500", async ({
    browser,
    baseURL,
  }) => {
    const { context, page, list } = await open(browser, baseURL);
    try {
      await openRecommended(list, "/recommended?per_page=250");
      const ranked = await rankedScenes(context.request);
      const { tag, ids } = requireData(
        (await narrowingTags(context.request, ranked))[0],
        "a tag on some of the recommended scenes"
      );
      const total = await shownTotal(page, list);
      expect(ids.size).toBeLessThan(total);

      // No filter, no notice
      const notice = page.getByRole("status").filter({
        hasText: `Filtering within your top ${RECOMMENDED_LIMIT} recommendations`,
      });
      await expect(notice).toHaveCount(0);

      // "+ Filter": type the tag's name and pick it under Values
      await list.addFilterButton.click();
      await page
        .getByRole("combobox", { name: "Find a filter" })
        .fill(tag.name);
      const answered = page.waitForResponse(
        (response) =>
          isRecommendedList(response.url(), response.request().method()) &&
          JSON.stringify(response.request().postDataJSON()).includes(refOf(tag))
      );
      await page
        .getByRole("listbox", { name: "Filters" })
        .getByRole("option", { name: `Tags: ${tag.name}`, exact: true })
        .click();
      const filtered = await answered;
      expect(((await filtered.json()) as { count: number }).count).toBe(
        ids.size
      );

      // The count fell to the tag's scenes within the rank, every card has
      // the tag, and the notice says where the filter works
      await expect(notice).toBeVisible();
      await expectShown(page, list, ids.size);
      const shown = await settledIds(page, ids.size);
      for (const id of shown) expect(ids.has(id)).toBe(true);
      expect(shown).toEqual(
        ranked.filter((scene) => ids.has(scene.id)).map((scene) => scene.id)
      );
      expect(new URL(page.url()).searchParams.get("tagIds")).toBe(refOf(tag));

      // Clearing the chip takes the notice and the narrowing away
      await page.getByRole("button", { name: /^Remove filter:/ }).click();
      await expect(notice).toHaveCount(0);
      await expectShown(page, list, total);
    } finally {
      await context.close();
    }
  });

  test("a View saved on Recommended reopens with its filter and Recommended sort", async ({
    browser,
    baseURL,
  }) => {
    const { context, page, list } = await open(browser, baseURL);
    const viewName = `e2e recommended ${Date.now()}`;
    try {
      await openRecommended(list, "/recommended?per_page=250");
      const ranked = await rankedScenes(context.request);
      const { tag, ids } = requireData(
        (await narrowingTags(context.request, ranked))[0],
        "a tag on some of the recommended scenes"
      );

      // A filter, the Wall and 48 a page, on the rank sort
      await page.goto(
        `/recommended?per_page=48&view=wall&tagIds=${refOf(tag)}`
      );
      await expectShown(page, list, ids.size);
      await expect(sortValue(list)).toHaveValue("recommended");

      // Save as new view, as the default for the Recommended page
      await list.viewsButton.click();
      await page.getByRole("menuitem", { name: "Save as new view" }).click();
      const dialog = page.getByRole("dialog", { name: "Save view" });
      await dialog.getByLabel("Name").fill(viewName);
      await dialog.getByLabel("Set as default for Recommended page").check();
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(list.viewsButton).toHaveAccessibleName(`Views: ${viewName}`);

      // A fresh visit, nothing in the URL: the default View applies, with
      // its filter, its rank sort and its presentation
      await page.goto("/recommended");
      await expect(list.viewsButton).toHaveAccessibleName(
        `Views: ${viewName}`,
        { timeout: 15_000 }
      );
      await expect(sortValue(list)).toHaveValue("recommended");
      await expectShown(page, list, ids.size);
      await expect(
        page.getByRole("button", { name: /^Edit filter: Tags/ })
      ).toBeVisible();
      await expect(page.locator(".wall-item").first()).toBeVisible();
      await expect(page.locator("#perPage").first()).toHaveValue("48");

      // Its default belongs to Recommended: Scenes has none
      await page.goto("/scenes");
      await expect(list.viewsButton).toHaveAccessibleName("Views");
      expect(await shownTotal(page, list)).toBeGreaterThan(ids.size);
    } finally {
      // Views are the user's, and every case shares the user: remove it
      const saved = await context.request.get("/api/user/filter-presets");
      if (saved.ok()) {
        const { presets } = (await saved.json()) as {
          presets: Record<string, Array<{ id: string; name: string }>>;
        };
        for (const view of presets["scene"] ?? []) {
          if (view.name === viewName) {
            await context.request.delete(
              `/api/user/filter-presets/scene/${view.id}`
            );
          }
        }
      }
      await context.close();
    }
  });

  test("a group of two Tags rows in an 'any' group narrows within the top 500", async ({
    browser,
    baseURL,
  }) => {
    const { context, page, list } = await open(browser, baseURL);
    try {
      const ranked = await rankedScenes(context.request);
      // Two tags whose union is wider than either and narrower than the rank
      const tags = (await narrowingTags(context.request, ranked)).slice(0, 12);
      let pair: [(typeof tags)[number], (typeof tags)[number]] | null = null;
      for (const a of tags) {
        for (const b of tags) {
          if (a === b || pair) continue;
          const union = new Set([...a.ids, ...b.ids]);
          if (
            union.size > a.ids.size &&
            union.size > b.ids.size &&
            union.size < ranked.length
          ) {
            pair = [a, b];
          }
        }
      }
      const [a, b] = requireData(pair, "two tags whose union narrows the rank");
      const expected = new Set([...a.ids, ...b.ids]);

      // The flat URL form (item 64): group 1 matches any, its Tags rows are
      // the group's 1st and 2nd
      const params = new URLSearchParams({
        per_page: "250",
        g1: "any",
        "g1.tagIds": refOf(a.tag),
        "g1.tagIdsModifier": "INCLUDES",
        "g1.2.tagIds": refOf(b.tag),
        "g1.2.tagIdsModifier": "INCLUDES",
      });
      const answered = page.waitForResponse(
        (response) =>
          isRecommendedList(response.url(), response.request().method()) &&
          JSON.stringify(response.request().postDataJSON()).includes(
            refOf(b.tag)
          )
      );
      await list.goto(`/recommended?${params.toString()}`);
      expect(((await (await answered).json()) as { count: number }).count).toBe(
        expected.size
      );

      // One group chip, the union's count, in rank order, and the notice
      await expect(
        page.getByRole("button", { name: /^Edit filter group/ })
      ).toHaveCount(1);
      await expectShown(page, list, expected.size);
      expect(await settledIds(page, expected.size)).toEqual(
        ranked
          .filter((scene) => expected.has(scene.id))
          .map((scene) => scene.id)
      );
      await expect(
        page.getByRole("status").filter({
          hasText: `Filtering within your top ${RECOMMENDED_LIMIT} recommendations`,
        })
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("Wall and Table show the same scenes as Grid", async ({
    browser,
    baseURL,
  }) => {
    const { context, page, list } = await open(browser, baseURL);
    try {
      await openRecommended(list, "/recommended?per_page=24");
      const grid = await settledIds(page, 24);
      expect(grid).toEqual(
        (await rankedPage(context.request, 1, 24)).slice(0, 24)
      );

      await list.viewModeButton.click();
      await page.getByRole("option", { name: "Wall view" }).click();
      await expect(page).toHaveURL(/[?&]view=wall(&|$)/);
      await expect(page.locator(".wall-item").first()).toBeVisible();
      expect(await settledIds(page, 24)).toEqual(grid);

      await list.viewModeButton.click();
      await page.getByRole("option", { name: "Table view" }).click();
      await expect(page).toHaveURL(/[?&]view=table(&|$)/);
      await expect(page.locator("tbody tr").first()).toBeVisible();
      expect(await settledIds(page, 24)).toEqual(grid);

      // The page has no timeline or folder view
      await list.viewModeButton.click();
      await expect(
        page.getByRole("option", {
          name: /^(Grid|Wall|Table|Timeline|Folder) view$/,
        })
      ).toHaveCount(3);
      await page.keyboard.press("Escape");
    } finally {
      await context.close();
    }
  });

  test("TV mode: PageDown pages the list", async ({ browser, baseURL }) => {
    const { context, page, list } = await open(browser, baseURL, {
      viewport: { width: 1920, height: 1080 },
      tv: true,
    });
    try {
      await openRecommended(list, "/recommended?per_page=12");
      requireData((await list.nextPage.isEnabled()) || null, "a second page");
      const secondPage = await rankedPage(context.request, 2, 12);

      await list.cards("Scene").first().focus();
      await page.keyboard.press("PageDown");
      await expect(page).toHaveURL(/[?&]page=2(&|$)/);
      await expect
        .poll(() => sceneIdsOn(page.locator("main")))
        .toEqual(secondPage);

      await page.keyboard.press("PageUp");
      await expect(page).not.toHaveURL(/[?&]page=2(&|$)/);
    } finally {
      await context.close();
    }
  });

  test("a 390 px phone opens the filter sheet; 'Show N results' counts within the 500", async ({
    browser,
    baseURL,
  }) => {
    const { context, page, list } = await open(browser, baseURL, {
      viewport: { width: 390, height: 844 },
    });
    try {
      const ranked = await rankedScenes(context.request);
      const { tag, ids } = requireData(
        (await narrowingTags(context.request, ranked))[0],
        "a tag on some of the recommended scenes"
      );
      await openRecommended(list, "/recommended?per_page=250");

      // The sheet counts the whole rank first
      await list.filtersButton.click();
      await expect(list.sheet).toBeVisible();
      await expect(list.showResults).toHaveText(
        `Show ${ranked.length.toLocaleString("en-US")} results`
      );
      await page.getByRole("combobox", { name: "Find a filter" }).fill("Tags");
      await page
        .getByRole("listbox", { name: "Filters" })
        .getByRole("option", { name: "Tags", exact: true })
        .click();
      const row = list.sheetRow("Tags");
      await expect(row).toBeVisible();

      // A tag picked in the sheet is counted by Recommended's count route,
      // within the rank, and nothing applies before Show N
      const counted = page.waitForRequest(
        (request) =>
          isRecommendedCount(request.url(), request.method()) &&
          JSON.stringify(request.postDataJSON()).includes(refOf(tag))
      );
      await row.getByRole("button", { name: /^Tags: Select tags/ }).click();
      await row.getByPlaceholder("Type to search...").fill(tag.name);
      await row.getByRole("button", { name: tag.name, exact: true }).click();
      await counted;
      await expect(list.showResults).toHaveText(
        `Show ${ids.size.toLocaleString("en-US")} results`
      );
      expect(new URL(page.url()).searchParams.get("tagIds")).toBeNull();

      // Show N applies them: the list is the count
      await list.showResults.click();
      await expect(list.sheet).toHaveCount(0);
      await expect(page).toHaveURL(/[?&]tagIds=/);
      await expectShown(page, list, ids.size);
      await expect(
        page.getByRole("status").filter({
          hasText: `Filtering within your top ${RECOMMENDED_LIMIT} recommendations`,
        })
      ).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
