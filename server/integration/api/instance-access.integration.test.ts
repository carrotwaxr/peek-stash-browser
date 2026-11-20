/**
 * An admin limits a USER to chosen Stash servers (#439).
 *
 * The two instances are the run's: the test Stash and the second library
 * global setup adds (a replay run always; a live run with ALLOW_PROD_STASH=1
 * in the shell), so the library list has scenes on both. The limit is access
 * control, not a preference: the user's scene list holds only the allowed
 * server's scenes after the PUT and both again once the limit is lifted.
 * The admin's own selection is never touched; the users are this file's own.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import type {
  GetUserInstanceAccessResponse,
  UpdateUserInstanceAccessResponse,
} from "../../types/api/index.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import {
  type TestClient,
  adminClient,
  findTestInstanceId,
} from "../helpers/testClient.js";

const SECOND_STASH_URL = process.env.STASH_SECOND_URL;
const PASSWORD = "Instance-access-IT-pass-1";
const PAGE = 250;

interface ListedScene {
  id: string;
  instanceId: string;
}

/** Every scene in the client's list, page by page, and the list's status */
async function scenesListedTo(
  client: TestClient
): Promise<{ status: number; count: number; scenes: ListedScene[] }> {
  const scenes: ListedScene[] = [];
  let count = 0;
  for (let page = 1; page <= 100; page++) {
    const res = await client.post<{
      findScenes?: { count: number; scenes: ListedScene[] };
    }>("/api/library/scenes", { filter: { page, per_page: PAGE } });
    const found = res.data.findScenes;
    if (res.status !== 200 || found === undefined) {
      return { status: res.status, count: 0, scenes: [] };
    }
    count = found.count;
    scenes.push(...found.scenes);
    if (found.scenes.length < PAGE || scenes.length >= found.count) break;
  }
  return { status: 200, count, scenes };
}

const instancesOf = (scenes: ListedScene[]) =>
  [...new Set(scenes.map((s) => s.instanceId))].sort();

