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
 *
 * The owner's playlist SORTED, shared with the same group, holds T3, X1,
 * T4, T1 and T2 on A (SORTED_ITEMS), for the view sorts; "Save as playlist
 * order" saves copies of its own, and the moves use playlists of their
 * own.
 *
 * The owner's playlist QUEUE (QUEUE_ITEMS), shared with the group too, holds
 * Q1 to Q3 on A beside hidden, soft-deleted, B and disabled-instance items,
 * for the play queue: Q1 has a file, a screenshot and a studio, Q2 only a
 * file (its title falls back to the file name), Q3 neither, and a studio
 * the owner hid.
 */
import type { PlaylistItemSort } from "@peek/shared-types/filters/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  duplicatePlaylist,
  getPlaylist,
  getPlaylistQueue,
  getSharedPlaylists,
  getUserPlaylists,
  removeUnavailablePlaylistItems,
  sortPlaylist,
  updatePlaylist,
} from "../../controllers/playlist.js";
import prisma from "../../prisma/singleton.js";
import {
  appendItems,
  countUnavailableItems,
  loadPlaylistItems,
  loadPlaylistPreviews,
  loadPlaylistQueue,
  moveItem,
} from "../../services/PlaylistQueryService.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import {
  reqFor,
  resFor,
  testUser,
} from "../../tests/helpers/controllerTestUtils.js";
import { must } from "../../tests/helpers/must.js";
import type { ParsedPlaylistItemsQuery } from "../../types/parsedFilters.js";
import { toProxyUrl } from "../../utils/proxyUrl.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { largeLibraryPlanner } from "../helpers/largeLibraryPlanner.js";
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
/** The view sorts' scenes on A: T1 and T4 share a displayed title */
const T1 = "7701021";
const T2 = "7701022";
const T3 = "7701023";
const T4 = "7701024";
const T_TITLES: Readonly<Record<string, string>> = {
  [T1]: "Bravo",
  [T2]: "alpha",
  [T3]: "Charlie",
  [T4]: "bravo",
};

/** The play queue's scenes on A, and a studio the owner hid */
const Q1 = "7701041";
const Q2 = "7701042";
const Q3 = "7701043";
const HIDDEN_STUDIO = "7701051";
/** Scenes with no row: deleted from Stash and purged from the cache */
const GONE = "7701061";
const GONE_OFF = "7701062";
/** An instance id no instance has */
const NOWHERE = "access-it-nowhere";

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

/** QUEUE's items in position order */
const QUEUE_ITEMS: readonly Ref[] = [
  [Q2, A],
  [X1, A], // hidden by the owner
  [Q1, A],
  [DELETED, A], // soft-deleted
  [SAME, B],
  [Q3, A],
  [ON_OFF, OFF], // on the disabled instance
];

