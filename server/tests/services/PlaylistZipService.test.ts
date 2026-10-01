import type archiver from "archiver";
import fs, { createWriteStream } from "fs";
import type * as fsModule from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { downloadService } from "../../services/DownloadService.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import { loadPlaylistItems } from "../../services/PlaylistQueryService.js";
import {
  PlaylistZipService,
  playlistZipService,
} from "../../services/PlaylistZipService.js";
import {
  UnknownInstanceError,
  stashInstanceManager,
} from "../../services/StashInstanceManager.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import type { PlaylistItemWithScene } from "../../types/api/index.js";
import type { NormalizedScene } from "../../types/index.js";
import { downloadRow, userPermissions } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// The real fs, with createWriteStream a spy a test can make fail. The service
// reads fs as a namespace, so only a module mock reaches it.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fsModule>();
  return { ...actual, createWriteStream: vi.fn(actual.createWriteStream) };
});

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../services/PlaylistQueryService.js", () => ({
  loadPlaylistItems: vi.fn(),
}));

vi.mock("../../services/UserInstanceService.js", () => ({
  getUserAllowedInstanceIds: vi.fn(),
}));

vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(),
}));

vi.mock("../../services/PlaylistAccessService.js", () => ({
  getPlaylistAccess: vi.fn(),
}));

const mockLoadPlaylistItems = vi.mocked(loadPlaylistItems);
const mockAllowedInstanceIds = vi.mocked(getUserAllowedInstanceIds);
const mockPermissions = vi.mocked(resolveUserPermissions);
const mockPlaylistAccess = vi.mocked(getPlaylistAccess);

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

/** A playlist item holding `visible` (the reader lists visible items only) */
function item(
  position: number,
  visible: NormalizedScene
): PlaylistItemWithScene {
  return {
    id: position + 1,
    playlistId: 3,
    sceneId: visible.id,
    instanceId: visible.instanceId,
    position,
    addedAt: new Date(0),
    scene: visible,
  };
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

/** No size cap a test reaches */
const NO_CAP = { maxBytes: 10n ** 12n };

/**
 * A Stash body the test drives: bytes sent, the end or an error when the
 * test says, and whether Peek cancelled it
 */
class StashBody {
  readonly stream: ReadableStream<Uint8Array>;
  cancelled = false;
  private controller: ReadableStreamDefaultController<Uint8Array> | undefined;

  constructor() {
    this.stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: () => {
        this.cancelled = true;
      },
    });
  }

  private get open(): ReadableStreamDefaultController<Uint8Array> {
    return must(this.controller, "the body's controller");
  }

  send(bytes: number): void {
    this.open.enqueue(new Uint8Array(bytes));
  }

  close(): void {
    this.open.close();
  }

  fail(error: Error): void {
    this.open.error(error);
  }
}

/** Each fetch answers with the next of these bodies, in order */
function serveBodies(...bodies: StashBody[]): void {
  let next = 0;
  vi.mocked(fetch).mockImplementation(() =>
    Promise.resolve(
      new Response(must(bodies[next++], "a body for this fetch").stream)
    )
  );
}

/** Lets the zip run as far as it can on what it has */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

