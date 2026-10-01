/**
 * Playlist scenes (item 77).
 *
 * The owner's playlist holds scene SAME and scene GLOBAL on two instances
 * each (see helpers/accessFixture.ts). SAME has its own screenshot and
 * performer image on each instance. Each viewer hid GLOBAL on one instance
 * only: the owner on B, the recipient (a member of a group the playlist is
 * shared with) on A. The playlist list and the shared list preview the
 * first four items the viewer can see, each as a compact scene from that
 * item's own instance with its proxied screenshot, and count only those.
 * The playlist page lists the items the viewer can see, a page at a time,
 * each with the scene from that item's own instance, with proxy paths
 * served from it, and the viewer's own rating of each scene; the play queue
 * lists the same items.
 *
 * Characterisation for the proxy URL helper: it passed before the playlist
 * handlers stopped re-running the old `transformScene` over the scene
 * loader's output, which shows that pass changed nothing there. The same
 * for the one playlist scene loader: it passed before the three handlers
 * shared it. The previews became compact, and skip what the viewer cannot
 * see, when they moved to one statement (PlaylistQueryService).
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
import { expectRefused } from "../helpers/refused.js";
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
  scene: ItemScene;
}

interface QueueEntryBody {
  sceneId: string;
  instanceId: string;
  position: number;
  scene: { title: string | null; paths: { screenshot: string | null } };
}

interface PlaylistBody {
  id: number;
  items: PlaylistItemBody[];
}

/** A preview on the playlist list and the shared list: a compact scene */
interface PreviewBody {
  sceneId: string;
  instanceId: string;
  position: number;
  scene: {
    id: string;
    instanceId: string;
    title: string | null;
    paths: { screenshot: string | null };
  };
}

interface PlaylistSummaryBody {
  id: number;
  items: PreviewBody[];
  _count?: { items: number };
  sceneCount?: number;
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
    // A share counts only while its owner may share
    await prisma.user.update({
      where: { id: ownerUser.id },
      data: { canShareOverride: true },
    });
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

  /** The items the viewer can see: every item but the GLOBAL they hid */
  const visibleTo = (viewer: Viewer) =>
    ITEMS.filter(
      ([sceneId, instanceId]) =>
        !(sceneId === FX_ID.GLOBAL && instanceId === viewer.hidGlobalOn)
    );

