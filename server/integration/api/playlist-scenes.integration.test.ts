/**
 * Playlist scenes' media URLs (item 77).
 *
 * The owner's playlist holds scene SAME on two instances (see
 * helpers/accessFixture.ts), each with its own screenshot and performer
 * image. The playlist list, the shared list and the playlist page answer,
 * per item, proxy paths served from that item's own instance.
 *
 * Characterisation for the proxy URL helper: it passed before the playlist
 * handlers stopped re-running the old `transformScene` over the scene
 * loader's output, which shows that pass changed nothing there.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { toProxyUrl } from "../../utils/proxyUrl.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient } from "../helpers/testClient.js";

const GROUP_NAME = "access-it-playlist-scenes";
const PASSWORD = "access_it_pass_1";

interface ItemScene {
  id: string;
  instanceId: string;
  paths: { screenshot: string | null };
  performers: Array<{ id: string; image_path: string | null }>;
}

interface PlaylistItemBody {
  sceneId: string;
  instanceId: string | null;
  scene: ItemScene | null;
}

interface PlaylistBody {
  id: number;
  items: PlaylistItemBody[];
}

/** What each item must carry, computed from the seeded rows. */
interface Expected {
  screenshot: string | null;
  performerImage: string | null;
}

describe("Playlist scenes' media URLs (integration)", () => {
  let owner: { id: number; client: TestClient };
  let recipient: { id: number; client: TestClient };
  let playlistId: number;
  const expected = new Map<string, Expected>();

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();

    // SAME on A and on B: a stored screenshot and one performer with an image
    // each, as sync stores them (Stash's absolute URLs)
    for (const [instance, host] of [
      [FX.A, "stash-a"],
      [FX.B, "stash-b"],
    ] as const) {
      const key = { id: FX_ID.SAME, stashInstanceId: instance };
      await prisma.stashScene.update({
        where: { id_stashInstanceId: key },
        data: {
          pathScreenshot: `http://${host}:9999/scene/${FX_ID.SAME}/screenshot?t=17`,
        },
      });
      await prisma.stashPerformer.update({
        where: { id_stashInstanceId: key },
        data: {
          imagePath: `http://${host}:9999/performer/${FX_ID.SAME}/image?t=18`,
        },
      });
      await prisma.scenePerformer.create({
        data: {
          sceneId: FX_ID.SAME,
          sceneInstanceId: instance,
          performerId: FX_ID.SAME,
          performerInstanceId: instance,
        },
      });

      const scene = must(
        await prisma.stashScene.findUnique({
          where: { id_stashInstanceId: key },
        })
      );
      const performer = must(
        await prisma.stashPerformer.findUnique({
          where: { id_stashInstanceId: key },
        })
      );
      expected.set(instance, {
        screenshot: toProxyUrl(scene.pathScreenshot, instance),
        performerImage: toProxyUrl(performer.imagePath, instance),
      });
    }

    owner = await createApiUser("access_it_pl_owner", PASSWORD);
    recipient = await createApiUser("access_it_pl_recipient", PASSWORD);

    const created = await owner.client.post<{ playlist: { id: number } }>(
      "/api/playlists",
      { name: "access-it playlist scenes" }
    );
    expect(created.status).toBe(201);
    playlistId = created.data.playlist.id;
    await prisma.playlistItem.createMany({
      data: [
        { playlistId, sceneId: FX_ID.SAME, instanceId: FX.A, position: 0 },
        { playlistId, sceneId: FX_ID.SAME, instanceId: FX.B, position: 1 },
      ],
    });

    const group = await prisma.userGroup.create({
      data: {
        name: GROUP_NAME,
        members: {
          create: [{ userId: owner.id }, { userId: recipient.id }],
        },
      },
    });
    await prisma.playlistShare.create({
      data: { playlistId, groupId: group.id },
    });
  }, 60000);

  afterAll(async () => {
    await prisma.userGroup.deleteMany({ where: { name: GROUP_NAME } });
    // Deletes the access_it_ users; their playlists and memberships cascade
    await clearAccessFixture();
  }, 60000);

  /** Both items, each with its own instance's screenshot and performer image. */
  function expectItemsFromTheirInstance(items: PlaylistItemBody[]): void {
    expect(items.map((i) => i.instanceId)).toEqual([FX.A, FX.B]);
    for (const item of items) {
      const want = must(expected.get(must(item.instanceId)));
      const scene = must(item.scene);
      expect(scene.instanceId).toBe(item.instanceId);
      expect(scene.paths.screenshot).toBe(want.screenshot);
      expect(scene.performers.map((p) => p.image_path)).toEqual([
        want.performerImage,
      ]);
    }
    // The two instances' same scene id keeps two different pictures
    const [first, second] = items.map((i) => must(i.scene).paths.screenshot);
    expect(first).not.toBe(second);
  }

  it("the expected URLs name each instance and neither Stash host", () => {
    for (const [instance, want] of expected) {
      expect(want.screenshot).toContain(`&instanceId=${instance}`);
      expect(want.performerImage).toContain(`&instanceId=${instance}`);
      expect(`${want.screenshot} ${want.performerImage}`).not.toMatch(
        /stash-[ab]/
      );
    }
  });

  it("GET /api/playlists", async () => {
    const res = await owner.client.get<{ playlists: PlaylistBody[] }>(
      "/api/playlists"
    );
    expect(res.status).toBe(200);
    const playlist = must(res.data.playlists.find((p) => p.id === playlistId));
    expectItemsFromTheirInstance(playlist.items);
  });

  it("GET /api/playlists/shared", async () => {
    const res = await recipient.client.get<{ playlists: PlaylistBody[] }>(
      "/api/playlists/shared"
    );
    expect(res.status).toBe(200);
    const playlist = must(res.data.playlists.find((p) => p.id === playlistId));
    expectItemsFromTheirInstance(playlist.items);
  });

  it("GET /api/playlists/:id, for the owner and a recipient", async () => {
    for (const client of [owner.client, recipient.client]) {
      const res = await client.get<{ playlist: PlaylistBody }>(
        `/api/playlists/${playlistId}`
      );
      expect(res.status).toBe(200);
      expectItemsFromTheirInstance(res.data.playlist.items);
    }
  });
});
