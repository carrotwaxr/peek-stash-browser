/**
 * Scenes by playlist (item 62; owner answers 6 and 13), from the wire
 * through the parser into the scene builder, on seeded rows.
 *
 * Three made-up instances: spf-x and spf-y enabled and reusing ids, as two
 * Stash servers do, spf-off disabled. Every viewer selects all three, so
 * the allowed list (`getUserAllowedInstanceIds`) is x and y.
 * - Scenes: 1 to 8 on x; 1, 5 and 6 on y; 9 on off (ids 789600n).
 * - Users: A owns P1 (shared with group G; A may share) and P2 (unshared);
 *   B, in G, owns P3 and hid 6@x; C, outside G, owns P4; D is an admin.
 * - P1: 6@x position 0, 7@x 1, 5@x 2, 9@off 3. P2: 1@x and 2@x both at
 *   position 0, 5@y 1. P3: 2@x, 5@x. P4: 3@x.
 * Every seeded row is deleted before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { parseListRequest } from "../../utils/listRequest.js";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const X = "spf-x";
const Y = "spf-y";
const OFF = "spf-off";
const INSTANCES = [X, Y, OFF];
const PREFIX = "spf-it";

const sid = (n: number) => String(7896000 + n);
const key = (n: number, instance: string) => `${sid(n)}:${instance}`;

/** Every live scene on the allowed instances: the library each viewer starts from */
const LIBRARY = [
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => key(n, X)),
  ...[1, 5, 6].map((n) => key(n, Y)),
].sort();
/** B hid 6@x */
const B_LIBRARY = LIBRARY.filter((k) => k !== key(6, X));

