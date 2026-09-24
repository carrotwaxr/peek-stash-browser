/**
 * Download access against the real test SQLite database (item 10).
 *
 * The owner's playlist P holds, in position order: SAME@B, SAME@A, GLOBAL@A,
 * DELETED@A and ON_OFF@OFF (see helpers/accessFixture.ts). The viewer hides
 * the fixture defaults (SAME@B, GLOBAL everywhere), so only SAME@A is theirs
 * to download; the owner hides nothing and gets every live scene on an
 * enabled instance.
 *
 * The zip runs in this worker: CONFIG_DIR points at a temp directory, fetch
 * is stubbed, and the instance manager answers only for A and B.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import prisma from "../../prisma/singleton.js";
import { downloadService } from "../../services/DownloadService.js";
import { playlistZipService } from "../../services/PlaylistZipService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { must } from "../../tests/helpers/must.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFixtureDefaults,
  seedAccessFixture,
} from "../helpers/accessFixture.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = path.resolve(
  __dirname,
  "../../prisma/migrations/20260923000150_expire_legacy_entity_downloads/migration.sql"
);

const BASE_URLS: Record<string, string> = {
  [FX.A]: "http://stash-a.test",
  [FX.B]: "http://stash-b.test",
};

describe("Download access (integration)", () => {
  let owner: number;
  let viewer: number;
  let playlistId: number;
  let configDir: string;
  const previousConfigDir = process.env.CONFIG_DIR;
  const fetchMock = vi.fn((url: string | URL | Request) =>
    Promise.resolve(
      new Response(`bytes:${url instanceof Request ? url.url : url.toString()}`)
    )
  );

  beforeAll(async () => {
    await seedAccessFixture();
    owner = (
      await prisma.user.create({
        data: {
          username: "access-it-owner",
          password: "not-a-real-hash",
          role: "USER",
        },
      })
    ).id;
    viewer = (
      await prisma.user.create({
        data: {
          username: "access-it-viewer",
          password: "not-a-real-hash",
          role: "USER",
        },
      })
    ).id;
    await hideFixtureDefaults(viewer);

    const items: Array<[string, string]> = [
      [FX_ID.SAME, FX.B],
      [FX_ID.SAME, FX.A],
      [FX_ID.GLOBAL, FX.A],
      [FX_ID.DELETED, FX.A],
      [FX_ID.ON_OFF, FX.OFF],
    ];
    const playlist = await prisma.playlist.create({
      data: {
        name: "access-it-playlist",
        userId: owner,
        items: {
          create: items.map(([sceneId, instanceId], position) => ({
            sceneId,
            instanceId,
            position,
          })),
        },
      },
    });
    playlistId = playlist.id;

    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-dl-access-"));
    process.env.CONFIG_DIR = configDir;
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(stashInstanceManager, "getBaseUrl").mockImplementation(
      (id?: string) => {
        const url = id ? BASE_URLS[id] : undefined;
        if (!url) throw new Error(`unexpected instance ${String(id)}`);
        return url;
      }
    );
    vi.spyOn(stashInstanceManager, "getApiKey").mockImplementation(
      (id?: string) => `key-${id}`
    );
  }, 60000);

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (previousConfigDir === undefined) delete process.env.CONFIG_DIR;
    else process.env.CONFIG_DIR = previousConfigDir;
    if (configDir) fs.rmSync(configDir, { recursive: true, force: true });
    // Users cascade to their playlists and Download rows.
    await clearAccessFixture();
  }, 60000);

  beforeEach(() => {
    fetchMock.mockClear();
  });

  it("getDownloadablePlaylistItems filters by the requesting user", async () => {
    expect(
      await downloadService.getDownloadablePlaylistItems(viewer, playlistId)
    ).toEqual([{ sceneId: FX_ID.SAME, instanceId: FX.A }]);

    expect(
      await downloadService.getDownloadablePlaylistItems(owner, playlistId)
    ).toEqual([
      { sceneId: FX_ID.SAME, instanceId: FX.B },
      { sceneId: FX_ID.SAME, instanceId: FX.A },
      { sceneId: FX_ID.GLOBAL, instanceId: FX.A },
    ]);
  });

  it("calculatePlaylistSize sums only the given (id, instance) pairs", async () => {
    const viewerItems = await downloadService.getDownloadablePlaylistItems(
      viewer,
      playlistId
    );
    const ownerItems = await downloadService.getDownloadablePlaylistItems(
      owner,
      playlistId
    );

    expect(await downloadService.calculatePlaylistSize(viewerItems)).toBe(100n);
    expect(await downloadService.calculatePlaylistSize(ownerItems)).toBe(1110n);
  });

  it("createZip streams each scene from its own instance and leaves out what the requester cannot see", async () => {
    const download = await downloadService.createPlaylistDownload(
      viewer,
      playlistId
    );

    await playlistZipService.createZip(download.id);

    const row = await prisma.download.findUnique({
      where: { id: download.id },
    });
    expect(row?.status).toBe("COMPLETED");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://stash-a.test/scene/${FX_ID.SAME}/stream`,
      expect.objectContaining({ headers: { ApiKey: `key-${FX.A}` } })
    );

    // Zip entry names are stored uncompressed, and the entries themselves
    // are stored (zlib level 0), so the titles are plain bytes in the file.
    const zip = fs
      .readFileSync(must(row?.filePath, "the zip's file path"))
      .toString("latin1");
    expect(zip).toContain(`A-${FX_ID.SAME}`);
    expect(zip).not.toContain(`B-${FX_ID.SAME}`);
    expect(zip).not.toContain(`A-${FX_ID.GLOBAL}`);
  });

  it("createZip for the owner fetches B's scene from B", async () => {
    const download = await downloadService.createPlaylistDownload(
      owner,
      playlistId
    );

    await playlistZipService.createZip(download.id);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `http://stash-b.test/scene/${FX_ID.SAME}/stream`,
      `http://stash-a.test/scene/${FX_ID.SAME}/stream`,
      `http://stash-a.test/scene/${FX_ID.GLOBAL}/stream`,
    ]);
  });

  it("the legacy-download migration expires scene and image rows with no instance", async () => {
    const row = (type: "SCENE" | "IMAGE" | "PLAYLIST", instanceId: string) => ({
      userId: viewer,
      type,
      status: "COMPLETED" as const,
      entityType: type === "PLAYLIST" ? null : type.toLowerCase(),
      entityId: type === "PLAYLIST" ? null : FX_ID.SAME,
      playlistId: type === "PLAYLIST" ? playlistId : null,
      instanceId,
      fileName: `legacy-${type}-${instanceId || "none"}`,
      progress: 100,
    });
    const legacyScene = await prisma.download.create({
      data: row("SCENE", ""),
    });
    const legacyImage = await prisma.download.create({
      data: row("IMAGE", ""),
    });
    const sceneOnA = await prisma.download.create({
      data: row("SCENE", FX.A),
    });
    const zip = await prisma.download.create({ data: row("PLAYLIST", "") });

    await prisma.$executeRawUnsafe(fs.readFileSync(MIGRATION_SQL, "utf8"));

    const status = async (id: number) =>
      (await prisma.download.findUnique({ where: { id } }))?.status;
    expect(await status(legacyScene.id)).toBe("EXPIRED");
    expect(await status(legacyImage.id)).toBe("EXPIRED");
    expect(await status(sceneOnA.id)).toBe("COMPLETED");
    expect(await status(zip.id)).toBe("COMPLETED");
  });
});
