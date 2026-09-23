/**
 * Downloads over HTTP (item 10).
 *
 * A download is created, and its file served, only while the user may see
 * the entity (not hidden or restricted for them, not deleted, on an enabled
 * instance they use) and holds the matching download permission. A playlist
 * zip needs the playlist to be the user's or shared with them.
 *
 * dl hides the fixture defaults (see helpers/accessFixture.ts): SAME on B for
 * every type, GLOBAL on every instance, HIDDEN_A on A. The owner's playlist P
 * holds SAME@B, SAME@A, GLOBAL@A, DELETED@A and ON_OFF@OFF; P2 holds only
 * SAME@B.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFixtureDefaults,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { TEST_CONFIG } from "../helpers/config.js";
import { TestClient, adminClient } from "../helpers/testClient.js";

const GROUP_NAME = "access-it-group";
const DL_PASSWORD = "access_it_pass_1";

interface DownloadResponse {
  download?: {
    id: number;
    type: string;
    entityId: string | null;
    instanceId: string;
  };
  error?: string;
}

async function unhideFor(
  userId: number,
  entityType: string,
  entityId: string,
  instanceId: string
): Promise<void> {
  const where = { userId, entityType, entityId, instanceId };
  await prisma.userHiddenEntity.deleteMany({ where });
  await prisma.userExcludedEntity.deleteMany({ where });
}

async function setPermissions(
  userId: number,
  overrides: {
    canDownloadFilesOverride?: boolean;
    canDownloadPlaylistsOverride?: boolean;
  }
): Promise<void> {
  const res = await adminClient.put(
    `/api/user/${userId}/permissions`,
    overrides
  );
  expect(res.status).toBe(200);
}

/** Waits until the server's background zip job has settled. */
async function waitForZipJob(downloadId: number): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const row = await prisma.download.findUnique({
      where: { id: downloadId },
    });
    if (!row || (row.status !== "PENDING" && row.status !== "PROCESSING")) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe("Downloads access (integration)", () => {
  let dl: { id: number; client: TestClient };
  let owner: { id: number; client: TestClient };
  let dlCookie: string;
  let playlistP: number;
  let playlistP2: number;
  let groupId: number;
  let tmpDir: string;

  /** GET /api/downloads/:id/file as dl, keeping the raw body. */
  async function getFile(
    downloadId: number
  ): Promise<{ status: number; text: string }> {
    const res = await fetch(
      `${TEST_CONFIG.baseUrl}/api/downloads/${downloadId}/file`,
      { headers: { Cookie: dlCookie } }
    );
    return { status: res.status, text: await res.text() };
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await prisma.userGroup.deleteMany({ where: { name: GROUP_NAME } });
    await seedAccessFixture();
    dl = await createApiUser("access_it_dl", DL_PASSWORD);
    owner = await createApiUser("access_it_dl_owner", DL_PASSWORD);
    await hideFixtureDefaults(dl.id);
    await setPermissions(dl.id, {
      canDownloadFilesOverride: true,
      canDownloadPlaylistsOverride: true,
    });

    const login = await fetch(`${TEST_CONFIG.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "access_it_dl", password: DL_PASSWORD }),
    });
    const token = login.headers.get("set-cookie")?.match(/token=([^;]+)/)?.[1];
    if (!token) throw new Error(`dl login failed: ${login.status}`);
    dlCookie = `token=${token}`;

    const items: Array<[string, string]> = [
      [FX_ID.SAME, FX.B],
      [FX_ID.SAME, FX.A],
      [FX_ID.GLOBAL, FX.A],
      [FX_ID.DELETED, FX.A],
      [FX_ID.ON_OFF, FX.OFF],
    ];
    playlistP = (
      await prisma.playlist.create({
        data: {
          name: "access-it-P",
          userId: owner.id,
          items: {
            create: items.map(([sceneId, instanceId], position) => ({
              sceneId,
              instanceId,
              position,
            })),
          },
        },
      })
    ).id;
    playlistP2 = (
      await prisma.playlist.create({
        data: {
          name: "access-it-P2",
          userId: owner.id,
          items: {
            create: [{ sceneId: FX_ID.SAME, instanceId: FX.B, position: 0 }],
          },
        },
      })
    ).id;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-dl-http-"));
  }, 60000);

  afterAll(async () => {
    await prisma.userGroup.deleteMany({ where: { name: GROUP_NAME } });
    // Users cascade to their playlists, shares' memberships and Download rows.
    if (dl) await adminClient.delete(`/api/user/${dl.id}`);
    if (owner) await adminClient.delete(`/api/user/${owner.id}`);
    await clearAccessFixture();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  }, 60000);

  it("scene download needs an instanceId", async () => {
    const res = await dl.client.post(`/api/downloads/scene/${FX_ID.SAME}`);
    expect(res.status).toBe(400);
  });

  it("scene download on a visible instance stores that instance", async () => {
    const res = await dl.client.post<DownloadResponse>(
      `/api/downloads/scene/${FX_ID.SAME}`,
      { instanceId: FX.A }
    );

    expect(res.status).toBe(200);
    expect(res.data.download?.instanceId).toBe(FX.A);
    expect(res.data.download?.entityId).toBe(FX_ID.SAME);
  });

  it("scene download where the user hid it is refused", async () => {
    const res = await dl.client.post(`/api/downloads/scene/${FX_ID.SAME}`, {
      instanceId: FX.B,
    });

    expect(res.status).toBe(404);
    expect(
      await prisma.download.findFirst({
        where: { userId: dl.id, entityId: FX_ID.SAME, instanceId: FX.B },
      })
    ).toBeNull();
  });

  it("soft-deleted, disabled-instance, unknown-instance and globally hidden scenes are refused", async () => {
    const cases: [string, string][] = [
      [FX_ID.DELETED, FX.A],
      [FX_ID.ON_OFF, FX.OFF],
      [FX_ID.SAME, "nope"],
      [FX_ID.GLOBAL, FX.A],
    ];
    for (const [id, instanceId] of cases) {
      const res = await dl.client.post(`/api/downloads/scene/${id}`, {
        instanceId,
      });
      expect(res.status, `${id}@${instanceId}`).toBe(404);
    }
  });

  it("image download follows the same rules", async () => {
    const visible = await dl.client.post(`/api/downloads/image/${FX_ID.SAME}`, {
      instanceId: FX.A,
    });
    expect(visible.status).toBe(200);

    const hidden = await dl.client.post(
      `/api/downloads/image/${FX_ID.HIDDEN_A}`,
      { instanceId: FX.A }
    );
    expect(hidden.status).toBe(404);
  });

  it("the file route re-checks access to a scene", async () => {
    const created = await dl.client.post<DownloadResponse>(
      `/api/downloads/scene/${FX_ID.SAME}`,
      { instanceId: FX.A }
    );
    expect(created.status).toBe(200);

    await hideFor(dl.id, "scene", FX_ID.SAME, FX.A);
    try {
      const file = await getFile(created.data.download!.id);
      expect(file.status).toBe(404);
      // Refused by Peek, not passed through from Stash
      expect(JSON.parse(file.text).error).toBe("Download not found");
    } finally {
      await unhideFor(dl.id, "scene", FX_ID.SAME, FX.A);
    }
  });

  it("the file route re-checks the files permission", async () => {
    const created = await dl.client.post<DownloadResponse>(
      `/api/downloads/scene/${FX_ID.SAME}`,
      { instanceId: FX.A }
    );
    expect(created.status).toBe(200);

    await setPermissions(dl.id, { canDownloadFilesOverride: false });
    try {
      const file = await getFile(created.data.download!.id);
      expect(file.status).toBe(403);
    } finally {
      await setPermissions(dl.id, { canDownloadFilesOverride: true });
    }
  });

  it("the file route refuses a legacy download with 410", async () => {
    const legacy = (status: "COMPLETED" | "EXPIRED") =>
      prisma.download.create({
        data: {
          userId: dl.id,
          type: "SCENE",
          status,
          entityType: "scene",
          entityId: FX_ID.SAME,
          instanceId: "",
          fileName: `legacy-${status}.mp4`,
          progress: 100,
        },
      });

    const completed = await getFile((await legacy("COMPLETED")).id);
    expect(completed.status).toBe(410);
    expect(JSON.parse(completed.text).error).toMatch(/expired/);

    const expired = await getFile((await legacy("EXPIRED")).id);
    expect(expired.status).toBe(410);
    expect(JSON.parse(expired.text).error).toMatch(/expired/);
  });

  it("a playlist not shared with the user is refused", async () => {
    const res = await dl.client.post(`/api/downloads/playlist/${playlistP}`);
    expect(res.status).toBe(404);
  });

  it("a shared recipient with the permission may download", async () => {
    groupId = (
      await prisma.userGroup.create({
        data: {
          name: GROUP_NAME,
          members: { create: [{ userId: dl.id }] },
        },
      })
    ).id;
    await prisma.playlistShare.create({
      data: { playlistId: playlistP, groupId },
    });

    const res = await dl.client.post<DownloadResponse>(
      `/api/downloads/playlist/${playlistP}`
    );

    expect(res.status).toBe(200);
    expect(res.data.download?.type).toBe("PLAYLIST");
    // The server's background zip then fails on the made-up instance, by
    // design. Let it settle so it doesn't outlive the fixture.
    await waitForZipJob(res.data.download!.id);
  });

  it("a shared recipient without the permission is refused", async () => {
    await setPermissions(dl.id, { canDownloadPlaylistsOverride: false });
    try {
      const res = await dl.client.post(`/api/downloads/playlist/${playlistP}`);
      expect(res.status).toBe(403);
    } finally {
      await setPermissions(dl.id, { canDownloadPlaylistsOverride: true });
    }
  });

  it("a playlist with nothing the user may download is refused", async () => {
    await prisma.playlistShare.create({
      data: { playlistId: playlistP2, groupId },
    });

    const res = await dl.client.post<DownloadResponse>(
      `/api/downloads/playlist/${playlistP2}`
    );

    expect(res.status).toBe(400);
    expect(res.data.error).toBe("This playlist has no scenes you can download");
  });

  it("unsharing or removing the permission cuts off a finished zip", async () => {
    const zipPath = path.join(tmpDir, "p.zip");
    fs.writeFileSync(zipPath, "zip-bytes");
    const zip = await prisma.download.create({
      data: {
        userId: dl.id,
        type: "PLAYLIST",
        status: "COMPLETED",
        playlistId: playlistP,
        fileName: "p.zip",
        filePath: zipPath,
        progress: 100,
      },
    });

    const shared = await getFile(zip.id);
    expect(shared.status).toBe(200);
    expect(shared.text).toBe("zip-bytes");

    await setPermissions(dl.id, { canDownloadPlaylistsOverride: false });
    try {
      expect((await getFile(zip.id)).status).toBe(403);
    } finally {
      await setPermissions(dl.id, { canDownloadPlaylistsOverride: true });
    }

    await prisma.playlistShare.deleteMany({
      where: { playlistId: playlistP, groupId },
    });
    expect((await getFile(zip.id)).status).toBe(404);
  });
});
