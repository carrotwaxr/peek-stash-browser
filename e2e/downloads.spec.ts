import {
  type APIRequestContext,
  type BrowserContext,
  type Page,
  expect,
  test,
} from "@playwright/test";
import { mustOk } from "./support/api";
import { deleteGroups, deleteUsers } from "./support/cleanup";
import { requireData } from "./support/data";
import { runPrefix, uniqueName } from "./support/names";
import {
  type TestUser,
  completeSetup,
  createUser,
  signIn,
} from "./support/users";

/**
 * E2E tests for a playlist zip download, from the Download button to the
 * file. The throwaway user holds Download Playlists through a group of its
 * own (nothing here widens the run admin's or a real account's access); the
 * zip is built from the Stash replay's synthetic media, so a hermetic run
 * needs no other setup. afterAll deletes the users and the group, and their
 * playlists and downloads go with the users.
 */

interface LibraryScene {
  id: string;
  instanceId: string;
  title: string;
  files: Array<{ path: string; size: number | null }>;
}

interface PlaylistRow {
  id: number;
  name: string;
}

interface DownloadRow {
  id: number;
  type: string;
  status: string;
  playlistId: number | null;
}

/** An entry of the zip's central directory */
interface ZipEntry {
  name: string;
  size: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

/**
 * The entries of a zip, read from its central directory: the End of Central
 * Directory record is the last 22 bytes plus a comment of up to 65535, so
 * the scan runs backward from the end. No zip64 (the replay's files are
 * small) and no dependency.
 */
function readZipEntries(zip: Buffer): ZipEntry[] {
  let eocd = -1;
  const lowest = Math.max(0, zip.length - 22 - 0xffff);
  for (let at = zip.length - 22; at >= lowest; at--) {
    if (zip.readUInt32LE(at) === EOCD_SIGNATURE) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) throw new Error("the file has no zip end-of-directory record");
  const count = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
      throw new Error(`zip entry ${i} has no central directory signature`);
    }
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    entries.push({ name, size });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The extension of a file name or path, lower case, with its dot */
const extensionOf = (fileName: string) =>
  fileName.slice(fileName.lastIndexOf(".")).toLowerCase();

/** The part of an entry name after its folder */
const baseName = (entryName: string) =>
  entryName.slice(entryName.lastIndexOf("/") + 1);

const downloadButton = (page: Page) =>
  page.locator('button[title="Download Playlist"]');

/** The user's downloads, read from the server */
async function listDownloads(api: APIRequestContext): Promise<DownloadRow[]> {
  const response = await mustOk(
    await api.get("/api/downloads"),
    "GET /api/downloads"
  );
  return ((await response.json()) as { downloads: DownloadRow[] }).downloads;
}

/** The row on the Downloads page that shows `playlistName` */
const downloadRow = (page: Page, playlistName: string) =>
  page.locator("div.p-4.rounded-lg").filter({ hasText: playlistName });

/**
 * The two smallest scenes the library holds with a known size. The replay
 * states real-sized files (a gigabyte or more each) while serving a small
 * WebM, and a zip over the size cap is refused before it starts.
 */
const MAX_PLANNED_BYTES = 5 * 1024 ** 3;

/** A user in `context` holds a two-scene playlist; returns it with the scenes */
async function seedPlaylist(context: BrowserContext) {
  const found = await mustOk(
    await context.request.post("/api/library/scenes", {
      data: { filter: { per_page: 100, sort: "title", direction: "ASC" } },
    }),
    "POST /api/library/scenes"
  );
  const { findScenes } = (await found.json()) as {
    findScenes: { scenes: LibraryScene[] };
  };
  const sized = findScenes.scenes
    .filter((scene) => (scene.files[0]?.size ?? 0) > 0)
    .sort((a, b) => (a.files[0]?.size ?? 0) - (b.files[0]?.size ?? 0));
  const scenes = requireData(
    sized.length >= 2 ? sized.slice(0, 2) : null,
    "two scenes with a file size"
  );
  const planned = scenes.reduce((sum, s) => sum + (s.files[0]?.size ?? 0), 0);
  expect(planned, "the two scenes fit the zip size cap").toBeLessThan(
    MAX_PLANNED_BYTES
  );

  const created = await mustOk(
    await context.request.post("/api/playlists", {
      data: { name: uniqueName("dl-playlist") },
    }),
    "POST /api/playlists"
  );
  const { playlist } = (await created.json()) as { playlist: PlaylistRow };
  await mustOk(
    await context.request.post(`/api/playlists/${playlist.id}/items/bulk`, {
      data: {
        scenes: scenes.map((scene) => ({
          sceneId: scene.id,
          instanceId: scene.instanceId,
        })),
      },
    }),
    `POST /api/playlists/${playlist.id}/items/bulk`
  );
  return { playlist, scenes };
}

/** Starts the playlist's zip from its page and waits for the Completed row */
async function downloadFromPlaylistPage(page: Page, playlist: PlaylistRow) {
  await page.goto(`/playlist/${playlist.id}`);
  await expect(downloadButton(page)).toBeVisible({ timeout: 10_000 });
  const started = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      new URL(r.url()).pathname === `/api/downloads/playlist/${playlist.id}`
  );
  await downloadButton(page).click();
  const answer = await started;
  expect(answer.status(), `starting the zip: ${await answer.text()}`).toBe(200);

