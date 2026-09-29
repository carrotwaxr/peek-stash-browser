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

  it("a scene's clips leave out a disabled instance's and a hidden scene's", async () => {
    const own = await reader.client.get<{ clips: ListedClip[] }>(
      `/api/scenes/${FX_ID.SAME}/clips?includeUngenerated=true&instanceId=${FX.A}`
    );
    expect(own.ok).toBe(true);
    expect(own.data.clips.map(keyOf)).toEqual([`${FX_ID.SAME}@${FX.A}`]);

    const onDisabled = await reader.client.get<{ clips: ListedClip[] }>(
      `/api/scenes/${FX_ID.ON_OFF}/clips?includeUngenerated=true`
    );
    expect(onDisabled.ok).toBe(true);
    expect(onDisabled.data.clips).toEqual([]);

    const ofHidden = await reader.client.get<{ clips: ListedClip[] }>(
      `/api/scenes/${FX_ID.GLOBAL}/clips?includeUngenerated=true`
    );
    expect(ofHidden.ok).toBe(true);
    expect(ofHidden.data.clips).toEqual([]);
  });
});
