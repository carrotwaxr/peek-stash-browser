/**
 * Playlist previews and items against the real test SQLite database (items
 * 41.6 and 41.7; EXCL-21, PM-14, PM-15, QUERIES-16).
 *
 * On the access fixture's instances (helpers/accessFixture.ts: A and B
 * enabled and synced, OFF disabled), plus scenes P1 to P5, X1 and X2 on A.
 * The owner's playlist PQ holds, by position:
 *
 *   0 X1@A      hidden by the owner on A
 *   1 P1@A
 *   2 DELETED@A soft-deleted
 *   3 P2@A      hidden by the recipient on A
 *   4 X2@A      hidden by the owner on every instance (a legacy "" row)
 *   5 SAME@B    B's scene with A's id; the owner hid SAME on A only
 *   6 P3@A
 *   7 ON_OFF    on the disabled instance
 *   8 P4@A
 *   9 P5@A
 *
 * so the owner sees P1, P2, SAME@B, P3, P4 and P5, and the recipient (a
 * member of a group PQ is shared with) sees X1, P1, X2, SAME@B, P3, P4 and
 * P5. A third user selects only A.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  duplicatePlaylist,
  getPlaylist,
  getSharedPlaylists,
  getUserPlaylists,
  updatePlaylist,
} from "../../controllers/playlist.js";
import prisma from "../../prisma/singleton.js";
import {
  loadPlaylistItems,
  loadPlaylistPreviews,
} from "../../services/PlaylistQueryService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { must } from "../../tests/helpers/must.js";
import { toProxyUrl } from "../../utils/proxyUrl.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { recordStatements } from "../helpers/statementRecorder.js";

const { A, B, OFF } = FX;
const { SAME, DELETED, ON_OFF } = FX_ID;

const P1 = "7701001";
const P2 = "7701002";
const P3 = "7701003";
const P4 = "7701004";
const P5 = "7701005";
const X1 = "7701011";
const X2 = "7701012";
const P_IDS = [P1, P2, P3, P4, P5];

const GROUP_NAME = "access-it-playlist-queries";
const MANY_PLAYLISTS = 36;

/** PQ's items in position order: [scene id, instance] */
const PQ_ITEMS = [
  [X1, A],
  [P1, A],
  [DELETED, A],
  [P2, A],
  [X2, A],
  [SAME, B],
  [P3, A],
  [ON_OFF, OFF],
  [P4, A],
  [P5, A],
] as const;

type Ref = readonly [sceneId: string, instanceId: string];

const OWNER_SEES: readonly Ref[] = [
  [P1, A],
  [P2, A],
  [SAME, B],
  [P3, A],
  [P4, A],
  [P5, A],
];
const RECIPIENT_SEES: readonly Ref[] = [
  [X1, A],
  [P1, A],
  [X2, A],
  [SAME, B],
  [P3, A],
  [P4, A],
  [P5, A],
];

interface User {
  id: number;
  username: string;
}

const screenshotOf = (sceneId: string, instanceId: string) =>
  `http://stash-${instanceId === A ? "a" : "b"}:9999/scene/${sceneId}/screenshot`;
const titleOf = (sceneId: string, instanceId: string) =>
  `${instanceId === A ? "A" : instanceId === B ? "B" : "OFF"}-${sceneId}`;

/** The compact preview a ref must come back as, at its position in PQ */
function preview([sceneId, instanceId]: Ref, items: readonly Ref[]) {
  return {
    sceneId,
    instanceId,
    position: items.findIndex(
      ([id, inst]) => id === sceneId && inst === instanceId
    ),
    scene: {
      id: sceneId,
      instanceId,
      title: titleOf(sceneId, instanceId),
      paths: {
        screenshot: toProxyUrl(screenshotOf(sceneId, instanceId), instanceId),
      },
    },
  };
}

const refsOf = (
  items: ReadonlyArray<{ sceneId: string; instanceId: string | null }>
) => items.map((i) => [i.sceneId, i.instanceId]);

