import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

/**
 * Sort Options Integration Tests
 *
 * Tests sorting functionality across entity types:
 * - Scene sort options
 * - Performer sort options
 * - Studio sort options
 * - Tag sort options
 * - Gallery sort options
 * - Group sort options
 * - ASC/DESC direction
 */

interface FindScenesResponse {
  findScenes: {
    scenes: Array<{
      id: string;
      title?: string;
      date?: string;
      rating100?: number | null;
      created_at?: string;
      updated_at?: string;
      play_count?: number;
      o_counter?: number;
      files?: Array<{ duration?: number }>;
    }>;
    count: number;
  };
}

interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      rating100?: number | null;
      scene_count?: number;
      birthdate?: string;
      created_at?: string;
    }>;
    count: number;
  };
}

interface FindStudiosResponse {
  findStudios: {
    studios: Array<{
      id: string;
      name: string;
      rating100?: number | null;
      scene_count?: number;
      created_at?: string;
    }>;
    count: number;
  };
}

interface FindTagsResponse {
  findTags: {
    tags: Array<{
      id: string;
      name: string;
      scene_count?: number;
    }>;
    count: number;
  };
}

interface FindGalleriesResponse {
  findGalleries: {
    galleries: Array<{
      id: string;
      title?: string;
      created_at?: string;
      rating100?: number | null;
    }>;
    count: number;
  };
}

interface FindGroupsResponse {
  findGroups: {
    groups: Array<{
      id: string;
      name: string;
      date?: string;
      rating100?: number | null;
      created_at?: string;
    }>;
    count: number;
  };
}

