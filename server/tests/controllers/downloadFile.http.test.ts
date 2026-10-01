import type { Download } from "@prisma/client";
import { createHash } from "crypto";
import express from "express";
import fs from "fs";
import http from "http";
import type { AddressInfo } from "net";
import os from "os";
import path from "path";
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
import { errorHandler } from "../../middleware/errorHandler.js";
import { downloadService } from "../../services/DownloadService.js";
import type * as stashInstanceManagerModule from "../../services/StashInstanceManager.js";
import { authenticated } from "../../utils/routeHelpers.js";
import { must } from "../helpers/must.js";

// Real Express and real HTTP: Node validates header bytes only when a header
// is actually written, and sendFile writes its headers asynchronously.

type StashHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => void;

const state = vi.hoisted(() => ({
  stashUrl: "",
  stashRequests: 0,
  /** What the stand-in Stash does with a request; unset answers 11 bytes */
  handler: undefined as StashHandler | undefined,
}));

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../services/DownloadService.js", () => ({
  downloadService: {
    getDownload: vi.fn(),
  },
}));

// Only inst-a is loaded; any other id is an instance that is not (disabled,
// deleted, or "" on a row stored before instances were carried)
vi.mock("../../services/StashInstanceManager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof stashInstanceManagerModule>();
  return {
    UnknownInstanceError: actual.UnknownInstanceError,
    stashInstanceManager: {
      getCredentials: vi.fn((id?: string) => {
        if (id !== "inst-a") {
          throw new actual.UnknownInstanceError(String(id));
        }
        return { baseUrl: state.stashUrl, apiKey: "test-key" };
      }),
    },
  };
});

vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(() =>
    Promise.resolve({
      canShare: false,
      canDownloadFiles: true,
      canDownloadPlaylists: true,
      sources: {
        canShare: "default",
        canDownloadFiles: "override",
        canDownloadPlaylists: "override",
      },
    })
  ),
}));

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("../../services/PlaylistAccessService.js", () => ({
  getPlaylistAccess: vi.fn(() => Promise.resolve({ level: "owner" })),
}));

