/**
 * By-id reads over HTTP (item 11).
 *
 * A gallery, image or tag that is hidden or restricted for the user no longer
 * opens by id: the GET-by-id routes are gone, and the list endpoints apply
 * exclusions and the instance to id lookups. Gallery images come from the
 * images search, with the instance and the user's own O count. Tag tooltips
 * leave out hidden performers.
 *
 * The reader hides the fixture defaults (see helpers/accessFixture.ts): SAME
 * on B for every type, GLOBAL on every instance, HIDDEN_A on A.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
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

interface GalleriesResponse {
  findGalleries: { count: number; galleries: Array<{ id: string }> };
}

interface ImagesResponse {
  findImages: {
    count: number;
    images: Array<{ id: string; instanceId?: string; oCounter?: number }>;
  };
}

interface TagsResponse {
  findTags: {
    count: number;
    tags: Array<{ id: string; performers?: Array<{ id: string }> }>;
  };
}

describe("By-id reads (integration)", () => {
  let reader: { id: number; client: TestClient };

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    reader = await createApiUser("access_it_reader", "access_it_pass_1");
    await hideFixtureDefaults(reader.id);
    await prisma.imageViewHistory.create({
      data: {
        userId: reader.id,
        instanceId: FX.A,
        imageId: FX_ID.SAME,
        oCount: 3,
        viewCount: 1,
      },
    });
  }, 60000);

  afterAll(async () => {
    if (reader) {
      await adminClient.delete(`/api/user/${reader.id}`);
    }
    await clearAccessFixture();
  }, 60000);

  it("the GET-by-id routes are gone", async () => {
    const paths = [
      `/api/library/galleries/${FX_ID.SAME}?instanceId=${FX.A}`,
      `/api/library/galleries/${FX_ID.SAME}/images?instance=${FX.A}`,
      `/api/library/images/${FX_ID.SAME}?instanceId=${FX.A}`,
    ];
    for (const client of [reader.client, adminClient]) {
      for (const path of paths) {
        const res = await client.get(path);
        expect(res.status, path).toBe(404);
      }
    }
  });

  it("gallery by id through the list endpoint applies exclusions", async () => {
    const onB = await reader.client.post<GalleriesResponse>(
      "/api/library/galleries",
      { ids: [FX_ID.SAME], gallery_filter: { instance_id: FX.B } }
    );
    expect(onB.status).toBe(200);
    expect(onB.data.findGalleries.galleries).toHaveLength(0);

    const onA = await reader.client.post<GalleriesResponse>(
      "/api/library/galleries",
      { ids: [FX_ID.SAME], gallery_filter: { instance_id: FX.A } }
    );
    expect(onA.status).toBe(200);
    expect(onA.data.findGalleries.galleries).toHaveLength(1);
  });

  it("gallery images come from the images search with exclusions, instance and the user's O count", async () => {
    const res = await reader.client.post<ImagesResponse>(
      "/api/library/images",
      {
        filter: { page: 1, per_page: 100, sort: "path", direction: "ASC" },
        image_filter: {
          galleries: {
            value: [`${FX_ID.SAME}:${FX.A}`],
            modifier: "INCLUDES",
          },
        },
      }
    );

    expect(res.status).toBe(200);
    const images = res.data.findImages.images;
    expect(images.map((i) => i.id)).toEqual([FX_ID.SAME]);
    expect(images[0]?.instanceId).toBe(FX.A);
    expect(images[0]?.oCounter).toBe(3);
  });

  it("findTags by id applies exclusions", async () => {
    const onB = await reader.client.post<TagsResponse>("/api/library/tags", {
      ids: [FX_ID.SAME],
      tag_filter: { instance_id: FX.B },
    });
    expect(onB.status).toBe(200);
    expect(onB.data.findTags.tags).toHaveLength(0);

    const onA = await reader.client.post<TagsResponse>("/api/library/tags", {
      ids: [FX_ID.SAME],
      tag_filter: { instance_id: FX.A },
    });
    expect(onA.status).toBe(200);
    expect(onA.data.findTags.tags).toHaveLength(1);
  });

  it("tag tooltip performers leave out hidden performers", async () => {
    const res = await reader.client.post<TagsResponse>("/api/library/tags", {
      ids: [FX_ID.SAME],
      tag_filter: { instance_id: FX.A },
    });

    expect(res.status).toBe(200);
    const performers = res.data.findTags.tags[0]?.performers ?? [];
    expect(performers.map((p) => p.id)).toEqual([FX_ID.VISIBLE_A]);
  });
});