describeWithDb("Scenes by playlist (seeded)", () => {
  const user = { A: 0, B: 0, C: 0, D: 0 };
  const playlist = { P1: 0, P2: 0, P3: 0, P4: 0 };
  let groupId = 0;

  async function removeRows(): Promise<void> {
    // Playlists, items, shares, selections and exclusions cascade with the user
    await prisma.user.deleteMany({
      where: { username: { startsWith: PREFIX } },
    });
    await prisma.userGroup.deleteMany({
      where: { name: { startsWith: PREFIX } },
    });
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: INSTANCES } },
    });
    await prisma.stashInstance.deleteMany({ where: { id: { in: INSTANCES } } });
  }

  interface Listed {
    readonly keys: string[];
    readonly total: number | null;
  }

  /** One page of the scenes a wire `scene_filter` lists for a viewer, in order */
  async function list(
    viewer: number,
    sceneFilter: Record<string, unknown>,
    sort: { sort?: string; direction?: string } = {}
  ): Promise<Listed> {
    const request = parseListRequest(
      "scene",
      { filter: { per_page: 250, ...sort }, scene_filter: sceneFilter },
      { userId: viewer }
    );
    const { items, total } = await sceneQueryBuilder.execute({
      userId: viewer,
      allowedInstanceIds: await getUserAllowedInstanceIds(viewer),
      request,
    });
    return { keys: items.map((s) => `${s.id}:${s.instanceId}`), total };
  }

  /** The listed keys sorted, with the count checked against them */
  async function scenesFor(
    viewer: number,
    sceneFilter: Record<string, unknown>
  ): Promise<string[]> {
    const { keys, total } = await list(viewer, sceneFilter);
    expect(total).toBe(keys.length);
    return [...keys].sort();
  }

  const includes = (...ids: number[]) => ({
    playlists: { value: ids, modifier: "INCLUDES" },
  });
  const excludes = (...ids: number[]) => ({
    playlists: { value: ids, modifier: "EXCLUDES" },
  });

  beforeAll(async () => {
    await removeRows();

    for (const [i, id] of INSTANCES.entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: "http://127.0.0.1:9/graphql",
          apiKey: "fixture-key",
          enabled: id !== OFF,
          priority: 960 + i,
          // Synced: its content shows (a first-syncing instance does not)
          firstSyncedAt: new Date(),
        },
      });
    }

    const makeUser = async (
      name: string,
      role: "ADMIN" | "USER",
      canShareOverride: boolean | null = null
    ) => {
      const created = await prisma.user.create({
        data: {
          username: `${PREFIX}-${name}`,
          password: "not-a-real-hash",
          role,
          canShareOverride,
          stashInstances: {
            create: INSTANCES.map((instanceId) => ({ instanceId })),
          },
        },
      });
      return created.id;
    };
    user.A = await makeUser("a", "USER", true);
    user.B = await makeUser("b", "USER");
    user.C = await makeUser("c", "USER");
    user.D = await makeUser("d", "ADMIN");

    groupId = (
      await prisma.userGroup.create({
        data: { name: `${PREFIX}-g`, canShare: false },
      })
    ).id;
    await prisma.userGroupMembership.create({
      data: { userId: user.B, groupId },
    });

    await prisma.stashScene.createMany({
      data: [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
          id: sid(n),
          stashInstanceId: X,
          title: `SPF ${n} x`,
        })),
        ...[1, 5, 6].map((n) => ({
          id: sid(n),
          stashInstanceId: Y,
          title: `SPF ${n} y`,
        })),
        { id: sid(9), stashInstanceId: OFF, title: "SPF 9 off" },
      ],
    });

    const makePlaylist = async (
      owner: number,
      items: [n: number, instance: string, position: number][],
      sharedWith: number[] = []
    ) =>
      (
        await prisma.playlist.create({
          data: {
            name: `${PREFIX}-p`,
            userId: owner,
            items: {
              create: items.map(([n, instanceId, position]) => ({
                sceneId: sid(n),
                instanceId,
                position,
              })),
            },
            shares: { create: sharedWith.map((id) => ({ groupId: id })) },
          },
        })
      ).id;
    playlist.P1 = await makePlaylist(
      user.A,
      [
        [6, X, 0],
        [7, X, 1],
        [5, X, 2],
        [9, OFF, 3],
      ],
      [groupId]
    );
    playlist.P2 = await makePlaylist(user.A, [
      [1, X, 0],
      [2, X, 0],
      [5, Y, 1],
    ]);
    playlist.P3 = await makePlaylist(user.B, [
      [2, X, 0],
      [5, X, 1],
    ]);
    playlist.P4 = await makePlaylist(user.C, [[3, X, 0]]);

    // The hide and its exclusion row: a recompute mid-file rebuilds the row
    await prisma.userHiddenEntity.create({
      data: {
        userId: user.B,
        entityType: "scene",
        entityId: sid(6),
        instanceId: X,
      },
    });
    await prisma.userExcludedEntity.create({
      data: {
        userId: user.B,
        entityType: "scene",
        entityId: sid(6),
        instanceId: X,
        reason: "hidden",
      },
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("INCLUDES lists the playlist's scenes on their own instance", async () => {
    // P1 holds 5 on x: 5 on y is another scene
    const p1 = await scenesFor(user.A, includes(playlist.P1));
    expect(p1).toEqual([key(5, X), key(6, X), key(7, X)].sort());
    expect(p1).not.toContain(key(5, Y));
    // P2 holds 5 on y and 1 on x only
    expect(await scenesFor(user.A, includes(playlist.P2))).toEqual(
      [key(1, X), key(2, X), key(5, Y)].sort()
    );
  });

  it("a playlist shared with the viewer's group filters", async () => {
    expect(await scenesFor(user.B, includes(playlist.P1))).toEqual(
      [key(5, X), key(7, X)].sort()
    );
    // C is not in the group
    expect(await scenesFor(user.C, includes(playlist.P1))).toEqual([]);
  });

  it("an unshared or revoked playlist matches nothing, whatever it holds", async () => {
    const missing = 2_000_000_000;
    // The answers for an id that does not exist
    expect(await list(user.B, includes(missing))).toEqual({
      keys: [],
      total: 0,
    });
    expect(await scenesFor(user.B, excludes(missing))).toEqual(B_LIBRARY);

    // A's unshared P2: the same answers, so a count reveals nothing
    expect(await list(user.B, includes(playlist.P2))).toEqual({
      keys: [],
      total: 0,
    });
    expect(await scenesFor(user.B, excludes(playlist.P2))).toEqual(B_LIBRARY);
    expect(await scenesFor(user.C, excludes(playlist.P1))).toEqual(LIBRARY);

    // A loses Can Share: P1 stops filtering for B
    await prisma.user.update({
      where: { id: user.A },
      data: { canShareOverride: false },
    });
    try {
      expect(await list(user.B, includes(playlist.P1))).toEqual({
        keys: [],
        total: 0,
      });
      expect(await scenesFor(user.B, excludes(playlist.P1))).toEqual(B_LIBRARY);
      // The owner still filters by it
      expect(await scenesFor(user.A, includes(playlist.P1))).toHaveLength(3);
    } finally {
      await prisma.user.update({
        where: { id: user.A },
        data: { canShareOverride: true },
      });
    }
  });

  it("an admin filtering by another user's unshared playlist gets nothing under INCLUDES and the library under EXCLUDES", async () => {
    expect(await list(user.D, includes(playlist.P2))).toEqual({
      keys: [],
      total: 0,
    });
    expect(await scenesFor(user.D, excludes(playlist.P2))).toEqual(LIBRARY);
    expect(
      await scenesFor(user.D, {
        playlists: { value: [playlist.P2, playlist.P4], modifier: "INCLUDES" },
      })
    ).toEqual([]);
  });

  it("the viewer's exclusions still apply: a hidden scene is never listed under any form", async () => {
    // P1 holds 6@x, which B hid: neither listed nor counted
    const { keys, total } = await list(user.B, includes(playlist.P1));
    expect(keys).not.toContain(key(6, X));
    expect(total).toBe(2);
    expect(await scenesFor(user.B, excludes(playlist.P3))).not.toContain(
      key(6, X)
    );
    expect(await scenesFor(user.B, { in_any_playlist: false })).not.toContain(
      key(6, X)
    );
    expect(await scenesFor(user.B, { in_any_playlist: true })).not.toContain(
      key(6, X)
    );
  });

  it("INCLUDES_ALL needs every playlist", async () => {
    expect(
      await scenesFor(user.B, {
        playlists: {
          value: [playlist.P1, playlist.P3],
          modifier: "INCLUDES_ALL",
        },
      })
    ).toEqual([key(5, X)]);
    // One the viewer cannot read makes INCLUDES_ALL match nothing
    expect(
      await scenesFor(user.B, {
        playlists: {
          value: [playlist.P3, playlist.P2],
          modifier: "INCLUDES_ALL",
        },
      })
    ).toEqual([]);
  });

  it("EXCLUDES drops scenes in any of them", async () => {
    expect(await scenesFor(user.B, excludes(playlist.P1, playlist.P3))).toEqual(
      [
        key(1, X),
        key(3, X),
        key(4, X),
        key(8, X),
        key(1, Y),
        key(5, Y),
        key(6, Y),
      ].sort()
    );
  });

  it("in any of my playlists: true lists the viewer's own playlists' scenes only, false the rest", async () => {
    const mine = [
      key(1, X),
      key(2, X),
      key(5, X),
      key(6, X),
      key(7, X),
      key(5, Y),
    ].sort();
    expect(await scenesFor(user.A, { in_any_playlist: true })).toEqual(mine);
    expect(await scenesFor(user.A, { in_any_playlist: false })).toEqual(
      LIBRARY.filter((k) => !mine.includes(k))
    );
    // B's own P3 only: P1, shared with B, is not B's
    expect(await scenesFor(user.B, { in_any_playlist: true })).toEqual(
      [key(2, X), key(5, X)].sort()
    );
    // Another user's playlists never count, the admin's included
    expect(await scenesFor(user.C, { in_any_playlist: true })).toEqual([
      key(3, X),
    ]);
    expect(await scenesFor(user.D, { in_any_playlist: true })).toEqual([]);
    expect(await scenesFor(user.D, { in_any_playlist: false })).toEqual(
      LIBRARY
    );
  });

  it("Playlist order sorts by the playlist's position; ties end with the key", async () => {
    const asc = await list(user.A, includes(playlist.P1), {
      sort: "playlist_position",
      direction: "ASC",
    });
    expect(asc).toEqual({ keys: [key(6, X), key(7, X), key(5, X)], total: 3 });
    const desc = await list(user.A, includes(playlist.P1), {
      sort: "playlist_position",
      direction: "DESC",
    });
    expect(desc.keys).toEqual([key(5, X), key(7, X), key(6, X)]);

    // 1@x and 2@x share position 0: the key orders them, both ways
    expect(
      (
        await list(user.A, includes(playlist.P2), {
          sort: "playlist_position",
          direction: "ASC",
        })
      ).keys
    ).toEqual([key(1, X), key(2, X), key(5, Y)]);
    expect(
      (
        await list(user.A, includes(playlist.P2), {
          sort: "playlist_position",
          direction: "DESC",
        })
      ).keys
    ).toEqual([key(5, Y), key(2, X), key(1, X)]);
  });

  it("a disabled instance's items never show", async () => {
    expect(await getUserAllowedInstanceIds(user.A)).not.toContain(OFF);
    // P1 holds 9@off
    expect(await scenesFor(user.A, includes(playlist.P1))).not.toContain(
      key(9, OFF)
    );
    expect(await scenesFor(user.A, { in_any_playlist: true })).not.toContain(
      key(9, OFF)
    );
    expect(
      (
        await list(user.A, includes(playlist.P1), {
          sort: "playlist_position",
          direction: "DESC",
        })
      ).keys
    ).not.toContain(key(9, OFF));
  });
});