vi.mock("../../services/PlaylistZipService.js", () => ({
  playlistZipService: {
    createZip: vi.fn(),
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockGetDownload = vi.mocked(downloadService.getDownload);

function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

describe("GET /api/downloads/:id/file over real HTTP", () => {
  let tmpDir: string;
  let zipPath: string;
  let stashServer: http.Server;
  let peekServer: http.Server;
  let peekUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(os.tmpdir() + "/peek-dl-");
    zipPath = path.join(tmpDir, "playlist.zip");
    fs.writeFileSync(zipPath, "zip-bytes");

    stashServer = http.createServer((req, res) => {
      state.stashRequests++;
      if (state.handler) {
        state.handler(req, res);
        return;
      }
      res.writeHead(200, { "content-type": "video/mp4" });
      res.end("video-bytes");
    });
    await new Promise<void>((resolve) => stashServer.listen(0, resolve));
    state.stashUrl = `http://127.0.0.1:${(stashServer.address() as AddressInfo).port}`;

    const app = express();
    app.use((req, _res, next) => {
      (req as AuthenticatedRequest).user = {
        id: 1,
        username: "u",
        role: "USER",
      };
      next();
    });
    app.get("/api/downloads/:id/file", authenticated(getDownloadFile));
    app.use(errorHandler);
    peekServer = await new Promise<http.Server>((resolve) => {
      const server = app.listen(0, () => resolve(server));
    });
    peekUrl = `http://127.0.0.1:${(peekServer.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await closeServer(peekServer);
    await closeServer(stashServer);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    mockGetDownload.mockReset();
    state.stashRequests = 0;
    state.handler = undefined;
    delete process.env.STASH_HEADERS_TIMEOUT_MS;
  });

  it("serves a playlist zip whose name has a curly apostrophe and an emoji", async () => {
    mockGetDownload.mockResolvedValue({
      id: 7,
      userId: 1,
      type: "PLAYLIST",
      status: "COMPLETED",
      entityType: null,
      entityId: null,
      instanceId: "",
      fileName: "Kate’s picks 🎬.zip",
      fileSize: BigInt(9),
      filePath: zipPath,
      progress: 100,
      error: null,
      skippedItems: 0,
      playlistId: 5,
      createdAt: new Date(),
      completedAt: new Date(),
      expiresAt: null,
    });

    const res = await fetch(`${peekUrl}/api/downloads/7/file`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Kate_s picks _.zip\"; filename*=UTF-8''Kate%E2%80%99s%20picks%20%F0%9F%8E%AC.zip"
    );
    expect(await res.text()).toBe("zip-bytes");
  });

  it("streams a scene download whose title has an en dash", async () => {
    mockGetDownload.mockResolvedValue({
      id: 8,
      userId: 1,
      type: "SCENE",
      status: "COMPLETED",
      entityType: "scene",
      entityId: "12",
      instanceId: "inst-a",
      fileName: "Part 1 – Intro.mp4",
      fileSize: BigInt(11),
      filePath: null,
      progress: 100,
      error: null,
      skippedItems: 0,
      playlistId: null,
      createdAt: new Date(),
      completedAt: new Date(),
      expiresAt: null,
    });

    const res = await fetch(`${peekUrl}/api/downloads/8/file`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Part 1 _ Intro.mp4\"; filename*=UTF-8''Part%201%20%E2%80%93%20Intro.mp4"
    );
    expect(await res.text()).toBe("video-bytes");
  });

  it("a download whose instance is not loaded answers 404 and never fetches", async () => {
    // Disabled or deleted since the download was made: the file is not
    // fetched from any other Stash
    mockGetDownload.mockResolvedValue({
      id: 9,
      userId: 1,
      type: "SCENE",
      status: "COMPLETED",
      entityType: "scene",
      entityId: "12",
      instanceId: "inst-gone",
      fileName: "Scene 12.mp4",
      fileSize: BigInt(11),
      filePath: null,
      progress: 100,
      error: null,
      skippedItems: 0,
      playlistId: null,
      createdAt: new Date(),
      completedAt: new Date(),
      expiresAt: null,
    });

    const res = await fetch(`${peekUrl}/api/downloads/9/file`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Download not found" });
    expect(state.stashRequests).toBe(0);
  });
  /** A completed scene download the user may fetch from inst-a */
  function sceneDownload(): Download {
    return {
      id: 20,
      userId: 1,
      type: "SCENE",
      status: "COMPLETED",
      entityType: "scene",
      entityId: "12",
      instanceId: "inst-a",
      fileName: "Scene 12.mp4",
      fileSize: BigInt(100),
      filePath: null,
      progress: 100,
      error: null,
      skippedItems: 0,
      playlistId: null,
      createdAt: new Date(),
      completedAt: new Date(),
      expiresAt: null,
    };
  }

  it("a Stash 404 answers 404 and the upstream body is cancelled", async () => {
    mockGetDownload.mockResolvedValue(sceneDownload());
    const stashClosed = new Promise<void>((resolve) => {
      state.handler = (_req, res) => {
        res.on("close", resolve);
        res.writeHead(404, { "content-type": "text/plain" });
        // A body that never ends
        res.write("not found");
      };
    });

    const res = await fetch(`${peekUrl}/api/downloads/20/file`);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Download not found" });
    await expect(
      Promise.race([
        stashClosed,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Stash's response stayed open")),
            1000
          )
        ),
      ])
    ).resolves.toBeUndefined();
  }, 5000);

  it("a Stash 410 answers 404, not 502", async () => {
    mockGetDownload.mockResolvedValue(sceneDownload());
    state.handler = (_req, res) => {
      res.writeHead(410, { "content-type": "text/plain" });
      res.end("gone");
    };

    const res = await fetch(`${peekUrl}/api/downloads/20/file`);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Download not found" });
  }, 5000);

  it("a Stash 500 answers 502", async () => {
    mockGetDownload.mockResolvedValue(sceneDownload());
    state.handler = (_req, res) => {
      res.writeHead(500);
      res.end("boom");
    };

    const res = await fetch(`${peekUrl}/api/downloads/20/file`);

    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: "Stash could not serve the file",
    });
  }, 5000);

  it("a Stash that sends no headers within the timeout answers 504", async () => {
    process.env.STASH_HEADERS_TIMEOUT_MS = "200";
    mockGetDownload.mockResolvedValue(sceneDownload());
    // Never answers
    state.handler = () => {};

    const res = await fetch(`${peekUrl}/api/downloads/20/file`);

    expect(res.status).toBe(504);
    expect(await res.json()).toMatchObject({ error: "Stash did not answer" });
  }, 5000);

  it("a Range request is forwarded and answered 206", async () => {
    mockGetDownload.mockResolvedValue(sceneDownload());
    const seen: {
      range?: string | undefined;
      ifRange?: string | string[] | undefined;
    } = {};
    state.handler = (req, res) => {
      seen.range = req.headers.range;
      seen.ifRange = req.headers["if-range"];
      res.writeHead(206, {
        "content-type": "video/mp4",
        "content-length": "10",
        "content-range": "bytes 10-19/100",
        "accept-ranges": "bytes",
      });
      res.end("0123456789");
    };

    const res = await fetch(`${peekUrl}/api/downloads/20/file`, {
      headers: { Range: "bytes=10-19", "If-Range": '"abc"' },
    });

    expect(seen).toEqual({ range: "bytes=10-19", ifRange: '"abc"' });
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 10-19/100");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(await res.text()).toBe("0123456789");
  }, 5000);

  it("a ranged scene download answers 206 with Content-Range and keeps Content-Disposition", async () => {
    mockGetDownload.mockResolvedValue(sceneDownload());
    state.handler = (_req, res) => {
      res.writeHead(206, {
        "content-type": "video/mp4",
        "content-length": "4",
        "content-range": "bytes 0-3/100",
        etag: '"v1"',
        "last-modified": "Wed, 21 Oct 2015 07:28:00 GMT",
      });
      res.end("abcd");
    };

    const res = await fetch(`${peekUrl}/api/downloads/20/file`, {
      headers: { Range: "bytes=0-3" },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-3/100");
    expect(res.headers.get("etag")).toBe('"v1"');
    expect(res.headers.get("last-modified")).toBe(
      "Wed, 21 Oct 2015 07:28:00 GMT"
    );
    expect(res.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Scene 12.mp4\"; filename*=UTF-8''Scene%2012.mp4"
    );
    expect(await res.text()).toBe("abcd");
  }, 5000);

  it("a 416 from Stash reaches the browser as 416", async () => {
    mockGetDownload.mockResolvedValue(sceneDownload());
    state.handler = (_req, res) => {
      res.writeHead(416, { "content-range": "bytes */100" });
      res.end();
    };

    const res = await fetch(`${peekUrl}/api/downloads/20/file`, {
      headers: { Range: "bytes=500-600" },
    });

    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */100");
    await res.arrayBuffer();
  }, 5000);

  it("a zip download answers a Range request with 206", async () => {
    mockGetDownload.mockResolvedValue({
      ...sceneDownload(),
      id: 21,
      type: "PLAYLIST",
      entityType: null,
      entityId: null,
      instanceId: "",
      fileName: "p.zip",
      filePath: zipPath,
      playlistId: 5,
    });

    const res = await fetch(`${peekUrl}/api/downloads/21/file`, {
      headers: { Range: "bytes=0-2" },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 0-2/9");
    expect(await res.text()).toBe("zip");
  }, 5000);

  it("a zip row without a file answers 404", async () => {
    mockGetDownload.mockResolvedValue({
      ...sceneDownload(),
      id: 22,
      type: "PLAYLIST",
      entityType: null,
      entityId: null,
      instanceId: "",
      fileName: "p.zip",
      filePath: null,
      playlistId: 5,
    });

    const res = await fetch(`${peekUrl}/api/downloads/22/file`);

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "Download not found" });
  }, 5000);

  it("a slow reader holds Stash back", async () => {
    // 64 MiB in 64 KiB chunks, each filled with a byte that depends on its index
    const chunkSize = 64 * 1024;
    const chunkCount = 1024;
    const chunk = (i: number): Buffer => Buffer.alloc(chunkSize, i % 251);
    const expected = createHash("sha256");
    for (let i = 0; i < chunkCount; i++) expected.update(chunk(i));
    const expectedDigest = expected.digest("hex");

    mockGetDownload.mockResolvedValue(sceneDownload());
    let written = 0;
    state.handler = (_req, res) => {
      res.writeHead(200, {
        "content-type": "video/mp4",
        "content-length": String(chunkSize * chunkCount),
      });
      let i = 0;
      const writeMore = (): void => {
        while (i < chunkCount) {
          const ok = res.write(chunk(i++));
          written += chunkSize;
          if (!ok) {
            res.once("drain", writeMore);
            return;
          }
        }
        res.end();
      };
      writeMore();
    };

    const res = await fetch(`${peekUrl}/api/downloads/20/file`);
    expect(res.status).toBe(200);
    const reader = must(res.body).getReader();
    const received = createHash("sha256");
    let receivedBytes = 0;
    while (receivedBytes < 1024 * 1024) {
      const { value, done } = await reader.read();
      if (done) break;
      received.update(value);
      receivedBytes += value.byteLength;
    }

    // The client stops reading: Stash may only fill the socket and stream buffers
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(written).toBeLessThanOrEqual(16 * 1024 * 1024);

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      received.update(value);
      receivedBytes += value.byteLength;
    }
    expect(receivedBytes).toBe(chunkSize * chunkCount);
    expect(received.digest("hex")).toBe(expectedDigest);
  }, 30_000);
});