/** Two scenes, s1 and s2, in playlist "Mix" */
function arrangeTwo(sizes: [number | null, number | null] = [null, null]) {
  arrange("Mix", [
    item(
      0,
      scene("s1", "First", {
        files: [partialRow({ duration: 60, size: sizes[0] })],
      })
    ),
    item(
      1,
      scene("s2", "Second", {
        files: [partialRow({ duration: 60, size: sizes[1] })],
      })
    ),
  ]);
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

  await playlistZipService.createZip(7, NO_CAP);

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
    vi.spyOn(downloadService, "updateProgress").mockResolvedValue(true);
    vi.spyOn(downloadService, "markCompleted").mockResolvedValue(true);
    vi.spyOn(downloadService, "markFailed").mockResolvedValue(true);
    mockPermissions.mockResolvedValue(
      userPermissions({ canDownloadPlaylists: true })
    );
    mockPlaylistAccess.mockResolvedValue({ level: "owner" });
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

  it("a playlist with nothing the requester can see fails without a zip", async () => {
    // The reader returns only the scenes the requester can see
    arrange("Mix", []);

    await playlistZipService.createZip(7, NO_CAP);

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

    await playlistZipService.createZip(7, NO_CAP);

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

  describe("one entry at a time, and any error fails the download", () => {
    const ZIP_FAILED = "The zip could not be created";

    /** Whether download 7's zip file is on disk */
    function zipLeft(): boolean {
      return fs.existsSync(
        path.join(configDir, "downloads", "user-5", "download-7.zip")
      );
    }

    it("the next scene is not fetched until the previous file is written", async () => {
      const first = new StashBody();
      const second = new StashBody();
      serveBodies(first, second);
      arrangeTwo();

      const done = playlistZipService.createZip(7, NO_CAP);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      first.send(10);
      await settle();
      expect(fetch).toHaveBeenCalledTimes(1);

      first.close();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
      second.send(10);
      second.close();
      await done;

      expect(downloadService.markCompleted).toHaveBeenCalledTimes(1);
    });

    it("a Stash stream that errors mid-file fails the download without an unhandled error", async () => {
      const first = new StashBody();
      serveBodies(first);
      arrange("Mix", [item(0, scene("s1", "First"))]);

      const done = playlistZipService.createZip(7, NO_CAP);
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      first.send(10);
      await settle();
      first.fail(new TypeError("terminated"));
      await done;

      expect(downloadService.markFailed).toHaveBeenCalledWith(7, ZIP_FAILED);
      expect(zipLeft()).toBe(false);
      expect(downloadService.markCompleted).not.toHaveBeenCalled();
    });

    it("a write failure fails the download", async () => {
      const first = new StashBody();
      serveBodies(first);
      arrangeTwo();
      vi.mocked(createWriteStream).mockImplementationOnce((file) => {
        const output = fs.createWriteStream(file);
        const noSpace = (callback: (error: Error) => void): void => {
          callback(
            Object.assign(new Error("ENOSPC: no space left on device"), {
              code: "ENOSPC",
            })
          );
        };
        // Writes buffered while the file opens arrive together
        output._write = (_chunk, _encoding, callback) => noSpace(callback);
        output._writev = (_chunks, callback) => noSpace(callback);
        return output;
      });

      await playlistZipService.createZip(7, NO_CAP);

      expect(downloadService.markFailed).toHaveBeenCalledWith(7, ZIP_FAILED);
      // The body being read when the disk failed was cancelled, if one was
      expect(vi.mocked(fetch).mock.calls.length === 0 || first.cancelled).toBe(
        true
      );
      expect(fetch).not.toHaveBeenCalledWith(
        "http://stash-a.test/scene/s2/stream",
        expect.anything()
      );
      expect(zipLeft()).toBe(false);
      expect(downloadService.markCompleted).not.toHaveBeenCalled();
    });

    it("a fetch that fails stops the zip and leaves no file", async () => {
      arrange("Mix", [
        item(0, scene("s1", "First")),
        item(1, scene("s2", "Second")),
        item(2, scene("s3", "Third")),
      ]);
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response("bytes"))
        .mockRejectedValueOnce(new TypeError("fetch failed"));

      await playlistZipService.createZip(7, NO_CAP);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(downloadService.markFailed).toHaveBeenCalledWith(7, ZIP_FAILED);
      expect(zipLeft()).toBe(false);
      expect(downloadService.markCompleted).not.toHaveBeenCalled();
    });

    it("the job's signal cancels the response being read, and no fetch follows", async () => {
      const first = new StashBody();
      const second = new StashBody();
      serveBodies(first, second);
      arrangeTwo();
      const job = new AbortController();

      const done = playlistZipService.createZip(7, {
        ...NO_CAP,
        signal: job.signal,
      });
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      first.send(10);
      await settle();
      job.abort();
      await done;

      expect(first.cancelled).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(downloadService.markFailed).toHaveBeenCalledWith(7, ZIP_FAILED);
      expect(zipLeft()).toBe(false);
    });

    it("progress follows bytes written, not appends", async () => {
      arrangeTwo([100, 300]);
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(new Uint8Array(100)))
        .mockResolvedValueOnce(new Response(new Uint8Array(300)));

      await playlistZipService.createZip(7, NO_CAP);

      const values = vi
        .mocked(downloadService.updateProgress)
        .mock.calls.map(([, progress]) => progress);
      expect(values).toEqual([...values].sort((a, b) => a - b));
      expect(Math.max(...values)).toBeLessThanOrEqual(95);
      // 100 of 400 planned bytes, of 95
      expect(values).toContain(23);
      // At most one write per whole percent
      expect(new Set(values).size).toBe(values.length);
      expect(downloadService.markCompleted).toHaveBeenCalledTimes(1);
    });

    it("a zip that grows past the size cap fails", async () => {
      // Planned under the cap; Stash sends more than the cache says
      arrangeTwo([50, 50]);
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response(new Uint8Array(100)))
        .mockResolvedValueOnce(new Response(new Uint8Array(100)));

      await playlistZipService.createZip(7, { maxBytes: 150n });

      expect(downloadService.markFailed).toHaveBeenCalledWith(
        7,
        "The zip grew past the size limit"
      );
      expect(zipLeft()).toBe(false);
      expect(downloadService.markCompleted).not.toHaveBeenCalled();
    });

    it("a Stash body that sends nothing for the idle limit fails the download", async () => {
      const first = new StashBody();
      serveBodies(first);
      arrange("Mix", [item(0, scene("s1", "First"))]);
      const service = new PlaylistZipService({
        headersTimeoutMs: 60_000,
        idleTimeoutMs: 50,
      });

      await service.createZip(7, NO_CAP);

      expect(downloadService.markFailed).toHaveBeenCalledWith(7, ZIP_FAILED);
      expect(first.cancelled).toBe(true);
      expect(zipLeft()).toBe(false);
    });
  });

  describe("a scene that cannot be fetched is left out and counted", () => {
    const ZIP_FAILED = "The zip could not be created";
    const NOTHING_FETCHED =
      "None of the playlist's scenes could be fetched from Stash";

    /** Download 7's zip file */
    function zipPath(): string {
      return path.join(configDir, "downloads", "user-5", "download-7.zip");
    }

    /** Three scenes, s1 to s3, in playlist "Mix"; s2 on `secondInstance` */
    function arrangeThree(secondInstance = "inst-a") {
      arrange("Mix", [
        item(0, scene("s1", "First")),
        item(1, scene("s2", "Second", { instanceId: secondInstance })),
        item(2, scene("s3", "Third")),
      ]);
    }

    it.each([404, 410])(
      "a scene Stash answers %i for is left out and counted",
      async (status) => {
        arrangeThree();
        const refused = new StashBody();
        vi.mocked(fetch)
          .mockResolvedValueOnce(new Response("bytes"))
          .mockResolvedValueOnce(new Response(refused.stream, { status }))
          .mockResolvedValueOnce(new Response("bytes"));

        await playlistZipService.createZip(7, NO_CAP);

        expect(appended.map((e) => e.name)).toEqual([
          "Mix/First.nfo",
          "Mix/First.mp4",
          "Mix/Third.nfo",
          "Mix/Third.mp4",
          "Mix/playlist.m3u",
        ]);
        expect(entryText("/playlist.m3u")).toBe(
          "#EXTM3U\n#EXTINF:60,First\nFirst.mp4\n#EXTINF:60,Third\nThird.mp4\n"
        );
        expect(refused.cancelled).toBe(true);
        const size = BigInt(fs.statSync(zipPath()).size);
        expect(downloadService.markCompleted).toHaveBeenCalledWith(
          7,
          zipPath(),
          size,
          1
        );
        expect(downloadService.markFailed).not.toHaveBeenCalled();
      }
    );

    it("a scene whose instance is no longer loaded is left out and counted", async () => {
      arrangeThree("inst-b");
      vi.mocked(stashInstanceManager.getCredentials).mockImplementation(
        (instanceId) => {
          if (instanceId === "inst-b") {
            throw new UnknownInstanceError("inst-b");
          }
          return { baseUrl: "http://stash-a.test", apiKey: "key-a" };
        }
      );

      await playlistZipService.createZip(7, NO_CAP);

      expect(appended.map((e) => e.name)).toEqual([
        "Mix/First.nfo",
        "Mix/First.mp4",
        "Mix/Third.nfo",
        "Mix/Third.mp4",
        "Mix/playlist.m3u",
      ]);
      expect(entryText("/playlist.m3u")).toBe(
        "#EXTM3U\n#EXTINF:60,First\nFirst.mp4\n#EXTINF:60,Third\nThird.mp4\n"
      );
      expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
        "http://stash-a.test/scene/s1/stream",
        "http://stash-a.test/scene/s3/stream",
      ]);
      const size = BigInt(fs.statSync(zipPath()).size);
      expect(downloadService.markCompleted).toHaveBeenCalledWith(
        7,
        zipPath(),
        size,
        1
      );
    });

    it("a zip that skips nothing completes with 0 skipped", async () => {
      arrangeThree();

      await playlistZipService.createZip(7, NO_CAP);

      expect(downloadService.markCompleted).toHaveBeenCalledWith(
        7,
        zipPath(),
        BigInt(fs.statSync(zipPath()).size),
        0
      );
    });

    it("a 5xx or a network error still fails the zip", async () => {
      arrangeThree();
      vi.mocked(fetch)
        .mockResolvedValueOnce(new Response("bytes"))
        .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));

      await playlistZipService.createZip(7, NO_CAP);

      expect(downloadService.markFailed).toHaveBeenCalledWith(7, ZIP_FAILED);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(fs.existsSync(zipPath())).toBe(false);
      expect(downloadService.markCompleted).not.toHaveBeenCalled();
    });

    it("nothing fetchable fails with its own reason", async () => {
      arrangeThree();
      vi.mocked(fetch).mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 404 }))
      );

      await playlistZipService.createZip(7, NO_CAP);

      expect(downloadService.markFailed).toHaveBeenCalledWith(
        7,
        NOTHING_FETCHED
      );
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(appended).toEqual([]);
      expect(fs.existsSync(zipPath())).toBe(false);
      expect(downloadService.markCompleted).not.toHaveBeenCalled();
    });
  });

  describe("a build rechecks access when its turn comes", () => {
    const NO_PERMISSION = "You no longer have permission to download playlists";
    const NO_DISK_SPACE =
      "Not enough space on the server for this zip; try again later";

    /** Download 7's zip file */
    function zipPath(): string {
      return path.join(configDir, "downloads", "user-5", "download-7.zip");
    }

    it("a build rechecks the playlist permission", async () => {
      arrangeTwo();
      mockPermissions.mockResolvedValue(userPermissions());

      await playlistZipService.createZip(7, NO_CAP);

      expect(mockPermissions).toHaveBeenCalledWith(5);
      expect(downloadService.markFailed).toHaveBeenCalledWith(7, NO_PERMISSION);
      expect(fetch).not.toHaveBeenCalled();
      expect(downloadService.markCompleted).not.toHaveBeenCalled();
    });

    it("a build rechecks playlist access", async () => {
      arrangeTwo();
      mockPlaylistAccess.mockResolvedValue({ level: "none" });

      await playlistZipService.createZip(7, NO_CAP);

      expect(mockPlaylistAccess).toHaveBeenCalledWith(3, 5);
      expect(downloadService.markFailed).toHaveBeenCalledWith(
        7,
        "Playlist not found"
      );
      expect(fetch).not.toHaveBeenCalled();
    });

    it("a build over the size cap fails before any fetch", async () => {
      arrangeTwo([100, 100]);

      await playlistZipService.createZip(7, { maxBytes: 150n });

      expect(downloadService.markFailed).toHaveBeenCalledWith(
        7,
        "The zip grew past the size limit"
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(fs.existsSync(zipPath())).toBe(false);
    });

    it("a build with too little free disk fails before any fetch", async () => {
      arrangeTwo([100, 100]);
      // 10 blocks of 4 KiB free: under 200 planned bytes plus 1 GiB
      const statfs = vi.spyOn(fs.promises, "statfs").mockResolvedValue({
        type: 0,
        bsize: 4096,
        blocks: 1000,
        bfree: 10,
        bavail: 10,
        files: 0,
        ffree: 0,
      });

      await playlistZipService.createZip(7, NO_CAP);

      expect(statfs).toHaveBeenCalledWith(path.join(configDir, "downloads"));
      expect(downloadService.markFailed).toHaveBeenCalledWith(7, NO_DISK_SPACE);
      expect(fetch).not.toHaveBeenCalled();
      expect(fs.existsSync(zipPath())).toBe(false);
    });

    it("a first build with no downloads folder yet creates it and passes the space check", async () => {
      arrangeTwo();
      const statfs = vi.spyOn(fs.promises, "statfs");
      expect(fs.existsSync(path.join(configDir, "downloads"))).toBe(false);

      await playlistZipService.createZip(7, NO_CAP);

      expect(statfs).toHaveBeenCalledWith(path.join(configDir, "downloads"));
      expect(downloadService.markFailed).not.toHaveBeenCalled();
      expect(downloadService.markCompleted).toHaveBeenCalledTimes(1);
    });

    it.each(["shutdown", "cancelled"])(
      "an abort for %s leaves the row as it is and removes the file",
      async (reason) => {
        const first = new StashBody();
        serveBodies(first);
        arrangeTwo();
        const job = new AbortController();

        const done = playlistZipService.createZip(7, {
          ...NO_CAP,
          signal: job.signal,
        });
        await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
        first.send(10);
        await settle();
        job.abort(reason);
        await done;

        expect(first.cancelled).toBe(true);
        expect(downloadService.markFailed).not.toHaveBeenCalled();
        expect(downloadService.markCompleted).not.toHaveBeenCalled();
        expect(fs.existsSync(zipPath())).toBe(false);
      }
    );

    it("a deleted row stops the build", async () => {
      arrangeTwo();
      // The row is there when the build starts, gone after the first file
      vi.mocked(downloadService.updateProgress)
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false);

      await playlistZipService.createZip(7, NO_CAP);

      expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual([
        "http://stash-a.test/scene/s1/stream",
      ]);
      expect(downloadService.markFailed).not.toHaveBeenCalled();
      expect(downloadService.markCompleted).not.toHaveBeenCalled();
      expect(fs.existsSync(zipPath())).toBe(false);
    });

    it("a row deleted before the build writes nothing", async () => {
      arrangeTwo();
      vi.mocked(downloadService.getDownload).mockResolvedValue(null);

      await playlistZipService.createZip(7, NO_CAP);

      expect(fetch).not.toHaveBeenCalled();
      expect(downloadService.markFailed).not.toHaveBeenCalled();
      expect(downloadService.updateProgress).not.toHaveBeenCalled();
    });
  });
});
