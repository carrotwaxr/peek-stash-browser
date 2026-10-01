import type archiver from "archiver";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { downloadService } from "../../services/DownloadService.js";
import { loadPlaylistItems } from "../../services/PlaylistQueryService.js";
import { playlistZipService } from "../../services/PlaylistZipService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type { PlaylistItemWithScene } from "../../types/api/index.js";
import type { NormalizedScene } from "../../types/index.js";
import { downloadRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";
import { malformedRow } from "../helpers/untrusted.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../services/PlaylistQueryService.js", () => ({
  loadPlaylistItems: vi.fn(),
}));

vi.mock("../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn(),
}));

const mockLoadPlaylistItems = vi.mocked(loadPlaylistItems);
const mockAllowedInstanceIds = vi.mocked(getUserAllowedInstanceIds);

// The real archiver writes the zip. Each entry's name and text are recorded
// as the service passes them: archiver rewrites the name in place (it strips
// a leading "../"), so a spy's recorded arguments would show its version.
const appended = vi.hoisted(
  () => [] as Array<{ name: string; text: string | null }>
);
vi.mock("archiver", async (importOriginal) => {
  const real = (await importOriginal<{ default: typeof archiver }>()).default;
  return {
    default: (...args: Parameters<typeof archiver>) => {
      const archive = real(...args);
      const append = archive.append.bind(archive);
      archive.append = (source, data) => {
        appended.push({
          name: must(data, "the entry's data").name,
          text: typeof source === "string" ? source : null,
        });
        return append(source, data);
      };
      return archive;
    },
  };
});

/** A scene as the scene builder reads it for the requester */
function scene(
  id: string,
  title: string | null,
  extra: Partial<NormalizedScene> = {}
): NormalizedScene {
  return partialRow<NormalizedScene>({
    id,
    instanceId: "inst-a",
    title,
    details: null,
    date: null,
    rating: null,
    rating100: null,
    studio: null,
    files: [partialRow({ duration: 60 })],
    performers: [],
    tags: [],
    ...extra,
  });
}

/**
 * A playlist item holding `visible`, or one its reader cannot see (null):
 * the reader lists visible items only, so a null scene is a row it cannot
 * return, for the zip's guard
 */
function item(
  position: number,
  visible: NormalizedScene | null
): PlaylistItemWithScene {
  return malformedRow<PlaylistItemWithScene>({
    playlistId: 3,
    sceneId: visible?.id ?? `hidden-${position}`,
    instanceId: visible?.instanceId ?? "inst-a",
    position,
    scene: visible,
  });
}

/** Download 7 of playlist 3, named `playlistName`, holding these items */
function arrange(playlistName: string, items: PlaylistItemWithScene[]) {
  vi.spyOn(downloadService, "getDownload").mockResolvedValue(
    downloadRow({
      id: 7,
      userId: 5,
      type: "PLAYLIST",
      status: "PENDING",
      playlistId: 3,
    })
  );
  vi.mocked(prisma.playlist.findUnique).mockResolvedValue(
    partialRow({ id: 3, name: playlistName, userId: 9 })
  );
  mockAllowedInstanceIds.mockResolvedValue(["inst-a"]);
  mockLoadPlaylistItems.mockResolvedValue({
    items,
    // The zip reads the items alone
    totalItems: items.length,
  });
}

/** The text of the entry whose name ends with `suffix` */
function entryText(suffix: string): string {
  return must(
    appended.find((e) => e.name.endsWith(suffix))?.text,
    `the entry ending ${suffix}`
  );
}

/** Zips a playlist of the given name holding the given scenes, in order. */
async function zip(playlistName: string, scenes: NormalizedScene[]) {
  arrange(
    playlistName,
    scenes.map((s, position) => item(position, s))
  );

  await playlistZipService.createZip(7);

  expect(downloadService.markCompleted).toHaveBeenCalledTimes(1);
  return {
    names: appended.map((e) => e.name),
    m3u: entryText("/playlist.m3u"),
  };
}