describe("Per-user Stash server access (integration)", () => {
  let user: { id: number; client: TestClient };
  let other: { id: number; client: TestClient };
  let testInstanceId: string;
  let secondInstanceId: string | undefined;
  const createdIds: number[] = [];

  const path = (id: number) => `/api/user/${id}/instance-access`;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    testInstanceId = await findTestInstanceId();
    if (SECOND_STASH_URL) {
      const res = await adminClient.get<{
        instances: Array<{ id: string; url: string }>;
      }>("/api/setup/stash-instances");
      secondInstanceId = must(
        res.data.instances.find((i) => i.url === SECOND_STASH_URL),
        "the second instance global setup adds"
      ).id;
    }
    user = await createApiUser("instance_access_it_user", PASSWORD);
    createdIds.push(user.id);
    other = await createApiUser("instance_access_it_other", PASSWORD);
    createdIds.push(other.id);
  }, 60000);

  afterAll(async () => {
    // beforeAll may have failed before it created both users
    for (const id of createdIds) await adminClient.delete(`/api/user/${id}`);
  }, 60000);

  it("a new user is not limited and holds no servers", async () => {
    const res = await adminClient.get<GetUserInstanceAccessResponse>(
      path(user.id)
    );
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ limited: false, instanceIds: [] });
  });

  it("a USER cannot read or set anyone's access", async () => {
    expect((await user.client.get(path(user.id))).status).toBe(403);
    const put = await user.client.put(path(user.id), {
      limited: false,
      instanceIds: [],
    });
    expect(put.status).toBe(403);
  });

  it("answers 404 for an unknown user", async () => {
    const get = await adminClient.get<{ error: string }>(path(99999999));
    expect(get.status).toBe(404);
    const put = await adminClient.put<{ error: string }>(path(99999999), {
      limited: true,
      instanceIds: [],
    });
    expect(put.status).toBe(404);
    expect(put.data.error).toBe("User not found");
  });

  it("answers 400 for an administrator", async () => {
    const me = await adminClient.get<{ user: { id: number } }>("/api/auth/me");
    const res = await adminClient.put<{ error: string }>(
      path(me.data.user.id),
      { limited: true, instanceIds: [testInstanceId] }
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toBe(
      "Server access limits do not apply to administrators"
    );
  });

  it("answers 400 for an id that names no instance, and changes nothing", async () => {
    const res = await adminClient.put<{ error: string; details?: string }>(
      path(other.id),
      { limited: true, instanceIds: [testInstanceId, "no-such-instance"] }
    );
    expect(res.status).toBe(400);
    expect(res.data.error).toBe("Invalid instance IDs");
    expect(res.data.details).toBe("no-such-instance");

    const after = await adminClient.get<GetUserInstanceAccessResponse>(
      path(other.id)
    );
    expect(after.data).toEqual({ limited: false, instanceIds: [] });
  });

  it("answers 400 naming the path for a body that is not { limited, instanceIds }", async () => {
    const res = await adminClient.put<{
      error: string;
      issues?: Array<{ path: string }>;
    }>(path(other.id), { limited: "yes", instanceIds: [] });
    expect(res.status).toBe(400);
    expect(res.data.issues?.map((i) => i.path)).toEqual(["limited"]);

    const notList = await adminClient.put<{
      issues?: Array<{ path: string }>;
    }>(path(other.id), { limited: true, instanceIds: "a" });
    expect(notList.status).toBe(400);
    expect(notList.data.issues?.map((i) => i.path)).toEqual(["instanceIds"]);
  });

  it("a limited user's scene list holds only the allowed server's scenes, and both again after the limit is lifted", async () => {
    if (!secondInstanceId) {
      throw new Error(
        "this run has no second instance: the limit has nothing to hide"
      );
    }

    // Before: the user sees both servers
    const all = await scenesListedTo(user.client);
    expect(all.status).toBe(200);
    expect(instancesOf(all.scenes)).toEqual(
      [testInstanceId, secondInstanceId].sort()
    );

    // Limited to the test instance
    const put = await adminClient.put<UpdateUserInstanceAccessResponse>(
      path(user.id),
      { limited: true, instanceIds: [testInstanceId] }
    );
    expect(put.status).toBe(200);
    expect(put.data).toEqual({ limited: true, instanceIds: [testInstanceId] });
    const get = await adminClient.get<GetUserInstanceAccessResponse>(
      path(user.id)
    );
    expect(get.data).toEqual({ limited: true, instanceIds: [testInstanceId] });

    const limited = await scenesListedTo(user.client);
    expect(limited.status).toBe(200);
    expect(instancesOf(limited.scenes)).toEqual([testInstanceId]);
    expect(limited.count).toBeGreaterThan(0);
    expect(limited.count).toBeLessThan(all.count);
    // The list's count follows the same scope
    expect(limited.count).toBe(limited.scenes.length);

    // The user's own selection cannot reach past the limit: naming only the
    // second server is refused
    const refused = await user.client.put<{ error?: string }>(
      "/api/user/stash-instances",
      { instanceIds: [secondInstanceId] }
    );
    expect(refused.status).toBe(400);
    expect(refused.data.error).toBe("Invalid instance IDs");

    // A selection saved before the limit (seeded directly: the endpoint no
    // longer takes it) falls back to the allowed server, never past it
    await prisma.userStashInstance.create({
      data: { userId: user.id, instanceId: secondInstanceId },
    });
    try {
      const selected = await scenesListedTo(user.client);
      expect(selected.status).toBe(200);
      expect(instancesOf(selected.scenes)).toEqual([testInstanceId]);
      // The user's own list of servers shows only the allowed one, and no
      // stale selection
      const own = await user.client.get<{
        selectedInstanceIds: string[];
        availableInstances: Array<{ id: string }>;
      }>("/api/user/stash-instances");
      expect(own.data.availableInstances.map((i) => i.id)).toEqual([
        testInstanceId,
      ]);
      expect(own.data.selectedInstanceIds).toEqual([]);
    } finally {
      await prisma.userStashInstance.deleteMany({ where: { userId: user.id } });
    }

    // The limit lifted: every server again; the kept ids stay for a re-grant
    const lifted = await adminClient.put<UpdateUserInstanceAccessResponse>(
      path(user.id),
      { limited: false, instanceIds: [testInstanceId] }
    );
    expect(lifted.data).toEqual({
      limited: false,
      instanceIds: [testInstanceId],
    });
    const back = await scenesListedTo(user.client);
    expect(back.count).toBe(all.count);
    expect(instancesOf(back.scenes)).toEqual(
      [testInstanceId, secondInstanceId].sort()
    );
  }, 120000);

  it("a limited user with no server sees nothing", async () => {
    const put = await adminClient.put(path(other.id), {
      limited: true,
      instanceIds: [],
    });
    expect(put.status).toBe(200);

    const res = await other.client.post<{
      error?: string;
      ready?: unknown;
      reason?: unknown;
    }>("/api/library/scenes", { filter: { page: 1, per_page: PAGE } });
    expect(res.status).toBe(503);
    expect(res.data).toMatchObject({
      error: "No Stash servers available",
      ready: false,
      reason: "noAccess",
    });

    // The client's re-check says the same, so its poll picks up a grant
    const ready = await other.client.get("/api/library/ready");
    expect(ready.status).toBe(200);
    expect(ready.data).toEqual({ ready: false, reason: "noAccess" });
  });
});
