/**
 * The playlist access rule as SQL (item 62, invariant 6) against real SQLite.
 *
 * Each case seeds its own users, groups and playlists, then asks both
 * `getPlaylistAccess` (one playlist at a time) and `viewablePlaylistSql` (the
 * whole table) and requires the same answer for every viewer, so the SQL and
 * the service cannot drift apart. Everything is deleted in `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import {
  ownPlaylistSql,
  viewablePlaylistSql,
} from "../../utils/playlistAccessSql.js";
import type { SqlFragment } from "../../utils/sqlClauses.js";

const PREFIX = `pas-${process.pid}-${Date.now()}`;

const userIds: number[] = [];
const groupIds: number[] = [];

async function makeUser(
  name: string,
  data: { role?: "ADMIN" | "USER"; canShareOverride?: boolean | null } = {}
): Promise<number> {
  const user = await prisma.user.create({
    data: {
      username: `${PREFIX}-${name}`,
      password: "not-a-real-hash",
      role: data.role ?? "USER",
      canShareOverride: data.canShareOverride ?? null,
    },
  });
  userIds.push(user.id);
  return user.id;
}

async function makeGroup(name: string, canShare: boolean): Promise<number> {
  const group = await prisma.userGroup.create({
    data: { name: `${PREFIX}-${name}`, canShare },
  });
  groupIds.push(group.id);
  return group.id;
}

async function join(userId: number, groupId: number): Promise<void> {
  await prisma.userGroupMembership.create({ data: { userId, groupId } });
}

async function makePlaylist(
  userId: number,
  sharedWith: number[] = []
): Promise<number> {
  const playlist = await prisma.playlist.create({
    data: {
      name: `${PREFIX}-p`,
      userId,
      shares: { create: sharedWith.map((groupId) => ({ groupId })) },
    },
  });
  return playlist.id;
}

/** The ids among `playlistIds` a fragment lets through */
async function through(
  fragment: SqlFragment,
  playlistIds: number[]
): Promise<number[]> {
  const rows = await prisma.$queryRawUnsafe<{ id: number }[]>(
    `SELECT p.id AS id FROM Playlist p WHERE p.id IN (${playlistIds.map(() => "?").join(",")}) AND ${fragment.sql} ORDER BY p.id`,
    ...playlistIds,
    ...fragment.params
  );
  return rows.map((r) => r.id);
}

/** Both answers for one viewer over the given playlists, which must agree */
async function viewable(
  viewerId: number,
  playlistIds: number[]
): Promise<number[]> {
  const sql = await through(viewablePlaylistSql("p", viewerId), playlistIds);
  const service: number[] = [];
  for (const id of [...playlistIds].sort((a, b) => a - b)) {
    if ((await getPlaylistAccess(id, viewerId)).level !== "none") {
      service.push(id);
    }
  }
  expect(sql).toEqual(service);
  return sql;
}

describe("playlist access as SQL", () => {
  let owner: number;
  let viewer: number;
  let outsider: number;
  let admin: number;
  let shareGroup: number; // grants Can Share, owner belongs to it
  let plainGroup: number; // grants nothing
  let targetGroup: number; // the playlist is shared with it, viewer belongs to it

  beforeAll(async () => {
    owner = await makeUser("owner");
    viewer = await makeUser("viewer");
    outsider = await makeUser("outsider");
    admin = await makeUser("admin", { role: "ADMIN" });
    shareGroup = await makeGroup("share", true);
    plainGroup = await makeGroup("plain", false);
    targetGroup = await makeGroup("target", false);
    await join(owner, shareGroup);
    await join(viewer, targetGroup);
    await join(outsider, plainGroup);
  });

  afterAll(async () => {
    // Playlists, shares and memberships cascade with their user or group
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.userGroup.deleteMany({ where: { id: { in: groupIds } } });
  });

  it("the owner sees their own playlist", async () => {
    const own = await makePlaylist(owner);
    expect(await viewable(owner, [own])).toEqual([own]);
    expect(await through(ownPlaylistSql("p", owner), [own])).toEqual([own]);
  });

  it("a member of a group it is shared with sees it while the owner may share", async () => {
    const shared = await makePlaylist(owner, [targetGroup]);
    expect(await viewable(viewer, [shared])).toEqual([shared]);
    // ownPlaylistSql never takes a share
    expect(await through(ownPlaylistSql("p", viewer), [shared])).toEqual([]);
  });

  it("a share stops counting when the owner loses Can Share", async () => {
    const shared = await makePlaylist(owner, [targetGroup]);
    expect(await viewable(viewer, [shared])).toEqual([shared]);

    await prisma.userGroup.update({
      where: { id: shareGroup },
      data: { canShare: false },
    });
    expect(await viewable(viewer, [shared])).toEqual([]);
    // the owner still sees it
    expect(await viewable(owner, [shared])).toEqual([shared]);

    // the permission coming back brings the share back
    await prisma.userGroup.update({
      where: { id: shareGroup },
      data: { canShare: true },
    });
    expect(await viewable(viewer, [shared])).toEqual([shared]);
  });

  it("the owner's override beats their groups", async () => {
    const shared = await makePlaylist(owner, [targetGroup]);

    // a granting group, overridden off
    await prisma.user.update({
      where: { id: owner },
      data: { canShareOverride: false },
    });
    expect(await viewable(viewer, [shared])).toEqual([]);

    // an override on with no granting group
    const lone = await makeUser("lone-owner", { canShareOverride: true });
    const loneShared = await makePlaylist(lone, [targetGroup]);
    expect(await viewable(viewer, [loneShared])).toEqual([loneShared]);

    // no override, no granting group: not shared
    const noGrant = await makeUser("no-grant-owner");
    const noGrantShared = await makePlaylist(noGrant, [targetGroup]);
    expect(await viewable(viewer, [noGrantShared])).toEqual([]);

    // clearing the override returns to the group's grant
    await prisma.user.update({
      where: { id: owner },
      data: { canShareOverride: null },
    });
    expect(await viewable(viewer, [shared])).toEqual([shared]);
  });

  it("a user outside the shared group does not see it", async () => {
    const shared = await makePlaylist(owner, [targetGroup]);
    expect(await viewable(outsider, [shared])).toEqual([]);
  });

  it("an unshared playlist of another user is not seen", async () => {
    const private_ = await makePlaylist(owner);
    expect(await viewable(viewer, [private_])).toEqual([]);
    expect(await viewable(outsider, [private_])).toEqual([]);
  });

  it("an admin sees another user's unshared playlist no more than anyone", async () => {
    const private_ = await makePlaylist(owner);
    expect(await viewable(admin, [private_])).toEqual([]);
    expect(await through(ownPlaylistSql("p", admin), [private_])).toEqual([]);

    // and a shared one only through a group they belong to
    const shared = await makePlaylist(owner, [targetGroup]);
    expect(await viewable(admin, [shared])).toEqual([]);
    await join(admin, targetGroup);
    expect(await viewable(admin, [shared])).toEqual([shared]);
  });

  it("a share to a group the viewer is not in never leaks through another share", async () => {
    const other = await makeGroup("other", false);
    const shared = await makePlaylist(owner, [other]);
    expect(await viewable(outsider, [shared])).toEqual([]);
    // two shares, one reaching the viewer: the playlist shows once
    const twice = await makePlaylist(owner, [other, targetGroup]);
    expect(await viewable(viewer, [twice])).toEqual([twice]);
  });
});
