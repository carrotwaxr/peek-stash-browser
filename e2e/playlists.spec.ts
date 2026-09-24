import { type Page, expect, test } from "@playwright/test";
import { mustOk } from "./support/api";
import { deleteOwnPlaylists } from "./support/cleanup";
import { requireData } from "./support/data";
import { runPrefix, uniqueName } from "./support/names";
import { completeSetup, createUser, deleteUser, signIn } from "./support/users";

/**
 * E2E tests for Playlist CRUD operations.
 *
 * Covers the full lifecycle: list, create, view detail, edit, delete. The run
 * admin owns the playlists these tests create; every name goes through
 * uniqueName, and afterAll deletes them. The empty state is a throwaway
 * user's, since the run admin's list holds these tests' playlists.
 */

/**
 * Every playlist here is named uniqueName("playlist"), which is
 * `<run prefix>-playlist-<worker>-<n>`: this is one worker's share of them
 */
const workerPlaylistPrefix = (workerIndex: number) =>
  `${runPrefix()}-playlist-${workerIndex}-`;

interface PlaylistRow {
  id: number;
  name: string;
}

/** The signed-in user's playlists, read from the server */
async function listPlaylists(page: Page): Promise<PlaylistRow[]> {
  const response = await mustOk(
    await page.request.get("/api/playlists"),
    "GET /api/playlists"
  );
  return ((await response.json()) as { playlists: PlaylistRow[] }).playlists;
}

async function gotoPlaylists(page: Page) {
  await page.goto("/playlists");
  await expect(
    page.getByRole("heading", { name: "Playlists", exact: true })
  ).toBeVisible({ timeout: 10_000 });
}

/** Creates a playlist through the New Playlist modal and waits for its card */
async function createThroughModal(page: Page, name: string) {
  await page.getByRole("button", { name: "+ New Playlist" }).click();
  await page.getByLabel("Playlist Name *").fill(name);
  await page.getByRole("button", { name: "Create" }).last().click();
  await expect(playlistLink(page, name)).toBeVisible({ timeout: 10_000 });
}

const playlistLink = (page: Page, name: string) =>
  page.getByRole("link", { name, exact: true });

/** A playlist's card on the list (a Paper: div.rounded-lg.border) */
const playlistCard = (page: Page, name: string) =>
  page.locator(".rounded-lg.border").filter({ has: playlistLink(page, name) });

