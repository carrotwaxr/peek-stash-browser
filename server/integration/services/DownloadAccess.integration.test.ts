/**
 * Download access against the real test SQLite database (item 10).
 *
 * The owner's playlist P holds, in position order: SAME@B, SAME@A, GLOBAL@A,
 * DELETED@A and ON_OFF@OFF (see helpers/accessFixture.ts). The viewer hides
 * the fixture defaults (SAME@B, GLOBAL everywhere), so only SAME@A is theirs
 * to download; the owner hides nothing and gets every live scene on an
 * enabled instance.
 *
 * SAME@A also carries what its NFO names: performers VISIBLE_A and HIDDEN_A
 * (the viewer hid HIDDEN_A), tags VISIBLE_A and a soft-deleted one, studio
 * SAME@A, Stash's own rating 90 and the viewer's rating 40 (the owner has
 * none).
 *
 * The zip and the file route run in this worker: CONFIG_DIR points at a temp
 * directory, fetch is stubbed, and the instance manager answers only for A
 * and B.
 */
import express from "express";
import fs from "fs";
import type http from "http";
import type { AddressInfo } from "net";
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
import { getDownloadFile } from "../../controllers/download.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import prisma from "../../prisma/singleton.js";
import { downloadService } from "../../services/DownloadService.js";
import { playlistZipService } from "../../services/PlaylistZipService.js";
import {
  UnknownInstanceError,
  stashInstanceManager,
} from "../../services/StashInstanceManager.js";
import { must } from "../../tests/helpers/must.js";
import { authenticated } from "../../utils/routeHelpers.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFixtureDefaults,
  hideFor,
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

// The file route is requested over real HTTP; Stash is the stubbed fetch
const realFetch = globalThis.fetch;

/** No zip size cap these tests reach */
const NO_CAP = { maxBytes: 10n ** 12n };

/** A soft-deleted tag on A, one of SAME@A's tags */
const TAG_DELETED = "7700009";

/**
 * The NFO titled `title` in a zip's bytes: the entries are stored (zlib
 * level 0), so each NFO is plain text in the file
 */