describe("Sort Options", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("Scene sorting", () => {
    it("sorts scenes by title ASC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "title",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const titles = response.data.findScenes.scenes
        .map((s) => s.title?.toLowerCase() || "")
        .filter((t) => t);
      for (let i = 1; i < titles.length; i++) {
        expect(titles[i] >= titles[i - 1]).toBe(true);
      }
    });

    it("sorts scenes by title DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "title",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const titles = response.data.findScenes.scenes
        .map((s) => s.title?.toLowerCase() || "")
        .filter((t) => t);
      for (let i = 1; i < titles.length; i++) {
        expect(titles[i] <= titles[i - 1]).toBe(true);
      }
    });

    it("sorts scenes by date ASC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "date",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const dates = response.data.findScenes.scenes
        .map((s) => s.date)
        .filter((d): d is string => !!d);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] >= dates[i - 1]).toBe(true);
      }
    });

    it("sorts scenes by date DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "date",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const dates = response.data.findScenes.scenes
        .map((s) => s.date)
        .filter((d): d is string => !!d);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] <= dates[i - 1]).toBe(true);
      }
    });

    it("sorts scenes by rating DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "rating",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const ratings = response.data.findScenes.scenes
        .map((s) => s.rating100)
        .filter((r): r is number => r !== null && r !== undefined);
      for (let i = 1; i < ratings.length; i++) {
        expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1]);
      }
    });

    it("sorts scenes by created_at DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "created_at",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const dates = response.data.findScenes.scenes
        .map((s) => s.created_at)
        .filter((d): d is string => !!d);
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] <= dates[i - 1]).toBe(true);
      }
    });

    it("sorts scenes by updated_at DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "updated_at",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("sorts scenes by play_count DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "play_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const counts = response.data.findScenes.scenes.map((s) => s.play_count || 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    });

    it("sorts scenes by o_counter DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "o_counter",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const counts = response.data.findScenes.scenes.map((s) => s.o_counter || 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    });

    it("sorts scenes by duration DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: "duration",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("sorts scenes by random with seed", async () => {
      const seed = 12345678;

      const response1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      const response2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      // Same seed should return same order
      const ids1 = response1.data.findScenes.scenes.map((s) => s.id);
      const ids2 = response2.data.findScenes.scenes.map((s) => s.id);
      expect(ids1).toEqual(ids2);
    });

    it("sorts scenes by random with different seeds returns different order", async () => {
      const response1 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
          sort: "random_11111111",
        },
      });

      const response2 = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: {
          per_page: 50,
          sort: "random_99999999",
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      // Different seeds should return different orders
      const ids1 = response1.data.findScenes.scenes.map((s) => s.id);
      const ids2 = response2.data.findScenes.scenes.map((s) => s.id);
      expect(ids1).not.toEqual(ids2);
    });
  });

  describe("Performer sorting", () => {
    it("sorts performers by name ASC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 20,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      const names = response.data.findPerformers.performers.map((p) => p.name.toLowerCase());
      for (let i = 1; i < names.length; i++) {
        expect(names[i] >= names[i - 1]).toBe(true);
      }
    });

    it("sorts performers by name DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 20,
          sort: "name",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      const names = response.data.findPerformers.performers.map((p) => p.name.toLowerCase());
      for (let i = 1; i < names.length; i++) {
        expect(names[i] <= names[i - 1]).toBe(true);
      }
    });

    it("sorts performers by scene_count DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 20,
          sort: "scene_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      const counts = response.data.findPerformers.performers.map((p) => p.scene_count || 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    });

    it("sorts performers by rating DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 20,
          sort: "rating",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by created_at DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 20,
          sort: "created_at",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by birthdate ASC", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 20,
          sort: "birthdate",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by random with seed", async () => {
      const seed = 22222222;

      const response1 = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      const response2 = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findPerformers.performers.map((p) => p.id);
      const ids2 = response2.data.findPerformers.performers.map((p) => p.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Studio sorting", () => {
    it("sorts studios by name ASC", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 20,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();

      const names = response.data.findStudios.studios.map((s) => s.name.toLowerCase());
      for (let i = 1; i < names.length; i++) {
        expect(names[i] >= names[i - 1]).toBe(true);
      }
    });

    it("sorts studios by scene_count DESC", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 20,
          sort: "scene_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();

      const counts = response.data.findStudios.studios.map((s) => s.scene_count || 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    });

    it("sorts studios by rating DESC", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 20,
          sort: "rating",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("sorts studios by random with seed", async () => {
      const seed = 33333333;

      const response1 = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      const response2 = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findStudios.studios.map((s) => s.id);
      const ids2 = response2.data.findStudios.studios.map((s) => s.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Tag sorting", () => {
    it("sorts tags by name ASC", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 20,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      const names = response.data.findTags.tags.map((t) => t.name.toLowerCase());
      for (let i = 1; i < names.length; i++) {
        expect(names[i] >= names[i - 1]).toBe(true);
      }
    });

    it("sorts tags by scene_count DESC", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 20,
          sort: "scene_count",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      const counts = response.data.findTags.tags.map((t) => t.scene_count || 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
      }
    });

    it("sorts tags by random with seed", async () => {
      const seed = 44444444;

      const response1 = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      const response2 = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findTags.tags.map((t) => t.id);
      const ids2 = response2.data.findTags.tags.map((t) => t.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Gallery sorting", () => {
    it("sorts galleries by title ASC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 20,
          sort: "title",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by created_at DESC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 20,
          sort: "created_at",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by rating DESC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 20,
          sort: "rating",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by random with seed", async () => {
      const seed = 55555555;

      const response1 = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      const response2 = await adminClient.post<FindGalleriesResponse>("/api/library/galleries", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findGalleries.galleries.map((g) => g.id);
      const ids2 = response2.data.findGalleries.galleries.map((g) => g.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Group sorting", () => {
    it("sorts groups by name ASC", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 20,
          sort: "name",
          direction: "ASC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      const names = response.data.findGroups.groups.map((g) => g.name.toLowerCase());
      for (let i = 1; i < names.length; i++) {
        expect(names[i] >= names[i - 1]).toBe(true);
      }
    });

    it("sorts groups by date DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 20,
          sort: "date",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by rating DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 20,
          sort: "rating",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by created_at DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 20,
          sort: "created_at",
          direction: "DESC",
        },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by random with seed", async () => {
      const seed = 66666666;

      const response1 = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      const response2 = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        filter: {
          per_page: 20,
          sort: `random_${seed}`,
        },
      });

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findGroups.groups.map((g) => g.id);
      const ids2 = response2.data.findGroups.groups.map((g) => g.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Default sorting behavior", () => {
    it("uses default sort when not specified for scenes", async () => {
      const response = await adminClient.post<FindScenesResponse>("/api/library/scenes", {
        filter: { per_page: 20 },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("uses default sort when not specified for performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        filter: { per_page: 20 },
      });

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.performers.length).toBeGreaterThan(0);
    });
  });
});
