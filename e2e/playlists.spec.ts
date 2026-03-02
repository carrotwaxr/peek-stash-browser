import { test, expect } from "@playwright/test";

/**
 * E2E tests for Playlist CRUD operations.
 *
 * Covers the full lifecycle: list, create, view detail, edit, delete.
 * All operations are local DB — no Stash data needed.
 */

test.describe("Playlist CRUD", () => {
  const uniqueSuffix = Date.now();

  test("playlists page loads with heading and tabs", async ({ page }) => {
    await page.goto("/playlists");

    // Main heading
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

    // Tab buttons should be visible (showEmpty + showSingleTab means both always show)
    await expect(page.getByText("My Playlists")).toBeVisible();
    await expect(page.getByText("Shared with Me")).toBeVisible();

    // New Playlist button should be visible on "My Playlists" tab
    await expect(
      page.getByRole("button", { name: "+ New Playlist" })
    ).toBeVisible();
  });

  test("shows playlists or empty state after loading", async ({ page }) => {
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

    // After loading, page shows either playlist cards or empty state
    const hasPlaylists = await page
      .getByRole("link")
      .filter({ hasText: /.+/ })
      .first()
      .isVisible()
      .catch(() => false);

    if (hasPlaylists) {
      // Playlists exist — verify the list rendered
      await expect(page.getByText(/\d+ videos?/).first()).toBeVisible();
    } else {
      // No playlists — verify empty state
      await expect(page.getByText("No playlists yet")).toBeVisible();
      await expect(
        page.getByText("Create your first playlist to get started")
      ).toBeVisible();
    }
  });

  test("shared tab shows empty state", async ({ page }) => {
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

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
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

    // Click the New Playlist button
    await page.getByRole("button", { name: "+ New Playlist" }).click();

    // Modal should appear
    await expect(page.getByText("Create New Playlist")).toBeVisible();

    // Fill in the form
    const playlistName = `E2E Playlist ${uniqueSuffix}`;
    await page.getByLabel("Playlist Name *").fill(playlistName);
    await page
      .getByLabel("Description (Optional)")
      .fill("Created by E2E test");

    // Create button should be enabled
    const createButton = page
      .getByRole("button", { name: "Create" })
      .last();
    await expect(createButton).toBeEnabled();

    // Submit the form
    await createButton.click();

    // Wait for the playlist name to appear in the list (confirms creation + modal close)
    await expect(
      page.getByRole("link", { name: playlistName })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create modal cancel closes without creating", async ({ page }) => {
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

    // Open the modal
    await page.getByRole("button", { name: "+ New Playlist" }).click();
    await expect(page.getByText("Create New Playlist")).toBeVisible();

    // Fill in a name
    await page.getByLabel("Playlist Name *").fill("Should Not Exist");

    // Click Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Modal should close
    await expect(page.getByText("Create New Playlist")).not.toBeVisible();

    // The playlist should NOT appear
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });

  test("create button disabled when name is empty", async ({ page }) => {
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

    // Open the modal
    await page.getByRole("button", { name: "+ New Playlist" }).click();
    await expect(page.getByText("Create New Playlist")).toBeVisible();

    // Create button should be disabled when name is empty
    const createButton = page
      .getByRole("button", { name: "Create" })
      .last();
    await expect(createButton).toBeDisabled();

    // Fill in a name
    await page.getByLabel("Playlist Name *").fill("Has Name");
    await expect(createButton).toBeEnabled();

    // Clear the name
    await page.getByLabel("Playlist Name *").clear();
    await expect(createButton).toBeDisabled();
  });

  test("can navigate to playlist detail", async ({ page }) => {
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

    // First create a playlist to navigate to
    const playlistName = `Detail Nav ${uniqueSuffix}`;
    await page.getByRole("button", { name: "+ New Playlist" }).click();
    await page.getByLabel("Playlist Name *").fill(playlistName);
    await page.getByRole("button", { name: "Create" }).last().click();
    await expect(page.getByText(playlistName)).toBeVisible({ timeout: 5_000 });

    // Click the playlist name link
    await page.getByRole("link", { name: playlistName }).click();

    // Should navigate to the detail page
    await expect(page).toHaveURL(/\/playlist\/\d+/, { timeout: 10_000 });

    // Playlist name should appear as heading
    await expect(page.getByText(playlistName)).toBeVisible();

    // Empty state should show since no scenes are added
    await expect(
      page.getByText("No scenes in this playlist yet")
    ).toBeVisible({ timeout: 5_000 });
  });

  test("can delete a playlist with confirmation", async ({ page }) => {
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

    // Create a playlist to delete
    const playlistName = `Delete Target ${uniqueSuffix}`;
    await page.getByRole("button", { name: "+ New Playlist" }).click();
    await page.getByLabel("Playlist Name *").fill(playlistName);
    await page.getByRole("button", { name: "Create" }).last().click();
    await expect(
      page.getByRole("link", { name: playlistName })
    ).toBeVisible({ timeout: 10_000 });

    // Navigate to playlist detail and delete from there
    await page.getByRole("link", { name: playlistName }).click();
    await expect(page).toHaveURL(/\/playlist\/\d+/, { timeout: 10_000 });

    // Go back to the list and use the Delete button on the card
    await page.goto("/playlists");
    await expect(
      page.getByRole("link", { name: playlistName })
    ).toBeVisible({ timeout: 10_000 });

    // Each playlist card is a Paper component (div.rounded-lg.border)
    const card = page
      .locator(".rounded-lg.border")
      .filter({ has: page.getByRole("link", { name: playlistName }) });
    await card.getByRole("button", { name: "Delete" }).click();

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
    await expect(
      page.getByRole("link", { name: playlistName })
    ).not.toBeVisible({ timeout: 5_000 });
  });

  test("delete confirmation cancel keeps playlist", async ({ page }) => {
    await page.goto("/playlists");
    await expect(
      page.getByRole("heading", { name: "Playlists" })
    ).toBeVisible({ timeout: 10_000 });

    // Create a playlist
    const playlistName = `Cancel Delete ${uniqueSuffix}`;
    await page.getByRole("button", { name: "+ New Playlist" }).click();
    await page.getByLabel("Playlist Name *").fill(playlistName);
    await page.getByRole("button", { name: "Create" }).last().click();
    await expect(
      page.getByRole("link", { name: playlistName })
    ).toBeVisible({ timeout: 10_000 });

    // Each playlist card is a Paper component (div.rounded-lg.border)
    const card = page
      .locator(".rounded-lg.border")
      .filter({ has: page.getByRole("link", { name: playlistName }) });
    await card.getByRole("button", { name: "Delete" }).click();

    // Cancel the deletion
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // Playlist should still be visible
    await expect(
      page.getByRole("link", { name: playlistName })
    ).toBeVisible();
  });
});