function nfoTitled(zip: string, title: string): string {
  const nfos = zip.match(/<movie>[\s\S]*?<\/movie>/g) ?? [];
  return must(
    nfos.find((nfo) => nfo.includes(`<title>${title}</title>`)),
    `the NFO titled ${title}`
  );
}

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

    // What SAME@A's NFO names. Junction rows go with the fixture's scenes.
    await prisma.stashTag.create({
      data: {
        id: TAG_DELETED,
        stashInstanceId: FX.A,
        name: "Deleted tag",
        deletedAt: new Date(),
      },
    });
    await prisma.stashScene.update({
      where: {
        id_stashInstanceId: { id: FX_ID.SAME, stashInstanceId: FX.A },
      },
      data: { studioId: FX_ID.SAME, rating100: 90 },
    });
    const onSameA = { sceneId: FX_ID.SAME, sceneInstanceId: FX.A };
    await prisma.scenePerformer.createMany({
      data: [FX_ID.VISIBLE_A, FX_ID.HIDDEN_A].map((performerId) => ({
        ...onSameA,
        performerId,
        performerInstanceId: FX.A,
      })),
    });
    await prisma.sceneTag.createMany({
      data: [FX_ID.VISIBLE_A, TAG_DELETED].map((tagId) => ({
        ...onSameA,
        tagId,
        tagInstanceId: FX.A,
      })),
    });
    await prisma.sceneRating.create({
      data: {
        userId: viewer,
        instanceId: FX.A,
        sceneId: FX_ID.SAME,
        rating: 40,
      },
    });

    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-dl-access-"));
    process.env.CONFIG_DIR = configDir;
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(stashInstanceManager, "getCredentials").mockImplementation(
      (id?: string) => {
        const baseUrl = id ? BASE_URLS[id] : undefined;
        if (!baseUrl) throw new UnknownInstanceError(String(id));
        return { baseUrl, apiKey: `key-${id}` };
      }
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

    await playlistZipService.createZip(download.id, NO_CAP);

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

    await playlistZipService.createZip(download.id, NO_CAP);

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      `http://stash-b.test/scene/${FX_ID.SAME}/stream`,
      `http://stash-a.test/scene/${FX_ID.SAME}/stream`,
      `http://stash-a.test/scene/${FX_ID.GLOBAL}/stream`,
    ]);
  });

  describe("the NFO names what the downloading user may see", () => {
    /** Builds this user's zip of the playlist; its bytes as text */
    async function zipText(userId: number): Promise<string> {
      const download = await downloadService.createPlaylistDownload(
        userId,
        playlistId
      );
      await playlistZipService.createZip(download.id, NO_CAP);
      const row = await prisma.download.findUnique({
        where: { id: download.id },
      });
      if (row?.status !== "COMPLETED") {
        throw new Error(`zip ${download.id} is ${row?.status}: ${row?.error}`);
      }
      return fs
        .readFileSync(must(row.filePath, "the zip's file path"))
        .toString("latin1");
    }

    it("a performer the viewer excluded is not named in the NFO", async () => {
      const nfo = nfoTitled(await zipText(viewer), `A-${FX_ID.SAME}`);

      expect(nfo).toContain(`<name>A-${FX_ID.VISIBLE_A}</name>`);
      expect(nfo).not.toContain(`A-${FX_ID.HIDDEN_A}`);
      expect(nfo).toContain(`<studio>A-${FX_ID.SAME}</studio>`);

      // The downloader's exclusions, not the playlist owner's: the owner hid
      // nothing, so their NFO names the performer
      const ownerNfo = nfoTitled(await zipText(owner), `A-${FX_ID.SAME}`);
      expect(ownerNfo).toContain(`<name>A-${FX_ID.HIDDEN_A}</name>`);
    });

    it("a soft-deleted tag is not named", async () => {
      const nfo = nfoTitled(await zipText(owner), `A-${FX_ID.SAME}`);

      expect(nfo).toContain(`<tag>A-${FX_ID.VISIBLE_A}</tag>`);
      expect(nfo).not.toContain("Deleted tag");
    });

    it("a studio the viewer hid is not named", async () => {
      await hideFor(viewer, "studio", FX_ID.SAME, FX.A);
      try {
        const nfo = nfoTitled(await zipText(viewer), `A-${FX_ID.SAME}`);

        expect(nfo).toContain("<studio></studio>");
        expect(nfo).not.toContain(`A-${FX_ID.SAME}</studio>`);
      } finally {
        const key = {
          userId: viewer,
          entityType: "studio",
          entityId: FX_ID.SAME,
          instanceId: FX.A,
        };
        await prisma.userHiddenEntity.deleteMany({ where: key });
        await prisma.userExcludedEntity.deleteMany({ where: key });
      }
    });

    it("the NFO's rating is the viewer's, not Stash's", async () => {
      const nfo = nfoTitled(await zipText(viewer), `A-${FX_ID.SAME}`);

      expect(nfo).toContain("<criticrating>40</criticrating>");
      expect(nfo).toContain("<rating>4</rating>");
      expect(nfo).toContain("<userrating>4</userrating>");

      // No rating of the owner's: none written, never Stash's 90
      const ownerNfo = nfoTitled(await zipText(owner), `A-${FX_ID.SAME}`);
      expect(ownerNfo).toContain("<criticrating></criticrating>");
      expect(ownerNfo).toContain("<rating></rating>");
    });
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

  it("a file download fetches from the download's own instance", async () => {
    await prisma.user.update({
      where: { id: owner },
      data: { canDownloadFilesOverride: true },
    });
    // SAME exists on A and B; the download is B's
    const download = await prisma.download.create({
      data: {
        userId: owner,
        type: "SCENE",
        status: "COMPLETED",
        entityType: "scene",
        entityId: FX_ID.SAME,
        instanceId: FX.B,
        fileName: "same-on-b.mp4",
        progress: 100,
      },
    });

    const app = express();
    app.use((req, _res, next) => {
      (req as AuthenticatedRequest).user = {
        id: owner,
        username: "access-it-owner",
        role: "USER",
      };
      next();
    });
    app.get("/api/downloads/:id/file", authenticated(getDownloadFile));
    const server = await new Promise<http.Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    try {
      const { port } = server.address() as AddressInfo;
      const res = await realFetch(
        `http://127.0.0.1:${port}/api/downloads/${download.id}/file`
      );

      expect(res.status).toBe(200);
      expect(await res.text()).toBe(
        `bytes:http://stash-b.test/scene/${FX_ID.SAME}/stream`
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        `http://stash-b.test/scene/${FX_ID.SAME}/stream`,
        expect.objectContaining({ headers: { ApiKey: `key-${FX.B}` } })
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