  /**
   * The items the viewer can see, each with its own instance's scene; the
   * SAME items with their own instance's pictures.
   */
  function expectItemsFromTheirInstance(
    items: PlaylistItemBody[],
    viewer: Viewer
  ): void {
    const title = (sceneId: string, instanceId: string) =>
      `${instanceId === FX.A ? "A" : "B"}-${sceneId}`;
    expect(
      items.map((i) => ({
        id: i.scene.id,
        instanceId: i.scene.instanceId,
        title: i.scene.title,
      }))
    ).toEqual(
      visibleTo(viewer).map(([sceneId, instanceId]) => ({
        id: sceneId,
        instanceId,
        title: title(sceneId, instanceId),
      }))
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
    const [first, second] = same.map((i) => i.scene.paths.screenshot);
    expect(first).not.toBe(second);
  }

  /**
   * The first four items the viewer can see, compact: every item but the
   * GLOBAL the viewer hid, each with its own instance's screenshot (SAME's
   * stored one; GLOBAL has none).
   */
  function expectPreviews(items: PreviewBody[], viewer: Viewer): void {
    const visible = ITEMS.map(
      ([sceneId, instanceId], position) =>
        [sceneId, instanceId, position] as const
    ).filter(
      ([sceneId, instanceId]) =>
        !(sceneId === FX_ID.GLOBAL && instanceId === viewer.hidGlobalOn)
    );
    expect(items).toEqual(
      visible.slice(0, 4).map(([sceneId, instanceId, position]) => ({
        sceneId,
        instanceId,
        position,
        scene: {
          id: sceneId,
          instanceId,
          title: `${instanceId === FX.A ? "A" : "B"}-${sceneId}`,
          paths: {
            screenshot:
              sceneId === FX_ID.SAME
                ? must(expected.get(instanceId)).screenshot
                : null,
          },
        },
      }))
    );
  }

  /** Each shown scene carries the viewer's own rating on its instance. */
  function expectViewerRatings(
    items: PlaylistItemBody[],
    viewer: Viewer
  ): void {
    expect(
      items.map((i) => ({
        rating100: i.scene.rating100,
        favorite: i.scene.favorite,
      }))
    ).toEqual(
      visibleTo(viewer).map(([sceneId, instanceId]) =>
        sceneId === FX_ID.SAME
          ? (viewer.sameRatings.get(instanceId) ?? UNRATED)
          : UNRATED
      )
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
    const res = await owner.client.get<{ playlists: PlaylistSummaryBody[] }>(
      "/api/playlists"
    );
    expect(res.status).toBe(200);
    const playlist = must(res.data.playlists.find((p) => p.id === playlistId));
    expectPreviews(playlist.items, owner);
    // Three of the four items: the owner hid GLOBAL on B
    expect(playlist._count).toEqual({ items: 3 });
  });

  it("GET /api/playlists/shared", async () => {
    const res = await recipient.client.get<{
      playlists: PlaylistSummaryBody[];
    }>("/api/playlists/shared");
    expect(res.status).toBe(200);
    const playlist = must(res.data.playlists.find((p) => p.id === playlistId));
    expectPreviews(playlist.items, recipient);
    expect(playlist.sceneCount).toBe(3);
  });

  it("GET /api/playlists/:id without page answers page 1 of 50", async () => {
    for (const viewer of [owner, recipient]) {
      const res = await viewer.client.get<{
        playlist: PlaylistBody;
        totalItems: number;
        page: number;
        perPage: number;
      }>(`/api/playlists/${playlistId}`);
      expect(res.status).toBe(200);
      expectItemsFromTheirInstance(res.data.playlist.items, viewer);
      expectViewerRatings(res.data.playlist.items, viewer);
      expect(res.data.totalItems).toBe(3);
      expect(res.data.page).toBe(1);
      expect(res.data.perPage).toBe(50);
    }
  });

  it("GET /api/playlists/:id/queue for a recipient lists only their visible items", async () => {
    const res = await recipient.client.get<{ entries: QueueEntryBody[] }>(
      `/api/playlists/${playlistId}/queue`
    );
    expect(res.status).toBe(200);
    expect(
      res.data.entries.map((e) => [e.sceneId, e.instanceId, e.position])
    ).toEqual(
      visibleTo(recipient).map(([sceneId, instanceId], n) => [
        sceneId,
        instanceId,
        n,
      ])
    );
    // Each SAME entry with its own instance's screenshot, through the proxy
    expect(
      res.data.entries.slice(0, 2).map((e) => e.scene.paths.screenshot)
    ).toEqual([FX.A, FX.B].map((inst) => must(expected.get(inst)).screenshot));
  });

  it("a user with no access gets 404 from the queue", async () => {
    const stranger = await createApiUser("access_it_pl_stranger", PASSWORD);
    const res = await stranger.client.get(`/api/playlists/${playlistId}/queue`);
    expect(res.status).toBe(404);
    // Nor may a recipient clear the owner's unavailable items
    const removed = await recipient.client.post(
      `/api/playlists/${playlistId}/items/remove-unavailable`,
      {}
    );
    expect(removed.status).toBe(404);
  });

  it("GET /api/playlists/:id?page=2&per_page=2 pages what the viewer can see", async () => {
    for (const viewer of [owner, recipient]) {
      const res = await viewer.client.get<{
        playlist: PlaylistBody;
        totalItems: number;
        page: number;
        perPage: number;
      }>(`/api/playlists/${playlistId}?page=2&per_page=2`);
      expect(res.status).toBe(200);
      // SAME@A and SAME@B are page 1; the GLOBAL the viewer did not hide is
      // the only item of page 2
      const shown = must(
        ITEMS.find(
          ([sceneId, instanceId]) =>
            sceneId === FX_ID.GLOBAL && instanceId !== viewer.hidGlobalOn
        )
      );
      expect(
        res.data.playlist.items.map((i) => [
          i.sceneId,
          i.instanceId,
          i.scene.instanceId,
        ])
      ).toEqual([[shown[0], shown[1], shown[1]]]);
      expect(res.data.totalItems).toBe(3);
      expect(res.data.page).toBe(2);
      expect(res.data.perPage).toBe(2);
    }
  });

  it("GET /api/playlists/:id refuses an unknown or invalid paging parameter", async () => {
    const res = await owner.client.get(
      `/api/playlists/${playlistId}?page=abc&sort=bogus`
    );
    expectRefused(res, ["page", "sort"]);
  });
});
