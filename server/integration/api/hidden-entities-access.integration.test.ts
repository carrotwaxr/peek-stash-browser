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
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  createApiUser,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import {
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

interface FindScenesResponse {
  findScenes: {
    count: number;
    scenes: Array<{ id: string; instanceId: string }>;
  };
}

interface FindPerformersResponse {
  findPerformers: {
    count: number;
    performers: Array<{ id: string; instanceId: string }>;
  };
}

interface HiddenItem {
  id: number;
  entityType: string;
  entityId: string;
  instanceId: string;
  restricted?: boolean;
  summary: {
    id: string;
    instanceId: string;
    name: string | null;
    imageUrl: string | null;
  } | null;
}

interface HiddenPage {
  items: HiddenItem[];
  total: number;
  counts: Record<string, number>;
}

describe("Hidden items and content restrictions (integration)", () => {
  let hider: { id: number; client: TestClient };
  let testInstanceId: string;
  const restrictedTagId = TEST_ENTITIES.restrictableTag;
  let restrictedTagName: string;
  let restrictedScene: { id: string; title: string };
  let visibleScene: { id: string; title: string };
  let otherVisibleScene: { id: string; title: string };

  async function listPage(query = ""): Promise<HiddenPage> {
    const response = await hider.client.get<HiddenPage>(
      `/api/user/hidden-entities${query}`
    );
    expect(response.status).toBe(200);
    return response.data;
  }

  async function list(entityType?: string): Promise<HiddenItem[]> {
    return (await listPage(entityType ? `?entityType=${entityType}` : ""))
      .items;
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
        pathScreenshot: { not: null },
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
    // beforeAll may have failed before it set hider
    const created = hider as typeof hider | undefined;
    if (created) {
      await adminClient.delete(`/api/user/${created.id}`);
    }
    await clearAccessFixture();
    await restoreInstanceSelection();
  }, 60000);

  it("a hide without an instance answers 400 and writes nothing", async () => {
    for (const instanceId of [undefined, ""]) {
      const response = await hider.client.post("/api/user/hidden-entities", {
        entityType: "scene",
        entityId: visibleScene.id,
        ...(instanceId !== undefined && { instanceId }),
      });

      expect(response.status).toBe(400);
      expect(response.data).toEqual({ error: "instanceId is required" });
    }
    expect(await hiddenRowCount()).toBe(0);
  });

  it("a hide naming an unknown instance answers 400 and writes nothing", async () => {
    const response = await hider.client.post("/api/user/hidden-entities", {
      entityType: "scene",
      entityId: visibleScene.id,
      instanceId: "no-such-instance",
    });

    expect(response.status).toBe(400);
    expect(response.data).toEqual({ error: "Invalid instanceId" });
    expect(await hiddenRowCount()).toBe(0);
  });

  it("hiding performer SAME on A leaves performer SAME on B listed, with its scenes", async () => {
    // SAME on A and on B: one ref names each copy
    const refs = [`${FX_ID.SAME}:${FX.A}`, `${FX_ID.SAME}:${FX.B}`];
    await prisma.scenePerformer.createMany({
      data: [FX.A, FX.B].map((instanceId) => ({
        sceneId: FX_ID.SAME,
        sceneInstanceId: instanceId,
        performerId: FX_ID.SAME,
        performerInstanceId: instanceId,
      })),
    });
    // Linked, neither performer is empty for the hider
    await exclusionComputationService.recomputeForUser(hider.id);
    const listed = async () => {
      const performers = await hider.client.post<FindPerformersResponse>(
        "/api/library/performers",
        { ids: refs }
      );
      expect(performers.status).toBe(200);
      const scenes = await hider.client.post<FindScenesResponse>(
        "/api/library/scenes",
        { ids: refs }
      );
      expect(scenes.status).toBe(200);
      return {
        performers: performers.data.findPerformers.performers
          .map((p) => p.instanceId)
          .sort(),
        scenes: scenes.data.findScenes.scenes.map((s) => s.instanceId).sort(),
      };
    };

    try {
      expect(await listed()).toEqual({
        performers: [FX.A, FX.B],
        scenes: [FX.A, FX.B],
      });

      const hide = await hider.client.post("/api/user/hidden-entities", {
        entityType: "performer",
        entityId: FX_ID.SAME,
        instanceId: FX.A,
      });
      expect(hide.status).toBe(200);

      expect(
        await prisma.userHiddenEntity.findMany({
          where: { userId: hider.id },
          select: { entityType: true, entityId: true, instanceId: true },
        })
      ).toEqual([
        { entityType: "performer", entityId: FX_ID.SAME, instanceId: FX.A },
      ]);
      expect(await listed()).toEqual({ performers: [FX.B], scenes: [FX.B] });
    } finally {
      await prisma.scenePerformer.deleteMany({
        where: {
          performerId: FX_ID.SAME,
          performerInstanceId: { in: [FX.A, FX.B] },
        },
      });
    }
  });

  it("refuses to hide a restricted entity and writes nothing", async () => {
    const response = await hider.client.post("/api/user/hidden-entities", {
      entityType: "tag",
      entityId: restrictedTagId,
      instanceId: testInstanceId,
    });

    expect(response.status).toBe(404);
    expect(response.data).toEqual({ error: "Not found" });
    expect(await hiddenRowCount()).toBe(0);

    const items = await list();
    expect(items).toEqual([]);
    expect(JSON.stringify(items)).not.toContain(restrictedTagName);
  });

  it("refuses to hide an entity restricted through a cascade", async () => {
    const response = await hider.client.post("/api/user/hidden-entities", {
      entityType: "scene",
      entityId: restrictedScene.id,
      instanceId: testInstanceId,
    });

    expect(response.status).toBe(404);
    expect(response.data).toEqual({ error: "Not found" });
    expect(await hiddenRowCount()).toBe(0);
  });

  it("hides a visible entity, lists its details, and a repeat hide writes nothing new", async () => {
    const body = {
      entityType: "scene",
      entityId: visibleScene.id,
      instanceId: testInstanceId,
    };

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
    expect(must(items[0]).summary?.name).toBe(visibleScene.title);
  });

  it("a bulk hide with one restricted target writes nothing and names it", async () => {
    const response = await hider.client.post("/api/user/hidden-entities/bulk", {
      entities: [
        {
          entityType: "scene",
          entityId: visibleScene.id,
          instanceId: testInstanceId,
        },
        {
          entityType: "tag",
          entityId: restrictedTagId,
          instanceId: testInstanceId,
        },
      ],
    });

    expect(response.status).toBe(404);
    expect(response.data).toEqual({ error: "entities[1]: Not found" });
    expect(await hiddenRowCount()).toBe(0);
  });

  it("a bulk hide stores each target on its instance, and repeats cleanly", async () => {
    const entities = [visibleScene.id, otherVisibleScene.id].map(
      (entityId) => ({
        entityType: "scene",
        entityId,
        instanceId: testInstanceId,
      })
    );

    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await hider.client.post<{
        successCount: number;
        failCount: number;
      }>("/api/user/hidden-entities/bulk", { entities });
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({ successCount: 2, failCount: 0 });
    }
    expect(await hiddenRowCount()).toBe(2);

    const titles = (await list("scene")).map((i) => i.summary?.name).sort();
    expect(titles).toEqual(
      [visibleScene.title, otherVisibleScene.title].sort()
    );
  });

  it("unhide answers once the entity lists again", async () => {
    const ref = `${visibleScene.id}:${testInstanceId}`;
    const listed = async () => {
      const response = await hider.client.post<FindScenesResponse>(
        "/api/library/scenes",
        { ids: [ref] }
      );
      expect(response.status).toBe(200);
      return response.data.findScenes.count;
    };

    const hide = await hider.client.post("/api/user/hidden-entities", {
      entityType: "scene",
      entityId: visibleScene.id,
      instanceId: testInstanceId,
    });
    expect(hide.status).toBe(200);
    expect(await listed()).toBe(0);

    const unhide = await hider.client.delete(
      `/api/user/hidden-entities/scene/${visibleScene.id}?instanceId=${testInstanceId}`
    );
    expect(unhide.status).toBe(200);
    // The very next request, with no wait
    expect(await listed()).toBe(1);
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
          summary: i.summary,
        }))
        .sort((a, b) => a.entityType.localeCompare(b.entityType))
    ).toEqual([
      {
        entityType: "scene",
        entityId: restrictedScene.id,
        instanceId: testInstanceId,
        restricted: true,
        summary: null,
      },
      {
        entityType: "tag",
        entityId: restrictedTagId,
        instanceId: testInstanceId,
        restricted: true,
        summary: null,
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
    expect(must(items[0]).summary?.name).toBe(`B-${FX_ID.SAME}`);
    expect(JSON.stringify(items)).not.toContain(`A-${FX_ID.SAME}`);
  });

  it("the list pages by 50 and counts each type", async () => {
    // Rows for entities that need not exist: they list as restricted
    await prisma.userHiddenEntity.createMany({
      data: [
        ...Array.from({ length: 120 }, (_, i) => ({
          userId: hider.id,
          entityType: "scene",
          entityId: `hidden-page-${i}`,
          instanceId: testInstanceId,
          hiddenAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
        })),
        ...Array.from({ length: 3 }, (_, i) => ({
          userId: hider.id,
          entityType: "performer",
          entityId: `hidden-page-${i}`,
          instanceId: testInstanceId,
          hiddenAt: new Date(Date.UTC(2025, 0, 1, 0, 0, i)),
        })),
      ],
    });

    const first = await listPage();
    expect(first.items).toHaveLength(50);
    expect(first.total).toBe(123);
    expect(first.counts).toEqual({
      scene: 120,
      performer: 3,
      studio: 0,
      tag: 0,
      group: 0,
      gallery: 0,
      image: 0,
      clip: 0,
    });
    // Newest first
    expect(must(first.items[0]).entityId).toBe("hidden-page-119");

    const last = await listPage("?page=3");
    expect(last.items.map((i) => i.entityType)).toEqual([
      ...Array.from({ length: 20 }, () => "scene"),
      "performer",
      "performer",
      "performer",
    ]);

    const performers = await listPage("?entityType=performer&per_page=2");
    expect(performers.items).toHaveLength(2);
    expect(performers.total).toBe(3);
    expect(performers.counts.scene).toBe(120);
  });

  it("answers 400 for a page size outside 1 to 100 or a bad page", async () => {
    for (const query of [
      "?per_page=0",
      "?per_page=101",
      "?per_page=ten",
      "?page=0",
      "?page=1.5",
      "?page=1&page=2",
    ]) {
      const response = await hider.client.get(
        `/api/user/hidden-entities${query}`
      );
      expect(response.status, query).toBe(400);
    }
  });

  it("each row's summary names the entity on the instance it shows from, with a thumbnail URL that names that instance", async () => {
    const hide = await hider.client.post("/api/user/hidden-entities", {
      entityType: "scene",
      entityId: visibleScene.id,
      instanceId: testInstanceId,
    });
    expect(hide.status).toBe(200);
    // Gallery SAME is restricted on A and visible on B; B's copy gets a cover
    await prisma.stashGallery.update({
      where: {
        id_stashInstanceId: { id: FX_ID.SAME, stashInstanceId: FX.B },
      },
      data: { coverPath: "/gallery/same/cover" },
    });
    try {
      await hideFor(hider.id, "gallery", FX_ID.SAME, "");
      await exclusionComputationService.recomputeForUser(hider.id);

      const items = await list();
      const scene = must(items.find((i) => i.entityType === "scene"));
      expect(scene.summary).toMatchObject({
        id: visibleScene.id,
        instanceId: testInstanceId,
        name: visibleScene.title,
      });
      const sceneUrl = new URL(
        must(scene.summary?.imageUrl, "scene thumbnail"),
        "http://peek"
      );
      expect(sceneUrl.pathname).toBe("/api/proxy/stash");
      expect(sceneUrl.searchParams.get("instanceId")).toBe(testInstanceId);

      const gallery = must(items.find((i) => i.entityType === "gallery"));
      expect(gallery.instanceId).toBe("");
      expect(gallery.summary).toEqual({
        id: FX_ID.SAME,
        instanceId: FX.B,
        name: `B-${FX_ID.SAME}`,
        imageUrl: `/api/proxy/stash?path=${encodeURIComponent("/gallery/same/cover")}&instanceId=${encodeURIComponent(FX.B)}`,
      });
    } finally {
      await prisma.stashGallery.update({
        where: {
          id_stashInstanceId: { id: FX_ID.SAME, stashInstanceId: FX.B },
        },
        data: { coverPath: null },
      });
    }
  });

  it("hiding a clip removes it from /api/clips and its scene's clips, and nothing else", async () => {
    // The fixture has a second clip on the same scene; it must stay listed
    await prisma.stashClip.create({
      data: {
        id: FX_ID.VISIBLE_A,
        stashInstanceId: FX.A,
        sceneId: FX_ID.SAME,
        sceneInstanceId: FX.A,
        seconds: 2,
      },
    });
    const clipKeys = async () => {
      const all = await hider.client.get<{
        clips: Array<{ id: string; instanceId: string }>;
      }>("/api/clips?isGenerated=false&perPage=250");
      expect(all.status).toBe(200);
      const ofScene = await hider.client.get<{
        clips: Array<{ id: string; instanceId: string }>;
      }>(
        `/api/scenes/${FX_ID.SAME}/clips?includeUngenerated=true&instanceId=${FX.A}`
      );
      expect(ofScene.status).toBe(200);
      const scene = await hider.client.post<FindScenesResponse>(
        "/api/library/scenes",
        { ids: [`${FX_ID.SAME}:${FX.A}`] }
      );
      expect(scene.status).toBe(200);
      const key = (c: { id: string; instanceId: string }) =>
        `${c.id}@${c.instanceId}`;
      return {
        all: all.data.clips
          .map(key)
          .filter((k) =>
            [FX_ID.SAME, FX_ID.VISIBLE_A].some((id) => k === `${id}@${FX.A}`)
          )
          .sort(),
        ofScene: ofScene.data.clips.map(key).sort(),
        scenes: scene.data.findScenes.count,
      };
    };
    const both = [`${FX_ID.SAME}@${FX.A}`, `${FX_ID.VISIBLE_A}@${FX.A}`].sort();

    try {
      expect(await clipKeys()).toEqual({ all: both, ofScene: both, scenes: 1 });

      const hide = await hider.client.post("/api/user/hidden-entities", {
        entityType: "clip",
        entityId: FX_ID.SAME,
        instanceId: FX.A,
      });
      expect(hide.status).toBe(200);

      const remaining = [`${FX_ID.VISIBLE_A}@${FX.A}`];
      expect(await clipKeys()).toEqual({
        all: remaining,
        ofScene: remaining,
        scenes: 1,
      });
      // Its own row only: no cascade to the scene or its other clip
      expect(
        await prisma.userExcludedEntity.findMany({
          where: { userId: hider.id, reason: "hidden" },
          select: { entityType: true, entityId: true, instanceId: true },
        })
      ).toEqual([
        { entityType: "clip", entityId: FX_ID.SAME, instanceId: FX.A },
      ]);
    } finally {
      await prisma.stashClip.delete({
        where: {
          id_stashInstanceId: { id: FX_ID.VISIBLE_A, stashInstanceId: FX.A },
        },
      });
    }
  });

  it("Hidden Items lists and restores a clip", async () => {
    await prisma.stashClip.update({
      where: { id_stashInstanceId: { id: FX_ID.SAME, stashInstanceId: FX.A } },
      data: {
        title: "A fixture clip",
        screenshotPath: "/clip/same/screenshot",
      },
    });
    try {
      const hide = await hider.client.post("/api/user/hidden-entities", {
        entityType: "clip",
        entityId: FX_ID.SAME,
        instanceId: FX.A,
      });
      expect(hide.status).toBe(200);

      const page = await listPage("?entityType=clip");
      expect(page.total).toBe(1);
      expect(page.counts.clip).toBe(1);
      const [item] = page.items;
      expect(item).toMatchObject({
        entityType: "clip",
        entityId: FX_ID.SAME,
        instanceId: FX.A,
        restricted: false,
        summary: {
          id: FX_ID.SAME,
          instanceId: FX.A,
          name: "A fixture clip",
          imageUrl: `/api/proxy/stash?path=${encodeURIComponent("/clip/same/screenshot")}&instanceId=${encodeURIComponent(FX.A)}`,
        },
      });

      // The per-row DELETE checks the instance against the configured
      // servers, which the fixture's A is not; restore the type instead
      const restore = await hider.client.delete(
        "/api/user/hidden-entities/all?entityType=clip"
      );
      expect(restore.status).toBe(200);
      expect(await listPage("?entityType=clip")).toMatchObject({
        items: [],
        total: 0,
      });
      const clips = await hider.client.get<{ clips: Array<{ id: string }> }>(
        "/api/clips?isGenerated=false&perPage=250"
      );
      expect(clips.data.clips.map((c) => c.id)).toContain(FX_ID.SAME);
    } finally {
      await prisma.stashClip.update({
        where: {
          id_stashInstanceId: { id: FX_ID.SAME, stashInstanceId: FX.A },
        },
        data: { title: null, screenshotPath: null },
      });
    }
  });

  it("a hidden row of a type that cannot be hidden is left out", async () => {
    await hideFor(hider.id, "scene", visibleScene.id, testInstanceId);
    await prisma.userHiddenEntity.create({
      data: {
        userId: hider.id,
        entityType: "marker",
        entityId: "1",
        instanceId: testInstanceId,
      },
    });

    const page = await listPage();
    expect(page.items.map((i) => i.entityType)).toEqual(["scene"]);
    expect(page.total).toBe(1);
    expect(page.counts).not.toHaveProperty("marker");
    expect(Object.values(page.counts).reduce((a, b) => a + b, 0)).toBe(1);
  });
});