/** SORTED's items in position order, with the day of the month each was added */
const SORTED_ITEMS: ReadonlyArray<readonly [sceneId: string, day: number]> = [
  [T3, 3],
  [X1, 1], // hidden by the owner
  [T4, 5],
  [T1, 2],
  [T2, 4],
];

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
  let sorted: number;
  let queue: number;
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
    // titleSort as sync stores it: the displayed title, lower-cased
    await prisma.stashScene.createMany({
      data: Object.entries(T_TITLES).map(([id, title]) => ({
        id,
        stashInstanceId: A,
        title,
        titleSort: title.toLowerCase(),
      })),
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

    await prisma.stashStudio.create({
      data: { id: HIDDEN_STUDIO, stashInstanceId: A, name: "Hidden studio" },
    });
    await prisma.stashScene.createMany({
      data: [
        {
          id: Q1,
          stashInstanceId: A,
          title: "Queue one",
          titleSort: "queue one",
          filePath: "/media/queue/one.mp4",
          duration: 61,
          pathScreenshot: screenshotOf(Q1, A),
          studioId: SAME,
        },
        {
          id: Q2,
          stashInstanceId: A,
          titleSort: "second clip",
          filePath: "/media/queue/Second clip.mkv",
          duration: 30,
        },
        {
          id: Q3,
          stashInstanceId: A,
          title: "Queue three",
          titleSort: "queue three",
          studioId: HIDDEN_STUDIO,
        },
      ],
    });
    // The studio alone: Q3 itself stays visible to the owner
    await hideFor(owner.id, "studio", HIDDEN_STUDIO, A);

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
        { userId: owner.id, instanceId: A, sceneId: T1, rating: 80 },
        { userId: recipient.id, instanceId: A, sceneId: T2, rating: 80 },
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

    const playlist = await prisma.playlist.create({
      data: {
        userId: owner.id,
        name: "SORTED",
        items: {
          create: SORTED_ITEMS.map(([sceneId, day], position) => ({
            sceneId,
            instanceId: A,
            position,
            addedAt: new Date(Date.UTC(2026, 0, day)),
          })),
        },
      },
    });
    sorted = playlist.id;
    await prisma.playlistShare.create({
      data: { playlistId: sorted, groupId: group.id },
    });

    queue = await createPlaylist(owner.id, "QUEUE", QUEUE_ITEMS);
    await prisma.playlistShare.create({
      data: { playlistId: queue, groupId: group.id },
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
    paging?: { page: number; perPage: number },
    sort?: ParsedPlaylistItemsQuery["sort"]
  ) =>
    loadPlaylistItems({
      userId: user.id,
      allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
      playlistId,
      paging,
      sort,
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

  it("the unpaged read returns visible items only, in order", async () => {
    // The zip's read: every item the viewer can see, each with its scene
    const { items, totalItems } = await itemsFor(owner, pq);

    expect(refsOf(items)).toEqual(OWNER_SEES.map(([id, inst]) => [id, inst]));
    expect(items.map((i) => [i.scene.id, i.scene.instanceId])).toEqual(
      refsOf(items)
    );
    expect(items.map((i) => i.position)).toEqual([1, 3, 5, 6, 8, 9]);
    for (const item of items) {
      expect(item.playlistId).toBe(pq);
      expect(typeof item.id).toBe("number");
      expect(item.addedAt).toBeInstanceOf(Date);
    }
    expect(totalItems).toBe(OWNER_SEES.length);

    // The recipient's view, never the owner's
    expect(refsOf((await itemsFor(recipient, pq)).items)).toEqual(
      RECIPIENT_SEES.map(([id, inst]) => [id, inst])
    );
  });

  it("GET /api/playlists/:id without page answers page 1 of 50", async () => {
    const req = reqFor(getPlaylist, {
      params: { id: String(pq) },
      user: testUser({ id: owner.id, username: owner.username }),
      allowedInstanceIds: await getUserAllowedInstanceIds(owner.id),
    });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);
    const body = res._getOkBody();
    expect(refsOf(body.playlist.items)).toEqual(
      OWNER_SEES.map(([id, inst]) => [id, inst])
    );
    expect(body.totalItems).toBe(OWNER_SEES.length);
    expect(body.page).toBe(1);
    expect(body.perPage).toBe(50);
    const sameB = must(body.playlist.items[2]).scene;
    expect(sameB).toMatchObject({
      id: SAME,
      instanceId: B,
      title: titleOf(SAME, B),
    });
  });

  /** The playlist page as `viewer` reads it, through the handler */
  const pageAs = async (viewer: User, playlistId: number) => {
    const req = reqFor(getPlaylist, {
      params: { id: String(playlistId) },
      user: testUser({ id: viewer.id, username: viewer.username }),
      allowedInstanceIds: await getUserAllowedInstanceIds(viewer.id),
    });
    const res = resFor(getPlaylist);
    await getPlaylist(req, res);
    return res._getOkBody();
  };

  it("the unavailable count is the playlist's rows minus the visible ones", async () => {
    // PQ: ten rows, six the owner can see
    const body = await pageAs(owner, pq);
    expect(body.unavailableItems).toBe(PQ_ITEMS.length - OWNER_SEES.length);

    // QUEUE: seven rows; the owner sees Q2, Q1, SAME@B and Q3
    expect(
      await countUnavailableItems({
        userId: owner.id,
        allowedInstanceIds: await getUserAllowedInstanceIds(owner.id),
        playlistId: queue,
      })
    ).toBe(3);
  });

  it("a recipient's unavailable count is 0", async () => {
    // The recipient cannot see three of PQ's ten items, and learns nothing
    const body = await pageAs(recipient, pq);
    expect(body.totalItems).toBe(RECIPIENT_SEES.length);
    expect(body.unavailableItems).toBe(0);
  });

  describe("play queue", () => {
    const TITLE_ASC = {
      field: "title",
      direction: "ASC",
      seed: undefined,
    } as const;
    const POSITION_ASC = {
      field: "position",
      direction: "ASC",
      seed: undefined,
    } as const;

    const queueFor = async (
      user: User,
      sort: ParsedPlaylistItemsQuery["sort"]
    ) =>
      loadPlaylistQueue({
        userId: user.id,
        allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
        playlistId: queue,
        sort,
      });

    /** One entry by its scene, failing when absent */
    const entryOf = (
      entries: Awaited<ReturnType<typeof queueFor>>,
      sceneId: string,
      instanceId: string
    ) =>
      must(
        entries.find(
          (e) => e.sceneId === sceneId && e.instanceId === instanceId
        ),
        `${sceneId}@${instanceId} in the queue`
      );

    it("the queue lists every visible item in the shown order with the sidebar's fields", async () => {
      const entries = await queueFor(owner, TITLE_ASC);

      // The order the pages show, page after page
      const pages: Array<[string, string]> = [];
      for (let page = 1; page <= 3; page++) {
        const { items } = await itemsFor(
          owner,
          queue,
          { page, perPage: 2 },
          TITLE_ASC
        );
        pages.push(
          ...items.map((i): [string, string] => [i.sceneId, i.instanceId])
        );
      }
      expect(refsOf(entries)).toEqual(pages);
      // SAME@B has no stored titleSort, so it sorts first
      expect(refsOf(entries)).toEqual([
        [SAME, B],
        [Q1, A],
        [Q3, A],
        [Q2, A],
      ]);
      expect(entries.map((e) => e.position)).toEqual([0, 1, 2, 3]);

      expect(entryOf(entries, Q1, A)).toEqual({
        sceneId: Q1,
        instanceId: A,
        position: 1,
        scene: {
          title: "Queue one",
          paths: { screenshot: toProxyUrl(screenshotOf(Q1, A), A) },
          files: [{ duration: 61, basename: "one.mp4" }],
          studio: { name: `A-${SAME}` },
        },
      });
      expect(entryOf(entries, Q2, A).scene).toEqual({
        title: "Second clip",
        paths: { screenshot: null },
        files: [{ duration: 30, basename: "Second clip.mkv" }],
        studio: null,
      });
      expect(entryOf(entries, SAME, B).scene).toEqual({
        title: titleOf(SAME, B),
        paths: { screenshot: toProxyUrl(screenshotOf(SAME, B), B) },
        files: [],
        studio: null,
      });

      // onlyA deselected B: X1 (which onlyA did not hide) shows, SAME@B not
      expect(refsOf(await queueFor(onlyA, POSITION_ASC))).toEqual([
        [Q2, A],
        [X1, A],
        [Q1, A],
        [Q3, A],
      ]);

      // Through the handler, in the request's sort
      const req = reqFor(getPlaylistQueue, {
        params: { id: String(queue) },
        query: { sort: "title", direction: "ASC" },
        user: testUser({ id: owner.id, username: owner.username }),
        allowedInstanceIds: await getUserAllowedInstanceIds(owner.id),
      });
      const res = resFor(getPlaylistQueue);
      await getPlaylistQueue(req, res);
      expect(res._getOkBody()).toEqual({ entries });
    });

    it("the queue leaves out a studio name the viewer may not see", async () => {
      // A guard while hiding a studio also hides its scenes: Q3 stays
      // visible here, its studio not
      const owners = await queueFor(owner, POSITION_ASC);
      expect(entryOf(owners, Q3, A).scene.studio).toBeNull();
      expect(entryOf(owners, Q1, A).scene.studio).toEqual({
        name: `A-${SAME}`,
      });

      // The recipient did not hide it
      const recipients = await queueFor(recipient, POSITION_ASC);
      expect(entryOf(recipients, Q3, A).scene.studio).toEqual({
        name: "Hidden studio",
      });
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

  /** The playlist's items as [scene id, instance, position], by position */
  const positioned = async (playlistId: number) =>
    (
      await prisma.playlistItem.findMany({
        where: { playlistId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      })
    ).map((i) => [i.sceneId, i.instanceId, i.position]);

  it("remove unavailable deletes the soft-deleted and missing scenes' items only; hidden, restricted and deselected-instance items stay", async () => {
    // Selects A only, hid X2 on A and is restricted from P3 on A
    const cleaner = await createUser("access-it-pq-cleaner");
    await prisma.userStashInstance.create({
      data: { userId: cleaner.id, instanceId: A },
    });
    await hideFor(cleaner.id, "scene", X2, A);
    await prisma.userExcludedEntity.create({
      data: {
        userId: cleaner.id,
        entityType: "scene",
        entityId: P3,
        instanceId: A,
        reason: "restricted",
      },
    });
    const playlistId = await createPlaylist(cleaner.id, "cleanup", [
      [P1, A],
      [DELETED, A], // soft-deleted
      [GONE, A], // no row on an enabled, synced instance
      [X2, A], // hidden
      [P3, A], // restricted
      [SAME, B], // on an instance the cleaner deselected
      [ON_OFF, OFF], // on the disabled instance
      [GONE_OFF, OFF], // no row, on the disabled instance
      [GONE, NOWHERE], // no row, on no configured instance
    ]);

    const req = reqFor(removeUnavailablePlaylistItems, {
      params: { id: String(playlistId) },
      user: testUser({ id: cleaner.id, username: cleaner.username }),
      allowedInstanceIds: await getUserAllowedInstanceIds(cleaner.id),
    });
    const res = resFor(removeUnavailablePlaylistItems);
    const recorder = recordStatements();
    try {
      await removeUnavailablePlaylistItems(req, res);
    } finally {
      recorder.restore();
    }

    expect(res._getOkBody()).toEqual({ removed: 2 });
    // The rest keep their positions
    expect(await positioned(playlistId)).toEqual([
      [P1, A, 0],
      [X2, A, 3],
      [P3, A, 4],
      [SAME, B, 5],
      [ON_OFF, OFF, 6],
      [GONE_OFF, OFF, 7],
      [GONE, NOWHERE, 8],
    ]);
    // One statement, outside any transaction
    expect(
      recorder.statements.filter((st) => /^\s*DELETE\b/i.test(st.sql))
    ).toHaveLength(1);
    expect(recorder.transactions()).toBe(0);
  });

  it("two adds at once get positions n and n+1", async () => {
    const playlistId = await createPlaylist(owner.id, "append race", [
      [P1, A],
      [P2, A],
      [P3, A],
    ]);

    const [first, second] = await Promise.all([
      appendItems(playlistId, owner.id, [{ id: P4, instanceId: A }]),
      appendItems(playlistId, owner.id, [{ id: P5, instanceId: A }]),
    ]);

    expect(first.added + second.added).toBe(2);
    const rows = await positioned(playlistId);
    expect(rows.slice(0, 3)).toEqual([
      [P1, A, 0],
      [P2, A, 1],
      [P3, A, 2],
    ]);
    // Two new rows, no position shared, in whichever order the queue ran them
    expect(rows.slice(3).map(([, , position]) => position)).toEqual([3, 4]);
    expect(
      rows
        .slice(3)
        .map(([id]) => id)
        .sort()
    ).toEqual([P4, P5]);
  });

  it("a bulk add of 5 where 1 is already in, 1 is hidden and 1 is named twice adds 3 in request order after the last item", async () => {
    // A gap from an earlier remove: the next position is MAX + 1
    const playlist = await prisma.playlist.create({
      data: {
        userId: owner.id,
        name: "append bulk",
        items: {
          create: [
            { sceneId: P1, instanceId: A, position: 0 },
            { sceneId: P2, instanceId: A, position: 4 },
          ],
        },
      },
    });

    const result = await appendItems(playlist.id, owner.id, [
      { id: P5, instanceId: A },
      { id: X1, instanceId: A }, // hidden by the owner
      { id: P1, instanceId: A }, // already in
      { id: P3, instanceId: A },
      { id: P5, instanceId: A }, // named twice
      { id: SAME, instanceId: B },
    ]);

    expect(result).toEqual({ added: 3, alreadyInPlaylist: 1, unavailable: 1 });
    expect(await positioned(playlist.id)).toEqual([
      [P1, A, 0],
      [P2, A, 4],
      [P5, A, 5],
      [P3, A, 6],
      [SAME, B, 7],
    ]);
    // addedAt holds epoch milliseconds, as Prisma writes it
    const stored = await prisma.$queryRawUnsafe<{ kind: string }[]>(
      "SELECT DISTINCT typeof(addedAt) AS kind FROM PlaylistItem WHERE playlistId = ? AND position >= 5",
      playlist.id
    );
    expect(stored).toEqual([{ kind: "integer" }]);
  });

  it("a shared playlist's recipient asking containsScene learns whether it holds that scene", async () => {
    const sharedAs = async (containsScene: string) => {
      const req = reqFor(getSharedPlaylists, {
        query: { containsScene },
        user: testUser({ id: recipient.id, username: recipient.username }),
        allowedInstanceIds: await getUserAllowedInstanceIds(recipient.id),
      });
      const res = resFor(getSharedPlaylists);
      await getSharedPlaylists(req, res);
      return must(res._getOkBody().playlists.find((p) => p.id === pq))
        .containsScene;
    };

    expect(await sharedAs(`${SAME}:${B}`)).toBe(true);
    // PQ holds SAME on B, not on A
    expect(await sharedAs(`${SAME}:${A}`)).toBe(false);
  });
  describe("view sorts", () => {
    const by = (
      field: PlaylistItemSort,
      direction: "ASC" | "DESC",
      seed?: number
    ): ParsedPlaylistItemsQuery["sort"] => ({ field, direction, seed });

    /** SORTED's items the user sees on one page under the sort, as scene ids */
    const sortedIds = async (
      user: User,
      sort: ParsedPlaylistItemsQuery["sort"] | undefined,
      paging = { page: 1, perPage: 100 }
    ) =>
      (await itemsFor(user, sorted, paging, sort)).items.map((i) => i.sceneId);

    it("sort=title pages the visible items by the displayed title, ties by position", async () => {
      // T4 "bravo" (position 2) before T1 "Bravo" (position 3), though T1's
      // id is lower; X1 is hidden by the owner
      const first = await itemsFor(
        owner,
        sorted,
        { page: 1, perPage: 2 },
        by("title", "ASC")
      );
      const second = await itemsFor(
        owner,
        sorted,
        { page: 2, perPage: 2 },
        by("title", "ASC")
      );
      expect(first.items.map((i) => i.sceneId)).toEqual([T2, T4]);
      expect(second.items.map((i) => i.sceneId)).toEqual([T1, T3]);
      expect(first.totalItems).toBe(4);
      expect(second.totalItems).toBe(4);
      expect(first.items.map((i) => must(i.scene).title)).toEqual([
        "alpha",
        "bravo",
      ]);

      expect(await sortedIds(owner, by("title", "DESC"))).toEqual([
        T3,
        T4,
        T1,
        T2,
      ]);
    });

    it("sort=rating uses the viewer's own rating", async () => {
      // The owner rated T1 80 and the recipient T2 80; the rest tie at 0
      // and come in position order
      expect(await sortedIds(owner, by("rating", "DESC"))).toEqual([
        T1,
        T3,
        T4,
        T2,
      ]);
      expect(await sortedIds(recipient, by("rating", "DESC"))).toEqual([
        T2,
        T3,
        X1,
        T4,
        T1,
      ]);
    });

    it("sort=random_7 gives the same order on every page and a different one for random_8", async () => {
      const whole = await sortedIds(recipient, by("random", "DESC", 7));
      const pages: string[] = [];
      for (let page = 1; page <= 3; page++) {
        pages.push(
          ...(await sortedIds(recipient, by("random", "DESC", 7), {
            page,
            perPage: 2,
          }))
        );
      }
      expect(pages).toEqual(whole);
      expect([...whole].sort()).toEqual([T1, T2, T3, T4, X1].sort());
      expect(await sortedIds(recipient, by("random", "DESC", 7))).toEqual(
        whole
      );
      expect(await sortedIds(recipient, by("random", "DESC", 8))).not.toEqual(
        whole
      );
    });

    it("sort=added_at orders by when each item was added", async () => {
      expect(await sortedIds(owner, by("added_at", "ASC"))).toEqual([
        T1,
        T3,
        T2,
        T4,
      ]);
      expect(await sortedIds(recipient, by("added_at", "DESC"))).toEqual([
        T4,
        T2,
        T3,
        T1,
        X1,
      ]);
    });

    it("the default is position order, as before", async () => {
      expect(await sortedIds(owner, undefined)).toEqual([T3, T4, T1, T2]);
      expect(await sortedIds(owner, by("position", "DESC"))).toEqual([
        T2,
        T1,
        T4,
        T3,
      ]);
    });

    it("the handler pages by the request's sort and answers it", async () => {
      const ask = async (viewer: User, query: Record<string, string>) => {
        const req = reqFor(getPlaylist, {
          params: { id: String(sorted) },
          query,
          user: testUser({ id: viewer.id, username: viewer.username }),
          allowedInstanceIds: await getUserAllowedInstanceIds(viewer.id),
        });
        const res = resFor(getPlaylist);
        await getPlaylist(req, res);
        return res._getOkBody();
      };

      const titled = await ask(owner, {
        page: "1",
        per_page: "2",
        sort: "title",
        direction: "ASC",
      });
      expect(titled.playlist.items.map((i) => i.sceneId)).toEqual([T2, T4]);
      expect(titled.totalItems).toBe(4);
      expect(titled.sort).toBe("title");
      expect(titled.direction).toBe("ASC");

      // A bare random answers the seed it used, which reads the same order
      const random = await ask(recipient, { page: "1", sort: "random" });
      expect(random.sort).toMatch(/^random_\d+$/);
      const again = await ask(recipient, { page: "1", sort: random.sort });
      expect(again.playlist.items).toEqual(random.playlist.items);

      const plain = await ask(owner, { page: "1" });
      expect(plain.sort).toBe("position");
      expect(plain.direction).toBe("ASC");
    });

    it("a sorted page drives from the playlist's items", async () => {
      const planner = await largeLibraryPlanner();
      try {
        for (const sort of [by("title", "ASC"), by("rating", "DESC")]) {
          const recorder = recordStatements();
          try {
            await itemsFor(owner, sorted, { page: 1, perPage: 2 }, sort);
          } finally {
            recorder.restore();
          }
          const page = must(
            recorder.statements.find(
              (st) =>
                st.sql.includes("FROM PlaylistItem pi") &&
                st.sql.includes("ORDER BY")
            ),
            "the page statement"
          );
          const plan = await planner.planOf(page.sql, ...page.params);
          expect(must(plan[0], "the plan's first row")).toMatch(
            /^SEARCH pi USING (COVERING )?INDEX \w+ \(playlistId=\?/
          );
          expect(plan.find((row) => row.startsWith("SEARCH s "))).toMatch(
            /^SEARCH s USING .*\(id=\? AND stashInstanceId=\?/
          );
          expect(plan.filter((row) => /^SCAN s\b/.test(row))).toEqual([]);
        }
      } finally {
        await planner.close();
      }
    });
  });

  describe("save as playlist order", () => {
    /** Saves the sort as the playlist's order through the handler, as `user` */
    const saveAs = async (
      user: User,
      playlistId: number,
      body: { sort: string; direction: "ASC" | "DESC" }
    ) => {
      const req = reqFor(sortPlaylist, {
        params: { id: String(playlistId) },
        body,
        user: testUser({ id: user.id, username: user.username }),
        allowedInstanceIds: await getUserAllowedInstanceIds(user.id),
      });
      const res = resFor(sortPlaylist);
      await sortPlaylist(req, res);
      return res;
    };

    /** The writes among the recorded statements */
    const writesOf = (recorder: ReturnType<typeof recordStatements>) =>
      recorder.statements.filter((st) =>
        /^\s*(WITH[\s\S]*\)\s*)?(UPDATE|INSERT|DELETE)\b/i.test(st.sql)
      );

    it("saving title order numbers the visible items 0..n-1 by title, and the owner's hidden and soft-deleted items keep their relative order after them", async () => {
      // X1 is hidden by the owner, DELETED soft-deleted, ON_OFF on a
      // disabled instance; T2 "alpha", T1 "Bravo", T3 "Charlie"
      const playlistId = await createPlaylist(owner.id, "save title", [
        [X1, A],
        [T1, A],
        [DELETED, A],
        [T2, A],
        [ON_OFF, OFF],
        [T3, A],
      ]);

      const res = await saveAs(owner, playlistId, {
        sort: "title",
        direction: "ASC",
      });

      expect(res._getOkBody()).toEqual({ success: true, itemCount: 6 });
      expect(await positioned(playlistId)).toEqual([
        [T2, A, 0],
        [T1, A, 1],
        [T3, A, 2],
        [X1, A, 3],
        [DELETED, A, 4],
        [ON_OFF, OFF, 5],
      ]);
    });

    it("saving the shown random order stores the order the page showed for that seed", async () => {
      const playlistId = await createPlaylist(owner.id, "save random", [
        [T3, A],
        [X1, A],
        [T4, A],
        [P1, A],
        [T1, A],
        [P3, A],
        [T2, A],
      ]);
      const shown = (
        await itemsFor(
          owner,
          playlistId,
          { page: 1, perPage: 100 },
          { field: "random", direction: "DESC", seed: 7 }
        )
      ).items.map((i) => i.sceneId);

      await saveAs(owner, playlistId, { sort: "random_7", direction: "DESC" });

      const saved = await positioned(playlistId);
      expect(saved.map(([id]) => id)).toEqual([...shown, X1]);
      expect(saved.map(([, , position]) => position)).toEqual([
        0, 1, 2, 3, 4, 5, 6,
      ]);
      // The saved order is now the playlist's own
      expect(
        (
          await itemsFor(owner, playlistId, { page: 1, perPage: 100 })
        ).items.map((i) => i.sceneId)
      ).toEqual(shown);
    });

    it("saving rating order reads the owner's own ratings", async () => {
      // The owner rated P1 80 and T1 80, the recipient T2 80
      const playlistId = await createPlaylist(owner.id, "save rating", [
        [T2, A],
        [T1, A],
        [T3, A],
        [P1, A],
      ]);

      await saveAs(owner, playlistId, { sort: "rating", direction: "DESC" });

      expect(await positioned(playlistId)).toEqual([
        [T1, A, 0],
        [P1, A, 1],
        [T2, A, 2],
        [T3, A, 3],
      ]);
    });

    it("a save is one unit and writes nothing when the playlist is gone", async () => {
      const playlistId = await createPlaylist(owner.id, "save unit", [
        [T3, A],
        [T2, A],
        [T1, A],
      ]);

      const recorder = recordStatements();
      try {
        await saveAs(owner, playlistId, { sort: "title", direction: "ASC" });
      } finally {
        recorder.restore();
      }
      expect(writesOf(recorder)).toHaveLength(1);
      expect(recorder.transactions()).toBe(0);

      await prisma.playlist.delete({ where: { id: playlistId } });
      const gone = recordStatements();
      let res: Awaited<ReturnType<typeof saveAs>>;
      try {
        res = await saveAs(owner, playlistId, {
          sort: "title",
          direction: "ASC",
        });
      } finally {
        gone.restore();
      }
      expect(res.status).toHaveBeenCalledWith(404);
      expect(writesOf(gone)).toEqual([]);
    });
  });

  describe("move one item", () => {
    /** The item id of a scene in a playlist */
    const itemIdOf = async (playlistId: number, [sceneId, instanceId]: Ref) =>
      (
        await prisma.playlistItem.findFirstOrThrow({
          where: { playlistId, sceneId, instanceId },
        })
      ).id;

    /** Moves the scene's item to `index` among the owner's visible items */
    const moveAs = async (
      user: User,
      playlistId: number,
      ref: Ref,
      index: number
    ) =>
      moveItem(
        playlistId,
        user.id,
        await getUserAllowedInstanceIds(user.id),
        await itemIdOf(playlistId, ref),
        index
      );

    it("moving the 5th visible item to index 1 puts it second and numbers the playlist 0..n-1", async () => {
      const playlistId = await createPlaylist(owner.id, "move fifth", [
        [P1, A],
        [X1, A], // hidden by the owner
        [P2, A],
        [P3, A],
        [P4, A],
        [P5, A],
        [T1, A],
      ]);

      expect(await moveAs(owner, playlistId, [P5, A], 1)).toBe(true);

      // Before the visible item now second (P2), so after the hidden X1

      expect(await positioned(playlistId)).toEqual([
        [P1, A, 0],
        [X1, A, 1],
        [P5, A, 2],
        [P2, A, 3],
        [P3, A, 4],
        [P4, A, 5],
        [T1, A, 6],
      ]);
    });

    it("moving down past the end puts it last among the visible items", async () => {
      const playlistId = await createPlaylist(owner.id, "move past end", [
        [P1, A],
        [P2, A],
        [P3, A],
        [X1, A], // hidden by the owner
        [DELETED, A],
      ]);

      expect(await moveAs(owner, playlistId, [P1, A], 99)).toBe(true);

      expect(await positioned(playlistId)).toEqual([
        [P2, A, 0],
        [P3, A, 1],
        [P1, A, 2],
        [X1, A, 3],
        [DELETED, A, 4],
      ]);
    });

    it("an item the owner cannot see keeps its place between its neighbours", async () => {
      const playlistId = await createPlaylist(owner.id, "move around hidden", [
        [P1, A],
        [P2, A],
        [X1, A], // hidden by the owner, between visible 2 and 3
        [P3, A],
        [P4, A],
      ]);

      expect(await moveAs(owner, playlistId, [P4, A], 0)).toBe(true);

      expect(await positioned(playlistId)).toEqual([
        [P4, A, 0],
        [P1, A, 1],
        [P2, A, 2],
        [X1, A, 3],
        [P3, A, 4],
      ]);
    });

    it("a playlist with gaps and equal positions comes out dense", async () => {
      const playlist = await prisma.playlist.create({
        data: {
          userId: owner.id,
          name: "move gaps",
          items: {
            create: [
              { sceneId: P1, instanceId: A, position: 0 },
              { sceneId: P2, instanceId: A, position: 3 },
              { sceneId: P3, instanceId: A, position: 3 },
              { sceneId: P4, instanceId: A, position: 9 },
            ],
          },
        },
      });

      expect(await moveAs(owner, playlist.id, [P1, A], 1)).toBe(true);

      expect(await positioned(playlist.id)).toEqual([
        [P2, A, 0],
        [P1, A, 1],
        [P3, A, 2],
        [P4, A, 3],
      ]);
    });

    it("two moves at once both land", async () => {
      const playlistId = await createPlaylist(owner.id, "move race", [
        [P1, A],
        [P2, A],
        [P3, A],
        [P4, A],
        [P5, A],
      ]);
      const allowed = await getUserAllowedInstanceIds(owner.id);
      const p1 = await itemIdOf(playlistId, [P1, A]);
      const p4 = await itemIdOf(playlistId, [P4, A]);

      const moved = await Promise.all([
        moveItem(playlistId, owner.id, allowed, p1, 2),
        moveItem(playlistId, owner.id, allowed, p4, 0),
      ]);

      expect(moved).toEqual([true, true]);
      const rows = await positioned(playlistId);
      expect(rows.map(([, , position]) => position)).toEqual([0, 1, 2, 3, 4]);
      // P1 to 2 then P4 to 0, or P4 to 0 then P1 to 2
      expect([
        [P4, P2, P3, P1, P5],
        [P4, P2, P1, P3, P5],
      ]).toContainEqual(rows.map(([id]) => id));
    });

    it("an item the owner cannot see, or another playlist's item, is not moved", async () => {
      const playlistId = await createPlaylist(owner.id, "move refused", [
        [P1, A],
        [X1, A], // hidden by the owner
        [P2, A],
      ]);
      const allowed = await getUserAllowedInstanceIds(owner.id);
      const elsewhere = await itemIdOf(pq, [P3, A]);
      const pqBefore = await positioned(pq);

      expect(await moveAs(owner, playlistId, [X1, A], 0)).toBe(false);
      expect(await moveItem(playlistId, owner.id, allowed, elsewhere, 0)).toBe(
        false
      );

      expect(await positioned(playlistId)).toEqual([
        [P1, A, 0],
        [X1, A, 1],
        [P2, A, 2],
      ]);
      expect(await positioned(pq)).toEqual(pqBefore);
    });
  });
});
