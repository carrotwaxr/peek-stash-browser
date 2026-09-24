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
import { downloadService } from "../../services/DownloadService.js";

// Real Express and real HTTP: Node validates header bytes only when a header
// is actually written, and sendFile writes its headers asynchronously.

const state = vi.hoisted(() => ({ stashUrl: "" }));

vi.mock("../../services/DownloadService.js", () => ({
  downloadService: {
    getDownload: vi.fn(),
  },
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getBaseUrl: vi.fn(() => state.stashUrl),
    getApiKey: vi.fn(() => "test-key"),
  },
}));

vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(async () => ({
    canShare: false,
    canDownloadFiles: true,
    canDownloadPlaylists: true,
    sources: {
      canShare: "default",
      canDownloadFiles: "override",
      canDownloadPlaylists: "override",
    },
  })),
}));

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn(async () => true),
}));

vi.mock("../../services/PlaylistAccessService.js", () => ({
  getPlaylistAccess: vi.fn(async () => ({ level: "owner" })),
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

    stashServer = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "video/mp4" });
      res.end("video-bytes");
    });
    await new Promise<void>((resolve) => stashServer.listen(0, resolve));
    state.stashUrl = `http://127.0.0.1:${(stashServer.address() as AddressInfo).port}`;

    const app = express();
    app.use((req, _res, next) => {
      (req as unknown as { user: unknown }).user = {
        id: 1,
        username: "u",
        role: "USER",
      };
      next();
    });
    app.get(
      "/api/downloads/:id/file",
      getDownloadFile as unknown as express.RequestHandler
    );
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
});
