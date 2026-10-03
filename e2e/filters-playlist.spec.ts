import { expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import { deleteGroups } from "./support/cleanup";
import { requireData } from "./support/data";
import { runPrefix, uniqueName } from "./support/names";
import { sentCriterion } from "./support/sentFilter";
import {
  type TestUser,
  completeSetup,
  createUser,
  deleteUser,
  signIn,
} from "./support/users";

/**
 * E2E test for the Scenes list's Playlists filter (PR 9a): a viewer filters
 * by a playlist an owner shared with their group, and sees only the scenes
 * their own exclusions allow. The owner, the group and the viewer are
 * throwaway: the viewer hides one of the playlist's scenes, per-user state
 * that must not reach the run admin or another test.
 */

interface SceneRow {
  id: string;
  instanceId: string;
  title: string;
}

test.describe("Scenes filtered by a playlist", () => {
  const created: TestUser[] = [];

  test.afterAll(async ({ request }) => {
    await deleteGroups(request, `${runPrefix()}-filter-group-`);
    for (const { id } of created.splice(0)) {
      await deleteUser(request, id);
    }
  });

  test("a user filters scenes by a playlist shared with their group and sees only what they may see", async ({
    browser,
    baseURL,
    request,
  }) => {
    const owner = await createUser(request, "filter-owner");
    created.push(owner);
    const viewer = await createUser(request, "filter-viewer");
    created.push(viewer);

    // Sharing needs Can Share, which a group grants: both users are members
    const group = (await (
      await mustOk(
        await request.post("/api/groups", {
          data: { name: uniqueName("filter-group"), canShare: true },
        }),
        "POST /api/groups"
      )
    ).json()) as { group: { id: number } };
    for (const { id } of [owner, viewer]) {
      await mustOk(
        await request.post(`/api/groups/${group.group.id}/members`, {
          data: { userId: id },
        }),
        `Adding user ${id} to the group`
      );
    }

    const ownerContext = await signIn(browser, baseURL, owner);
    const viewerContext = await signIn(browser, baseURL, viewer);
    try {
      await completeSetup(ownerContext);
      await completeSetup(viewerContext);

      // The owner's playlist holds three scenes and is shared with the group
      const listed = await mustOk(
        await ownerContext.request.post("/api/library/scenes", {
          data: { filter: { per_page: 3, sort: "title", direction: "ASC" } },
        }),
        "POST /api/library/scenes"
      );
      const scenes = (
        (await listed.json()) as { findScenes: { scenes: SceneRow[] } }
      ).findScenes.scenes;
      requireData(scenes.length === 3 ? scenes : null, "three scenes");
      const titles = scenes.map((scene) => scene.title);
      expect(new Set(titles).size, "distinct scene titles").toBe(3);

      const playlist = (await (
        await mustOk(
          await ownerContext.request.post("/api/playlists", {
            data: { name: uniqueName("filter-playlist") },
          }),
          "POST /api/playlists"
        )
      ).json()) as { playlist: { id: number; name: string } };
      await mustOk(
        await ownerContext.request.post(
          `/api/playlists/${playlist.playlist.id}/items/bulk`,
          {
            data: {
              scenes: scenes.map(({ id, instanceId }) => ({
                sceneId: id,
                instanceId,
              })),
            },
          }
        ),
        "Adding the scenes to the playlist"
      );
      await mustOk(
        await ownerContext.request.put(
          `/api/playlists/${playlist.playlist.id}/shares`,
          { data: { groupIds: [group.group.id] } }
        ),
        "Sharing the playlist"
      );

      // The viewer hides the second of them
      const hidden = scenes[1] as SceneRow;
      await mustOk(
        await viewerContext.request.post("/api/user/hidden-entities", {
          data: {
            entityType: "scene",
            entityId: hidden.id,
            instanceId: hidden.instanceId,
          },
        }),
        "Hiding a scene"
      );

      // The viewer opens Scenes filtered by the shared playlist
      const page = await viewerContext.newPage();
      const list = new ListPage(page);
      const answered = page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname === "/api/library/scenes" &&
          r.request().method() === "POST" &&
          (r.request().postData() ?? "").includes('"playlists"')
      );
      await page.goto(`/scenes?playlistIds=${playlist.playlist.id}`);
      const response = await answered;
      const playlists = sentCriterion<{ value?: number[] }>(
        response.request().postDataJSON(),
        "playlists"
      );
      expect(playlists?.value).toEqual([playlist.playlist.id]);
      const body = (await response.json()) as {
        findScenes: { count: number; scenes: SceneRow[] };
      };

      // Two of the three: the one the viewer hid is not listed or counted
      expect(body.findScenes.count).toBe(2);
      expect(body.findScenes.scenes.map((scene) => scene.title).sort()).toEqual(
        [scenes[0], scenes[2]].map((scene) => (scene as SceneRow).title).sort()
      );
      await expect(list.cards("Scene")).toHaveCount(2, { timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: /^Edit filter: Playlists/ })
      ).toBeVisible();
      await expect(page.getByText(hidden.title, { exact: true })).toHaveCount(
        0
      );

      // The owner's own view of the same filter lists all three
      const ownerPage = await ownerContext.newPage();
      const ownerList = new ListPage(ownerPage);
      await ownerPage.goto(`/scenes?playlistIds=${playlist.playlist.id}`);
      await expect(ownerList.cards("Scene")).toHaveCount(3, {
        timeout: 15_000,
      });
    } finally {
      await viewerContext.close();
      await ownerContext.close();
    }
    // The throwaway users and group are deleted in afterAll
  });
});
