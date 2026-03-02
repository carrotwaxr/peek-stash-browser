import { describe, it, expect, beforeAll } from "vitest";
import {
  adminClient,
  selectTestInstanceOnly,
} from "../helpers/testClient.js";
import { TEST_ENTITIES, TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  measureEndpoint,
  assertBenchmark,
} from "./measureEndpoint.js";

/**
 * API Performance Benchmarks
 *
 * Measures response times for critical API endpoints.
 * Each test runs warmup + N timed iterations, computes stats,
 * and fails if the average exceeds the FAIL threshold (1000ms).
 *
 * Run with: npm run test:integration:perf
 */

// Discovered IDs for detail-page benchmarks
let discoveredSceneId: string;
let discoveredPerformerId: string;
let discoveredStudioId: string;
let discoveredGalleryId: string;

beforeAll(async () => {
  await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  await selectTestInstanceOnly();

  // Auto-discover entity IDs from first page of each list
  const [scenes, performers, studios, galleries] = await Promise.all([
    adminClient.post<{ findScenes: { scenes: Array<{ id: string }> } }>(
      "/api/library/scenes",
      { filter: { page: 1, per_page: 1 } }
    ),
    adminClient.post<{ findPerformers: { performers: Array<{ id: string }> } }>(
      "/api/library/performers",
      { filter: { page: 1, per_page: 1 } }
    ),
    adminClient.post<{ findStudios: { studios: Array<{ id: string }> } }>(
      "/api/library/studios",
      { filter: { page: 1, per_page: 1 } }
    ),
    adminClient.post<{ findGalleries: { galleries: Array<{ id: string }> } }>(
      "/api/library/galleries",
      { filter: { page: 1, per_page: 1 } }
    ),
  ]);

  discoveredSceneId =
    scenes.data?.findScenes?.scenes?.[0]?.id ?? TEST_ENTITIES.sceneWithRelations;
  discoveredPerformerId =
    performers.data?.findPerformers?.performers?.[0]?.id ?? TEST_ENTITIES.performerWithScenes;
  discoveredStudioId =
    studios.data?.findStudios?.studios?.[0]?.id ?? TEST_ENTITIES.studioWithScenes;
  discoveredGalleryId =
    galleries.data?.findGalleries?.galleries?.[0]?.id ?? TEST_ENTITIES.galleryWithImages;

  console.log("\n=== API Performance Benchmarks ===");
  console.log(`  Scene ID:     ${discoveredSceneId}`);
  console.log(`  Performer ID: ${discoveredPerformerId}`);
  console.log(`  Studio ID:    ${discoveredStudioId}`);
  console.log(`  Gallery ID:   ${discoveredGalleryId}`);
  console.log("");
});

