/**
 * Playlist item writes name each scene's instance (item 33).
 *
 * Scene SAME exists on instance A and on instance B (see
 * helpers/accessFixture.ts), so a bare id names two scenes. Add, remove and
 * reorder take the instance from the request and never guess one; an add
 * also checks the viewer can see the scene. The viewer hid GLOBAL on B.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient } from "../helpers/testClient.js";

/** The playlist's items in position order, as "sceneId@instance" */
async function itemsOf(playlistId: number): Promise<string[]> {
  const rows = await prisma.playlistItem.findMany({
    where: { playlistId },
    orderBy: { position: "asc" },
  });
  return rows.map((r) => `${r.sceneId}@${r.instanceId}`);
}

describe("Playlist items keep each scene's instance (integration)", () => {
  let viewer: { id: number; client: TestClient };
  let nextName = 0;

  /** A fresh playlist of the viewer's, holding the given items in order */
  async function playlistWith(
    items: ReadonlyArray<readonly [string, string]> = []
  ): Promise<number> {
    nextName += 1;
    const playlist = await prisma.playlist.create({
      data: {
        userId: viewer.id,
        name: `access-it-pl-instances-${nextName}`,
        items: {
          create: items.map(([sceneId, instanceId], position) => ({
            sceneId,
            instanceId,
            position,
          })),
        },
      },
    });
    return playlist.id;
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    viewer = await createApiUser("access_it_pl_instances", "access_it_pass_1");
    await hideFor(viewer.id, "scene", FX_ID.GLOBAL, FX.B);
  }, 60000);

  afterAll(async () => {
    // beforeAll may have failed before it set viewer
    const created = viewer as typeof viewer | undefined;
    if (created) {
      await adminClient.delete(`/api/user/${created.id}`);
    }
    await clearAccessFixture();
  }, 60000);

  it("adding B's SAME stores B:SAME when A has the same id", async () => {
    const playlistId = await playlistWith();

    const res = await viewer.client.post(`/api/playlists/${playlistId}/items`, {
      sceneId: FX_ID.SAME,
      instanceId: FX.B,
    });

    expect(res.status).toBe(201);
    expect(await itemsOf(playlistId)).toEqual([`${FX_ID.SAME}@${FX.B}`]);
  });

  it("adding a scene already in the playlist answers 409", async () => {
    const playlistId = await playlistWith([[FX_ID.SAME, FX.B]]);

    const res = await viewer.client.post(`/api/playlists/${playlistId}/items`, {
      sceneId: FX_ID.SAME,
      instanceId: FX.B,
    });

    expect(res.status).toBe(409);
    expect(await itemsOf(playlistId)).toEqual([`${FX_ID.SAME}@${FX.B}`]);
  });

  it("add without an instance answers 400", async () => {
    const playlistId = await playlistWith();

    const res = await viewer.client.post(`/api/playlists/${playlistId}/items`, {
      sceneId: FX_ID.SAME,
    });

    expect(res.status).toBe(400);
    expect(await itemsOf(playlistId)).toEqual([]);
  });

  it.each([
    ["hidden on that instance", FX_ID.GLOBAL, FX.B],
    ["deleted", FX_ID.DELETED, FX.A],
    ["on a disabled instance", FX_ID.ON_OFF, FX.OFF],
    ["not on that instance", FX_ID.B_ONLY, FX.A],
  ])(
    "adding a scene the user cannot see answers 404 and stores nothing (%s)",
    async (_why, sceneId, instanceId) => {
      const playlistId = await playlistWith();

      const res = await viewer.client.post(
        `/api/playlists/${playlistId}/items`,
        { sceneId, instanceId }
      );

      expect(res.status).toBe(404);
      expect(await itemsOf(playlistId)).toEqual([]);
    }
  );

  it("removing B:SAME leaves A:SAME", async () => {
    const playlistId = await playlistWith([
      [FX_ID.SAME, FX.A],
      [FX_ID.SAME, FX.B],
    ]);

    const res = await viewer.client.delete(
      `/api/playlists/${playlistId}/items/${FX_ID.SAME}?instanceId=${FX.B}`
    );

    expect(res.status).toBe(200);
    expect(await itemsOf(playlistId)).toEqual([`${FX_ID.SAME}@${FX.A}`]);
  });

  it("remove without an instance answers 400", async () => {
    const playlistId = await playlistWith([[FX_ID.SAME, FX.A]]);

    const res = await viewer.client.delete(
      `/api/playlists/${playlistId}/items/${FX_ID.SAME}`
    );

    expect(res.status).toBe(400);
    expect(await itemsOf(playlistId)).toEqual([`${FX_ID.SAME}@${FX.A}`]);
  });

  it("removing an item that is not there answers 404", async () => {
    const playlistId = await playlistWith([[FX_ID.SAME, FX.A]]);

    const res = await viewer.client.delete(
      `/api/playlists/${playlistId}/items/${FX_ID.B_ONLY}?instanceId=${FX.B}`
    );

    expect(res.status).toBe(404);
    expect(await itemsOf(playlistId)).toEqual([`${FX_ID.SAME}@${FX.A}`]);
  });

  it("reorder with both SAMEs moves each by its instance", async () => {
    const playlistId = await playlistWith([
      [FX_ID.SAME, FX.A],
      [FX_ID.SAME, FX.B],
    ]);

    const res = await viewer.client.put(
      `/api/playlists/${playlistId}/reorder`,
      {
        items: [
          { sceneId: FX_ID.SAME, instanceId: FX.B, position: 0 },
          { sceneId: FX_ID.SAME, instanceId: FX.A, position: 1 },
        ],
      }
    );

    expect(res.status).toBe(200);
    expect(await itemsOf(playlistId)).toEqual([
      `${FX_ID.SAME}@${FX.B}`,
      `${FX_ID.SAME}@${FX.A}`,
    ]);
  });

  it("reorder without an item's instance answers 400 naming the index", async () => {
    const playlistId = await playlistWith([
      [FX_ID.SAME, FX.A],
      [FX_ID.SAME, FX.B],
    ]);

    const res = await viewer.client.put<{ error?: string }>(
      `/api/playlists/${playlistId}/reorder`,
      {
        items: [
          { sceneId: FX_ID.SAME, instanceId: FX.B, position: 0 },
          { sceneId: FX_ID.SAME, position: 1 },
        ],
      }
    );

    expect(res.status).toBe(400);
    expect(res.data.error).toContain("items[1]");
    expect(await itemsOf(playlistId)).toEqual([
      `${FX_ID.SAME}@${FX.A}`,
      `${FX_ID.SAME}@${FX.B}`,
    ]);
  });

  it("reorder naming an item that is not in the playlist answers 400 and moves nothing", async () => {
    const playlistId = await playlistWith([
      [FX_ID.SAME, FX.A],
      [FX_ID.SAME, FX.B],
    ]);

    const res = await viewer.client.put<{ error?: string }>(
      `/api/playlists/${playlistId}/reorder`,
      {
        items: [
          { sceneId: FX_ID.SAME, instanceId: FX.B, position: 0 },
          { sceneId: FX_ID.B_ONLY, instanceId: FX.B, position: 1 },
        ],
      }
    );

    expect(res.status).toBe(400);
    expect(res.data.error).toContain("items[1]");
    expect(await itemsOf(playlistId)).toEqual([
      `${FX_ID.SAME}@${FX.A}`,
      `${FX_ID.SAME}@${FX.B}`,
    ]);
  });
});
