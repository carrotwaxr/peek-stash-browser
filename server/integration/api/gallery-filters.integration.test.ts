import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { must } from "../../tests/helpers/must.js";
import { parseListRequest } from "../../utils/listRequest.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import {
  adminClient,
  restoreInstanceSelection,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";

/**
 * Gallery Filters Integration Tests
 *
 * Tests gallery-specific filters:
 * - favorite filter
 * - rating100 filter
 * - image_count filter
 * - title text search
 * - studios filter (with hierarchy)
 * - performers filter
 * - tags filter (with hierarchy)
 */

interface FindGalleriesResponse {
  findGalleries: {
    galleries: Array<{
      id: string;
      title?: string;
      favorite?: boolean;
      rating100?: number | null;
      image_count?: number;
      cover?: string | null;
      coverWidth?: number | null;
      coverHeight?: number | null;
      studio?: { id: string; name: string } | null;
      performers?: Array<{ id: string; name: string }>;
      tags?: Array<{ id: string; name?: string }>;
    }>;
    count: number;
  };
}

describe("Gallery Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    // Select only test instance to avoid ID collisions with other instances
    await selectTestInstanceOnly();
  });

  afterAll(restoreInstanceSelection);

  describe("favorite filter", () => {
    it("filters favorite galleries", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            favorite: true,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();

      for (const gallery of response.data.findGalleries.galleries) {
        expect(gallery.favorite).toBe(true);
      }
    });

    it("filters non-favorite galleries", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            favorite: false,
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("rating100 filter", () => {
    it("filters by rating GREATER_THAN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            rating100: {
              value: 70,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters by rating LESS_THAN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            rating100: {
              value: 50,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters by rating BETWEEN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            rating100: {
              value: 50,
              value2: 80,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("image_count filter", () => {
    it("filters galleries with many images", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            image_count: {
              value: 10,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries with few images", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            image_count: {
              value: 5,
              modifier: "LESS_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries with image_count BETWEEN", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            image_count: {
              value: 10,
              value2: 50,
              modifier: "BETWEEN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("title filter", () => {
    it("filters galleries by title text search", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            title: {
              value: "a",
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("studios filter", () => {
    it("filters galleries by studio", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries by studio with hierarchy depth", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
              depth: 1,
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("scenes filter", () => {
    it("filters galleries containing specific scene with INCLUDES", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            scenes: {
              value: [TEST_ENTITIES.sceneWithRelations],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries excluding specific scene with EXCLUDES", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            scenes: {
              value: [TEST_ENTITIES.sceneWithRelations],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("performers filter", () => {
    it("filters galleries by performer", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("tags filter", () => {
    it("filters galleries by tag with INCLUDES", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries by tag with EXCLUDES", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "EXCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("filters galleries by tag with hierarchy depth", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
              depth: 1,
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("text search (q parameter)", () => {
    it("searches galleries by title", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 50,
            q: "a",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("combined filters", () => {
    it("combines favorite and image_count filters", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            favorite: true,
            image_count: {
              value: 5,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();

      for (const gallery of response.data.findGalleries.galleries) {
        expect(gallery.favorite).toBe(true);
      }
    });

    it("combines studio and performer filters", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            studios: {
              value: [TEST_ENTITIES.studioWithScenes],
              modifier: "INCLUDES",
            },
            performers: {
              value: [TEST_ENTITIES.performerWithScenes],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("combines rating and tags filters", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            rating100: {
              value: 60,
              modifier: "GREATER_THAN",
            },
            tags: {
              value: [TEST_ENTITIES.tagWithEntities],
              modifier: "INCLUDES",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("sorting", () => {
    it("sorts galleries by title ASC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 50,
            sort: "title",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by image_count DESC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 50,
            sort: "image_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by rating100 DESC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 50,
            sort: "rating100",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });
  });

  describe("gallery by ID", () => {
    it("returns gallery by ID with details", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          ids: [TEST_ENTITIES.galleryWithImages],
        }
      );

      expect(response.ok).toBe(true);
      // With multi-instance, same ID can exist in multiple instances
      expect(
        response.data.findGalleries.galleries.length
      ).toBeGreaterThanOrEqual(1);
      // Verify at least one result has the expected ID
      const matchingGallery = response.data.findGalleries.galleries.find(
        (g) => g.id === TEST_ENTITIES.galleryWithImages
      );
      expect(matchingGallery).toBeDefined();
    });
  });

  describe("cover dimensions", () => {
    it("returns cover URL and dimensions when available", async () => {
      // Fetch galleries that have images (so they have cover images)
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 20 },
          gallery_filter: {
            image_count: {
              value: 1,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
      expect(response.data.findGalleries.galleries.length).toBeGreaterThan(0);

      // Check that galleries have cover field (may be null if no cover set)
      const galleries = response.data.findGalleries.galleries;
      for (const gallery of galleries) {
        // Cover should be a string URL or null
        expect(
          typeof gallery.cover === "string" || gallery.cover === null
        ).toBe(true);
        // coverWidth and coverHeight should be numbers or null
        expect(
          typeof gallery.coverWidth === "number" || gallery.coverWidth === null
        ).toBe(true);
        expect(
          typeof gallery.coverHeight === "number" ||
            gallery.coverHeight === null
        ).toBe(true);
      }
    });

    it("returns valid dimensions for galleries with cover images", async () => {
      // Fetch galleries
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: { per_page: 50 },
          gallery_filter: {
            image_count: {
              value: 1,
              modifier: "GREATER_THAN",
            },
          },
        }
      );

      expect(response.ok).toBe(true);

      // Find galleries that have cover dimensions
      const galleriesWithDimensions =
        response.data.findGalleries.galleries.filter(
          (g) => g.coverWidth !== null && g.coverHeight !== null
        );

      // If any galleries have dimensions, verify they're positive
      for (const gallery of galleriesWithDimensions) {
        expect(gallery.coverWidth).toBeGreaterThan(0);
        expect(gallery.coverHeight).toBeGreaterThan(0);
      }
    });

    it("returns consistent aspect ratio calculation data", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          ids: [TEST_ENTITIES.galleryWithImages],
        }
      );

      expect(response.ok).toBe(true);
      // With multi-instance, same ID can exist in multiple instances
      expect(
        response.data.findGalleries.galleries.length
      ).toBeGreaterThanOrEqual(1);

      // Use first gallery for validation
      const gallery = must(response.data.findGalleries.galleries[0]);

      // Gallery should have cover field
      expect("cover" in gallery).toBe(true);
      expect("coverWidth" in gallery).toBe(true);
      expect("coverHeight" in gallery).toBe(true);

      // galleryWithImages has a cover, so both dimensions exist
      const aspectRatio =
        must(gallery.coverWidth, "gallery.coverWidth") /
        must(gallery.coverHeight, "gallery.coverHeight");
      expect(aspectRatio).toBeGreaterThan(0);
      expect(Number.isFinite(aspectRatio)).toBe(true);
    });
  });
});

/**
 * Gallery details, code, photographer, path, URL, organized and is_zip
 * (items 63 and 66), from the wire through the parser into the gallery
 * builder, on seeded rows.
 *
 * Two made-up instances reusing ids, as two Stash servers do: spg-x and
 * spg-y, both enabled and both selected by every viewer. Gallery ids are
 * 7899000 + n. Users: A, whose hides are none, and B, who hid gallery 60@x.
 * Every seeded row is deleted before the describe ends.
 */
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const GX = "spg-x";
const GY = "spg-y";
const GALLERY_INSTANCES = [GX, GY];
const GALLERY_PREFIX = "spg-it";
const galleryId = (n: number) => String(7899000 + n);

describeWithDb("Gallery own fields (seeded)", () => {
  const user = { A: 0, B: 0 };

  async function removeRows(): Promise<void> {
    await prisma.user.deleteMany({
      where: { username: { startsWith: GALLERY_PREFIX } },
    });
    await prisma.stashGallery.deleteMany({
      where: { stashInstanceId: { in: GALLERY_INSTANCES } },
    });
    await prisma.stashInstance.deleteMany({
      where: { id: { in: GALLERY_INSTANCES } },
    });
  }

  /** The galleries of one instance a wire `gallery_filter` lists, as numbers; the count is checked */
  async function ns(
    viewer: number,
    galleryFilter: Record<string, unknown>,
    instance = GX
  ): Promise<number[]> {
    const request = parseListRequest(
      "gallery",
      { filter: { per_page: 250 }, gallery_filter: galleryFilter },
      { userId: viewer }
    );
    const { items, total } = await galleryQueryBuilder.execute({
      userId: viewer,
      allowedInstanceIds: await getUserAllowedInstanceIds(viewer),
      request,
    });
    expect(total).toBe(items.length);
    return items
      .filter((gallery) => gallery.instanceId === instance)
      .map((gallery) => Number(gallery.id) - 7899000)
      .sort((a, b) => a - b);
  }

  const text = (field: string, modifier: string, value?: string) => ({
    [field]: value === undefined ? { modifier } : { value, modifier },
  });

  beforeAll(async () => {
    await removeRows();

    for (const [i, id] of GALLERY_INSTANCES.entries()) {
      await prisma.stashInstance.create({
        data: {
          id,
          name: id,
          url: "http://127.0.0.1:9/graphql",
          apiKey: "fixture-key",
          enabled: true,
          priority: 950 + i,
          firstSyncedAt: new Date(),
        },
      });
    }

    const makeUser = async (name: string) =>
      (
        await prisma.user.create({
          data: {
            username: `${GALLERY_PREFIX}-${name}`,
            password: "not-a-real-hash",
            role: "USER",
            stashInstances: {
              create: GALLERY_INSTANCES.map((instanceId) => ({ instanceId })),
            },
          },
        })
      ).id;
    user.A = await makeUser("a");
    user.B = await makeUser("b");

    const gallery = (
      n: number,
      instance: string,
      extra: Record<string, unknown> = {}
    ) => ({
      id: galleryId(n),
      stashInstanceId: instance,
      title: `SPG ${n} ${instance}`,
      ...extra,
    });
    await prisma.stashGallery.createMany({
      data: [
        // Details, codes, photographers: 1 holds an underscore, 2 a
        // lookalike, 3 a percent
        gallery(1, GX, { details: "d_1", code: "C_1", photographer: "p_1" }),
        gallery(2, GX, { details: "dx1", code: "CX1", photographer: "px1" }),
        gallery(3, GX, {
          details: "100% detail",
          code: "100%",
          photographer: "100% shots",
        }),
        gallery(1, GY, { details: "d_1", code: "C_1", photographer: "p_1" }),
        gallery(3, GY, { details: "100% elsewhere" }),
        // Paths: folder galleries 4 to 7 and a zip 8 (its full path), 9 a zip
        // whose name holds an underscore; 8 and 9 have no folder
        gallery(4, GX, { folderPath: "/a_b/folder" }),
        gallery(5, GX, { folderPath: "/axb/folder" }),
        gallery(6, GX, { folderPath: "/z/a_b/folder" }),
        gallery(7, GX, { folderPath: "/100%/folder" }),
        gallery(8, GX, {
          folderPath: null,
          filePath: "/zips/set.zip",
          fileBasename: "set.zip",
        }),
        gallery(9, GX, {
          folderPath: null,
          filePath: "/a_b/zips/set.zip",
          fileBasename: "set.zip",
        }),
        gallery(4, GY, { folderPath: "/a_b/other" }),
        gallery(8, GY, { filePath: "/100%/other.zip" }),
        // URLs
        gallery(10, GX, {
          urls: JSON.stringify(["https://a.test/1", "https://example.com/2"]),
        }),
        gallery(11, GX, { urls: JSON.stringify(["https://other.test/"]) }),
        gallery(12, GX, { urls: null }),
        gallery(13, GX, { urls: "" }),
        gallery(14, GX, { urls: "[]" }),
        gallery(10, GY, { urls: JSON.stringify(["https://nothing.test/"]) }),
        // Organized
        gallery(20, GX, { organized: true }),
        gallery(21, GX),
        gallery(20, GY),
        // Hidden by B, with every field set
        gallery(60, GX, {
          details: "hidden details",
          code: "HID",
          photographer: "hidden photographer",
          folderPath: "/hidden/folder",
          urls: JSON.stringify(["https://hidden.test/"]),
          organized: false,
        }),
        gallery(61, GX, {
          folderPath: null,
          filePath: "/hidden/zip.zip",
          fileBasename: "zip.zip",
        }),
      ],
    });

    for (const n of [60, 61]) {
      await prisma.userHiddenEntity.create({
        data: {
          userId: user.B,
          entityType: "gallery",
          entityId: galleryId(n),
          instanceId: GX,
        },
      });
      await prisma.userExcludedEntity.create({
        data: {
          userId: user.B,
          entityType: "gallery",
          entityId: galleryId(n),
          instanceId: GX,
          reason: "hidden",
        },
      });
    }
  });

  afterAll(async () => {
    await removeRows();
  });

  it("details, code and photographer match literally, per instance", async () => {
    for (const field of ["details", "code", "photographer"]) {
      const underscore = { details: "d_", code: "C_", photographer: "p_" }[
        field
      ] as string;
      expect(await ns(user.A, text(field, "INCLUDES", underscore))).toEqual([
        1,
      ]);
      expect(await ns(user.A, text(field, "INCLUDES", underscore), GY)).toEqual(
        [1]
      );
    }
    expect(await ns(user.A, text("details", "INCLUDES", "100%"))).toEqual([3]);
    expect(await ns(user.A, text("details", "INCLUDES", "100%"), GY)).toEqual([
      3,
    ]);
    expect(await ns(user.A, text("code", "EQUALS", "C_1"))).toEqual([1]);
    expect(await ns(user.A, text("code", "EQUALS", "C%"))).toEqual([]);
    expect(await ns(user.A, text("photographer", "EQUALS", "p_1"))).toEqual([
      1,
    ]);
    expect(
      await ns(user.A, text("photographer", "NOT_EQUALS", "p_1"))
    ).not.toContain(1);
  });

  it("path STARTS_WITH matches a folder gallery and a zip gallery by its full path", async () => {
    // A folder gallery by its folder, a zip gallery by its file's path
    expect(await ns(user.A, text("path", "STARTS_WITH", "/a_b/"))).toEqual([
      4, 9,
    ]);
    expect(await ns(user.A, text("path", "STARTS_WITH", "/zips/"))).toEqual([
      8,
    ]);
    expect(await ns(user.A, text("path", "EQUALS", "/zips/set.zip"))).toEqual([
      8,
    ]);
    expect(await ns(user.A, text("path", "EQUALS", "/a_b/folder"))).toEqual([
      4,
    ]);
    expect(await ns(user.A, text("path", "STARTS_WITH", "/z/"))).toEqual([6]);
    // The same id on the other instance is another gallery
    expect(await ns(user.A, text("path", "STARTS_WITH", "/a_b/"), GY)).toEqual([
      4,
    ]);
    // A literal percent, in a folder and in a zip's path
    expect(await ns(user.A, text("path", "INCLUDES", "%"))).toEqual([7]);
    expect(await ns(user.A, text("path", "INCLUDES", "%"), GY)).toEqual([8]);
  });

  it("is_zip matches the galleries that are one file", async () => {
    const zips = await ns(user.A, { is_zip: true });
    expect(zips).toEqual([8, 9, 61]);
    const folders = await ns(user.A, { is_zip: false });
    expect(folders).toEqual(expect.arrayContaining([4, 5, 6, 7, 10, 60]));
    expect(folders).not.toContain(8);
    expect(await ns(user.A, { is_zip: true }, GY)).toEqual([8]);
    // The two together are every gallery of the instance
    expect(zips.length + folders.length).toBe((await ns(user.A, {})).length);
  });

  it("url matches any of the gallery's URLs, not the JSON text", async () => {
    expect(await ns(user.A, text("url", "INCLUDES", '"'))).toEqual([]);
    expect(await ns(user.A, text("url", "INCLUDES", "]"))).toEqual([]);
    expect(await ns(user.A, text("url", "INCLUDES", "example.com"))).toEqual([
      10,
    ]);
    expect(
      await ns(user.A, text("url", "INCLUDES", "nothing.test"), GY)
    ).toEqual([10]);
    expect(await ns(user.A, text("url", "INCLUDES", "nothing.test"))).toEqual(
      []
    );
    expect(
      await ns(user.A, text("url", "EQUALS", "https://other.test/"))
    ).toEqual([11]);
    expect(await ns(user.A, text("url", "IS_NULL"))).toEqual(
      expect.arrayContaining([12, 13, 14])
    );
    expect(await ns(user.A, text("url", "IS_NULL"))).not.toContain(10);
    expect(await ns(user.A, text("url", "NOT_NULL"))).toEqual(
      expect.arrayContaining([10, 11])
    );
    expect(
      await ns(user.A, text("url", "EXCLUDES", "example.com"))
    ).not.toContain(10);
  });

  it("organized false matches the default and true the marked", async () => {
    expect(await ns(user.A, { organized: true })).toEqual([20]);
    expect(await ns(user.A, { organized: false })).toEqual(
      expect.arrayContaining([21])
    );
    expect(await ns(user.A, { organized: false })).not.toContain(20);
    expect(await ns(user.A, { organized: true }, GY)).toEqual([]);
    expect(await ns(user.A, { organized: false }, GY)).toContain(20);
  });

  it("a gallery the viewer hid is never listed under a new field", async () => {
    for (const filter of [
      text("details", "INCLUDES", "hidden"),
      text("code", "EQUALS", "HID"),
      text("photographer", "INCLUDES", "hidden"),
      text("path", "STARTS_WITH", "/hidden/"),
      text("url", "INCLUDES", "hidden.test"),
      { organized: false },
      { is_zip: false },
      { is_zip: true },
    ]) {
      const seen = await ns(user.A, filter);
      expect(
        seen.includes(60) || seen.includes(61),
        JSON.stringify(filter)
      ).toBe(true);
      const hidden = await ns(user.B, filter);
      expect(hidden, JSON.stringify(filter)).not.toContain(60);
      expect(hidden, JSON.stringify(filter)).not.toContain(61);
    }
    // The negative forms never list them either
    for (const filter of [
      text("path", "EXCLUDES", "zzz"),
      text("path", "NOT_EQUALS", "zzz"),
      text("url", "EXCLUDES", "zzz"),
      text("url", "NOT_NULL"),
      text("code", "NOT_NULL"),
      { is_zip: false },
      { is_zip: true },
      { organized: false },
    ]) {
      const hidden = await ns(user.B, filter);
      expect(hidden, JSON.stringify(filter)).not.toContain(60);
      expect(hidden, JSON.stringify(filter)).not.toContain(61);
    }
  });
});
