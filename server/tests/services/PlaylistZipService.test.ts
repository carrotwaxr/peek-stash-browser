import type { Prisma } from "@prisma/client";
import type archiver from "archiver";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { downloadService } from "../../services/DownloadService.js";
import { playlistZipService } from "../../services/PlaylistZipService.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import { downloadRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

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

type SceneForZip = Prisma.StashSceneGetPayload<{
  include: {
    performers: { include: { performer: { select: { name: true } } } };
    tags: { include: { tag: { select: { name: true } } } };
  };
}>;

function scene(id: string, title: string): SceneForZip {
  return partialRow<SceneForZip>({
    id,
    stashInstanceId: "inst-a",
    title,
    details: null,
    date: null,
    rating100: null,
    studioId: null,
    duration: 60,
    performers: [],
    tags: [],
  });
}

/** Zips a playlist of the given name holding the given scenes, in order. */
async function zip(playlistName: string, scenes: SceneForZip[]) {
  vi.spyOn(downloadService, "getDownload").mockResolvedValue(
    downloadRow({ id: 7, type: "PLAYLIST", status: "PENDING", playlistId: 3 })
  );
  vi.spyOn(downloadService, "getDownloadablePlaylistItems").mockResolvedValue(
    scenes.map((s) => ({ sceneId: s.id, instanceId: s.stashInstanceId }))
  );
  vi.mocked(prisma.playlist.findUnique).mockResolvedValue(
    partialRow({ id: 3, name: playlistName })
  );
  for (const s of scenes) {
    vi.mocked(prisma.stashScene.findFirst).mockResolvedValueOnce(s);
  }

  await playlistZipService.createZip(7);

  expect(downloadService.markCompleted).toHaveBeenCalledTimes(1);
  const m3u = must(
    appended.find((e) => e.name.endsWith("/playlist.m3u"))?.text,
    "the M3U entry"
  );
  return { names: appended.map((e) => e.name), m3u };
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

  it("a file name starting with # is listed as a path, not a comment", async () => {
    const { m3u } = await zip("Mix", [scene("s1", "#1 Hit")]);

    expect(m3u).toBe("#EXTM3U\n#EXTINF:60,#1 Hit\n./#1 Hit.mp4\n");
  });
});
