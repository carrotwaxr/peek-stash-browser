/**
 * Playlist scenes (item 77).
 *
 * The owner's playlist holds scene SAME and scene GLOBAL on two instances
 * each (see helpers/accessFixture.ts). SAME has its own screenshot and
 * performer image on each instance. Each viewer hid GLOBAL on one instance
 * only: the owner on B, the recipient (a member of a group the playlist is
 * shared with) on A. The playlist list, the shared list and the playlist
 * page attach to every item the scene from that item's own instance, with
 * proxy paths served from it, and null for the scene the viewer hid; the
 * playlist page also carries the viewer's own rating of each scene.
 *
 * Characterisation for the proxy URL helper: it passed before the playlist
 * handlers stopped re-running the old `transformScene` over the scene
 * loader's output, which shows that pass changed nothing there. The same
 * for the one playlist scene loader: it passed before the three handlers
 * shared it.
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
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient } from "../helpers/testClient.js";

const GROUP_NAME = "access-it-playlist-scenes";
const PASSWORD = "access_it_pass_1";

interface ItemScene {
  id: string;
  instanceId: string;
  title: string | null;
  rating100: number | null;
  favorite: boolean;
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

/** What each SAME item must carry, computed from the seeded rows. */
interface Expected {
  screenshot: string | null;
  performerImage: string | null;
}

/** A user's own rating of a scene, as seeded in SceneRating. */
interface Rated {
  rating100: number | null;
  favorite: boolean;
}

const UNRATED: Rated = { rating100: null, favorite: false };

/** A user who reads the playlist, with what they hid and rated. */
interface Viewer {
  id: number;
  client: TestClient;
  /** The instance whose GLOBAL scene this viewer hid. */
  hidGlobalOn: string;
  /** This viewer's ratings of SAME, per instance; absent is unrated. */
  sameRatings: ReadonlyMap<string, Rated>;
}

/** The playlist's items in position order: [scene id, instance]. */
const ITEMS = [
  [FX_ID.SAME, FX.A],
  [FX_ID.SAME, FX.B],
  [FX_ID.GLOBAL, FX.A],
  [FX_ID.GLOBAL, FX.B],
] as const;

describe("Playlist scenes (integration)", () => {
  let owner: Viewer;
  let recipient: Viewer;
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

    const ownerUser = await createApiUser("access_it_pl_owner", PASSWORD);
    const recipientUser = await createApiUser(
      "access_it_pl_recipient",
      PASSWORD
    );
    owner = {
      ...ownerUser,
      hidGlobalOn: FX.B,
      sameRatings: new Map([
        [FX.A, { rating100: 80, favorite: false }],
        [FX.B, { rating100: 20, favorite: true }],
      ]),
    };
    recipient = {
      ...recipientUser,
      hidGlobalOn: FX.A,
      sameRatings: new Map([[FX.A, { rating100: 40, favorite: true }]]),
    };

    for (const viewer of [owner, recipient]) {
      await hideFor(viewer.id, "scene", FX_ID.GLOBAL, viewer.hidGlobalOn);
      for (const [instanceId, rated] of viewer.sameRatings) {
        await prisma.sceneRating.create({
          data: {
            userId: viewer.id,
            instanceId,
            sceneId: FX_ID.SAME,
            rating: rated.rating100,
            favorite: rated.favorite,
          },
        });
      }
    }

    const created = await owner.client.post<{ playlist: { id: number } }>(
      "/api/playlists",
      { name: "access-it playlist scenes" }
    );
    expect(created.status).toBe(201);
    playlistId = created.data.playlist.id;
    await prisma.playlistItem.createMany({
      data: ITEMS.map(([sceneId, instanceId], position) => ({
        playlistId,
        sceneId,
        instanceId,
        position,
      })),
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
    // Deletes the access_it_ users; their playlists, memberships, hides and
    // ratings cascade
    await clearAccessFixture();
  }, 60000);

  /**
   * Every item with its own instance's scene, and null for the GLOBAL the
   * viewer hid; the SAME items with their own instance's pictures.
   */
  function expectItemsFromTheirInstance(
    items: PlaylistItemBody[],
    viewer: Viewer
  ): void {
    expect(items.map((i) => [i.sceneId, i.instanceId])).toEqual(
      ITEMS.map(([sceneId, instanceId]) => [sceneId, instanceId])
    );
    const title = (sceneId: string, instanceId: string) =>
      `${instanceId === FX.A ? "A" : "B"}-${sceneId}`;
    expect(
      items.map((i) =>
        i.scene === null
          ? null
          : {
              id: i.scene.id,
              instanceId: i.scene.instanceId,
              title: i.scene.title,
            }
      )
    ).toEqual(
      ITEMS.map(([sceneId, instanceId]) =>
        sceneId === FX_ID.GLOBAL && instanceId === viewer.hidGlobalOn
          ? null
          : { id: sceneId, instanceId, title: title(sceneId, instanceId) }
      )
    );

    const same = items.slice(0, 2);
    for (const item of same) {
      const want = must(expected.get(must(item.instanceId)));
      const scene = must(item.scene);
      expect(scene.paths.screenshot).toBe(want.screenshot);
      expect(scene.performers.map((p) => p.image_path)).toEqual([
        want.performerImage,
      ]);
    }
    // The two instances' same scene id keeps two different pictures
    const [first, second] = same.map((i) => must(i.scene).paths.screenshot);
    expect(first).not.toBe(second);
  }

  /** Each shown scene carries the viewer's own rating on its instance. */
  function expectViewerRatings(
    items: PlaylistItemBody[],
    viewer: Viewer
  ): void {
    expect(
      items.map((i) =>
        i.scene === null
          ? null
          : { rating100: i.scene.rating100, favorite: i.scene.favorite }
      )
    ).toEqual(
      ITEMS.map(([sceneId, instanceId]) => {
        if (sceneId === FX_ID.SAME) {
          return viewer.sameRatings.get(instanceId) ?? UNRATED;
        }
        return instanceId === viewer.hidGlobalOn ? null : UNRATED;
      })
    );
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
    expectItemsFromTheirInstance(playlist.items, owner);
  });

  it("GET /api/playlists/shared", async () => {
    const res = await recipient.client.get<{ playlists: PlaylistBody[] }>(
      "/api/playlists/shared"
    );
    expect(res.status).toBe(200);
    const playlist = must(res.data.playlists.find((p) => p.id === playlistId));
    expectItemsFromTheirInstance(playlist.items, recipient);
  });

  it("GET /api/playlists/:id, for the owner and a recipient", async () => {
    for (const viewer of [owner, recipient]) {
      const res = await viewer.client.get<{ playlist: PlaylistBody }>(
        `/api/playlists/${playlistId}`
      );
      expect(res.status).toBe(200);
      expectItemsFromTheirInstance(res.data.playlist.items, viewer);
      expectViewerRatings(res.data.playlist.items, viewer);
    }
  });
});
