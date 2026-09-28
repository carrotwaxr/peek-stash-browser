import { MINIMAL_PER_PAGE_MAX } from "@peek/shared-types/filters/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../../tests/helpers/must.js";
import { TEST_ADMIN, TEST_ENTITIES } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import { expectRefused } from "../helpers/refused.js";
import {
  type TestClient,
  adminClient,
  guestClient,
} from "../helpers/testClient.js";

/**
 * Integration tests for minimal endpoint count_filter functionality.
 *
 * Tests that the count_filter parameter correctly filters entities
 * based on their content counts (scene_count, gallery_count, etc.)
 *
 * The requests go through the one parser (item 38) with the server in
 * reject mode: an unknown count_filter key answers 400, and the page size is
 * 50 unless the request names one, held to 1..100. The page-size cases seed
 * 260 rows of each type on a made-up instance (the replay's library is
 * smaller than a page) for a user who sees every instance, and delete them
 * before the file ends.
 */

interface MinimalPerformerResponse {
  performers: Array<{ id: string; name: string }>;
}

interface MinimalStudioResponse {
  studios: Array<{ id: string; name: string }>;
}

interface MinimalTagResponse {
  tags: Array<{ id: string; name: string }>;
}

interface MinimalGalleryResponse {
  galleries: Array<{ id: string; name: string }>;
}

interface MinimalGroupResponse {
  groups: Array<{ id: string; name: string }>;
}

