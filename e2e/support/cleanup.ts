import type { APIRequestContext } from "@playwright/test";
import { mustOk } from "./api";

/**
 * Deletes what tests created, by name prefix (`runPrefix()` for this run's
 * names). Global setup and teardown call these in dev-stack mode; a spec's
 * afterAll can call them for its own playlists and groups.
 */

interface UserRow {
  id: number;
  username: string;
}

interface GroupRow {
  id: number;
  name: string;
}

interface PlaylistRow {
  id: number;
  name: string;
}

/** Every user; `api` needs an admin session */
export async function listUsers(api: APIRequestContext): Promise<UserRow[]> {
  const response = await mustOk(
    await api.get("/api/user/all"),
    "Listing users"
  );
  return ((await response.json()) as { users: UserRow[] }).users;
}

/** Every user group; `api` needs an admin session */
export async function listGroups(api: APIRequestContext): Promise<GroupRow[]> {
  const response = await mustOk(await api.get("/api/groups"), "Listing groups");
  return ((await response.json()) as { groups: GroupRow[] }).groups;
}

/** Deletes the signed-in user's playlists whose name starts with `prefix` */
export async function deleteOwnPlaylists(
  api: APIRequestContext,
  prefix: string
): Promise<void> {
  const response = await mustOk(
    await api.get("/api/playlists"),
    "Listing playlists"
  );
  const { playlists } = (await response.json()) as {
    playlists: PlaylistRow[];
  };
  for (const playlist of playlists) {
    if (playlist.name.startsWith(prefix)) {
      await mustOk(
        await api.delete(`/api/playlists/${playlist.id}`),
        `Deleting the playlist ${playlist.name}`
      );
    }
  }
}

/** Deletes the groups whose name starts with `prefix`; needs an admin session */
export async function deleteGroups(
  api: APIRequestContext,
  prefix: string
): Promise<void> {
  for (const group of await listGroups(api)) {
    if (group.name.startsWith(prefix)) {
      await mustOk(
        await api.delete(`/api/groups/${group.id}`),
        `Deleting the group ${group.name}`
      );
    }
  }
}

/**
 * Deletes the users whose name starts with `prefix`, except `keepUsername`
 * (the signed-in admin, which Peek refuses to delete); needs an admin session.
 * Their playlists, history and other per-user rows go with them.
 */
export async function deleteUsers(
  api: APIRequestContext,
  prefix: string,
  keepUsername?: string
): Promise<void> {
  for (const user of await listUsers(api)) {
    if (user.username.startsWith(prefix) && user.username !== keepUsername) {
      await mustOk(
        await api.delete(`/api/user/${user.id}`),
        `Deleting the user ${user.username}`
      );
    }
  }
}
