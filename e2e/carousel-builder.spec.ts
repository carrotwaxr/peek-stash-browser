import {
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import { requireData } from "./support/data";
import { addRow, pickValues } from "./support/filterRows";
import { uniqueName } from "./support/names";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";

/**
 * E2E tests for the carousel builder with groups (item 64): build a carousel
 * whose rules are a Match any group, preview it, save it, see it on Home,
 * follow See More, edit it and delete it; and a carousel on one playlist
 * rule sorted by Playlist order.
 *
 * Carousels, favorites and playlists are per-user state: each test runs as a
 * throwaway user, deleted after.
 */

interface Ref {
  id: string;
  instanceId: string;
}

interface SceneRow extends Ref {
  title: string;
  tags: Array<Ref & { name: string }>;
  performers: Array<Ref & { name: string }>;
}

/** The scene ids of the cards in a locator, in page order */
const sceneIdsIn = (scope: Locator): Promise<string[]> =>
  scope
    .locator('[aria-label="Scene"]')
    .evaluateAll((cards) =>
      cards.map(
        (card) =>
          /^\/scene\/([^/?]+)/.exec(
            card.querySelector('a[href^="/scene/"]')?.getAttribute("href") ?? ""
          )?.[1] ?? ""
      )
    );

/** A Home carousel's section, by its heading */
const homeCarousel = (page: Page, title: string) =>
  page
    .locator("div.mb-8")
    .filter({ has: page.getByRole("heading", { level: 2, name: title }) });

async function scenesBy(api: APIRequestContext, sort: string, perPage: number) {
  const response = await mustOk(
    await api.post("/api/library/scenes", {
      data: { filter: { per_page: perPage, sort, direction: "ASC" } },
    }),
    "POST /api/library/scenes"
  );
  return ((await response.json()) as { findScenes: { scenes: SceneRow[] } })
    .findScenes.scenes;
}

test.describe("Carousel builder", () => {
  const created: number[] = [];

  test.afterAll(async ({ request }) => {
    for (const id of created.splice(0)) {
      await deleteUser(request, id);
    }
  });

  /** A signed-in throwaway user, through the API, with first sign-in done */
  async function newUser(
    browser: Parameters<typeof signIn>[0],
    baseURL: string | undefined,
    request: APIRequestContext,
    purpose: string
  ): Promise<BrowserContext> {
    const user = await createUser(request, purpose);
    created.push(user.id);
    const context = await signIn(browser, baseURL, user);
    await completeSetup(context);
    return context;
  }

  test("a carousel with a Match any group: build, preview, save, show on Home, See More, edit, delete", async ({
    browser,
    baseURL,
    request,
  }) => {
    const context = await newUser(browser, baseURL, request, "carousel-group");
    try {
      // A favorite tag and a favorite performer, set through the API
      const scenes = await scenesBy(context.request, "title", 250);
      const tag = requireData(
        scenes.flatMap((scene) => scene.tags)[0],
        "a scene with a tag"
      );
      const performer = requireData(
        scenes.flatMap((scene) => scene.performers)[0],
        "a scene with a performer"
      );
      for (const [type, entity] of [
        ["tag", tag],
        ["performer", performer],
      ] as const) {
        await mustOk(
          await context.request.put(`/api/ratings/${type}/${entity.id}`, {
            data: { favorite: true, instanceId: entity.instanceId },
          }),
          `Favoriting a ${type}`
        );
      }

      const title = uniqueName("carousel");
      const page = await context.newPage();
      await page.goto("/settings/carousels/new");
      await expect(
        page.getByRole("heading", { name: "Create Carousel" })
      ).toBeVisible();
      await page.getByPlaceholder("My Custom Carousel").fill(title);

      // Group 1, Match any: Favorite Tags is Yes, Favorite Performers is Yes
      await page.getByRole("button", { name: "Add group" }).click();
      await page.getByLabel("Match for Group 1").selectOption("any");
      const editor = page.locator("body");
      for (const field of ["Favorite Tags", "Favorite Performers"]) {
        const row = await addRow(editor, "Group 1", field);
        await row.value.selectOption({ label: "Yes" });
      }
      await page.locator("#carousel-sort").selectOption("title");
      await page.getByRole("combobox").last().selectOption("ASC");

      // Preview lists scenes, and only then can the carousel be saved
      await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
      const previewed = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/carousels/preview" &&
          response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "Preview" }).click();
      const preview = (await (await previewed).json()) as {
        scenes: SceneRow[];
      };
      expect(preview.scenes.length).toBeGreaterThan(0);
      await expect(page.getByText(/^Showing \d+ scenes?$/)).toBeVisible();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page).toHaveURL(/\/settings\?/);

      // Home shows it, with the first scenes in title order
      await page.goto("/");
      const carousel = homeCarousel(page, title);
      await expect(
        carousel.locator('[aria-label="Scene"]').first()
      ).toBeVisible({ timeout: 15_000 });
      const onHome = await sceneIdsIn(carousel);
      expect(onHome.length).toBeGreaterThan(0);
      expect(onHome.slice(0, 3)).toEqual(
        preview.scenes.slice(0, 3).map((scene) => scene.id)
      );

      // See More opens the Scenes list with the group, and lists those scenes
      await carousel.getByRole("link", { name: "More" }).click();
      await expect(page).toHaveURL(/\/scenes\?/);
      const params = new URL(page.url()).searchParams;
      expect(params.get("g1")).toBe("any");
      expect(params.get("g1.tagFavorite")).toBe("true");
      expect(params.get("g1.performerFavorite")).toBe("true");
      const list = new ListPage(page);
      await list.waitForResults("Scene");
      const listed = await sceneIdsIn(page.locator("main"));
      for (const id of onHome) expect(listed).toContain(id);

      // The edit page shows the group and its two rows
      await page.goto("/settings?section=user&tab=navigation");
      await page.getByTitle("Edit carousel").click();
      await expect(
        page.getByRole("heading", { name: "Edit Carousel" })
      ).toBeVisible();
      await expect(page.getByPlaceholder("My Custom Carousel")).toHaveValue(
        title
      );
      const group = page.getByRole("group", { name: "Group 1" });
      await expect(group).toBeVisible();
      await expect(page.getByLabel("Match for Group 1")).toHaveValue("any");
      await expect(group.locator('select[id$="-field"]')).toHaveCount(2);
      // (the rows come back in the panel's order, not the order they were added in)
      expect(
        (
          await group
            .locator('select[id$="-field"]')
            .evaluateAll((els) =>
              els.map((el) => (el as HTMLSelectElement).value)
            )
        ).sort()
      ).toEqual(["performerFavorite", "tagFavorite"]);

      // Delete leaves no carousel, on Home or in the list
      await page.getByRole("button", { name: "Back" }).click();
      await expect(page).toHaveURL(/\/settings\?/);
      // (Back lands on the Customization tab; the carousels list is on Navigation)
      await page.goto("/settings?section=user&tab=navigation");
      await page.getByTitle("Delete carousel").click();
      await expect(page.getByTitle("Delete carousel")).toHaveCount(0);
      const remaining = (await (
        await mustOk(
          await context.request.get("/api/carousels"),
          "GET /api/carousels"
        )
      ).json()) as { carousels: unknown[] };
      expect(remaining.carousels).toHaveLength(0);
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Welcome", exact: false })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 2, name: title })
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("Playlist order with one playlist rule", async ({
    browser,
    baseURL,
    request,
  }) => {
    const context = await newUser(browser, baseURL, request, "carousel-order");
    try {
      // A playlist of three scenes, in an order the titles do not give
      const scenes = await scenesBy(context.request, "title", 3);
      requireData(scenes.length === 3 ? scenes : null, "three scenes");
      const [first, second, third] = scenes as [SceneRow, SceneRow, SceneRow];
      const inOrder = [third, first, second];
      const name = uniqueName("playlist");
      const playlist = (await (
        await mustOk(
          await context.request.post("/api/playlists", { data: { name } }),
          "POST /api/playlists"
        )
      ).json()) as { playlist: { id: number } };
      await mustOk(
        await context.request.post(
          `/api/playlists/${playlist.playlist.id}/items/bulk`,
          {
            data: {
              scenes: inOrder.map(({ id, instanceId }) => ({
                sceneId: id,
                instanceId,
              })),
            },
          }
        ),
        "Adding the scenes to the playlist"
      );

      const title = uniqueName("carousel");
      const page = await context.newPage();
      await page.goto("/settings/carousels/new");
      await page.getByPlaceholder("My Custom Carousel").fill(title);
      const row = await addRow(page.locator("body"), "top level", "Playlists");
      await pickValues(page, page.locator("body"), row, [name]);

      // The sort the one playlist rule makes available
      await page.locator("#carousel-sort").selectOption("playlist_position");
      await page.getByRole("combobox").last().selectOption("ASC");
      await page.getByRole("button", { name: "Preview" }).click();
      await expect(page.getByText("Showing 3 scenes")).toBeVisible();
      await page.getByRole("button", { name: "Save" }).click();
      await expect(page).toHaveURL(/\/settings\?/);

      // Home lists the scenes in the playlist's order
      await page.goto("/");
      const carousel = homeCarousel(page, title);
      await expect(carousel.locator('[aria-label="Scene"]')).toHaveCount(3, {
        timeout: 15_000,
      });
      expect(await sceneIdsIn(carousel)).toEqual(inOrder.map((s) => s.id));
    } finally {
      await context.close();
    }
  });
});
