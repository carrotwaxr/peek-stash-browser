/**
 * A scene's `vr` on the single-scene lookup (PR 11, V5; Contract 7), against
 * real SQLite.
 *
 * - The replay's VR scene and a scene without the VR tag, over HTTP, and the
 *   statements `getSceneVr` sends for the VR one (RS9). The replay's Stash
 *   names a VR tag (`synth.ts`); a live test Stash may not, so these skip in
 *   live mode.
 * - The effective tag's rules and the walk up the hierarchy on seeded rows
 *   under two made-up instances that reuse the same ids, as two Stash servers
 *   do. Every seeded row is deleted before the file ends.
 */
import type { VrProjection } from "@peek/shared-types/vr.js";
import { VR_PROJECTIONS } from "@peek/shared-types/vr.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { getSceneVr } from "../../services/SceneVrService.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { recordStatements } from "../helpers/statementRecorder.js";
import {
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;
const REPLAY = process.env.STASH_REPLAY === "1";

interface LookupResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      instanceId: string;
      vr?: { projection: VrProjection; source: string } | null;
    }>;
  };
}

describe("A scene's vr on the lookup (replay data)", () => {
  let testInstanceId: string;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    testInstanceId = await selectTestInstanceOnly();
  });

  afterAll(restoreInstanceSelection);

  async function lookup(id: string) {
    const response = await adminClient.post<LookupResponse>(
      "/api/library/scenes",
      { ids: [`${id}:${testInstanceId}`] }
    );
    expect(response.ok).toBe(true);
    expect(response.data.findScenes.scenes).toHaveLength(1);
    return must(response.data.findScenes.scenes[0]);
  }

  it.skipIf(!REPLAY)("the VR scene answers a projection", async () => {
    const scene = await lookup(TEST_ENTITIES.vrScene);

    const vr = must(scene.vr);
    expect(VR_PROJECTIONS).toContain(vr.projection);
    expect(["tag", "filename", "shape", "default"]).toContain(vr.source);
  });

  it.skipIf(!REPLAY)("a scene without the VR tag answers vr null", async () => {
    const scene = await lookup(TEST_ENTITIES.nonVrScene);

    expect(scene.vr).toBeNull();
  });

  it("a list carries no vr", async () => {
    const response = await adminClient.post<LookupResponse>(
      "/api/library/scenes",
      { filter: { page: 1, per_page: 10 } }
    );

    expect(response.ok).toBe(true);
    expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    for (const scene of response.data.findScenes.scenes) {
      expect(scene).not.toHaveProperty("vr");
    }
  });

  it.skipIf(!REPLAY)(
    "the VR check is one recursive statement by primary key, then one for the projection's hints",
    async () => {
      const recorder = recordStatements();
      let vr: Awaited<ReturnType<typeof getSceneVr>>;
      try {
        vr = await getSceneVr(TEST_ENTITIES.vrScene, testInstanceId);
      } finally {
        recorder.restore();
      }

      expect(vr).not.toBeNull();
      const [walk, hints, ...rest] = recorder.statements;
      expect(rest).toEqual([]);
      expect(must(walk).sql).toMatch(/WITH RECURSIVE/);
      // Every value bound: the scene and its instance, never the tag's name
      expect(must(walk).sql).not.toContain(TEST_ENTITIES.vrScene);
      expect(must(walk).params).toContain(TEST_ENTITIES.vrScene);
      expect(must(walk).params).toContain(testInstanceId);
      expect(must(hints).sql).not.toMatch(/WITH RECURSIVE/);
      expect(must(hints).params).toEqual([
        TEST_ENTITIES.vrScene,
        testInstanceId,
      ]);
    }
  );
});

/**
 * Seeded under two made-up instances, A and B, reusing ids:
 * - A: tags 9 and 10 both named "VR"; 20 "VR child" under 9, 21 "VR
 *   grandchild" under 20; 30 and 31 parents of each other (a cycle); 40
 *   "Old VR" (soft-deleted); 50 "MKX200" under 9 (soft-deleted); 51
 *   "MKX200" under 9 (live); 60 "Plain".
 * - B: 9 named "Other", 60 named "VR".
 * - Scenes on A: 101 holds 10 only, 102 holds 9, 103 holds 21, 104 holds 30,
 *   105 holds the dead 50 only, 106 holds 9 and the dead 50, 107 holds 9
 *   and 51, 108 holds B's tag 9 (a junction row naming the other instance),
 *   109 holds 60.
 * - Scenes on B: 102 holds B's 9.
 */
