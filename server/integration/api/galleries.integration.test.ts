import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  guestClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

// Response type for /api/library/galleries
interface FindGalleriesResponse {
  findGalleries: {
    galleries: Array<{ id: string; title?: string }>;
    count: number;
  };
}

describe("Gallery API", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
  });

  afterAll(restoreInstanceSelection);

  describe("POST /api/library/galleries", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post("/api/library/galleries", {});
      expect(response.status).toBe(401);
    });

    it("returns galleries with pagination", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { page: 1, per_page: 10 },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.galleries).toBeDefined();
      expect(Array.isArray(response.data.findGalleries.galleries)).toBe(true);
      expect(response.data.findGalleries.count).toBeGreaterThan(0);
    });

    it("returns gallery by ID", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          ids: [TEST_ENTITIES.galleryWithImages],
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries.galleries).toHaveLength(1);
      expect(must(response.data.findGalleries.galleries[0]).id).toBe(
        TEST_ENTITIES.galleryWithImages
      );
    });
  });

  describe("POST /api/library/images with a galleries filter", () => {
    it("returns that gallery's images", async () => {
      const response = await adminClient.post<{
        findImages: { images: Array<{ id: string }>; count: number };
      }>("/api/library/images", {
        filter: { page: 1, per_page: 100, sort: "path", direction: "ASC" },
        image_filter: {
          galleries: {
            value: [TEST_ENTITIES.galleryWithImages],
            modifier: "INCLUDES",
          },
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findImages.images).toBeDefined();
      expect(Array.isArray(response.data.findImages.images)).toBe(true);
    });
  });
});

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

/**
 * Untitled galleries are found by the name their card shows: a zip's file
 * name without its extension, else the folder's own name.
 * - gl-a 7897001: titled "GL Titled Set"; 7897002: no title, file
 *   "holiday-set.zip"; 7897003: no title, folder "/data/pics/Beach Day"
 * Every seeded row is deleted before the file ends.
 */
describeWithDb("Gallery search by shown name (seeded)", () => {
  const A = "gl-a";
  const VIEWER = "gl-viewer";
  let viewerId = 0;

  /** The galleries a search or Title filter lists, as sorted ids */
  async function list(
    override: { q?: string; title?: string } = {}
  ): Promise<string[]> {
    const { items, total } = await galleryQueryBuilder.execute({
      userId: viewerId,
      applyExclusions: true,
      allowedInstanceIds: [A],
      request: parsedListRequest("gallery", {
        perPage: 50,
        q: override.q,
        filter:
          override.title === undefined
            ? {}
            : { title: { modifier: "INCLUDES", value: override.title } },
      }),
    });
    expect(total).toBe(items.length);
    return items.map((g) => g.id).sort();
  }

  beforeAll(async () => {
    await prisma.stashGallery.deleteMany({ where: { stashInstanceId: A } });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
    viewerId = (
      await prisma.user.create({
        data: { username: VIEWER, password: "not-a-real-hash", role: "USER" },
      })
    ).id;
    await prisma.stashGallery.createMany({
      data: [
        { id: "7897001", stashInstanceId: A, title: "GL Titled Set" },
        {
          id: "7897002",
          stashInstanceId: A,
          title: "",
          fileBasename: "holiday-set.zip",
        },
        {
          id: "7897003",
          stashInstanceId: A,
          title: null,
          folderPath: "/data/pics/Beach Day",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.stashGallery.deleteMany({ where: { stashInstanceId: A } });
    await prisma.user.deleteMany({ where: { username: VIEWER } });
  });

  it("an untitled gallery is found by the name its card shows", async () => {
    expect(await list({ q: "holiday-set" })).toEqual(["7897002"]);
    expect(await list({ q: "beach day" })).toEqual(["7897003"]);
    expect(await list({ q: "set" })).toEqual(["7897001", "7897002"]);
  });

  it("the extension is not part of the shown name", async () => {
    expect(await list({ q: ".zip" })).toEqual([]);
  });

  it("the gallery Title filter matches that name too", async () => {
    expect(await list({ title: "holiday-set" })).toEqual(["7897002"]);
    expect(await list({ title: "Beach Day" })).toEqual(["7897003"]);
  });

  it("every word of a search must match", async () => {
    expect(await list({ q: "beach day" })).toEqual(["7897003"]);
    expect(await list({ q: "day beach" })).toEqual(["7897003"]);
    expect(await list({ q: "beach holiday" })).toEqual([]);
  });
});