describe("PlaylistZipService.createZip", () => {
  let configDir: string;
  const previousConfigDir = process.env.CONFIG_DIR;

  beforeEach(() => {
    vi.clearAllMocks();
    appended.length = 0;
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-zip-test-"));
    process.env.CONFIG_DIR = configDir;
    vi.spyOn(stashInstanceManager, "getCredentials").mockReturnValue({
      baseUrl: "http://stash-a.test",
      apiKey: "key-a",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("bytes")))
    );
    vi.spyOn(downloadService, "updateProgress").mockResolvedValue(
      downloadRow()
    );
    vi.spyOn(downloadService, "markCompleted").mockResolvedValue(downloadRow());
    vi.spyOn(downloadService, "markFailed").mockResolvedValue(downloadRow());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (previousConfigDir === undefined) delete process.env.CONFIG_DIR;
    else process.env.CONFIG_DIR = previousConfigDir;
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it("a playlist named '..' zips under download/", async () => {
    const { names } = await zip("..", [scene("s1", "First")]);

    expect(names).toEqual([
      "download/First.nfo",
      "download/First.mp4",
      "download/playlist.m3u",
    ]);
  });

  it("a title containing a newline gives one #EXTINF line", async () => {
    const { m3u } = await zip("Mix", [scene("s1", "Line one\r\nLine two")]);

    expect(m3u).toBe(
      "#EXTM3U\n#EXTINF:60,Line one Line two\nLine oneLine two.mp4\n"
    );
  });

  it("two scenes with the same title get distinct entries, and the M3U names each", async () => {
    const { names, m3u } = await zip("Mix", [
      scene("s1", "Same"),
      scene("s2", "same"),
    ]);

    expect(names).toEqual([
      "Mix/Same.nfo",
      "Mix/Same.mp4",
      "Mix/same (2).nfo",
      "Mix/same (2).mp4",
      "Mix/playlist.m3u",
    ]);
    expect(m3u).toBe(
      "#EXTM3U\n#EXTINF:60,Same\nSame.mp4\n#EXTINF:60,same\nsame (2).mp4\n"
    );
  });

  it("each entry keeps its file's extension and the M3U names it", async () => {
    const { names, m3u } = await zip("Mix", [
      scene("s1", "First", {
        files: [partialRow({ duration: 60, path: "/v/a.mkv" })],
      }),
      scene("s2", "Second", {
        files: [partialRow({ duration: 60, path: "/v/b.avi" })],
      }),
    ]);

    expect(names).toEqual([
      "Mix/First.nfo",
      "Mix/First.mkv",
      "Mix/Second.nfo",
      "Mix/Second.avi",
      "Mix/playlist.m3u",
    ]);
    expect(m3u).toBe(
      "#EXTM3U\n#EXTINF:60,First\nFirst.mkv\n#EXTINF:60,Second\nSecond.avi\n"
    );
  });

  it("two same-title scenes with different extensions still get distinct names", async () => {
    const { names } = await zip("Mix", [
      scene("s1", "A", {
        files: [partialRow({ duration: 60, path: "/v/a.mkv" })],
      }),
      scene("s2", "A", {
        files: [partialRow({ duration: 60, path: "/v/b.mp4" })],
      }),
    ]);

    expect(names).toEqual([
      "Mix/A.nfo",
      "Mix/A.mkv",
      "Mix/A (2).nfo",
      "Mix/A (2).mp4",
      "Mix/playlist.m3u",
    ]);
  });

  it("a file name starting with # is listed as a path, not a comment", async () => {
    const { m3u } = await zip("Mix", [scene("s1", "#1 Hit")]);

    expect(m3u).toBe("#EXTM3U\n#EXTINF:60,#1 Hit\n./#1 Hit.mp4\n");
  });

  it("reads the playlist as the requester, with their allowed instances, not the owner", async () => {
    await zip("Mix", [scene("s1", "First")]);

    expect(mockAllowedInstanceIds).toHaveBeenCalledWith(5);
    expect(mockLoadPlaylistItems).toHaveBeenCalledWith({
      userId: 5,
      allowedInstanceIds: ["inst-a"],
      playlistId: 3,
    });
  });

  it("an item the requester cannot see gets no entry and is not fetched", async () => {
    arrange("Mix", [
      item(0, null),
      item(1, scene("s2", "Second")),
      item(2, null),
    ]);

    await playlistZipService.createZip(7);

    expect(appended.map((e) => e.name)).toEqual([
      "Mix/Second.nfo",
      "Mix/Second.mp4",
      "Mix/playlist.m3u",
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "http://stash-a.test/scene/s2/stream",
      expect.anything()
    );
    expect(downloadService.markCompleted).toHaveBeenCalledTimes(1);
  });

  it("a playlist with nothing the requester can see fails without a zip", async () => {
    arrange("Mix", [item(0, null)]);

    await playlistZipService.createZip(7);

    expect(downloadService.markFailed).toHaveBeenCalledWith(
      7,
      "No scenes you can download"
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(appended).toEqual([]);
    expect(downloadService.markCompleted).not.toHaveBeenCalled();
  });

  it("a failure stores a fixed reason, never the caught text or a path", async () => {
    arrange("Mix", [item(0, scene("s1", "First"))]);
    vi.mocked(fetch).mockRejectedValue(
      new Error("ENOENT: open '/config/downloads/user-3/download-7.zip'")
    );

    await expect(playlistZipService.createZip(7)).rejects.toThrow();

    expect(downloadService.markFailed).toHaveBeenCalledWith(
      7,
      "The zip could not be created"
    );
  });

  it("the NFO carries the builder's names and the requester's rating", async () => {
    await zip("Mix", [
      scene("s1", "First", {
        rating: 40,
        studio: { id: "st", name: "Studio One" },
        performers: [
          partialRow({ id: "p1", name: "Ann" }),
          partialRow({ id: "p2", name: "Bo" }),
        ],
        tags: [partialRow({ id: "t1", name: "Outdoor" })],
      }),
    ]);

    const nfo = entryText("/First.nfo");
    expect(nfo).toContain("<criticrating>40</criticrating>");
    expect(nfo).toContain("<rating>4</rating>");
    expect(nfo).toContain("<studio>Studio One</studio>");
    expect(nfo).toContain("<name>Ann</name>");
    expect(nfo).toContain("<name>Bo</name>");
    expect(nfo).toContain("<tag>Outdoor</tag>");
  });

  it("a scene the requester has not rated writes no rating", async () => {
    await zip("Mix", [scene("s1", "First")]);

    const nfo = entryText("/First.nfo");
    expect(nfo).toContain("<criticrating></criticrating>");
    expect(nfo).toContain("<rating></rating>");
    expect(nfo).toContain("<studio></studio>");
  });

  it("a scene with no title or file is named by its id, and one with no file lists no duration", async () => {
    const { names, m3u } = await zip("Mix", [scene("s1", null, { files: [] })]);

    expect(names).toEqual(["Mix/s1.nfo", "Mix/s1.mp4", "Mix/playlist.m3u"]);
    expect(m3u).toBe("#EXTM3U\n#EXTINF:-1,s1\ns1.mp4\n");
  });
});