async function createUser(username: string): Promise<User> {
  const user = await prisma.user.create({
    data: { username, password: "not-a-real-hash", role: "USER" },
  });
  return { id: user.id, username };
}

async function createPlaylist(
  userId: number,
  name: string,
  items: readonly Ref[]
): Promise<number> {
  const playlist = await prisma.playlist.create({
    data: {
      userId,
      name,
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

describe("Playlist queries (integration)", () => {
  let owner: User;
  let recipient: User;
  let onlyA: User;
  let many: User;
  let pq: number;
  let allHidden: number;
  const manyPlaylists: Array<{ id: number; items: Ref[] }> = [];

  beforeAll(async () => {
    await seedAccessFixture();

    const scene = (id: string) => ({
      id,
      stashInstanceId: A,
      title: titleOf(id, A),
      pathScreenshot: screenshotOf(id, A),
    });
    await prisma.stashScene.createMany({
      data: [...P_IDS, X1, X2].map(scene),
    });
    await prisma.stashScene.update({
      where: { id_stashInstanceId: { id: SAME, stashInstanceId: B } },
      data: { pathScreenshot: screenshotOf(SAME, B) },
    });
    // Stash's own counts on P1, which no Peek user's response may carry
    await prisma.stashScene.update({
      where: { id_stashInstanceId: { id: P1, stashInstanceId: A } },
      data: { rating100: 10, oCounter: 9, playCount: 9 },
    });

    owner = await createUser("access-it-pq-owner");
    recipient = await createUser("access-it-pq-recipient");
    onlyA = await createUser("access-it-pq-only-a");
    many = await createUser("access-it-pq-many");
    await prisma.userStashInstance.create({
      data: { userId: onlyA.id, instanceId: A },
    });

    await hideFor(owner.id, "scene", X1, A);
    await hideFor(owner.id, "scene", X2, "");
    await hideFor(owner.id, "scene", SAME, A);
    await hideFor(recipient.id, "scene", P2, A);

    await prisma.sceneRating.createMany({
      data: [
        {
          userId: owner.id,
          instanceId: A,
          sceneId: P1,
          rating: 80,
          favorite: true,
        },
        { userId: recipient.id, instanceId: A, sceneId: P1, rating: 40 },
      ],
    });
    await prisma.watchHistory.createMany({
      data: [
        {
          userId: owner.id,
          instanceId: A,
          sceneId: P1,
          playCount: 3,
          oCount: 2,
        },
        { userId: owner.id, instanceId: B, sceneId: SAME, playCount: 5 },
      ],
    });

    pq = await createPlaylist(owner.id, "PQ", PQ_ITEMS);
    allHidden = await createPlaylist(owner.id, "all hidden", [
      [X1, A],
      [DELETED, A],
    ]);

    const group = await prisma.userGroup.create({
      data: {
        name: GROUP_NAME,
        members: {
          create: [
            { userId: owner.id },
            { userId: recipient.id },
            { userId: onlyA.id },
          ],
        },
      },
    });
    await prisma.playlistShare.create({
      data: { playlistId: pq, groupId: group.id },
    });

    // 36 playlists of P1..P5, each rotated to start at a different scene
    for (let k = 0; k < MANY_PLAYLISTS; k++) {
      const items: Ref[] = P_IDS.map((_, i) => [
        must(P_IDS[(k + i) % P_IDS.length]),
        A,
      ]);
      manyPlaylists.push({
        id: await createPlaylist(many.id, `many ${k}`, items),
        items,
      });
    }
  }, 60000);

  afterAll(async () => {
    await prisma.userGroup.deleteMany({ where: { name: GROUP_NAME } });
    // Deletes the access-it- users; their playlists, hides, ratings and
    // history cascade
    await clearAccessFixture();
  }, 60000);

  const previewsFor = async (user: User, playlistIds: number[]) =>
    loadPlaylistPreviews({
      userId: user.id,
      allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
      playlistIds,
    });

  const itemsFor = async (
    user: User,
    playlistId: number,
    paging?: { page: number; perPage: number }
  ) =>
    loadPlaylistItems({
      userId: user.id,
      allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
      playlistId,
      paging,
    });

  it("previews are the first four items the user can see", async () => {
    const previews = must((await previewsFor(owner, [pq])).get(pq));

    expect(previews.items).toEqual(
      OWNER_SEES.slice(0, 4).map((ref) => preview(ref, PQ_ITEMS))
    );
    // The item count is what the owner can see
    expect(previews.visibleCount).toBe(OWNER_SEES.length);
  });

  it("a playlist whose items are all hidden previews nothing and counts 0", async () => {
    const previews = must(
      (await previewsFor(owner, [allHidden])).get(allHidden)
    );
    expect(previews).toEqual({ items: [], visibleCount: 0 });
  });

  it("every playlist's previews come from one statement", async () => {
    const allowedInstanceIds = await getUserAllowedInstanceIds(many.id);
    const ids = manyPlaylists.map((p) => p.id);

    const recorder = recordStatements();
    let previews: Awaited<ReturnType<typeof loadPlaylistPreviews>>;
    try {
      previews = await loadPlaylistPreviews({
        userId: many.id,
        allowedInstanceIds,
        playlistIds: ids,
      });
    } finally {
      recorder.restore();
    }

    expect(recorder.statements).toHaveLength(1);
    for (const playlist of manyPlaylists) {
      const got = must(previews.get(playlist.id));
      expect(refsOf(got.items)).toEqual(playlist.items.slice(0, 4));
      expect(got.visibleCount).toBe(P_IDS.length);
    }
  });

  it("a shared playlist's recipient sees only their own visible items", async () => {
    const previews = must((await previewsFor(recipient, [pq])).get(pq));
    expect(previews.items).toEqual(
      RECIPIENT_SEES.slice(0, 4).map((ref) => preview(ref, PQ_ITEMS))
    );
    expect(previews.visibleCount).toBe(RECIPIENT_SEES.length);

    // Through the handler: the shared list answers with the recipient's view
    const req = reqFor(getSharedPlaylists, {
      user: testUser({ id: recipient.id, username: recipient.username }),
      allowedInstanceIds: await getUserAllowedInstanceIds(recipient.id),
    });
    const res = resFor(getSharedPlaylists);
    await getSharedPlaylists(req, res);
    const shared = must(res._getOkBody().playlists.find((p) => p.id === pq));
    expect(refsOf(shared.items)).toEqual(RECIPIENT_SEES.slice(0, 4));
    expect(shared.sceneCount).toBe(RECIPIENT_SEES.length);
  });

  it("the owner's list counts and previews what the owner can see", async () => {
    const req = reqFor(getUserPlaylists, {
      user: testUser({ id: owner.id, username: owner.username }),
      allowedInstanceIds: await getUserAllowedInstanceIds(owner.id),
    });
    const res = resFor(getUserPlaylists);
    await getUserPlaylists(req, res);
    const playlists = res._getOkBody().playlists;

    const own = must(playlists.find((p) => p.id === pq));
    expect(refsOf(own.items)).toEqual(OWNER_SEES.slice(0, 4));
    expect(own._count.items).toBe(OWNER_SEES.length);
    const empty = must(playlists.find((p) => p.id === allHidden));
    expect(empty.items).toEqual([]);
    expect(empty._count.items).toBe(0);
  });

  it("items on an instance the user did not select are not shown", async () => {
    // onlyA hid nothing and selects A: every live item on A, not SAME@B
    const expected: Ref[] = [
      [X1, A],
      [P1, A],
      [P2, A],
      [X2, A],
      [P3, A],
      [P4, A],
      [P5, A],
    ];

    const previews = must((await previewsFor(onlyA, [pq])).get(pq));
    expect(refsOf(previews.items)).toEqual(expected.slice(0, 4));
    expect(previews.visibleCount).toBe(expected.length);

    const { items, totalItems } = await itemsFor(onlyA, pq, {
      page: 1,
      perPage: 100,
    });
    expect(refsOf(items)).toEqual(expected);
    expect(totalItems).toBe(expected.length);
  });

  it("page 2 with per_page 2 returns items 3 and 4 by position, with totalItems", async () => {
    const { items, totalItems } = await itemsFor(owner, pq, {
      page: 2,
      perPage: 2,
    });
    expect(refsOf(items)).toEqual(OWNER_SEES.slice(2, 4));
    expect(items.map((i) => i.position)).toEqual([5, 6]);
    expect(items.map((i) => must(i.scene).title)).toEqual([
      titleOf(SAME, B),
      titleOf(P3, A),
    ]);
    expect(totalItems).toBe(OWNER_SEES.length);

    // Past the end: no items, the same total
    const past = await itemsFor(owner, pq, { page: 4, perPage: 2 });
    expect(past).toEqual({ items: [], totalItems: OWNER_SEES.length });

    // Through the handler, for the owner and for the recipient
    for (const [viewer, sees] of [
      [owner, OWNER_SEES],
      [recipient, RECIPIENT_SEES],
    ] as const) {
      const req = reqFor(getPlaylist, {
        params: { id: String(pq) },
        query: { page: "2", per_page: "2" },
        user: testUser({ id: viewer.id, username: viewer.username }),
        allowedInstanceIds: await getUserAllowedInstanceIds(viewer.id),
      });
      const res = resFor(getPlaylist);
      await getPlaylist(req, res);
      const body = res._getOkBody();
      expect(refsOf(must(body.playlist.items))).toEqual(sees.slice(2, 4));
      expect(body.totalItems).toBe(sees.length);
      expect(body.page).toBe(2);
      expect(body.perPage).toBe(2);
    }
  });

  it("items carry the user's rating and play count from SQL", async () => {
    const userFields = (scene: {
      rating100: number | null;
      favorite: boolean;
      play_count: number;
      o_counter: number;
    }) => ({
      rating100: scene.rating100,
      favorite: scene.favorite,
      play_count: scene.play_count,
      o_counter: scene.o_counter,
    });

    const ownerPage = await itemsFor(owner, pq, { page: 1, perPage: 3 });
    expect(ownerPage.items.map((i) => userFields(must(i.scene)))).toEqual([
      { rating100: 80, favorite: true, play_count: 3, o_counter: 2 }, // P1@A
      { rating100: null, favorite: false, play_count: 0, o_counter: 0 }, // P2@A
      { rating100: null, favorite: false, play_count: 5, o_counter: 0 }, // SAME@B
    ]);

    // The recipient's own rating of P1, never the owner's or Stash's
    const recipientPage = await itemsFor(recipient, pq, {
      page: 1,
      perPage: 2,
    });
    expect(recipientPage.items.map((i) => userFields(must(i.scene)))).toEqual([
      { rating100: null, favorite: false, play_count: 0, o_counter: 0 }, // X1@A
      { rating100: 40, favorite: false, play_count: 0, o_counter: 0 }, // P1@A
    ]);
  });

  it("without page, every item comes back as before", async () => {
    const { items, totalItems } = await itemsFor(owner, pq);

    // Every item, in position order, with its row's fields
    expect(refsOf(items)).toEqual(PQ_ITEMS.map(([id, inst]) => [id, inst]));
    expect(items.map((i) => i.position)).toEqual(PQ_ITEMS.map((_, n) => n));
    for (const item of items) {
      expect(item.playlistId).toBe(pq);
      expect(typeof item.id).toBe("number");
      expect(item.addedAt).toBeInstanceOf(Date);
    }
    // The scene of each item the owner can see; null for the rest
    const seen = new Set(OWNER_SEES.map(([id, inst]) => `${id}:${inst}`));
    expect(
      items.map((i) =>
        i.scene === null ? null : `${i.scene.id}:${i.scene.instanceId}`
      )
    ).toEqual(
      PQ_ITEMS.map(([id, inst]) =>
        seen.has(`${id}:${inst}`) ? `${id}:${inst}` : null
      )
    );
    expect(totalItems).toBe(OWNER_SEES.length);

    // Through the handler, with the items' full scenes
    const req = reqFor(getPlaylist, {
      params: { id: String(pq) },
      user: testUser({ id: owner.id, username: owner.username }),
      allowedInstanceIds: await getUserAllowedInstanceIds(owner.id),
    });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);
    const body = res._getOkBody();
    expect(refsOf(must(body.playlist.items))).toEqual(
      PQ_ITEMS.map(([id, inst]) => [id, inst])
    );
    expect(body.totalItems).toBe(OWNER_SEES.length);
    expect(body.page).toBeUndefined();
    const sameB = must(must(body.playlist.items)[5]).scene;
    expect(sameB).toMatchObject({
      id: SAME,
      instanceId: B,
      title: titleOf(SAME, B),
    });
  });

  /** The copy's items as [scene id, instance, position], by position */
  const copiedItems = async (playlistId: number) =>
    (
      await prisma.playlistItem.findMany({
        where: { playlistId },
        orderBy: { position: "asc" },
      })
    ).map((i) => [i.sceneId, i.instanceId, i.position]);

  const duplicateAs = async (user: User, playlistId: number) => {
    const req = reqFor(duplicatePlaylist, {
      params: { id: String(playlistId) },
      user: testUser({ id: user.id, username: user.username }),
      allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
    });
    const res = resFor(duplicatePlaylist);
    await duplicatePlaylist(req, res);
    return res._getOkBody().playlist;
  };

  it("a duplicate copies only the items the requester can see, numbered 0..n-1 in the original's order", async () => {
    // The recipient hid P2; DELETED is soft-deleted; ON_OFF is on a disabled
    // instance
    const copy = await duplicateAs(recipient, pq);
    expect(copy.userId).toBe(recipient.id);
    expect(await copiedItems(copy.id)).toEqual(
      RECIPIENT_SEES.map(([id, inst], n) => [id, inst, n])
    );
    expect(copy._count?.items).toBe(RECIPIENT_SEES.length);

    // A user who selected only A: SAME@B is on an instance they deselected
    const onlyACopy = await duplicateAs(onlyA, pq);
    const seesA: Ref[] = [X1, P1, P2, X2, P3, P4, P5].map((id) => [id, A]);
    expect(await copiedItems(onlyACopy.id)).toEqual(
      seesA.map(([id, inst], n) => [id, inst, n])
    );
    expect(onlyACopy._count?.items).toBe(seesA.length);

    // The owner's own copy leaves out what the owner hid
    const ownerCopy = await duplicateAs(owner, pq);
    expect(await copiedItems(ownerCopy.id)).toEqual(
      OWNER_SEES.map(([id, inst], n) => [id, inst, n])
    );
  });

  it("a duplicate of a playlist with nothing visible is an empty copy", async () => {
    const copy = await duplicateAs(owner, allHidden);
    expect(await copiedItems(copy.id)).toEqual([]);
    expect(copy._count?.items).toBe(0);
  });

  it("update and duplicate answer the visible count", async () => {
    const req = reqFor(updatePlaylist, {
      params: { id: String(pq) },
      body: { name: "PQ" },
      user: testUser({ id: owner.id, username: owner.username }),
      allowedInstanceIds: await getUserAllowedInstanceIds(owner.id),
    });
    const res = resFor(updatePlaylist);
    await updatePlaylist(req, res);
    // Ten rows, six the owner can see
    expect(res._getOkBody().playlist._count?.items).toBe(OWNER_SEES.length);

    const copy = await duplicateAs(recipient, pq);
    expect(copy._count?.items).toBe(RECIPIENT_SEES.length);
  });
});
