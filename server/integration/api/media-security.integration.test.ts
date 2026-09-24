/**
 * Media paths in API responses (item 1) and media routes behind the session
 * (item 2).
 *
 * Scene responses must carry no Stash API key and no Stash host in their
 * stream lists or media paths: the browser reaches Stash only through Peek's
 * proxies. Admins still receive stashUrl (the View in Stash link), which
 * holds the host by design, so the host check covers only sceneStreams and
 * paths.
 *
 * Every media route needs a Peek session (or, on the direct stream, a signed
 * external-player link), accepts only Stash's media shapes, and answers 404
 * for an entity the user cannot see.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { TEST_CONFIG } from "../helpers/config.js";
import {
  TestClient,
  adminClient,
  selectAllInstances,
  selectTestInstanceForClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

interface FindScenesResponse {
  findScenes: {
    count: number;
    scenes: Array<{
      id: string;
      sceneStreams?: Array<{ url: string }>;
      paths?: Record<string, string | null>;
    }>;
  };
}

const MEDIA_USER = { username: "media_it_user", password: "media_it_pass_123" };

/** Log in with raw fetch and return the `token=` cookie for media requests. */
async function loginCookie(
  username: string,
  password: string
): Promise<string> {
  const res = await fetch(`${TEST_CONFIG.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const token = res.headers.get("set-cookie")?.match(/token=([^;]+)/)?.[1];
  await res.body?.cancel();
  if (!res.ok || !token) {
    throw new Error(`Login failed for ${username}: ${res.status}`);
  }
  return `token=${token}`;
}

/** GET a media URL with raw fetch; only the status and content type matter. */
async function media(
  path: string,
  init: { cookie?: string; range?: string } = {}
): Promise<{ status: number; contentType: string }> {
  const headers: Record<string, string> = {};
  if (init.cookie) headers["Cookie"] = init.cookie;
  if (init.range) headers["Range"] = init.range;
  const res = await fetch(`${TEST_CONFIG.baseUrl}${path}`, { headers });
  const result = {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
  };
  await res.body?.cancel();
  return result;
}

describe("media security", () => {
  let instanceId: string;
  let adminCookie: string;
  let mediaUserId: number;
  let mediaUserClient: TestClient;
  let mediaUserCookie: string;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    instanceId = await selectTestInstanceOnly();
    adminCookie = await loginCookie(TEST_ADMIN.username, TEST_ADMIN.password);

    // A fresh media_it_user; a leftover from an interrupted run is replaced
    // because its password may have been reset at the end of that run
    const users = await adminClient.get<{
      users: Array<{ id: number; username: string }>;
    }>("/api/user/all");
    const leftover = users.data.users?.find(
      (u) => u.username === MEDIA_USER.username
    );
    if (leftover) {
      await adminClient.delete(`/api/user/${leftover.id}`);
    }
    const created = await adminClient.post<{
      success: boolean;
      user: { id: number; username: string };
    }>("/api/user/create", { ...MEDIA_USER, role: "USER" });
    if (!created.ok || !created.data.user) {
      throw new Error(`Failed to create ${MEDIA_USER.username}`);
    }
    mediaUserId = created.data.user.id;

    mediaUserClient = new TestClient();
    await mediaUserClient.login(MEDIA_USER.username, MEDIA_USER.password);
    await selectTestInstanceForClient(mediaUserClient);
    mediaUserCookie = await loginCookie(
      MEDIA_USER.username,
      MEDIA_USER.password
    );
  }, 30_000);

  afterAll(async () => {
    await selectAllInstances();
    if (mediaUserId) {
      await adminClient.delete(`/api/user/${mediaUserId}`);
    }
  });

  it("scene list responses carry no API key and no Stash host in stream or media paths", async () => {
    const response = await adminClient.post<FindScenesResponse>(
      "/api/library/scenes",
      { filter: { per_page: 50 } }
    );

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.data)).not.toContain("apikey");

    const stashHost = new URL(must(process.env.STASH_URL, "STASH_URL")).host;
    for (const scene of response.data.findScenes.scenes) {
      for (const stream of scene.sceneStreams ?? []) {
        expect(stream.url).not.toContain(stashHost);
      }
      for (const value of Object.values(scene.paths ?? {})) {
        if (value) expect(value).not.toContain(stashHost);
      }
    }
  });

  describe("media routes need a session", () => {
    const graphqlViaProxy =
      "/api/proxy/stash?path=/graphql%3Fquery%3D%7Bversion%7Bversion%7D%7D";
    const traversalViaStream =
      "/api/scene/1/proxy-stream/..%2F..%2Fgraphql%3Fquery%3D%7Bversion%7Bversion%7D%7D";

    it("anonymous GraphQL through the media proxy returns 401", async () => {
      const res = await media(graphqlViaProxy);
      expect(res.status).toBe(401);
    });

    it("the same GraphQL request with a session returns 400", async () => {
      const res = await media(graphqlViaProxy, { cookie: adminCookie });
      expect(res.status).toBe(400);
    });

    it("anonymous ..%2F traversal on the stream route returns 401", async () => {
      const res = await media(traversalViaStream);
      expect(res.status).toBe(401);
    });

    it("the same traversal with a session returns 400", async () => {
      const res = await media(traversalViaStream, { cookie: adminCookie });
      expect(res.status).toBe(400);
    });

    it("anonymous stream playlist, caption and preview requests return 401", async () => {
      const id = TEST_ENTITIES.sceneWithRelations;
      const q = `instanceId=${encodeURIComponent(instanceId)}`;
      expect(
        (await media(`/api/scene/${id}/proxy-stream/stream.m3u8?${q}`)).status
      ).toBe(401);
      expect(
        (await media(`/api/scene/${id}/caption?lang=en&type=srt&${q}`)).status
      ).toBe(401);
      expect((await media(`/api/proxy/scene/${id}/preview`)).status).toBe(401);
      expect(
        (await media(`/api/proxy/stash?path=%2Fscene%2F${id}%2Fscreenshot`))
          .status
      ).toBe(401);
    });
  });

  describe("hidden entities", () => {
    const id = TEST_ENTITIES.sceneWithRelations;
    let screenshotPath: string;
    let streamPath: string;

    beforeAll(async () => {
      const q = `instanceId=${encodeURIComponent(instanceId)}`;
      screenshotPath = `/api/proxy/stash?path=%2Fscene%2F${id}%2Fscreenshot&${q}`;
      streamPath = `/api/scene/${id}/proxy-stream/stream?${q}`;

      const hide = await mediaUserClient.post("/api/user/hidden-entities", {
        entityType: "scene",
        entityId: id,
        instanceId,
      });
      expect(hide.status).toBe(200);
    }, 30_000);

    it("a scene the user has hidden returns 404 on screenshot and stream", async () => {
      expect(
        (await media(screenshotPath, { cookie: mediaUserCookie })).status
      ).toBe(404);
      expect(
        (
          await media(streamPath, {
            cookie: mediaUserCookie,
            range: "bytes=0-1023",
          })
        ).status
      ).toBe(404);

      // The admin has not hidden it
      expect(
        (await media(screenshotPath, { cookie: adminCookie })).status
      ).toBe(200);
      const adminStream = await media(streamPath, {
        cookie: adminCookie,
        range: "bytes=0-1023",
      });
      expect([200, 206]).toContain(adminStream.status);
    }, 30_000);
  });

  describe("external-player links", () => {
    it("an external-player link plays without a cookie, fails when tampered, and dies on password reset", async () => {
      const id = TEST_ENTITIES.sceneInGroup;
      const minted = await mediaUserClient.post<{
        url: string;
        expiresAt: string;
      }>(`/api/scene/${id}/external-player-link`, { instanceId });
      expect(minted.status).toBe(200);
      const url = minted.data.url;
      expect(url).toMatch(
        new RegExp(
          `^/api/scene/${id}/proxy-stream/stream\\?instanceId=[^&]+&uid=${mediaUserId}&exp=\\d+&sig=[A-Za-z0-9_-]{43}$`
        )
      );
      expect(new Date(minted.data.expiresAt).getTime()).toBeGreaterThan(
        Date.now() + 11 * 60 * 60 * 1000
      );

      // Cookieless playback
      const played = await media(url, { range: "bytes=0-1023" });
      expect([200, 206]).toContain(played.status);
      expect(played.contentType.startsWith("video/")).toBe(true);

      // Tampered signature
      const last = url.endsWith("A") ? "B" : "A";
      expect((await media(url.slice(0, -1) + last)).status).toBe(401);

      // Signed links do not open HLS
      expect(
        (
          await media(
            url.replace("/proxy-stream/stream?", "/proxy-stream/stream.m3u8?")
          )
        ).status
      ).toBe(401);

      // A password reset revokes it
      const reset = await adminClient.post(
        `/api/user/${mediaUserId}/reset-password`,
        { newPassword: "media_it_pass_456" }
      );
      expect(reset.status).toBe(200);
      expect((await media(url, { range: "bytes=0-1023" })).status).toBe(401);
    }, 30_000);
  });
});
