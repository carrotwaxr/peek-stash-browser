import { type Locator, type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import { requireData } from "./support/data";
import { uniqueName } from "./support/names";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";

/**
 * Lists follow the address bar: Back and Forward step through pages and
 * filters, presentation changes replace the entry, a sidebar link opens the
 * list unfiltered, a random order keeps its seed, and a default preset
 * applies whenever the URL names no filter.
 *
 * Requests are counted by responses, never by requests: the Vite dev server
 * runs React in StrictMode, whose double mount aborts and resends a list
 * request (list hooks pass TanStack's signal); production builds do not.
 */

/** A card's title text */
const titleOf = (card: Locator) => card.locator(".card-title");
const titleLinkOf = (card: Locator) => card.locator("a:has(.card-title)");

/** Opens the scene list at `path` and waits for its cards */
async function openScenes(page: Page, path: string) {
  const list = new ListPage(page);
  await list.goto(path);
  requireData(await list.waitForResults("Scene"), "scenes");
  return { list, cards: list.cards("Scene") };
}

const firstTitle = async (cards: Locator) =>
  (await titleOf(cards.first()).innerText()).trim();

test.describe("List state in the URL", () => {
  test("Back after Next shows page 1's cards and pagination", async ({
    page,
  }) => {
    const { list, cards } = await openScenes(page, "/scenes?per_page=12");
    requireData(await list.nextPage.isEnabled(), "a second page of scenes");
    const pageOneTitle = await firstTitle(cards);
    await expect(list.previousPage).toBeDisabled();

    await list.nextPage.click();
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(titleOf(cards.first())).not.toHaveText(pageOneTitle);
    await expect(list.previousPage).toBeEnabled();

    await page.goBack();
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(titleOf(cards.first())).toHaveText(pageOneTitle);
    await expect(list.previousPage).toBeDisabled();
  });

  test("Back after applying a filter removes its chip and its results", async ({
    page,
  }) => {
    const { list, cards } = await openScenes(page, "/scenes?per_page=12");
    const unfilteredTitle = await firstTitle(cards);
    const chip = page.getByRole("button", {
      name: /^Remove filter: Favorite/,
    });

    await list.openFilters();
    await page
      .locator("label", { hasText: /^Favorite Scenes$/ })
      .locator("..")
      .getByRole("combobox")
      .selectOption("Yes");
    await page.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(/[?&]favorite=true(&|$)/);
    await expect(chip).toBeVisible();

    await page.goBack();
    await expect(page).not.toHaveURL(/favorite=/);
    await expect(chip).toHaveCount(0);
    await expect(titleOf(cards.first())).toHaveText(unfilteredTitle);
  });

  test("a Resolution 'Greater Than' filter survives Apply and a reload", async ({
    page,
  }) => {
    const { list } = await openScenes(page, "/scenes?per_page=12");
    const resolution = page
      .locator("label", { hasText: /^Resolution$/ })
      .locator("..");
    const sceneRequest = () =>
      page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname.endsWith("/api/library/scenes") &&
          request.method() === "POST"
      );
    const modifierOf = (request: Awaited<ReturnType<typeof sceneRequest>>) =>
      (
        request.postDataJSON() as {
          scene_filter?: { resolution?: { modifier?: string } };
        }
      ).scene_filter?.resolution?.modifier;

    await list.openFilters();
    await page.getByRole("heading", { name: "Video Properties" }).click();
    await resolution.locator("select").nth(0).selectOption("GREATER_THAN");
    await resolution.locator("select").nth(1).selectOption("FULL_HD");
    const applied = sceneRequest();
    await page.getByRole("button", { name: "Apply Filters" }).click();
    await expect(page).toHaveURL(/[?&]resolution=FULL_HD(&|$)/);
    await expect(page).toHaveURL(/[?&]resolutionModifier=GREATER_THAN(&|$)/);
    expect(modifierOf(await applied)).toBe("GREATER_THAN");

    const reloaded = sceneRequest();
    await page.reload();
    expect(modifierOf(await reloaded)).toBe("GREATER_THAN");
    await list.openFilters();
    await page.getByRole("heading", { name: "Video Properties" }).click();
    await expect(resolution.locator("select").nth(0)).toHaveValue(
      "GREATER_THAN"
    );
    await expect(resolution.locator("select").nth(1)).toHaveValue("FULL_HD");
  });

  test("density, view and per-page changes add no history entry: one Back leaves the list", async ({
    page,
  }) => {
    await page.goto("/performers");
    const { list } = await openScenes(page, "/scenes");

    await page.getByRole("button", { name: "L size" }).click();
    await expect(page).toHaveURL(/[?&]grid_density=large(&|$)/);
    await list.perPage.selectOption("48");
    await expect(page).toHaveURL(/[?&]per_page=48(&|$)/);
    await list.viewModeButton.click();
    await page.getByRole("option", { name: "Wall view" }).click();
    await expect(page).toHaveURL(/[?&]view=wall(&|$)/);

    await page.goBack();
    await expect(page).toHaveURL(/\/performers$/);
  });

  test("clicking Scenes in the sidebar on a filtered list clears the filters", async ({
    page,
  }) => {
    const list = new ListPage(page);
    await list.goto("/scenes?favorite=true");
    const chip = page.getByRole("button", {
      name: /^Remove filter: Favorite/,
    });
    await expect(chip).toBeVisible();

    await page
      .locator("aside")
      .getByRole("link", { name: "Scenes", exact: true })
      .click();

    await expect(page).toHaveURL(/\/scenes$/);
    await expect(chip).toHaveCount(0);
    requireData(await list.waitForResults("Scene"), "scenes");
  });

  test("a random-sorted list shows the same first card after opening a scene and pressing Back", async ({
    page,
  }) => {
    const { cards } = await openScenes(page, "/scenes?sort=random");
    // The order's seed is written into the URL by one replace
    await expect(page).toHaveURL(/[?&]sort=random_\d+(&|$)/);
    const shuffledUrl = page.url();
    const shuffledTitle = await firstTitle(cards);

    await titleLinkOf(cards.first()).click();
    await expect(page).toHaveURL(/\/scene\//);

    await page.goBack();
    await expect(page).toHaveURL(shuffledUrl);
    await expect(titleOf(cards.first())).toHaveText(shuffledTitle);
  });

  test("a Performers default preset's filter still applies on a URL with instance", async ({
    browser,
    baseURL,
    request,
  }) => {
    // The preset is per-user state: a throwaway user of its own
    const user = await createUser(request, "list-preset");
    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const status = await mustOk(
        await context.request.get("/api/user/setup-status"),
        "GET /api/user/setup-status"
      );
      const { instances } = (await status.json()) as {
        instances: { id: string }[];
      };
      const instanceId = requireData(instances[0]?.id, "a Stash instance");
      await mustOk(
        await context.request.post("/api/user/filter-presets", {
          data: {
            artifactType: "performer",
            context: "performer",
            name: uniqueName("women"),
            filters: { gender: "FEMALE" },
            sort: "name",
            direction: "ASC",
            viewMode: "grid",
            zoomLevel: "medium",
            gridDensity: "medium",
            tableColumns: null,
            perPage: 24,
            setAsDefault: true,
          },
        }),
        "Saving the default Performers preset"
      );

      const page = await context.newPage();
      const listResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/library/performers") &&
          response.request().method() === "POST" &&
          response.ok()
      );
      await page.goto(`/performers?instance=${encodeURIComponent(instanceId)}`);

      const body = (await listResponse).request().postDataJSON() as {
        performer_filter?: { gender?: unknown };
        filter?: { sort?: string };
      };
      expect(body.performer_filter?.gender).toBeTruthy();
      expect(body.filter?.sort).toBe("name");
      await expect(
        page.getByRole("button", { name: /^Remove filter: Gender/ })
      ).toBeVisible();
    } finally {
      await context.close();
      await deleteUser(request, user.id);
    }
  });
});