test.describe("Playlist CRUD", () => {
  // Only this worker's playlists: with fullyParallel, Playwright runs these
  // tests in groups on several workers at once, each group with its own
  // afterAll, so deleting every playlist of the run would pull them from
  // under tests still running elsewhere
  test.afterAll(({ request }, testInfo) =>
    deleteOwnPlaylists(request, workerPlaylistPrefix(testInfo.workerIndex))
  );

  test("playlists page loads with heading and tabs", async ({ page }) => {
    await gotoPlaylists(page);

    // Tab buttons should be visible (showEmpty + showSingleTab means both always show)
    await expect(page.getByText("My Playlists")).toBeVisible();
    await expect(page.getByText("Shared with Me")).toBeVisible();

    // New Playlist button should be visible on "My Playlists" tab
    await expect(
      page.getByRole("button", { name: "+ New Playlist" })
    ).toBeVisible();
  });

  test("a user with no playlists sees the empty state", async ({
    request,
    browser,
    baseURL,
  }) => {
    const user = await createUser(request, "no-playlists");
    try {
      const context = await signIn(browser, baseURL, user);
      try {
        await completeSetup(context);
        const userPage = await context.newPage();
        await gotoPlaylists(userPage);

        await expect(userPage.getByText("No playlists yet")).toBeVisible();
        await expect(
          userPage.getByText("Create your first playlist to get started")
        ).toBeVisible();
      } finally {
        await context.close();
      }
    } finally {
      await deleteUser(request, user.id);
    }
  });

  test("a playlist card shows its video count", async ({ page }) => {
    const found = await mustOk(
      await page.request.post("/api/library/scenes", {
        data: { filter: { per_page: 1 } },
      }),
      "POST /api/library/scenes"
    );
    const { findScenes } = (await found.json()) as {
      findScenes: { scenes: { id: string }[] };
    };
    const scene = requireData(findScenes.scenes[0], "a scene");

    const name = uniqueName("playlist");
    const created = await mustOk(
      await page.request.post("/api/playlists", { data: { name } }),
      "POST /api/playlists"
    );
    const { playlist } = (await created.json()) as { playlist: PlaylistRow };
    await mustOk(
      await page.request.post(`/api/playlists/${playlist.id}/items`, {
        data: { sceneId: scene.id },
      }),
      `POST /api/playlists/${playlist.id}/items`
    );

    await gotoPlaylists(page);
    await expect(
      playlistCard(page, name).getByText("1 video", { exact: true })
    ).toBeVisible();
  });

  test("shared tab shows empty state", async ({ page }) => {
    await gotoPlaylists(page);

    // Switch to Shared tab
    await page.getByText("Shared with Me").click();

    // Should show shared empty state
    await expect(page.getByText("No shared playlists")).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByText("Playlists shared with your groups will appear here")
    ).toBeVisible();

    // New Playlist button should NOT be visible on Shared tab
    await expect(
      page.getByRole("button", { name: "+ New Playlist" })
    ).not.toBeVisible();
  });

  test("can create a new playlist", async ({ page }) => {
    await gotoPlaylists(page);

    // Click the New Playlist button
    await page.getByRole("button", { name: "+ New Playlist" }).click();

    // Modal should appear
    await expect(page.getByText("Create New Playlist")).toBeVisible();

    // Fill in the form
    const playlistName = uniqueName("playlist");
    await page.getByLabel("Playlist Name *").fill(playlistName);
    await page.getByLabel("Description (Optional)").fill("Created by E2E test");

    // Create button should be enabled
    const createButton = page.getByRole("button", { name: "Create" }).last();
    await expect(createButton).toBeEnabled();

    // Submit the form
    await createButton.click();

    // Wait for the playlist name to appear in the list (confirms creation + modal close)
    await expect(playlistLink(page, playlistName)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("create modal cancel closes without creating", async ({ page }) => {
    await gotoPlaylists(page);

    // Open the modal
    await page.getByRole("button", { name: "+ New Playlist" }).click();
    await expect(page.getByText("Create New Playlist")).toBeVisible();

    // Fill in a name
    const playlistName = uniqueName("playlist");
    await page.getByLabel("Playlist Name *").fill(playlistName);

    // Click Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Modal should close
    await expect(page.getByText("Create New Playlist")).not.toBeVisible();

    // The server has no playlist with that name
    const names = (await listPlaylists(page)).map((p) => p.name);
    expect(names).not.toContain(playlistName);
  });

  test("create button disabled when name is empty", async ({ page }) => {
    await gotoPlaylists(page);

    // Open the modal
    await page.getByRole("button", { name: "+ New Playlist" }).click();
    await expect(page.getByText("Create New Playlist")).toBeVisible();

    // Create button should be disabled when name is empty
    const createButton = page.getByRole("button", { name: "Create" }).last();
    await expect(createButton).toBeDisabled();

    // Fill in a name
    await page.getByLabel("Playlist Name *").fill(uniqueName("playlist"));
    await expect(createButton).toBeEnabled();

    // Clear the name
    await page.getByLabel("Playlist Name *").clear();
    await expect(createButton).toBeDisabled();
  });

  test("can navigate to playlist detail", async ({ page }) => {
    await gotoPlaylists(page);

    // First create a playlist to navigate to
    const playlistName = uniqueName("playlist");
    await createThroughModal(page, playlistName);

    // Click the playlist name link
    await playlistLink(page, playlistName).click();

    // Should navigate to the detail page
    await expect(page).toHaveURL(/\/playlist\/\d+/, { timeout: 10_000 });

    // Playlist name should appear as heading
    await expect(page.getByText(playlistName, { exact: true })).toBeVisible();

    // Empty state should show since no scenes are added
    await expect(page.getByText("No scenes in this playlist yet")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("can delete a playlist with confirmation", async ({ page }) => {
    await gotoPlaylists(page);

    // Create a playlist to delete
    const playlistName = uniqueName("playlist");
    await createThroughModal(page, playlistName);

    // Navigate to playlist detail and delete from there
    await playlistLink(page, playlistName).click();
    await expect(page).toHaveURL(/\/playlist\/\d+/, { timeout: 10_000 });

    // Go back to the list and use the Delete button on the card
    await gotoPlaylists(page);
    await expect(playlistLink(page, playlistName)).toBeVisible({
      timeout: 10_000,
    });
    await playlistCard(page, playlistName)
      .getByRole("button", { name: "Delete" })
      .click();

    // Confirmation dialog should appear
    await expect(
      page.getByRole("heading", { name: "Delete Playlist" })
    ).toBeVisible();
    await expect(
      page.getByText(/Are you sure you want to delete/)
    ).toBeVisible();

    // Confirm the deletion
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Delete" }).click();

    // Playlist should be removed from the list
    await expect(playlistLink(page, playlistName)).not.toBeVisible({
      timeout: 5_000,
    });
  });

  test("delete confirmation cancel keeps playlist", async ({ page }) => {
    await gotoPlaylists(page);

    // Create a playlist
    const playlistName = uniqueName("playlist");
    await createThroughModal(page, playlistName);

    await playlistCard(page, playlistName)
      .getByRole("button", { name: "Delete" })
      .click();

    // Cancel the deletion
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    // The playlist is still there after a reload
    await page.reload();
    await expect(playlistLink(page, playlistName)).toBeVisible({
      timeout: 10_000,
    });
  });
});
