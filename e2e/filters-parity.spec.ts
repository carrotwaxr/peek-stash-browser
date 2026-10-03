import { expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import { requireData } from "./support/data";
import { uniqueName } from "./support/names";
import { sentCriterion } from "./support/sentFilter";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";

/**
 * E2E tests for the filters PR 9a brings level with Stash's: a gallery card's
 * Scenes count opens the Scenes list filtered by that gallery, and a Tags
 * filter that includes one tag and excludes another survives the URL and a
 * saved preset.
 */

interface GalleryRow {
  id: string;
  instanceId: string;
  relation_totals?: { scenes?: number };
}

interface TagRow {
  id: string;
  instanceId: string;
  name: string;
  scene_count?: number;
}

test.describe("Filters in step with Stash", () => {
  test("the gallery card's scenes count opens the Scenes list filtered by that gallery", async ({
    page,
  }) => {
    const list = new ListPage(page);
    const listed = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/library/galleries" &&
        r.request().method() === "POST"
    );
    await page.goto("/galleries?sort=title&dir=ASC");
    const rows = (
      (await (await listed).json()) as {
        findGalleries: { galleries: GalleryRow[] };
      }
    ).findGalleries.galleries;
    const index = rows.findIndex(
      (row) => (row.relation_totals?.scenes ?? 0) > 0
    );
    const gallery = requireData(rows[index], "a gallery with scenes");
    const sceneCount = gallery.relation_totals?.scenes ?? 0;
    await list.waitForResults("Gallery");

    // The count beside the Scenes icon is a link into the Scenes list
    const scenesRequest = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/library/scenes" &&
        r.request().method() === "POST" &&
        (r.request().postData() ?? "").includes('"galleries"')
    );
    await list
      .cards("Gallery")
      .nth(index)
      .locator(
        ".card-indicator-icon:has(svg.lucide-clapperboard) + .card-indicator-text"
      )
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/scenes\\?galleryId=${gallery.id}(&|$)`)
    );
    const response = await scenesRequest;
    const galleries = sentCriterion<{ value?: string[]; modifier?: string }>(
      response.request().postDataJSON(),
      "galleries"
    );
    expect(galleries?.value).toHaveLength(1);
    expect(galleries?.value?.[0]).toMatch(new RegExp(`^${gallery.id}(:|$)`));
    const body = (await response.json()) as { findScenes: { count: number } };
    expect(body.findScenes.count).toBe(sceneCount);
    await expect(
      page.getByRole("button", { name: /^Edit filter: Galleries/ })
    ).toBeVisible();
  });

  test("Tags include X, exclude Y round-trips through the URL and a saved preset", async ({
    browser,
    baseURL,
    request,
  }) => {
    // The preset is per-user state: a throwaway user of its own
    const user = await createUser(request, "filter-tags");
    const context = await signIn(browser, baseURL, user);
    try {
      await completeSetup(context);
      const listed = await mustOk(
        await context.request.post("/api/library/tags", {
          data: {
            filter: { per_page: 250, sort: "scenes_count", direction: "DESC" },
          },
        }),
        "POST /api/library/tags"
      );
      const tags = (
        (await listed.json()) as { findTags: { tags: TagRow[] } }
      ).findTags.tags.filter((tag) => (tag.scene_count ?? 0) > 0);
      const included = requireData(tags[0], "a tag on scenes");
      const excluded = requireData(
        tags.find((tag) => tag.name !== included.name),
        "a second tag on scenes"
      );
      const includedRef = `${included.id}:${included.instanceId}`;
      const excludedRef = `${excluded.id}:${excluded.instanceId}`;

      const page = await context.newPage();
      const list = new ListPage(page);
      await list.goto("/scenes");
      await list.waitForResults("Scene");

      // Pick both tags in the Tags chip's editor (its list opens with it),
      // then turn the second into an exclusion; each change applies at once
      const editor = await list.addFilter("Tags");
      const search = editor.getByPlaceholder("Type to search...");
      for (const tag of [included, excluded]) {
        await search.fill(tag.name);
        await editor
          .getByRole("button", { name: tag.name, exact: true })
          .first()
          .click();
      }
      await page.keyboard.press("Escape");
      await expect(search).toHaveCount(0);
      const applied = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/library/scenes" &&
          r.request().method() === "POST" &&
          (r.request().postData() ?? "").includes('"excludes"')
      );
      await editor
        .getByRole("button", { name: `Exclude ${excluded.name}`, exact: true })
        .click();
      await expect(
        editor.getByRole("button", { name: `Exclude ${excluded.name}` })
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        editor.getByRole("button", { name: `Exclude ${included.name}` })
      ).toHaveAttribute("aria-pressed", "false");
      await list.closeEditor();

      // 1. The request says include X, exclude Y
      const sent = sentCriterion<{ value?: string[]; excludes?: string[] }>(
        (await applied).request().postDataJSON(),
        "tags"
      );
      expect(sent?.value).toEqual([includedRef]);
      expect(sent?.excludes).toEqual([excludedRef]);

      // 2. The URL carries both, the chip shows the filter
      const params = new URL(page.url()).searchParams;
      expect(params.get("tagIds")).toBe(includedRef);
      expect(params.get("tagIdsExclude")).toBe(excludedRef);
      const chip = page.getByRole("button", { name: /^Edit filter: Tags/ });
      await expect(chip).toContainText(included.name);
      await expect(chip).toContainText(excluded.name);

      // 3. A reload reads it back: the same request, the same chip
      const reloaded = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/library/scenes" &&
          r.request().method() === "POST" &&
          (r.request().postData() ?? "").includes('"excludes"')
      );
      await page.reload();
      const again = sentCriterion(
        (await reloaded).request().postDataJSON(),
        "tags"
      );
      expect(again).toMatchObject({
        value: [includedRef],
        excludes: [excludedRef],
      });
      await expect(
        page.getByRole("button", { name: /^Edit filter: Tags/ })
      ).toContainText(excluded.name);

      // 4. Saved as the default preset, it applies on a bare /scenes
      await page.getByRole("button", { name: "Save Preset" }).click();
      const dialog = page.getByRole("dialog", { name: "Save Filter Preset" });
      await dialog
        .getByPlaceholder("Enter preset name...")
        .fill(uniqueName("tags-preset"));
      await dialog
        .getByRole("checkbox", { name: /Set as default for All Scenes page/ })
        .check();
      const saved = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/user/filter-presets") &&
          r.request().method() === "POST" &&
          r.ok()
      );
      await dialog.getByRole("button", { name: "Save" }).click();
      await saved;

      const fromPreset = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/library/scenes" &&
          r.request().method() === "POST" &&
          (r.request().postData() ?? "").includes('"excludes"')
      );
      await page.goto("/scenes");
      const loaded = sentCriterion(
        (await fromPreset).request().postDataJSON(),
        "tags"
      );
      expect(loaded).toMatchObject({
        value: [includedRef],
        excludes: [excludedRef],
      });
      await expect(
        page.getByRole("button", { name: /^Edit filter: Tags/ })
      ).toContainText(excluded.name);
    } finally {
      await context.close();
      await deleteUser(request, user.id);
    }
  });
});
