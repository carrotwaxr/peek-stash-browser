import { type Page, expect, test } from "@playwright/test";
import { ListPage } from "./pages/ListPage";
import { mustOk } from "./support/api";
import {
  deleteGroups,
  deleteOwnPlaylists,
  deleteUsers,
  listUsers,
} from "./support/cleanup";
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
      findScenes: { scenes: { id: string; instanceId: string }[] };
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
        data: { sceneId: scene.id, instanceId: scene.instanceId },
      }),
      `POST /api/playlists/${playlist.id}/items`
    );

    await gotoPlaylists(page);
    await expect(
      playlistCard(page, name).getByText("1 video", { exact: true })
    ).toBeVisible();
  });

  test("the add-to-playlist menu opens with one /playlists request and lists the playlists", async ({
    page,
  }) => {
    const found = await mustOk(
      await page.request.post("/api/library/scenes", {
        data: { filter: { per_page: 1 } },
      }),
      "POST /api/library/scenes"
    );
    const { findScenes } = (await found.json()) as {
      findScenes: { scenes: { id: string; instanceId: string }[] };
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
        data: { sceneId: scene.id, instanceId: scene.instanceId },
      }),
      `POST /api/playlists/${playlist.id}/items`
    );

    let playlistRequests = 0;
    const count = (request: { url(): string; method(): string }) => {
      if (
        request.method() === "GET" &&
        new URL(request.url()).pathname === "/api/playlists"
      ) {
        playlistRequests += 1;
      }
    };
    page.on("request", count);
    try {
      await page.goto(
        `/scene/${scene.id}?instance=${encodeURIComponent(scene.instanceId)}`
      );
      // The Scene page lays its controls out once per breakpoint; one shows
      const button = page.locator('button[title="Add to playlist"]:visible');
      await expect(button).toBeVisible({ timeout: 10_000 });
      expect(playlistRequests, "before the menu opens").toBe(0);

      const listed = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/playlists"
      );
      await button.click();
      await listed;

      const entry = page.getByRole("button", { name: new RegExp(name) });
      await expect(entry).toBeVisible();
      await expect(entry).toContainText("1 videos");
      // A second request, if any, follows the first within the same render
      await page.waitForTimeout(1_000);
    } finally {
      page.off("request", count);
    }
    expect(playlistRequests).toBe(1);
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

/** A library scene as the list answers it */
interface LibraryScene {
  id: string;
  instanceId: string;
  title: string;
}

/** How many scenes a playlist of the order tests holds, when the library has them */
const ORDER_ITEMS = 30;
/** The page size the paging tests choose: 30 items make a second page of 5 */
const ORDER_PER_PAGE = 25;

/**
 * Creates a playlist of the library's first `ORDER_ITEMS` scenes by title,
 * added from the last title to the first, so the playlist's own order is the
 * reverse of the title order. Returns the playlist and its scenes in title
 * order (ascending).
 */
async function seedOrderedPlaylist(page: Page) {
  const found = await mustOk(
    await page.request.post("/api/library/scenes", {
      data: {
        filter: { per_page: ORDER_ITEMS, sort: "title", direction: "DESC" },
      },
    }),
    "POST /api/library/scenes"
  );
  const { findScenes } = (await found.json()) as {
    findScenes: { scenes: LibraryScene[] };
  };
  const scenes = findScenes.scenes;
  requireData(
    scenes.length > ORDER_PER_PAGE ? scenes : null,
    `more than ${ORDER_PER_PAGE} scenes`
  );
  const titles = scenes.map((scene) => scene.title);
  expect(new Set(titles).size, "distinct scene titles").toBe(scenes.length);

  const created = await mustOk(
    await page.request.post("/api/playlists", {
      data: { name: uniqueName("order-playlist") },
    }),
    "POST /api/playlists"
  );
  const { playlist } = (await created.json()) as { playlist: PlaylistRow };
  const added = await mustOk(
    await page.request.post(`/api/playlists/${playlist.id}/items/bulk`, {
      data: {
        scenes: scenes.map((scene) => ({
          sceneId: scene.id,
          instanceId: scene.instanceId,
        })),
      },
    }),
    `POST /api/playlists/${playlist.id}/items/bulk`
  );
  expect(await added.json()).toMatchObject({ added: scenes.length });

  return { playlist, byTitle: [...scenes].reverse() };
}