  // The page polls while the zip is Queued or building
  await page.goto("/downloads");
  const row = downloadRow(page, playlist.name);
  await expect(row.getByText("Completed", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  return row;
}

test.describe("Playlist zip download", () => {
  // One throwaway user holds Download Playlists through a group; a second has
  // no group. Tests run in order, each on its own playlist
  test.describe.configure({ mode: "serial" });

  let permitted: TestUser;
  let plain: TestUser;

  test.beforeAll(async ({ request }) => {
    permitted = await createUser(request, "dl-allowed");
    plain = await createUser(request, "dl-denied");
    const created = await mustOk(
      await request.post("/api/groups", {
        data: { name: uniqueName("dl-group"), canDownloadPlaylists: true },
      }),
      "POST /api/groups"
    );
    const { group } = (await created.json()) as { group: { id: number } };
    await mustOk(
      await request.post(`/api/groups/${group.id}/members`, {
        data: { userId: permitted.id },
      }),
      `Adding user ${permitted.id} to the group`
    );
  });

  test.afterAll(async ({ request }, testInfo) => {
    const worker = testInfo.workerIndex;
    await deleteUsers(request, `${runPrefix()}-dl-allowed-${worker}-`);
    await deleteUsers(request, `${runPrefix()}-dl-denied-${worker}-`);
    await deleteGroups(request, `${runPrefix()}-dl-group-${worker}-`);
  });

  test("a playlist zip completes and holds each scene, its NFO and the M3U", async ({
    browser,
    baseURL,
  }) => {
    const context = await signIn(browser, baseURL, permitted);
    try {
      await completeSetup(context);
      const { playlist, scenes } = await seedPlaylist(context);
      const page = await context.newPage();
      const row = await downloadFromPlaylistPage(page, playlist);
      await expect(row.getByRole("link", { name: "Download" })).toBeVisible();

      const download = (await listDownloads(context.request)).find(
        (d) => d.playlistId === playlist.id
      );
      if (!download) throw new Error("the zip is not in the downloads list");
      expect(download.status).toBe("COMPLETED");

      const file = await mustOk(
        await page.request.get(`/api/downloads/${download.id}/file`),
        `GET /api/downloads/${download.id}/file`
      );
      expect(file.headers()["content-disposition"]).toContain(".zip");
      const entries = readZipEntries(await file.body());

      const names = entries.map((e) => e.name);
      const nfos = names.filter((n) => n.endsWith(".nfo"));
      const playlists = names.filter((n) => baseName(n) === "playlist.m3u");
      const videos = names.filter(
        (n) => !n.endsWith(".nfo") && baseName(n) !== "playlist.m3u"
      );
      expect(videos, "videos").toHaveLength(2);
      expect(nfos, "NFOs").toHaveLength(2);
      expect(playlists, "the M3U").toHaveLength(1);
      expect(names, "every entry in the playlist's folder").toHaveLength(5);

      // Each video keeps the extension of its scene's own file
      expect(videos.map((v) => extensionOf(v)).sort()).toEqual(
        scenes.map((s) => extensionOf(s.files[0]?.path ?? "")).sort()
      );
      // Each NFO sits beside a video of the same name
      const videoStems = videos.map((v) => baseName(v).replace(/\.[^.]+$/, ""));
      expect(nfos.map((n) => baseName(n).replace(/\.nfo$/, "")).sort()).toEqual(
        videoStems.sort()
      );
      // The files hold bytes
      for (const entry of entries) {
        expect(entry.size, `the size of ${entry.name}`).toBeGreaterThan(0);
      }
    } finally {
      await context.close();
    }
  });

  test("deleting the download removes it from the list, and its file answers 404", async ({
    browser,
    baseURL,
  }) => {
    const context = await signIn(browser, baseURL, permitted);
    try {
      await completeSetup(context);
      const { playlist } = await seedPlaylist(context);
      const page = await context.newPage();
      const row = await downloadFromPlaylistPage(page, playlist);

      const download = (await listDownloads(context.request)).find(
        (d) => d.playlistId === playlist.id
      );
      if (!download) throw new Error("the zip is not in the downloads list");
      const fileUrl = `/api/downloads/${download.id}/file`;
      expect((await page.request.get(fileUrl)).status()).toBe(200);

      await row.getByRole("button", { name: "Delete" }).click();
      await expect(downloadRow(page, playlist.name)).toHaveCount(0, {
        timeout: 10_000,
      });
      expect(
        (await listDownloads(context.request)).some((d) => d.id === download.id)
      ).toBe(false);
      expect((await page.request.get(fileUrl)).status()).toBe(404);
    } finally {
      await context.close();
    }
  });

  test("a user without the permission sees no Download button", async ({
    browser,
    baseURL,
  }) => {
    const context = await signIn(browser, baseURL, plain);
    try {
      await completeSetup(context);
      const { playlist } = await seedPlaylist(context);
      const page = await context.newPage();
      const permissions = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/user/permissions"
      );
      await page.goto(`/playlist/${playlist.id}`);
      await expect(
        page.getByRole("heading", { name: playlist.name })
      ).toBeVisible({ timeout: 10_000 });
      // The button waits on the permissions answer: it is read once it came
      expect((await permissions).status()).toBe(200);
      await expect(page.locator('a[href^="/scene/"]').first()).toBeVisible();
      await expect(downloadButton(page)).toHaveCount(0);

      // The server refuses the request as well
      const refused = await page.request.post(
        `/api/downloads/playlist/${playlist.id}`
      );
      expect(refused.status()).toBe(403);
    } finally {
      await context.close();
    }
  });
});