describe("Minimal Endpoint Count Filters", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/library/performers/minimal with count_filter", () => {
    it("filters performers with min_scene_count", async () => {
      // Without filter - should return all performers
      const allResponse = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.performers.length;

      // With min_scene_count: 1 - should return fewer performers
      const filteredResponse = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      expect(filteredResponse.data.performers.length).toBeLessThanOrEqual(
        totalCount
      );

      // Known performer with scenes should be in filtered results
      const hasPerformerWithScenes = filteredResponse.data.performers.some(
        (p) => p.id === TEST_ENTITIES.performerWithScenes
      );
      expect(hasPerformerWithScenes).toBe(true);
    });

    it("returns all performers when count_filter is empty", async () => {
      const response = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          count_filter: {},
        }
      );
      expect(response.ok).toBe(true);
      expect(response.data.performers.length).toBeGreaterThan(0);
    });

    it("supports min_gallery_count filter", async () => {
      const response = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          count_filter: { min_gallery_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
      // Should return performers with at least 1 gallery
    });
  });

  describe("POST /api/library/studios/minimal with count_filter", () => {
    it("filters studios with min_scene_count", async () => {
      // Without filter
      const allResponse = await adminClient.post<MinimalStudioResponse>(
        "/api/library/studios/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.studios.length;

      // With min_scene_count: 1
      const filteredResponse = await adminClient.post<MinimalStudioResponse>(
        "/api/library/studios/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      expect(filteredResponse.data.studios.length).toBeLessThanOrEqual(
        totalCount
      );

      // Known studio with scenes should be in filtered results
      const hasStudioWithScenes = filteredResponse.data.studios.some(
        (s) => s.id === TEST_ENTITIES.studioWithScenes
      );
      expect(hasStudioWithScenes).toBe(true);
    });

    it("supports min_performer_count filter", async () => {
      const response = await adminClient.post<MinimalStudioResponse>(
        "/api/library/studios/minimal",
        {
          count_filter: { min_performer_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
    });
  });

  describe("POST /api/library/tags/minimal with count_filter", () => {
    it("filters tags with min_scene_count", async () => {
      // Without filter
      const allResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.tags.length;

      // With min_scene_count: 1
      const filteredResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      expect(filteredResponse.data.tags.length).toBeLessThanOrEqual(totalCount);

      // Known tag with entities should be in filtered results
      const hasTagWithEntities = filteredResponse.data.tags.some(
        (t) => t.id === TEST_ENTITIES.tagWithEntities
      );
      expect(hasTagWithEntities).toBe(true);
    });

    it("supports min_performer_count filter", async () => {
      const response = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_performer_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
    });
  });

  describe("POST /api/library/galleries/minimal with count_filter", () => {
    it("filters galleries with min_image_count", async () => {
      // Without filter
      const allResponse = await adminClient.post<MinimalGalleryResponse>(
        "/api/library/galleries/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.galleries.length;

      // With min_image_count: 1
      const filteredResponse = await adminClient.post<MinimalGalleryResponse>(
        "/api/library/galleries/minimal",
        {
          count_filter: { min_image_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      // Filtered count should be <= total (some galleries may have 0 images)
      expect(filteredResponse.data.galleries.length).toBeLessThanOrEqual(
        totalCount
      );
    });
  });

  describe("POST /api/library/groups/minimal with count_filter", () => {
    it("filters groups with min_scene_count", async () => {
      // Without filter
      const allResponse = await adminClient.post<MinimalGroupResponse>(
        "/api/library/groups/minimal",
        {}
      );
      expect(allResponse.ok).toBe(true);
      const totalCount = allResponse.data.groups.length;

      // With min_scene_count: 1
      const filteredResponse = await adminClient.post<MinimalGroupResponse>(
        "/api/library/groups/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(filteredResponse.ok).toBe(true);
      expect(filteredResponse.data.groups.length).toBeLessThanOrEqual(
        totalCount
      );
    });

    it("supports min_performer_count filter", async () => {
      const response = await adminClient.post<MinimalGroupResponse>(
        "/api/library/groups/minimal",
        {
          count_filter: { min_performer_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
    });
  });

  describe("OR logic for multiple count filters", () => {
    it("uses OR logic when multiple filters provided", async () => {
      // This test verifies that when multiple count filters are provided,
      // entities matching ANY filter are included (OR logic, not AND)

      // Get results with only scene filter
      const scenesOnlyResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );

      // Get results with only performer filter
      const performersOnlyResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_performer_count: 1 },
        }
      );

      // Get results with both filters (OR logic)
      const bothFiltersResponse = await adminClient.post<MinimalTagResponse>(
        "/api/library/tags/minimal",
        {
          count_filter: { min_scene_count: 1, min_performer_count: 1 },
        }
      );

      expect(scenesOnlyResponse.ok).toBe(true);
      expect(performersOnlyResponse.ok).toBe(true);
      expect(bothFiltersResponse.ok).toBe(true);

      // With OR logic, combined should be >= each individual filter
      // (unless there's perfect overlap)
      const scenesOnlyCount = scenesOnlyResponse.data.tags.length;
      const performersOnlyCount = performersOnlyResponse.data.tags.length;
      const bothCount = bothFiltersResponse.data.tags.length;

      // Combined should be at least as big as the larger individual result
      expect(bothCount).toBeGreaterThanOrEqual(
        Math.max(scenesOnlyCount, performersOnlyCount)
      );
    });
  });

  describe("Authentication", () => {
    it("rejects unauthenticated requests", async () => {
      const response = await guestClient.post(
        "/api/library/performers/minimal",
        {
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(response.status).toBe(401);
    });
  });

  describe("Backward compatibility", () => {
    it("works without count_filter parameter", async () => {
      const response = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          filter: { per_page: 10 },
        }
      );
      expect(response.ok).toBe(true);
      expect(response.data.performers).toBeDefined();
    });

    it("combines with search query", async () => {
      const response = await adminClient.post<MinimalPerformerResponse>(
        "/api/library/performers/minimal",
        {
          filter: { q: "a" },
          count_filter: { min_scene_count: 1 },
        }
      );
      expect(response.ok).toBe(true);
      // Should only return performers matching search AND having scenes
    });
  });

  describe("page size", () => {
    const INSTANCE = "minimal-it";
    const USERNAME = "minimal_it_user";
    const SEEDED = 260;
    let viewer: { id: number; client: TestClient } | undefined;

    const seededIds = Array.from({ length: SEEDED }, (_, i) =>
      String(7780001 + i)
    );
    const named = seededIds.map((id, i) => ({
      id,
      stashInstanceId: INSTANCE,
      name: `Mx ${String(i + 1).padStart(3, "0")}`,
    }));

    async function clearPageSizeFixture(): Promise<void> {
      await prisma.user.deleteMany({ where: { username: USERNAME } });
      const onInstance = { where: { stashInstanceId: INSTANCE } };
      await prisma.stashPerformer.deleteMany(onInstance);
      await prisma.stashStudio.deleteMany(onInstance);
      await prisma.stashTag.deleteMany(onInstance);
      await prisma.stashGroup.deleteMany(onInstance);
      await prisma.stashGallery.deleteMany(onInstance);
      await prisma.stashInstance.deleteMany({ where: { id: INSTANCE } });
    }

    beforeAll(async () => {
      await clearPageSizeFixture();
      await prisma.stashInstance.create({
        data: {
          id: INSTANCE,
          name: INSTANCE,
          url: "http://127.0.0.1:9/graphql",
          apiKey: "fixture-key",
          enabled: true,
          priority: 940,
          // Synced: its content shows (a first-syncing instance does not)
          firstSyncedAt: new Date(),
        },
      });
      await prisma.stashPerformer.createMany({ data: named });
      await prisma.stashStudio.createMany({ data: named });
      await prisma.stashTag.createMany({ data: named });
      await prisma.stashGroup.createMany({ data: named });
      await prisma.stashGallery.createMany({
        data: named.map(({ name, ...row }) => ({ ...row, title: name })),
      });
      // No instance selection: every enabled instance, this one included
      viewer = await createApiUser(USERNAME, "minimal_it_pass_1");
    }, 60000);

    afterAll(async () => {
      await clearPageSizeFixture();
    });

    const ENDPOINTS = [
      {
        type: "performers",
        rows: (d: unknown) => (d as MinimalPerformerResponse).performers,
      },
      {
        type: "studios",
        rows: (d: unknown) => (d as MinimalStudioResponse).studios,
      },
      { type: "tags", rows: (d: unknown) => (d as MinimalTagResponse).tags },
      {
        type: "groups",
        rows: (d: unknown) => (d as MinimalGroupResponse).groups,
      },
      {
        type: "galleries",
        rows: (d: unknown) => (d as MinimalGalleryResponse).galleries,
      },
    ];

    it.each(ENDPOINTS)(
      "minimal: per_page 1000 returns at most 100 ($type)",
      async ({ type, rows }) => {
        const { client } = must(viewer, "the viewer");

        const response = await client.post(`/api/library/${type}/minimal`, {
          filter: { per_page: 1000 },
        });

        expect(response.status).toBe(200);
        expect(rows(response.data)).toHaveLength(MINIMAL_PER_PAGE_MAX);
      }
    );

    it.each(ENDPOINTS)(
      "minimal: without per_page returns 50 ($type)",
      async ({ type, rows }) => {
        const { client } = must(viewer, "the viewer");

        const response = await client.post(`/api/library/${type}/minimal`, {});

        expect(response.status).toBe(200);
        expect(rows(response.data)).toHaveLength(50);
      }
    );

    it("minimal: an unknown count_filter key answers 400", async () => {
      const { client } = must(viewer, "the viewer");

      const response = await client.post("/api/library/performers/minimal", {
        count_filter: { min_scene_count: 1, min_bogus_count: 1 },
      });

      expectRefused(response, ["count_filter.min_bogus_count"]);
    });
  });
});