describe("Scene List Benchmarks", () => {
  it("paginated scene list (page 1, 25 per page)", async () => {
    const result = await measureEndpoint("scene-list-paginated", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("filtered scene list (by performer)", async () => {
    const result = await measureEndpoint("scene-list-filtered-performer", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 25 },
        find_filter: { performers: [TEST_ENTITIES.performerWithScenes] },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("filtered scene list (by studio)", async () => {
    const result = await measureEndpoint("scene-list-filtered-studio", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 25 },
        find_filter: { studios: [TEST_ENTITIES.studioWithScenes] },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("filtered scene list (by tag)", async () => {
    const result = await measureEndpoint("scene-list-filtered-tag", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 25 },
        find_filter: { tags: [TEST_ENTITIES.tagWithEntities] },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("random sort scene list", async () => {
    const result = await measureEndpoint("scene-list-random-sort", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 25, sort: "random" },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("scene list deep page", async () => {
    const result = await measureEndpoint("scene-list-deep-page", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 50, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });
});

describe("Entity List Benchmarks", () => {
  it("performer list", async () => {
    const result = await measureEndpoint("performer-list", async () => {
      const res = await adminClient.post("/api/library/performers", {
        filter: { page: 1, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("studio list", async () => {
    const result = await measureEndpoint("studio-list", async () => {
      const res = await adminClient.post("/api/library/studios", {
        filter: { page: 1, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("tag list", async () => {
    const result = await measureEndpoint("tag-list", async () => {
      const res = await adminClient.post("/api/library/tags", {
        filter: { page: 1, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("group list", async () => {
    const result = await measureEndpoint("group-list", async () => {
      const res = await adminClient.post("/api/library/groups", {
        filter: { page: 1, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("gallery list", async () => {
    const result = await measureEndpoint("gallery-list", async () => {
      const res = await adminClient.post("/api/library/galleries", {
        filter: { page: 1, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("minimal performer list", async () => {
    const result = await measureEndpoint("performer-list-minimal", async () => {
      const res = await adminClient.post("/api/library/performers/minimal", {
        filter: { page: 1, per_page: 100 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("minimal tag list", async () => {
    const result = await measureEndpoint("tag-list-minimal", async () => {
      const res = await adminClient.post("/api/library/tags/minimal", {
        filter: { page: 1, per_page: 100 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });
});

describe("Detail Page Benchmarks", () => {
  it("scene detail (by ID in scene list)", async () => {
    const result = await measureEndpoint("scene-detail", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 1 },
        find_filter: { id: discoveredSceneId },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("scene similar", async () => {
    const result = await measureEndpoint("scene-similar", async () => {
      const res = await adminClient.get(
        `/api/library/scenes/${discoveredSceneId}/similar`
      );
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("performer detail (filtered scene list)", async () => {
    const result = await measureEndpoint("performer-detail-scenes", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 25 },
        find_filter: { performers: [discoveredPerformerId] },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("studio detail (filtered scene list)", async () => {
    const result = await measureEndpoint("studio-detail-scenes", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 25 },
        find_filter: { studios: [discoveredStudioId] },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("gallery detail", async () => {
    const result = await measureEndpoint("gallery-detail", async () => {
      const res = await adminClient.get(
        `/api/library/galleries/${discoveredGalleryId}`
      );
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("gallery images", async () => {
    const result = await measureEndpoint("gallery-images", async () => {
      const res = await adminClient.get(
        `/api/library/galleries/${discoveredGalleryId}/images?page=1&per_page=25`
      );
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });
});

describe("Carousel Benchmarks", () => {
  it("carousel list", async () => {
    const result = await measureEndpoint("carousel-list", async () => {
      const res = await adminClient.get("/api/carousels");
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("carousel execute (first carousel)", async () => {
    // Discover the first carousel ID
    const listRes = await adminClient.get<Array<{ id: number }>>(
      "/api/carousels"
    );

    if (!listRes.ok || !Array.isArray(listRes.data) || listRes.data.length === 0) {
      console.log("  ⊘ carousel-execute: skipped (no carousels configured)");
      return;
    }

    const carouselId = listRes.data[0].id;
    const result = await measureEndpoint("carousel-execute", async () => {
      const res = await adminClient.get(`/api/carousels/${carouselId}/execute`);
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });
});

describe("Search Benchmarks", () => {
  it("text search (scenes)", async () => {
    const result = await measureEndpoint("search-scenes-text", async () => {
      const res = await adminClient.post("/api/library/scenes", {
        filter: { page: 1, per_page: 25, q: "test" },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("text search (performers)", async () => {
    const result = await measureEndpoint("search-performers-text", async () => {
      const res = await adminClient.post("/api/library/performers", {
        filter: { page: 1, per_page: 25, q: "a" },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });
});

describe("Image Benchmarks", () => {
  it("image list paginated", async () => {
    const result = await measureEndpoint("image-list-paginated", async () => {
      const res = await adminClient.post("/api/library/images", {
        filter: { page: 1, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("image list deep page", async () => {
    const result = await measureEndpoint("image-list-deep-page", async () => {
      const res = await adminClient.post("/api/library/images", {
        filter: { page: 20, per_page: 25 },
      });
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });
});

describe("Supplementary Benchmarks", () => {
  it("user stats", async () => {
    const result = await measureEndpoint("user-stats", async () => {
      const res = await adminClient.get("/api/user-stats");
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("scene recommendations", async () => {
    const result = await measureEndpoint("scene-recommendations", async () => {
      const res = await adminClient.get("/api/library/scenes/recommended");
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("timeline distribution (scenes)", async () => {
    const result = await measureEndpoint("timeline-scenes", async () => {
      const res = await adminClient.get("/api/timeline/scene/distribution");
      expect(res.ok).toBe(true);
    });
    assertBenchmark(result);
  });

  it("health check", async () => {
    const result = await measureEndpoint(
      "health-check",
      async () => {
        const res = await adminClient.get("/api/health");
        expect(res.ok).toBe(true);
      },
      { passThreshold: 50, slowThreshold: 200 }
    );
    assertBenchmark(result);
  });
});
