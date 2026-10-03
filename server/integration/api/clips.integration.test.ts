/**
 * The clip endpoints over HTTP: the Clips page's list, a clip by id and a
 * scene's clips show only what the reader may see, on the instances they
 * see (invariants 3 and 11), and each clip carries its instance.
 *
 * The reader hides the fixture defaults (see helpers/accessFixture.ts),
 * GLOBAL's scene on every instance among them, so clip CLIP_OF_GLOBAL (of
 * that scene on A) is hidden with it. This file adds clip ON_OFF on the
 * disabled instance, of its scene ON_OFF. The fixture's clips have no
 * generated preview, so the list asks for isGenerated=false and the scene
 * page for includeUngenerated=true.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { objectContaining } from "../../tests/helpers/matchers.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFixtureDefaults,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { expectRefused } from "../helpers/refused.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient } from "../helpers/testClient.js";

interface ListedClip {
  id: string;
  instanceId?: string;
  scene: { id: string; instanceId?: string };
}

const keyOf = (clip: ListedClip) => `${clip.id}@${String(clip.instanceId)}`;

describe("Clip endpoints (integration)", () => {
  let reader: { id: number; client: TestClient };

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    await prisma.stashClip.create({
      data: {
        id: FX_ID.ON_OFF,
        stashInstanceId: FX.OFF,
        sceneId: FX_ID.ON_OFF,
        sceneInstanceId: FX.OFF,
        seconds: 1,
      },
    });
    reader = await createApiUser("access_it_clip_reader", "access_it_pass_1");
    await hideFixtureDefaults(reader.id);
  }, 60000);

  // Also deletes the reader (named access_it_*) with their rows
  afterAll(async () => {
    await clearAccessFixture();
  }, 60000);

  it("the Clips page lists the clips of the reader's enabled instances, each with its instance", async () => {
    const response = await reader.client.get<{ clips: ListedClip[] }>(
      "/api/clips?isGenerated=false&perPage=250"
    );

    expect(response.ok).toBe(true);
    const listed = response.data.clips.map(keyOf);
    expect(listed).toContain(`${FX_ID.SAME}@${FX.A}`);
    // The disabled instance's clip, and the clip of the hidden scene
    const unseen = new Set<string>([FX_ID.ON_OFF, FX_ID.CLIP_OF_GLOBAL]);
    expect(response.data.clips.filter((c) => unseen.has(c.id))).toEqual([]);
    const same = response.data.clips.find((c) => c.id === FX_ID.SAME);
    expect(same?.scene).toEqual(
      objectContaining({ id: FX_ID.SAME, instanceId: FX.A })
    );
  });

  it("POST /api/library/clips lists what the GET with the same filter lists, with its total", async () => {
    const posted = await reader.client.post<{
      clips: ListedClip[];
      total: number;
      perPage: number;
    }>("/api/library/clips", {
      filter: { per_page: 250 },
      clip_filter: { is_generated: false },
    });
    const got = await reader.client.get<{ clips: ListedClip[] }>(
      "/api/clips?isGenerated=false&perPage=250"
    );

    expect(posted.ok).toBe(true);
    expect(posted.data.perPage).toBe(250);
    expect(posted.data.clips.map(keyOf)).toEqual(got.data.clips.map(keyOf));
    expect(posted.data.total).toBe(posted.data.clips.length);
    // The hidden scene's clip and the disabled instance's never list
    const unseen = new Set<string>([FX_ID.ON_OFF, FX_ID.CLIP_OF_GLOBAL]);
    expect(posted.data.clips.filter((c) => unseen.has(c.id))).toEqual([]);
  });

  it("POST /api/library/clips refuses the GET's parameter names and top-level ids", async () => {
    const response = await reader.client.post("/api/library/clips", {
      ids: ["1"],
      clip_filter: { isGenerated: true },
    });

    expectRefused(response, ["ids", "clip_filter.isGenerated"]);
  });

  it("the disabled instance's clip is not listed even when asked for by instance", async () => {
    const response = await reader.client.get<{ clips: ListedClip[] }>(
      `/api/clips?isGenerated=false&perPage=250&instanceId=${FX.OFF}`
    );

    expect(response.ok).toBe(true);
    expect(response.data.clips).toEqual([]);
  });

  it("a clip opens by id only while the reader can see it", async () => {
    const visible = await reader.client.get<ListedClip>(
      `/api/clips/${FX_ID.SAME}`
    );
    expect(visible.status).toBe(200);
    expect(keyOf(visible.data)).toBe(`${FX_ID.SAME}@${FX.A}`);

    const onDisabled = await reader.client.get(`/api/clips/${FX_ID.ON_OFF}`);
    expect(onDisabled.status).toBe(404);

    const ofHiddenScene = await reader.client.get(
      `/api/clips/${FX_ID.CLIP_OF_GLOBAL}`
    );
    expect(ofHiddenScene.status).toBe(404);
  });

  it("GET /api/clips/:id with a bare id held by two instances answers the ambiguous 400 with matches", async () => {
    // Clip SAME is on A only; the same id on B, whose scene SAME exists too
    await prisma.stashClip.create({
      data: {
        id: FX_ID.SAME,
        stashInstanceId: FX.B,
        sceneId: FX_ID.SAME,
        sceneInstanceId: FX.B,
        seconds: 1,
      },
    });
    try {
      const response = await adminClient.get<{
        error: string;
        matches: { id: string; instanceId: string }[];
      }>(`/api/clips/${FX_ID.SAME}`);

      expect(response.status).toBe(400);
      expect(response.data.error).toBe("Ambiguous lookup");
      expect(
        response.data.matches
          .map((m) => `${m.id}@${m.instanceId}`)
          .sort((a, b) => a.localeCompare(b))
      ).toEqual([`${FX_ID.SAME}@${FX.A}`, `${FX_ID.SAME}@${FX.B}`]);
    } finally {
      await prisma.stashClip.delete({
        where: {
          id_stashInstanceId: { id: FX_ID.SAME, stashInstanceId: FX.B },
        },
      });
    }
  });

  it("GET /api/clips/<id>:<instance> answers that instance's clip", async () => {
    const own = await reader.client.get<ListedClip>(
      `/api/clips/${FX_ID.SAME}:${FX.A}`
    );
    expect(own.status).toBe(200);
    expect(keyOf(own.data)).toBe(`${FX_ID.SAME}@${FX.A}`);

    // The id on an instance that holds no such clip
    const other = await reader.client.get(`/api/clips/${FX_ID.SAME}:${FX.B}`);
    expect(other.status).toBe(404);

    const malformed = await reader.client.get(`/api/clips/${FX_ID.SAME}:a%20b`);
    expect(malformed.status).toBe(400);
  });

  it("GET /api/scenes/:id/clips without instanceId answers 400", async () => {
    const response = await reader.client.get(
      `/api/scenes/${FX_ID.SAME}/clips?includeUngenerated=true`
    );
    expect(response.status).toBe(400);
  });

  it("a scene's clips leave out a disabled instance's and a hidden scene's", async () => {
    const own = await reader.client.get<{ clips: ListedClip[] }>(
      `/api/scenes/${FX_ID.SAME}/clips?includeUngenerated=true&instanceId=${FX.A}`
    );
    expect(own.ok).toBe(true);
    expect(own.data.clips.map(keyOf)).toEqual([`${FX_ID.SAME}@${FX.A}`]);

    const onDisabled = await reader.client.get<{ clips: ListedClip[] }>(
      `/api/scenes/${FX_ID.ON_OFF}/clips?includeUngenerated=true&instanceId=${FX.OFF}`
    );
    expect(onDisabled.ok).toBe(true);
    expect(onDisabled.data.clips).toEqual([]);

    const ofHidden = await reader.client.get<{ clips: ListedClip[] }>(
      `/api/scenes/${FX_ID.GLOBAL}/clips?includeUngenerated=true&instanceId=${FX.A}`
    );
    expect(ofHidden.ok).toBe(true);
    expect(ofHidden.data.clips).toEqual([]);
  });
});
