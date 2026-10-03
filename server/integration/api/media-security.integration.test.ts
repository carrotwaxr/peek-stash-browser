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
import type { SceneMediaLinkResponse } from "@peek/shared-types/api/video.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { TEST_CONFIG } from "../helpers/config.js";
import {
  TestClient,
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceForClient,
  selectTestInstanceOnly,
  setInstanceSelection,
} from "../helpers/testClient.js";

interface FindScenesResponse {
  findScenes: {
    count: number;
    scenes: Array<{
      id: string;
      sceneStreams?: Array<{ url: string }>;
      paths?: Record<string, string | null>;
      captions?: unknown[];
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

/**
 * GET (or HEAD) a media URL with raw fetch; only the status, content type
 * and length matter.
 */
async function media(
  path: string,
  init: { cookie?: string; range?: string; method?: "HEAD" } = {}
): Promise<{
  status: number;
  contentType: string;
  contentLength: string | null;
}> {
  const headers: Record<string, string> = {};
  if (init.cookie) headers["Cookie"] = init.cookie;
  if (init.range) headers["Range"] = init.range;
  const res = await fetch(`${TEST_CONFIG.baseUrl}${path}`, {
    headers,
    method: init.method ?? "GET",
  });
  const result = {
    status: res.status,
    contentType: res.headers.get("content-type") ?? "",
    contentLength: res.headers.get("content-length"),
  };
  await res.body?.cancel();
  return result;
}

/** A cast receiver's request: no cookie, the receiver's origin, the link only. */
async function receiver(
  path: string,
  init: { range?: string; method?: "GET" | "POST" } = {}
): Promise<{
  status: number;
  allowOrigin: string | null;
  allowCredentials: string | null;
  contentType: string;
  body: string;
}> {
  const headers: Record<string, string> = {
    Origin: "https://www.gstatic.com",
  };
  if (init.range) headers["Range"] = init.range;
  if (init.method === "POST") headers["Content-Type"] = "application/json";
  const res = await fetch(`${TEST_CONFIG.baseUrl}${path}`, {
    headers,
    method: init.method ?? "GET",
    ...(init.method === "POST" ? { body: JSON.stringify({}) } : {}),
  });
  const body = await res.text();
  return {
    status: res.status,
    allowOrigin: res.headers.get("access-control-allow-origin"),
    allowCredentials: res.headers.get("access-control-allow-credentials"),
    contentType: res.headers.get("content-type") ?? "",
    body,
  };
}

/** The same signed URL with one query parameter replaced, added or removed. */
function withParam(url: string, key: string, value: string | null): string {
  const u = new URL(url, "http://peek.invalid");
  if (value === null) u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  return `${u.pathname}${u.search}`;
}

/** The same signed URL for another scene (the scene id sits in the path). */
function forScene(url: string, from: string, to: string): string {
  return url.replace(`/scene/${from}/`, `/scene/${to}/`);
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
      users?: Array<{ id: number; username: string }>;
    }>("/api/user/all");
    const leftover = users.data.users?.find(
      (u) => u.username === MEDIA_USER.username
    );
    if (leftover) {
      await adminClient.delete(`/api/user/${leftover.id}`);
    }
    const created = await adminClient.post<{
      success: boolean;
      user?: { id: number; username: string };
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
    await restoreInstanceSelection();
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
        // A path Stash left null holds no host either
        expect(value ?? "").not.toContain(stashHost);
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

  describe("every media route names its instance", () => {
    it("every media route answers 400 without instanceId", async () => {
      const scene = TEST_ENTITIES.sceneWithRelations;
      const image = TEST_ENTITIES.imageWithOwnProperties;
      const paths = [
        `/api/proxy/scene/${scene}/preview`,
        `/api/proxy/scene/${scene}/webp`,
        `/api/proxy/clip/1/preview`,
        `/api/proxy/image/${image}/thumbnail`,
        `/api/proxy/stash?path=%2Fscene%2F${scene}%2Fscreenshot`,
        `/api/scene/${scene}/proxy-stream/stream.m3u8`,
        `/api/scene/${scene}/proxy-stream/stream`,
        `/api/scene/${scene}/caption?lang=en&type=srt`,
      ];

      const statuses = [];
      for (const path of paths) {
        statuses.push([
          path,
          (await media(path, { cookie: adminCookie })).status,
        ]);
      }

      expect(statuses).toEqual(paths.map((path) => [path, 400]));
    }, 30_000);
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

    it("a scene the user has hidden keeps its screenshot (Hidden Items shows it) and returns 404 on its stream", async () => {
      expect(
        (await media(screenshotPath, { cookie: mediaUserCookie })).status
      ).toBe(200);
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

  describe("HEAD probes", () => {
    // Stash answers HEAD with 405 on its media routes (the replay too), so
    // the scene card's preview probe and the image cards' type probe read
    // every file as missing unless Peek asks Stash with GET
    it.each([
      ["scene preview", "video/"],
      ["scene screenshot", "image/"],
      ["scene sprite", "image/"],
      ["scene sprite VTT", "text/vtt"],
      ["image thumbnail", "image/"],
    ])(
      "a HEAD to the %s answers 200 with its type and length",
      async (name, type) => {
        const scene = TEST_ENTITIES.sceneWithRelations;
        const image = TEST_ENTITIES.imageWithOwnProperties;
        const q = `instanceId=${encodeURIComponent(instanceId)}`;
        const paths: Record<string, string> = {
          "scene preview": `/api/proxy/scene/${scene}/preview?${q}`,
          "scene screenshot": `/api/proxy/stash?path=%2Fscene%2F${scene}%2Fscreenshot&${q}`,
          "scene sprite": `/api/proxy/stash?path=%2Fscene%2F${scene}%2Fvtt%2Fsprite&${q}`,
          "scene sprite VTT": `/api/proxy/stash?path=%2Fscene%2F${scene}%2Fvtt%2Fthumbs&${q}`,
          "image thumbnail": `/api/proxy/image/${image}/thumbnail?${q}`,
        };

        const probe = await media(must(paths[name], name), {
          cookie: adminCookie,
          method: "HEAD",
        });

        expect(probe.status).toBe(200);
        expect(probe.contentType.startsWith(type)).toBe(true);
        expect(Number(probe.contentLength)).toBeGreaterThan(1);
      }
    );
  });

  describe("a cast device's requests", () => {
    const CAST_USER = {
      username: "cast_it_user",
      password: "cast_it_pass_123",
    };
    let sceneId: string;
    let otherSceneId: string;
    let castUserId: number;
    let castClient: TestClient;
    let link: SceneMediaLinkResponse;
    let directUrl: string;
    let hlsUrl: string;
    let segmentUrl: string;
    let captionUrl: string;
    let posterUrl: string;
    let signedQuery: string;
    let otherInstanceId: string;

    beforeAll(async () => {
      const users = await adminClient.get<{
        users?: Array<{ id: number; username: string }>;
      }>("/api/user/all");
      const leftover = users.data.users?.find(
        (u) => u.username === CAST_USER.username
      );
      if (leftover) await adminClient.delete(`/api/user/${leftover.id}`);
      const created = await adminClient.post<{
        user?: { id: number };
      }>("/api/user/create", { ...CAST_USER, role: "USER" });
      if (!created.ok || !created.data.user) {
        throw new Error(`Failed to create ${CAST_USER.username}`);
      }
      castUserId = created.data.user.id;

      castClient = new TestClient();
      await castClient.login(CAST_USER.username, CAST_USER.password);
      await selectTestInstanceForClient(castClient);

      const instances = await adminClient.get<{
        instances?: Array<{ id: string }>;
      }>("/api/setup/stash-instances");
      otherInstanceId = must(
        instances.data.instances?.find((i) => i.id !== instanceId)?.id,
        "a second Stash instance"
      );

      // A scene with captions, and another one for the cross-scene checks
      const found = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        { filter: { per_page: 100 } }
      );
      const scenes = found.data.findScenes.scenes;
      sceneId = must(
        scenes.find((s) => (s.captions?.length ?? 0) > 0)?.id,
        "a scene with captions"
      );
      otherSceneId = must(
        scenes.find((s) => s.id !== sceneId)?.id,
        "a second scene"
      );

      const minted = await castClient.post<SceneMediaLinkResponse>(
        `/api/scene/${sceneId}/media-link`,
        { instanceId }
      );
      expect(minted.status).toBe(200);
      link = minted.data;
      directUrl = must(
        link.streams.find((s) => /\/proxy-stream\/stream\?/.test(s.url)),
        "the Direct stream"
      ).url;
      hlsUrl = must(
        link.streams.find((s) => /\/stream\.m3u8\?/.test(s.url)),
        "an HLS tier"
      ).url;
      captionUrl = must(link.captions[0], "a caption").url;
      posterUrl = must(link.poster, "a poster");
      signedQuery = new URL(directUrl, "http://peek.invalid").search;

      // Stash lists the first segment as a path that carries the signature
      const playlist = await receiver(hlsUrl);
      expect(playlist.status).toBe(200);
      segmentUrl = must(
        playlist.body
          .split("\n")
          .find((line) => /\/proxy-stream\/stream\.m3u8\/0\.ts/.test(line)),
        "the first segment line"
      );
    }, 60_000);

    afterAll(async () => {
      if (castUserId) await adminClient.delete(`/api/user/${castUserId}`);
    });

    it("the link alone plays the direct stream, the playlist, a segment, a caption and the poster across origins", async () => {
      const direct = await receiver(directUrl, { range: "bytes=0-1023" });
      expect(direct.status).toBe(206);
      expect(direct.allowOrigin).toBe("*");
      expect(direct.allowCredentials).toBeNull();
      expect(direct.contentType.startsWith("video/")).toBe(true);

      const playlist = await receiver(hlsUrl);
      expect(playlist.status).toBe(200);
      expect(playlist.allowOrigin).toBe("*");
      expect(playlist.allowCredentials).toBeNull();
      expect(playlist.body).toContain("#EXTM3U");
      expect(playlist.body).not.toContain("apikey");

      const segment = await receiver(segmentUrl);
      expect(segment.status).toBe(200);
      expect(segment.allowOrigin).toBe("*");
      expect(segment.allowCredentials).toBeNull();

      const caption = await receiver(captionUrl);
      expect(caption.status).toBe(200);
      expect(caption.allowOrigin).toBe("*");
      expect(caption.allowCredentials).toBeNull();
      expect(caption.body).toContain("WEBVTT");

      const poster = await receiver(posterUrl);
      expect(poster.status).toBe(200);
      expect(poster.allowOrigin).toBe("*");
      expect(poster.allowCredentials).toBeNull();
      expect(poster.contentType.startsWith("image/")).toBe(true);
    }, 30_000);

    it("a tampered scope is refused, and the link opens no other scene", async () => {
      const urls = [directUrl, hlsUrl, segmentUrl, captionUrl, posterUrl];
      for (const url of urls) {
        // Another scope, a missing scope (read as an external-player link)
        // and an empty one
        for (const scope of ["other", "", null]) {
          expect((await receiver(withParam(url, "scope", scope))).status).toBe(
            401
          );
        }
      }

      // Scene 2's stream, caption and poster with scene 1's link
      for (const url of [directUrl, hlsUrl, captionUrl, posterUrl]) {
        const res = await receiver(forScene(url, sceneId, otherSceneId), {
          range: "bytes=0-1023",
        });
        expect(res.status).toBe(401);
      }
      expect(
        (await receiver(forScene(segmentUrl, sceneId, otherSceneId))).status
      ).toBe(401);
    }, 30_000);

    it("the link opens neither the MKV nor the MP4 transcode", async () => {
      for (const file of ["stream.mkv", "stream.mp4", "stream.webm"]) {
        const url = directUrl.replace(
          "/proxy-stream/stream?",
          `/proxy-stream/${file}?`
        );
        expect((await receiver(url)).status).toBe(401);
      }
    });

    it("the link opens no other route", async () => {
      // The same scene's screenshot through the generic proxy
      const screenshot = `/api/proxy/stash?path=${encodeURIComponent(`/scene/${sceneId}/screenshot`)}&instanceId=${encodeURIComponent(instanceId)}&${signedQuery.slice(1)}`;
      expect((await receiver(screenshot)).status).toBe(401);
      expect(
        (await receiver(`/api/proxy/scene/${sceneId}/preview${signedQuery}`))
          .status
      ).toBe(401);
      expect(
        (
          await receiver(`/api/scene/${sceneId}/media-link${signedQuery}`, {
            method: "POST",
          })
        ).status
      ).toBe(401);
    });

    it("a scene the user hides answers 404 on every route the link opens, until it is shown again", async () => {
      const hide = await castClient.post("/api/user/hidden-entities", {
        entityType: "scene",
        entityId: sceneId,
        instanceId,
      });
      expect(hide.status).toBe(200);
      try {
        const answers = [];
        for (const url of [directUrl, segmentUrl, captionUrl, posterUrl]) {
          answers.push((await receiver(url, { range: "bytes=0-1023" })).status);
        }
        expect(answers).toEqual([404, 404, 404, 404]);
      } finally {
        const unhide = await castClient.delete(
          `/api/user/hidden-entities/scene/${sceneId}?instanceId=${encodeURIComponent(instanceId)}`
        );
        expect(unhide.status).toBe(200);
      }
      expect((await receiver(segmentUrl)).status).toBe(200);
    }, 30_000);

    it("narrowing the user to another instance answers 404 on the segment", async () => {
      await setInstanceSelection([otherInstanceId], castClient);
      try {
        expect((await receiver(segmentUrl)).status).toBe(404);
      } finally {
        await selectTestInstanceForClient(castClient);
      }
      expect((await receiver(segmentUrl)).status).toBe(200);
    }, 30_000);

    it("a password change revokes the link", async () => {
      const changed = await castClient.post("/api/user/change-password", {
        currentPassword: CAST_USER.password,
        newPassword: "cast_it_pass_456",
      });
      expect(changed.status).toBe(200);
      expect((await receiver(segmentUrl)).status).toBe(401);
      expect(
        (await receiver(directUrl, { range: "bytes=0-1023" })).status
      ).toBe(401);
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