describeWithDb("The effective VR tag and the walk up (seeded)", () => {
  const A = "vr5-a";
  const B = "vr5-b";
  const DELETED = new Date("2026-01-01T00:00:00Z");

  async function removeRows(): Promise<void> {
    await prisma.sceneTag.deleteMany({
      where: { sceneInstanceId: { in: [A, B] } },
    });
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.stashTag.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.stashInstance.deleteMany({ where: { id: { in: [A, B] } } });
  }

  async function setVrTag(
    instance: string,
    vrTagId: string | null,
    stashVrTag: string | null
  ): Promise<void> {
    await prisma.stashInstance.update({
      where: { id: instance },
      data: { vrTagId, stashVrTag },
    });
  }

  const tag = (
    id: string,
    instance: string,
    name: string,
    parents: string[] = [],
    deletedAt: Date | null = null
  ) => ({
    id,
    stashInstanceId: instance,
    name,
    parentIds: JSON.stringify(parents),
    deletedAt,
  });

  const SCENE_TAGS: Array<[string, string, string, string]> = [
    ["101", A, "10", A],
    ["102", A, "9", A],
    ["103", A, "21", A],
    ["104", A, "30", A],
    ["105", A, "50", A],
    ["106", A, "9", A],
    ["106", A, "50", A],
    ["107", A, "9", A],
    ["107", A, "51", A],
    ["108", A, "9", B],
    ["109", A, "60", A],
    ["102", B, "9", B],
  ];

  beforeAll(async () => {
    await removeRows();
    for (const [index, id] of [A, B].entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: "http://127.0.0.1:9/graphql",
          apiKey: "fixture-key",
          // Never synced or shown: only getSceneVr reads it
          enabled: false,
          priority: 950 + index,
        },
      });
    }
    await prisma.stashTag.createMany({
      data: [
        tag("9", A, "VR"),
        tag("10", A, "VR"),
        tag("20", A, "VR child", ["9"]),
        tag("21", A, "VR grandchild", ["20"]),
        tag("30", A, "Loop one", ["31"]),
        tag("31", A, "Loop two", ["30"]),
        tag("40", A, "Old VR", [], DELETED),
        tag("50", A, "MKX200", ["9"], DELETED),
        tag("51", A, "MKX200", ["9"]),
        tag("60", A, "Plain"),
        tag("9", B, "Other"),
        tag("60", B, "VR"),
      ],
    });
    const scenes = new Set(
      SCENE_TAGS.map(([id, instance]) => `${id} ${instance}`)
    );
    await prisma.stashScene.createMany({
      data: [...scenes].map((key) => {
        const [id, instance] = key.split(" ") as [string, string];
        return { id, stashInstanceId: instance, title: `VR5 ${key}` };
      }),
    });
    await prisma.sceneTag.createMany({
      data: SCENE_TAGS.map(
        ([sceneId, sceneInstanceId, tagId, tagInstanceId]) => ({
          sceneId,
          sceneInstanceId,
          tagId,
          tagInstanceId,
        })
      ),
    });
  });

  afterAll(async () => {
    await removeRows();
  });

  it("an instance with no VR tag gives null", async () => {
    await setVrTag(A, null, null);

    await expect(getSceneVr("102", A)).resolves.toBeNull();
  });

  it("Stash's tag by exact name, the lowest id as a number: 9 beats 10", async () => {
    await setVrTag(A, null, "VR");

    await expect(getSceneVr("102", A)).resolves.not.toBeNull();
    // 10 shares the name but is not the effective tag ("10" < "9" as text)
    await expect(getSceneVr("101", A)).resolves.toBeNull();
  });

  it("the name matches exactly", async () => {
    await setVrTag(A, null, "vr");

    await expect(getSceneVr("102", A)).resolves.toBeNull();
  });

  it("a live override wins over Stash's tag", async () => {
    await setVrTag(A, "10", "VR");

    await expect(getSceneVr("101", A)).resolves.not.toBeNull();
    await expect(getSceneVr("102", A)).resolves.toBeNull();
  });

  it("a soft-deleted override falls back to Stash's tag", async () => {
    await setVrTag(A, "40", "VR");

    await expect(getSceneVr("102", A)).resolves.not.toBeNull();
    await expect(getSceneVr("101", A)).resolves.toBeNull();
  });

  it("an override naming no tag on the instance, with no Stash tag, gives null", async () => {
    await setVrTag(A, "999", null);

    await expect(getSceneVr("102", A)).resolves.toBeNull();
  });

  it("a scene holding a descendant of the tag is VR", async () => {
    await setVrTag(A, "9", null);

    await expect(getSceneVr("103", A)).resolves.not.toBeNull();
  });

  it("a cycle in the hierarchy ends, and a scene outside the tag's tree gets null", async () => {
    await setVrTag(A, "9", null);

    await expect(getSceneVr("104", A)).resolves.toBeNull();
    await expect(getSceneVr("109", A)).resolves.toBeNull();
  });

  it("a soft-deleted tag on the scene neither makes it VR nor feeds the projection", async () => {
    await setVrTag(A, "9", null);

    // 50 is under 9 but soft-deleted
    await expect(getSceneVr("105", A)).resolves.toBeNull();
    // 106 is VR through 9; the dead "MKX200" does not set the projection
    await expect(getSceneVr("106", A)).resolves.toEqual({
      projection: "180_LR",
      source: "default",
    });
    // 107's live "MKX200" does
    await expect(getSceneVr("107", A)).resolves.toEqual({
      projection: "FISHEYE_200_LR",
      source: "tag",
    });
  });

  it("the same tag id on another instance does not count", async () => {
    await setVrTag(A, "9", null);
    await setVrTag(B, null, "VR");

    // A junction row naming B's tag 9 on A's scene
    await expect(getSceneVr("108", A)).resolves.toBeNull();
    // B's scene 102 holds B's 9 ("Other"); B's VR tag is its 60
    await expect(getSceneVr("102", B)).resolves.toBeNull();
    // A's own 102 is VR
    await expect(getSceneVr("102", A)).resolves.not.toBeNull();
  });
});
