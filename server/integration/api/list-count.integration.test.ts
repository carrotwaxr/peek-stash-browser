/**
 * `POST /api/library/<list>/count` (the filter sheet's live count).
 *
 * For each of the eight lists the count of a request with one filter equals
 * the `count` of the list's own request with the same body, and a scene the
 * user hid is never counted. The `where` group case waits for W3's tree
 * (enabled with W10 on main).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import {
  type TestClient,
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

const tag = { value: [TEST_ENTITIES.tagWithEntities], modifier: "INCLUDES" };

/** One filter per list, and where the list's response holds its count */
const LISTS = [
  {
    list: "scenes",
    body: { scene_filter: { tags: tag } },
    total: (data: unknown) =>
      (data as { findScenes: { count: number } }).findScenes.count,
  },
  {
    list: "performers",
    body: { performer_filter: { tags: tag } },
    total: (data: unknown) =>
      (data as { findPerformers: { count: number } }).findPerformers.count,
  },
  {
    list: "studios",
    body: { studio_filter: { tags: tag } },
    total: (data: unknown) =>
      (data as { findStudios: { count: number } }).findStudios.count,
  },
  {
    list: "tags",
    body: {
      tag_filter: { scene_count: { value: 0, modifier: "GREATER_THAN" } },
    },
    total: (data: unknown) =>
      (data as { findTags: { count: number } }).findTags.count,
  },
  {
    list: "groups",
    body: { group_filter: { tags: tag } },
    total: (data: unknown) =>
      (data as { findGroups: { count: number } }).findGroups.count,
  },
  {
    list: "galleries",
    body: { gallery_filter: { tags: tag } },
    total: (data: unknown) =>
      (data as { findGalleries: { count: number } }).findGalleries.count,
  },
  {
    list: "images",
    body: { image_filter: { tags: tag } },
    total: (data: unknown) =>
      (data as { findImages: { count: number } }).findImages.count,
  },
  {
    list: "clips",
    body: { clip_filter: { is_generated: true } },
    total: (data: unknown) => (data as { total: number }).total,
  },
];

describe("list count (integration)", () => {
  let viewer: { id: number; client: TestClient } | undefined;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await selectTestInstanceOnly();
  }, 60000);

  afterAll(async () => {
    if (viewer) await adminClient.delete(`/api/user/${viewer.id}`);
    await restoreInstanceSelection();
  }, 60000);

  it.each(LISTS)(
    "counts $list as the list's own request does",
    async ({ list, body, total }) => {
      const page = await adminClient.post(`/api/library/${list}`, {
        ...body,
        filter: { page: 1, per_page: 5 },
      });
      expect(page.status).toBe(200);

      // The page is ignored by the count
      const counted = await adminClient.post<{ count: number }>(
        `/api/library/${list}/count`,
        { ...body, filter: { page: 4, per_page: 1 } }
      );
      expect(counted.status).toBe(200);
      expect(counted.data.count).toBe(total(page.data));
    }
  );

  it("counts the scenes of the filter", async () => {
    const counted = await adminClient.post<{ count: number }>(
      "/api/library/scenes/count",
      { scene_filter: { tags: tag } }
    );
    expect(counted.data.count).toBeGreaterThan(0);
  });

  it("a bad body answers the list's 400", async () => {
    const response = await adminClient.post("/api/library/scenes/count", {
      scene_filter: { nope: { value: 1 } },
    });
    expect(response.status).toBe(400);
  });

  it.todo("counts a request with a where group (enabled with W10)");

  it("a hidden scene is never counted", async () => {
    viewer = await createApiUser("list_count_it_user", "list_count_it_pass_1");
    const { client } = viewer;
    const count = async () =>
      (await client.post<{ count: number }>("/api/library/scenes/count", {}))
        .data.count;

    const before = await count();
    expect(before).toBeGreaterThan(1);

    const first = await client.post<{
      findScenes: { scenes: Array<{ id: string; instanceId: string }> };
    }>("/api/library/scenes", { filter: { page: 1, per_page: 1 } });
    const hidden = must(first.data.findScenes.scenes[0]);
    const hide = await client.post("/api/user/hidden-entities", {
      entityType: "scene",
      entityId: hidden.id,
      instanceId: hidden.instanceId,
    });
    expect(hide.status).toBe(200);

    expect(await count()).toBe(before - 1);
    const listed = await client.post<{ findScenes: { count: number } }>(
      "/api/library/scenes",
      { filter: { page: 1, per_page: 1 } }
    );
    expect(listed.data.findScenes.count).toBe(before - 1);
  }, 60000);
});
