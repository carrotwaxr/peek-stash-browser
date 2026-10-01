/**
 * Playlist item writes name each scene's instance (item 33).
 *
 * Scene SAME exists on instance A and on instance B (see
 * helpers/accessFixture.ts), so a bare id names two scenes. Add, bulk add
 * and remove take the instance from the request and never guess one; a
 * move and a bulk remove name items by item id (the whole-list reorder
 * route is gone); an add also checks the viewer can see the scene, and the playlist
 * list's `containsScene` names one. The viewer hid GLOBAL on B.
 */
import { PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import type {
  AddSceneToPlaylistResponse,
  AddScenesToPlaylistResponse,
  GetUserPlaylistsResponse,
  RemovePlaylistItemsResponse,
} from "../../types/api/index.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { expectRefused } from "../helpers/refused.js";
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
    const playlistId = await playlistWith([[FX_ID.SAME, FX.A]]);

    const res = await viewer.client.post<AddSceneToPlaylistResponse>(
      `/api/playlists/${playlistId}/items`,
      { sceneId: FX_ID.SAME, instanceId: FX.B }
    );

    // The single add keeps its answer: 201 with the stored item, after the
    // last one
    expect(res.status).toBe(201);
    expect(res.data.item).toMatchObject({
      playlistId,
      sceneId: FX_ID.SAME,
      instanceId: FX.B,
      position: 1,
    });
    expect(await itemsOf(playlistId)).toEqual([
      `${FX_ID.SAME}@${FX.A}`,
      `${FX_ID.SAME}@${FX.B}`,
    ]);
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

  it("bulk add of A:SAME and B:SAME adds both", async () => {
    const playlistId = await playlistWith();

    const res = await viewer.client.post<AddScenesToPlaylistResponse>(
      `/api/playlists/${playlistId}/items/bulk`,
      {
        scenes: [
          { sceneId: FX_ID.SAME, instanceId: FX.A },
          { sceneId: FX_ID.SAME, instanceId: FX.B },
        ],
      }
    );

    expect(res.status).toBe(200);
    expect(res.data).toEqual({
      added: 2,
      alreadyInPlaylist: 0,
      unavailable: 0,
    });
    expect(await itemsOf(playlistId)).toEqual([
      `${FX_ID.SAME}@${FX.A}`,
      `${FX_ID.SAME}@${FX.B}`,
    ]);
  });

  it("bulk add without an instance on one entry answers 400 naming the index and adds nothing", async () => {
    const playlistId = await playlistWith();

    const res = await viewer.client.post<{ error?: string }>(
      `/api/playlists/${playlistId}/items/bulk`,
      {
        scenes: [
          { sceneId: FX_ID.SAME, instanceId: FX.A },
          { sceneId: FX_ID.SAME },
        ],
      }
    );

    expect(res.status).toBe(400);
    expect(res.data.error).toContain("scenes[1]");
    expect(await itemsOf(playlistId)).toEqual([]);
  });

  it("bulk add of 251 scenes answers 400", async () => {
    const playlistId = await playlistWith();
    const scenes = Array.from({ length: PER_PAGE_MAX + 1 }, (_, i) => ({
      sceneId: String(i + 1),
      instanceId: FX.A,
    }));

    const res = await viewer.client.post(
      `/api/playlists/${playlistId}/items/bulk`,
      { scenes }
    );

    expect(res.status).toBe(400);
    expect(await itemsOf(playlistId)).toEqual([]);
  });

  it("bulk add to a playlist the viewer cannot reach answers 404", async () => {
    const other = await prisma.playlist.create({
      data: {
        userId: (
          await prisma.user.findFirstOrThrow({
            where: { username: TEST_ADMIN.username },
          })
        ).id,
        name: "access-it-pl-instances-admin",
      },
    });
    try {
      const res = await viewer.client.post(
        `/api/playlists/${other.id}/items/bulk`,
        { scenes: [{ sceneId: FX_ID.SAME, instanceId: FX.A }] }
      );

      expect(res.status).toBe(404);
      expect(await itemsOf(other.id)).toEqual([]);
    } finally {
      await prisma.playlist.delete({ where: { id: other.id } });
    }
  });

  it("GET /api/playlists?containsScene=<id:instance> marks the playlists holding that scene", async () => {
    const holdsB = await playlistWith([[FX_ID.SAME, FX.B]]);
    const holdsA = await playlistWith([[FX_ID.SAME, FX.A]]);

    const res = await viewer.client.get<GetUserPlaylistsResponse>(
      `/api/playlists?containsScene=${encodeURIComponent(`${FX_ID.SAME}:${FX.B}`)}`
    );

    expect(res.status).toBe(200);
    const marks = new Map(
      res.data.playlists.map((p) => [p.id, p.containsScene])
    );
    expect(marks.get(holdsB)).toBe(true);
    // The same id on the other instance is another scene
    expect(marks.get(holdsA)).toBe(false);

    // Not asked, not answered
    const plain =
      await viewer.client.get<GetUserPlaylistsResponse>("/api/playlists");
    expect(plain.status).toBe(200);
    expect(plain.data.playlists.every((p) => !("containsScene" in p))).toBe(
      true
    );
  });

  it.each([
    ["a bare id", FX_ID.SAME],
    ["an empty value", ""],
    ["a bad instance", `${FX_ID.SAME}:not an instance`],
  ])(
    "GET /api/playlists?containsScene with %s answers 400",
    async (_why, value) => {
      const res = await viewer.client.get(
        `/api/playlists?containsScene=${encodeURIComponent(value)}`
      );

      expectRefused(res, ["containsScene"]);
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

  it("PUT /api/playlists/:id/reorder answers 404 and moves nothing", async () => {
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

    expect(res.status).toBe(404);
    expect(await itemsOf(playlistId)).toEqual([
      `${FX_ID.SAME}@${FX.A}`,
      `${FX_ID.SAME}@${FX.B}`,
    ]);
  });

  /** The item id of a scene on an instance in a playlist */
  async function itemIdOf(
    playlistId: number,
    sceneId: string,
    instanceId: string
  ): Promise<number> {
    return (
      await prisma.playlistItem.findFirstOrThrow({
        where: { playlistId, sceneId, instanceId },
      })
    ).id;
  }

  it("moving B:SAME leaves A:SAME where it was", async () => {
    const playlistId = await playlistWith([
      [FX_ID.SAME, FX.A],
      [FX_ID.B_ONLY, FX.B],
      [FX_ID.SAME, FX.B],
    ]);
    const itemId = await itemIdOf(playlistId, FX_ID.SAME, FX.B);

    const res = await viewer.client.put(
      `/api/playlists/${playlistId}/items/${itemId}/position`,
      { index: 1 }
    );

    expect(res.status).toBe(200);
    expect(await itemsOf(playlistId)).toEqual([
      `${FX_ID.SAME}@${FX.A}`,
      `${FX_ID.SAME}@${FX.B}`,
      `${FX_ID.B_ONLY}@${FX.B}`,
    ]);
  });

  it("moving an item of another playlist, or an unknown item id, answers 404", async () => {
    const playlistId = await playlistWith([
      [FX_ID.SAME, FX.A],
      [FX_ID.SAME, FX.B],
    ]);
    const otherId = await playlistWith([[FX_ID.B_ONLY, FX.B]]);
    const elsewhere = await itemIdOf(otherId, FX_ID.B_ONLY, FX.B);

    for (const itemId of [elsewhere, 2_000_000_000]) {
      const res = await viewer.client.put(
        `/api/playlists/${playlistId}/items/${itemId}/position`,
        { index: 0 }
      );
      expect(res.status).toBe(404);
    }
    expect(await itemsOf(playlistId)).toEqual([
      `${FX_ID.SAME}@${FX.A}`,
      `${FX_ID.SAME}@${FX.B}`,
    ]);
  });

  it.each([[-1], [1.5], ["1"], [null]])(
    "index %s answers 400",
    async (index) => {
      const playlistId = await playlistWith([
        [FX_ID.SAME, FX.A],
        [FX_ID.SAME, FX.B],
      ]);
      const itemId = await itemIdOf(playlistId, FX_ID.SAME, FX.B);

      const res = await viewer.client.put(
        `/api/playlists/${playlistId}/items/${itemId}/position`,
        { index }
      );

      expect(res.status).toBe(400);
      expect(await itemsOf(playlistId)).toEqual([
        `${FX_ID.SAME}@${FX.A}`,
        `${FX_ID.SAME}@${FX.B}`,
      ]);
    }
  );

  it("removing item ids [a, b] deletes those two only; an id of another playlist is ignored and not counted", async () => {
    const playlistId = await playlistWith([
      [FX_ID.SAME, FX.A],
      [FX_ID.SAME, FX.B],
      [FX_ID.B_ONLY, FX.B],
    ]);
    const otherId = await playlistWith([[FX_ID.B_ONLY, FX.B]]);
    const a = await itemIdOf(playlistId, FX_ID.SAME, FX.A);
    const b = await itemIdOf(playlistId, FX_ID.B_ONLY, FX.B);
    const elsewhere = await itemIdOf(otherId, FX_ID.B_ONLY, FX.B);

    const res = await viewer.client.post<RemovePlaylistItemsResponse>(
      `/api/playlists/${playlistId}/items/remove`,
      { itemIds: [a, b, elsewhere] }
    );

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ removed: 2 });
    expect(await itemsOf(playlistId)).toEqual([`${FX_ID.SAME}@${FX.B}`]);
    expect(await itemsOf(otherId)).toEqual([`${FX_ID.B_ONLY}@${FX.B}`]);
  });

  it("removing more than 250 ids answers 400", async () => {
    const playlistId = await playlistWith([[FX_ID.SAME, FX.A]]);
    const a = await itemIdOf(playlistId, FX_ID.SAME, FX.A);
    const itemIds = [
      a,
      ...Array.from({ length: PER_PAGE_MAX }, (_, i) => i + 1),
    ];

    const res = await viewer.client.post(
      `/api/playlists/${playlistId}/items/remove`,
      { itemIds }
    );

    expect(res.status).toBe(400);
    expect(await itemsOf(playlistId)).toEqual([`${FX_ID.SAME}@${FX.A}`]);
  });
});
