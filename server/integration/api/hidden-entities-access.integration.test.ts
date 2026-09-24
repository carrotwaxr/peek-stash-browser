/**
 * Hiding and the Hidden Items list respect content restrictions (HTTP).
 *
 * A user may hide only an entity they can see (a repeat hide succeeds without
 * writing), and the Hidden Items list returns an entity's cached data only
 * when the user could see it if they had hidden nothing. Any other hidden row
 * comes back as its type, id and instance with restricted: true and no
 * entity, so its owner can still unhide it.
 *
 * The hider is a USER on the test instance and the access fixture's A and B
 * (see helpers/accessFixture.ts). The restrictable tag is excluded on the test
 * instance, so the tag is restricted directly and its scenes through the
 * cascade, and gallery SAME is excluded on A only. The rules go in through
 * prisma and a recompute in this process, as in the restriction integration
 * tests.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import {
  TestClient,
  adminClient,
  selectAllInstances,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

interface HiddenItem {
  id: number;
  entityType: string;
  entityId: string;
  instanceId: string;
  restricted?: boolean;
  entity: { title?: string | null; name?: string | null } | null;
}

describe("Hidden items and content restrictions (integration)", () => {
  let hider: { id: number; client: TestClient };
  let testInstanceId: string;
  const restrictedTagId = TEST_ENTITIES.restrictableTag;
  let restrictedTagName: string;
  let restrictedScene: { id: string; title: string };
  let visibleScene: { id: string; title: string };
  let otherVisibleScene: { id: string; title: string };

  async function list(entityType?: string): Promise<HiddenItem[]> {
    const query = entityType ? `?entityType=${entityType}` : "";
    const response = await hider.client.get<{ hiddenEntities: HiddenItem[] }>(
      `/api/user/hidden-entities${query}`
    );
    expect(response.status).toBe(200);
    return response.data.hiddenEntities;
  }

  function hiddenRowCount(): Promise<number> {
    return prisma.userHiddenEntity.count({ where: { userId: hider.id } });
  }

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    testInstanceId = await selectTestInstanceOnly();
    await seedAccessFixture();
    hider = await createApiUser("access_it_hider", "access_it_pass_1");

    await prisma.userStashInstance.deleteMany({ where: { userId: hider.id } });
    await prisma.userStashInstance.createMany({
      data: [testInstanceId, FX.A, FX.B].map((instanceId) => ({
        userId: hider.id,
        instanceId,
      })),
    });
    await prisma.userContentRestriction.deleteMany({
      where: { userId: hider.id },
    });
    await prisma.userContentRestriction.createMany({
      data: [
        {
          userId: hider.id,
          entityType: "tags",
          mode: "EXCLUDE",
          entityIds: JSON.stringify([`${restrictedTagId}:${testInstanceId}`]),
          restrictEmpty: false,
        },
        {
          userId: hider.id,
          entityType: "galleries",
          mode: "EXCLUDE",
          entityIds: JSON.stringify([`${FX_ID.SAME}:${FX.A}`]),
          restrictEmpty: false,
        },
      ],
    });
    await exclusionComputationService.recomputeForUser(hider.id);

    const tag = await prisma.stashTag.findFirst({
      where: { id: restrictedTagId, stashInstanceId: testInstanceId },
    });
    if (!tag?.name) throw new Error("restrictableTag is not in the cache");
    restrictedTagName = tag.name;

    const tagged = await prisma.sceneTag.findFirst({
      where: {
        tagId: restrictedTagId,
        tagInstanceId: testInstanceId,
        sceneInstanceId: testInstanceId,
        scene: { deletedAt: null, title: { not: null } },
      },
      include: { scene: true },
    });
    if (!tagged?.scene.title) {
      throw new Error("No titled scene carries restrictableTag");
    }
    restrictedScene = { id: tagged.sceneId, title: tagged.scene.title };

    // A titled scene on the test instance with no exclusion row: visible
    const excluded = await prisma.userExcludedEntity.findMany({
      where: { userId: hider.id, entityType: "scene" },
      select: { entityId: true, instanceId: true },
    });
    const excludedKeys = new Set(
      excluded.map((r) => `${r.entityId}\0${r.instanceId}`)
    );
    const scenes = await prisma.stashScene.findMany({
      where: {
        stashInstanceId: testInstanceId,
        deletedAt: null,
        title: { not: null },
      },
      select: { id: true, title: true },
      orderBy: { id: "asc" },
    });
    const visible = scenes.filter(
      (s) =>
        s.title &&
        !excludedKeys.has(`${s.id}\0${testInstanceId}`) &&
        !excludedKeys.has(`${s.id}\0`)
    );
    if (!visible[0]?.title || !visible[1]?.title) {
      throw new Error("Fewer than two visible titled scenes");
    }
    visibleScene = { id: visible[0].id, title: visible[0].title };
    otherVisibleScene = { id: visible[1].id, title: visible[1].title };
  }, 120000);

  afterEach(async () => {
    await prisma.userHiddenEntity.deleteMany({ where: { userId: hider.id } });
    await exclusionComputationService.recomputeForUser(hider.id);
  }, 60000);

  afterAll(async () => {
    if (hider) {
      await adminClient.delete(`/api/user/${hider.id}`);
    }
    await clearAccessFixture();
    await selectAllInstances();
  }, 60000);

  it("refuses to hide a restricted entity and writes nothing", async () => {
    const response = await hider.client.post("/api/user/hidden-entities", {
      entityType: "tag",
      entityId: restrictedTagId,
    });

    expect(response.status).toBe(404);
    expect(response.data).toEqual({ error: "Not found" });
    expect(await hiddenRowCount()).toBe(0);

    const items = await list();
    expect(items).toEqual([]);
    expect(JSON.stringify(items)).not.toContain(restrictedTagName);
  });

  it("refuses a restricted entity named with its instance", async () => {
    const response = await hider.client.post("/api/user/hidden-entities", {
      entityType: "tag",
      entityId: restrictedTagId,
      instanceId: testInstanceId,
    });

    expect(response.status).toBe(404);
    expect(await hiddenRowCount()).toBe(0);
  });

  it("refuses to hide an entity restricted through a cascade", async () => {
    const response = await hider.client.post("/api/user/hidden-entities", {
      entityType: "scene",
      entityId: restrictedScene.id,
    });

    expect(response.status).toBe(404);
    expect(response.data).toEqual({ error: "Not found" });
    expect(await hiddenRowCount()).toBe(0);
  });

  it("hides a visible entity, lists its details, and a repeat hide writes nothing new", async () => {
    const body = { entityType: "scene", entityId: visibleScene.id };

    const first = await hider.client.post("/api/user/hidden-entities", body);
    expect(first.status).toBe(200);
    const second = await hider.client.post("/api/user/hidden-entities", body);
    expect(second.status).toBe(200);
    expect(await hiddenRowCount()).toBe(1);

    const items = await list("scene");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      entityType: "scene",
      entityId: visibleScene.id,
      restricted: false,
    });
    expect(items[0].entity?.title).toBe(visibleScene.title);
  });

  it("a repeat hide without an instance finds a hide stored for one instance", async () => {
    const first = await hider.client.post("/api/user/hidden-entities", {
      entityType: "scene",
      entityId: visibleScene.id,
      instanceId: testInstanceId,
    });
    expect(first.status).toBe(200);

    const second = await hider.client.post("/api/user/hidden-entities", {
      entityType: "scene",
      entityId: visibleScene.id,
    });
    expect(second.status).toBe(200);
    expect(await hiddenRowCount()).toBe(1);
  });

  it("a bulk hide with one restricted target writes nothing and names it", async () => {
    const response = await hider.client.post("/api/user/hidden-entities/bulk", {
      entities: [
        { entityType: "scene", entityId: visibleScene.id },
        { entityType: "tag", entityId: restrictedTagId },
      ],
    });

    expect(response.status).toBe(404);
    expect(response.data).toEqual({ error: "entities[1]: Not found" });
    expect(await hiddenRowCount()).toBe(0);
  });

  it("a bulk hide takes targets with and without an instance, and repeats cleanly", async () => {
    const entities = [
      {
        entityType: "scene",
        entityId: visibleScene.id,
        instanceId: testInstanceId,
      },
      { entityType: "scene", entityId: otherVisibleScene.id },
    ];

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await hider.client.post<{
        successCount: number;
        failCount: number;
      }>("/api/user/hidden-entities/bulk", { entities });
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({ successCount: 2, failCount: 0 });
    }
    expect(await hiddenRowCount()).toBe(2);

    const titles = (await list("scene")).map((i) => i.entity?.title).sort();
    expect(titles).toEqual(
      [visibleScene.title, otherVisibleScene.title].sort()
    );
  });

  it("lists an existing hide of a restricted entity without its details", async () => {
    // Rows stored before hiding checked visibility; the recompute is the one
    // every upgrade and sync runs
    await hideFor(hider.id, "tag", restrictedTagId, testInstanceId);
    await hideFor(hider.id, "scene", restrictedScene.id, testInstanceId);
    await exclusionComputationService.recomputeForUser(hider.id);

    const items = await list();
    expect(
      items
        .map((i) => ({
          entityType: i.entityType,
          entityId: i.entityId,
          instanceId: i.instanceId,
          restricted: i.restricted,
          entity: i.entity,
        }))
        .sort((a, b) => a.entityType.localeCompare(b.entityType))
    ).toEqual([
      {
        entityType: "scene",
        entityId: restrictedScene.id,
        instanceId: testInstanceId,
        restricted: true,
        entity: null,
      },
      {
        entityType: "tag",
        entityId: restrictedTagId,
        instanceId: testInstanceId,
        restricted: true,
        entity: null,
      },
    ]);
    const text = JSON.stringify(items);
    expect(text).not.toContain(restrictedTagName);
    expect(text).not.toContain(restrictedScene.title);

    // The owner can still remove the row
    const unhide = await hider.client.delete(
      `/api/user/hidden-entities/tag/${restrictedTagId}?instanceId=${testInstanceId}`
    );
    expect(unhide.status).toBe(200);
    expect(
      await prisma.userHiddenEntity.count({
        where: { userId: hider.id, entityType: "tag" },
      })
    ).toBe(0);
  });

  it("a hide stored for every instance shows the copy the user may see", async () => {
    // Gallery SAME is restricted on A and visible on B
    await hideFor(hider.id, "gallery", FX_ID.SAME, "");
    await exclusionComputationService.recomputeForUser(hider.id);

    const items = await list("gallery");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      entityId: FX_ID.SAME,
      instanceId: "",
      restricted: false,
    });
    expect(items[0].entity?.title).toBe(`B-${FX_ID.SAME}`);
    expect(JSON.stringify(items)).not.toContain(`A-${FX_ID.SAME}`);
  });
});