/** The titles of the rows on the page, in the order shown */
const rowTitles = (page: Page) =>
  page.locator('a.font-semibold.text-lg[href^="/scene/"]');

/** Reads every row's title: waits until the page shows `count` of them */
async function readTitles(page: Page, count: number): Promise<string[]> {
  await expect(rowTitles(page)).toHaveCount(count, { timeout: 10_000 });
  return (await rowTitles(page).allInnerTexts()).map(trimmed);
}

const trimmed = (text: string) => text.trim();

/** An element the test relies on, failing with its name when missing */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected an element, got none");
  return value;
}

/** Waits for the rows to show exactly `titles`, in that order */
const expectTitles = (page: Page, titles: string[]) =>
  expect(rowTitles(page)).toHaveText(titles, { timeout: 10_000 });

const titlesOf = (scenes: LibraryScene[]) => scenes.map((s) => s.title);

const sortSelect = (page: Page) => page.getByLabel("Sort playlist by");
const nextPageButton = (page: Page) =>
  page.locator('button[aria-label="Next Page"]').last();
const playButton = (page: Page) =>
  page.locator('button[title="Play Playlist"]');

test.describe("Playlist order", () => {
  // Per worker, as in "Playlist CRUD": each test seeds its own playlist, and
  // this worker's afterAll deletes the playlists, throwaway users and groups
  // that it made
  test.afterAll(async ({ request }, testInfo) => {
    const worker = testInfo.workerIndex;
    await deleteOwnPlaylists(
      request,
      `${runPrefix()}-order-playlist-${worker}-`
    );
    await deleteUsers(request, `${runPrefix()}-order-recipient-${worker}-`);
    await deleteGroups(request, `${runPrefix()}-order-group-${worker}-`);
  });

  test("sorting by title shows titles in order and Play starts with the first title", async ({
    page,
  }) => {
    const { playlist, byTitle } = await seedOrderedPlaylist(page);
    await page.goto(`/playlist/${playlist.id}`);
    // The playlist's own order is the reverse of the titles
    await expectTitles(page, titlesOf(byTitle).reverse());

    await sortSelect(page).selectOption({ label: "Title" });
    await expect(page).toHaveURL(/[?&]sort=title(&|$)/);
    await expect(page).toHaveURL(/[?&]direction=ASC(&|$)/);
    await expectTitles(page, titlesOf(byTitle));

    const first = must(byTitle[0]);
    await playButton(page).click();
    await expect(page).toHaveURL(new RegExp(`/scene/${first.id}(\\?|$)`), {
      timeout: 10_000,
    });
    // The queue the page started follows the shown order
    const queue = await mustOk(
      await page.request.get(
        `/api/playlists/${playlist.id}/queue?sort=title&direction=ASC`
      ),
      "GET /api/playlists/:id/queue"
    );
    const { entries } = (await queue.json()) as {
      entries: { sceneId: string }[];
    };
    expect(entries.map((e) => e.sceneId)).toEqual(byTitle.map((s) => s.id));
  });

  test("a random sort keeps its order from page 1 to page 2 and after a reload", async ({
    page,
  }) => {
    const { playlist, byTitle } = await seedOrderedPlaylist(page);
    const total = byTitle.length;
    await page.goto(`/playlist/${playlist.id}?per_page=${ORDER_PER_PAGE}`);
    const positionOrder = titlesOf(byTitle).reverse().slice(0, ORDER_PER_PAGE);
    await expectTitles(page, positionOrder);

    await sortSelect(page).selectOption({ label: "Random" });
    await expect(page).toHaveURL(/[?&]sort=random_\d+(&|$)/);
    // Until the random order arrives the rows still show the playlist's own
    await expect
      .poll(async () => (await rowTitles(page).allInnerTexts()).map(trimmed), {
        timeout: 10_000,
      })
      .not.toEqual(positionOrder);
    const pageOne = await readTitles(page, ORDER_PER_PAGE);
    expect(pageOne).not.toEqual(positionOrder);

    await nextPageButton(page).click();
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    const pageTwo = await readTitles(page, total - ORDER_PER_PAGE);

    // Every item once across the two pages
    expect([...pageOne, ...pageTwo].sort()).toEqual(titlesOf(byTitle).sort());

    // The same pages after a reload, page 2 first and then page 1
    await page.reload();
    expect(await readTitles(page, total - ORDER_PER_PAGE)).toEqual(pageTwo);
    await page.goto(
      new URL(page.url()).pathname +
        new URL(page.url()).search.replace(/[?&]page=2/, "")
    );
    expect(await readTitles(page, ORDER_PER_PAGE)).toEqual(pageOne);
  });

  test("Save as playlist order, then Playlist order, shows the title order", async ({
    page,
  }) => {
    const { playlist, byTitle } = await seedOrderedPlaylist(page);
    await page.goto(`/playlist/${playlist.id}?sort=title&direction=ASC`);
    await expectTitles(page, titlesOf(byTitle));

    await page.getByRole("button", { name: "Save as playlist order" }).click();
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: "Save order" })
      .click();

    // The page switches to the playlist's own order, now the title order
    await expect(page).not.toHaveURL(/[?&]sort=/);
    await expectTitles(page, titlesOf(byTitle));
    await page.reload();
    await expectTitles(page, titlesOf(byTitle));

    // The server holds it too
    const queue = await mustOk(
      await page.request.get(`/api/playlists/${playlist.id}/queue`),
      "GET /api/playlists/:id/queue"
    );
    const { entries } = (await queue.json()) as {
      entries: { sceneId: string }[];
    };
    expect(entries.map((e) => e.sceneId)).toEqual(byTitle.map((s) => s.id));
  });

  test("moving the first item of page 2 up puts it last on page 1", async ({
    page,
  }) => {
    const { playlist, byTitle } = await seedOrderedPlaylist(page);
    const total = byTitle.length;
    const order = titlesOf(byTitle).reverse(); // the playlist's own order
    const pageTwoUrl = `/playlist/${playlist.id}?per_page=${ORDER_PER_PAGE}&page=2`;
    await page.goto(pageTwoUrl);
    await expectTitles(page, order.slice(ORDER_PER_PAGE));
    const moved = must(order[ORDER_PER_PAGE]);
    const displaced = must(order[ORDER_PER_PAGE - 1]);

    await page.getByRole("button", { name: "Reorder" }).click();
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        /\/items\/\d+\/position$/.test(new URL(r.url()).pathname)
    );
    await page.getByRole("button", { name: "Move up" }).first().click();
    expect((await saved).status(), "the move").toBe(200);

    // The item that was last on page 1 now opens page 2
    await expect(rowTitles(page).first()).toHaveText(displaced);
    await page.getByRole("button", { name: "Done" }).click();

    await page.goto(`/playlist/${playlist.id}?per_page=${ORDER_PER_PAGE}`);
    const pageOne = await readTitles(page, ORDER_PER_PAGE);
    expect(pageOne.at(-1)).toBe(moved);
    expect(pageOne.slice(0, -2)).toEqual(order.slice(0, ORDER_PER_PAGE - 2));
  });

  test("selecting 5 scenes on /scenes and adding them to a playlist adds 5 in one request", async ({
    page,
  }) => {
    const created = await mustOk(
      await page.request.post("/api/playlists", {
        data: { name: uniqueName("order-playlist") },
      }),
      "POST /api/playlists"
    );
    const { playlist } = (await created.json()) as { playlist: PlaylistRow };

    const list = new ListPage(page);
    await list.goto("/scenes");
    const count = requireData(
      (await list.waitForResults("Scene")) >= 5 ? 5 : null,
      "5 scenes"
    );
    const cards = list.cards("Scene");
    for (let i = 0; i < count; i++) {
      await cards
        .nth(i)
        .getByRole("button", { name: "Select scene", exact: true })
        .click();
    }

    const writes: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (
        request.method() === "POST" &&
        pathname.startsWith("/api/playlists/")
      ) {
        writes.push(pathname);
      }
    });
    await page.getByRole("button", { name: "Add 5 to Playlist" }).click();
    const added = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname === `/api/playlists/${playlist.id}/items/bulk`
    );
    await page.getByRole("button", { name: new RegExp(playlist.name) }).click();
    const bulk = await added;
    expect(bulk.status(), "the bulk add").toBe(200);
    expect(await bulk.json()).toEqual({
      added: 5,
      alreadyInPlaylist: 0,
      unavailable: 0,
    });

    expect(writes).toEqual([`/api/playlists/${playlist.id}/items/bulk`]);
    const read = await mustOk(
      await page.request.get(`/api/playlists/${playlist.id}`),
      "GET /api/playlists/:id"
    );
    expect(await read.json()).toMatchObject({ totalItems: 5 });
  });

  test("a recipient can sort and play a shared playlist but has no Save as playlist order", async ({
    page,
    request,
    browser,
    baseURL,
  }) => {
    const { playlist, byTitle } = await seedOrderedPlaylist(page);

    // The owner is the run admin; sharing needs Can Share, which a group
    // grants, so the group holds the admin as well as the recipient
    const adminName = process.env.E2E_ADMIN_USERNAME;
    const admin = (await listUsers(request)).find(
      (user) => user.username === adminName
    );
    if (!admin) throw new Error(`the run admin ${adminName} is not listed`);
    const recipient = await createUser(request, "order-recipient");
    const created = await mustOk(
      await request.post("/api/groups", {
        data: { name: uniqueName("order-group"), canShare: true },
      }),
      "POST /api/groups"
    );
    const { group } = (await created.json()) as { group: { id: number } };
    for (const userId of [admin.id, recipient.id]) {
      await mustOk(
        await request.post(`/api/groups/${group.id}/members`, {
          data: { userId },
        }),
        `Adding user ${userId} to the group`
      );
    }
    await mustOk(
      await request.put(`/api/playlists/${playlist.id}/shares`, {
        data: { groupIds: [group.id] },
      }),
      `PUT /api/playlists/${playlist.id}/shares`
    );

    const context = await signIn(browser, baseURL, recipient);
    try {
      await completeSetup(context);
      const guest = await context.newPage();
      await guest.goto(`/playlist/${playlist.id}`);
      await expect(guest.getByText(`Shared by ${adminName}`)).toBeVisible({
        timeout: 10_000,
      });
      await expectTitles(guest, titlesOf(byTitle).reverse());

      await sortSelect(guest).selectOption({ label: "Title" });
      await expect(guest).toHaveURL(/[?&]sort=title(&|$)/);
      await expectTitles(guest, titlesOf(byTitle));
      await expect(
        guest.getByRole("button", { name: "Save as playlist order" })
      ).toHaveCount(0);
      await expect(guest.getByRole("button", { name: "Reorder" })).toHaveCount(
        0
      );

      await playButton(guest).click();
      await expect(guest).toHaveURL(
        new RegExp(`/scene/${must(byTitle[0]).id}(\\?|$)`),
        { timeout: 10_000 }
      );
    } finally {
      await context.close();
    }
    // The throwaway user and group are deleted in afterAll
  });
});
