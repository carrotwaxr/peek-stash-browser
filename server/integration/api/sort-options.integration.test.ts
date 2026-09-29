import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type { ParsedFilter, RefCriterion } from "../../types/parsedFilters.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { adminClient } from "../helpers/testClient.js";

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
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "title",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const titles = response.data.findScenes.scenes
        .map((s) => s.title?.toLowerCase() || "")
        .filter((t) => t);
      for (let i = 1; i < titles.length; i++) {
        expect(must(titles[i]) >= must(titles[i - 1])).toBe(true);
      }
    });

    it("sorts scenes by title DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "title",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const titles = response.data.findScenes.scenes
        .map((s) => s.title?.toLowerCase() || "")
        .filter((t) => t);
      for (let i = 1; i < titles.length; i++) {
        expect(must(titles[i]) <= must(titles[i - 1])).toBe(true);
      }
    });

    it("sorts scenes by date ASC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "date",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const dates = response.data.findScenes.scenes
        .map((s) => s.date)
        .filter((d): d is string => !!d);
      for (let i = 1; i < dates.length; i++) {
        expect(must(dates[i]) >= must(dates[i - 1])).toBe(true);
      }
    });

    it("sorts scenes by date DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "date",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const dates = response.data.findScenes.scenes
        .map((s) => s.date)
        .filter((d): d is string => !!d);
      for (let i = 1; i < dates.length; i++) {
        expect(must(dates[i]) <= must(dates[i - 1])).toBe(true);
      }
    });

    it("sorts scenes by rating DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "rating",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const ratings = response.data.findScenes.scenes
        .map((s) => s.rating100)
        .filter((r): r is number => r !== null && r !== undefined);
      for (let i = 1; i < ratings.length; i++) {
        expect(ratings[i]).toBeLessThanOrEqual(must(ratings[i - 1]));
      }
    });

    it("sorts scenes by created_at DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "created_at",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const dates = response.data.findScenes.scenes
        .map((s) => s.created_at)
        .filter((d): d is string => !!d);
      for (let i = 1; i < dates.length; i++) {
        expect(must(dates[i]) <= must(dates[i - 1])).toBe(true);
      }
    });

    it("sorts scenes by updated_at DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "updated_at",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("sorts scenes by play_count DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "play_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const counts = response.data.findScenes.scenes.map(
        (s) => s.play_count || 0
      );
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(must(counts[i - 1]));
      }
    });

    it("sorts scenes by o_counter DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "o_counter",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();

      const counts = response.data.findScenes.scenes.map(
        (s) => s.o_counter || 0
      );
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(must(counts[i - 1]));
      }
    });

    it("sorts scenes by duration DESC", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: "duration",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
    });

    it("sorts scenes by random with seed", async () => {
      const seed = 12345678;

      const response1 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      const response2 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      // Same seed should return same order
      const ids1 = response1.data.findScenes.scenes.map((s) => s.id);
      const ids2 = response2.data.findScenes.scenes.map((s) => s.id);
      expect(ids1).toEqual(ids2);
    });

    it("sorts scenes by random with different seeds returns different order", async () => {
      const response1 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
            sort: "random_11111111",
          },
        }
      );

      const response2 = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: {
            per_page: 50,
            sort: "random_99999999",
          },
        }
      );

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
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 20,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      const names = response.data.findPerformers.performers.map((p) =>
        p.name.toLowerCase()
      );
      for (let i = 1; i < names.length; i++) {
        expect(must(names[i]) >= must(names[i - 1])).toBe(true);
      }
    });

    it("sorts performers by name DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 20,
            sort: "name",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      const names = response.data.findPerformers.performers.map((p) =>
        p.name.toLowerCase()
      );
      for (let i = 1; i < names.length; i++) {
        expect(must(names[i]) <= must(names[i - 1])).toBe(true);
      }
    });

    it("sorts performers by scene_count DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 20,
            sort: "scene_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();

      const counts = response.data.findPerformers.performers.map(
        (p) => p.scene_count || 0
      );
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(must(counts[i - 1]));
      }
    });

    it("sorts performers by rating DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 20,
            sort: "rating",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by created_at DESC", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 20,
            sort: "created_at",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by birthdate ASC", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 20,
            sort: "birthdate",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
    });

    it("sorts performers by random with seed", async () => {
      const seed = 22222222;

      const response1 = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      const response2 = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findPerformers.performers.map((p) => p.id);
      const ids2 = response2.data.findPerformers.performers.map((p) => p.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Studio sorting", () => {
    it("sorts studios by name ASC", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 20,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();

      const names = response.data.findStudios.studios.map((s) =>
        s.name.toLowerCase()
      );
      for (let i = 1; i < names.length; i++) {
        expect(must(names[i]) >= must(names[i - 1])).toBe(true);
      }
    });

    it("sorts studios by scene_count DESC", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 20,
            sort: "scene_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();

      const counts = response.data.findStudios.studios.map(
        (s) => s.scene_count || 0
      );
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(must(counts[i - 1]));
      }
    });

    it("sorts studios by rating DESC", async () => {
      const response = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 20,
            sort: "rating",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findStudios).toBeDefined();
    });

    it("sorts studios by random with seed", async () => {
      const seed = 33333333;

      const response1 = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      const response2 = await adminClient.post<FindStudiosResponse>(
        "/api/library/studios",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findStudios.studios.map((s) => s.id);
      const ids2 = response2.data.findStudios.studios.map((s) => s.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Tag sorting", () => {
    it("sorts tags by name ASC", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 20,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      const names = response.data.findTags.tags.map((t) =>
        t.name.toLowerCase()
      );
      for (let i = 1; i < names.length; i++) {
        expect(must(names[i]) >= must(names[i - 1])).toBe(true);
      }
    });

    it("sorts tags by scene_count DESC", async () => {
      const response = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 20,
            sort: "scene_count",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findTags).toBeDefined();

      const counts = response.data.findTags.tags.map((t) => t.scene_count || 0);
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i]).toBeLessThanOrEqual(must(counts[i - 1]));
      }
    });

    it("sorts tags by random with seed", async () => {
      const seed = 44444444;

      const response1 = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      const response2 = await adminClient.post<FindTagsResponse>(
        "/api/library/tags",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findTags.tags.map((t) => t.id);
      const ids2 = response2.data.findTags.tags.map((t) => t.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Gallery sorting", () => {
    it("sorts galleries by title ASC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 20,
            sort: "title",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by created_at DESC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 20,
            sort: "created_at",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by rating DESC", async () => {
      const response = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 20,
            sort: "rating",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGalleries).toBeDefined();
    });

    it("sorts galleries by random with seed", async () => {
      const seed = 55555555;

      const response1 = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      const response2 = await adminClient.post<FindGalleriesResponse>(
        "/api/library/galleries",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findGalleries.galleries.map((g) => g.id);
      const ids2 = response2.data.findGalleries.galleries.map((g) => g.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Group sorting", () => {
    it("sorts groups by name ASC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 20,
            sort: "name",
            direction: "ASC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();

      const names = response.data.findGroups.groups.map((g) =>
        g.name.toLowerCase()
      );
      for (let i = 1; i < names.length; i++) {
        expect(must(names[i]) >= must(names[i - 1])).toBe(true);
      }
    });

    it("sorts groups by date DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 20,
            sort: "date",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by rating DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 20,
            sort: "rating",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by created_at DESC", async () => {
      const response = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 20,
            sort: "created_at",
            direction: "DESC",
          },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findGroups).toBeDefined();
    });

    it("sorts groups by random with seed", async () => {
      const seed = 66666666;

      const response1 = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      const response2 = await adminClient.post<FindGroupsResponse>(
        "/api/library/groups",
        {
          filter: {
            per_page: 20,
            sort: `random_${seed}`,
          },
        }
      );

      expect(response1.ok).toBe(true);
      expect(response2.ok).toBe(true);

      const ids1 = response1.data.findGroups.groups.map((g) => g.id);
      const ids2 = response2.data.findGroups.groups.map((g) => g.id);
      expect(ids1).toEqual(ids2);
    });
  });

  describe("Default sorting behavior", () => {
    it("uses default sort when not specified for scenes", async () => {
      const response = await adminClient.post<FindScenesResponse>(
        "/api/library/scenes",
        {
          filter: { per_page: 20 },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findScenes).toBeDefined();
      expect(response.data.findScenes.scenes.length).toBeGreaterThan(0);
    });

    it("uses default sort when not specified for performers", async () => {
      const response = await adminClient.post<FindPerformersResponse>(
        "/api/library/performers",
        {
          filter: { per_page: 20 },
        }
      );

      expect(response.ok).toBe(true);
      expect(response.data.findPerformers).toBeDefined();
      expect(response.data.findPerformers.performers.length).toBeGreaterThan(0);
    });
  });
});

/**
 * Scene Number and Last O At, on rows seeded under two made-up instances that
 * reuse the same ids (the replay library has no group with indexes and no O
 * times): so-a holds group 1 with scenes 1, 2, 3 at indexes 3, 1, 2 and scene
 * 4 outside it; so-b holds a same-id group 1 with scenes 1 and 2 at indexes 1
 * and 2, which must not interleave with so-a's. The viewer's O times are on
 * so-a's scenes 1 (two, the latest 2024-03-01), 2 (one, 2024-05-01) and 3
 * (a count and no times); scene 4 has none. Every seeded row is deleted.
 */
describe("Scene Number and Last O At sorts", () => {
  const A = "so-a";
  const B = "so-b";
  const USERNAME = "sort-seeded-user";
  let userId = 0;

  const collection = (...ids: string[]): RefCriterion => ({
    refs: ids.map((id) => ({ id, instanceId: A })),
    modifier: "INCLUDES",
    depth: 0,
  });

  const list = async (
    field: "scene_index" | "last_o_at",
    direction: "ASC" | "DESC",
    filter: ParsedFilter<"scene">
  ) => {
    const { items } = await sceneQueryBuilder.execute({
      userId,
      applyExclusions: false,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("scene", {
        perPage: 50,
        sort: { field, direction, seed: undefined },
        filter,
      }),
    });
    return items.map((scene) => `${scene.id}:${scene.instanceId}`);
  };

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
    });
    userId = user.id;
    await prisma.stashScene.createMany({
      data: [
        ...["1", "2", "3", "4"].map((id) => ({ id, stashInstanceId: A })),
        ...["1", "2"].map((id) => ({ id, stashInstanceId: B })),
      ],
    });
    await prisma.stashGroup.createMany({
      data: [A, B].map((stashInstanceId) => ({
        id: "1",
        stashInstanceId,
        name: `Sort ${stashInstanceId}`,
      })),
    });
    const member = (sceneId: string, instance: string, sceneIndex: number) => ({
      sceneId,
      sceneInstanceId: instance,
      groupId: "1",
      groupInstanceId: instance,
      sceneIndex,
    });
    await prisma.sceneGroup.createMany({
      data: [
        member("1", A, 3),
        member("2", A, 1),
        member("3", A, 2),
        member("1", B, 1),
        member("2", B, 2),
      ],
    });
    const history = (sceneId: string, oCount: number, oHistory: string[]) => ({
      userId,
      instanceId: A,
      sceneId,
      oCount,
      oHistory,
    });
    await prisma.watchHistory.createMany({
      data: [
        history("1", 2, [
          "2024-01-01T00:00:00.000Z",
          "2024-03-01T00:00:00.000Z",
        ]),
        history("2", 1, ["2024-05-01T00:00:00.000Z"]),
        history("3", 4, []),
      ],
    });
  });

  afterAll(async () => {
    await prisma.watchHistory.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { username: USERNAME } });
    await prisma.sceneGroup.deleteMany({
      where: { sceneInstanceId: { in: [A, B] } },
    });
    await prisma.stashGroup.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
    await prisma.stashScene.deleteMany({
      where: { stashInstanceId: { in: [A, B] } },
    });
  });

  it("a collection of three scenes with indexes 3, 1, 2 lists 1, 2, 3; the same ids in a same-id group on the second instance do not interleave", async () => {
    const filter = { groups: collection("1") };
    expect(await list("scene_index", "ASC", filter)).toEqual([
      "2:so-a",
      "3:so-a",
      "1:so-a",
    ]);
    expect(await list("scene_index", "DESC", filter)).toEqual([
      "1:so-a",
      "3:so-a",
      "2:so-a",
    ]);
  });

  it("scene_index over two collections orders by the first", async () => {
    const filter = { groups: collection("1", "9") };
    expect(await list("scene_index", "ASC", filter)).toEqual([
      "2:so-a",
      "3:so-a",
      "1:so-a",
    ]);
  });

  it("scene_index without a collection filter answers 400", async () => {
    const response = await adminClient.post("/api/library/scenes", {
      filter: { per_page: 5, sort: "scene_index", direction: "ASC" },
    });
    expect(response.status).toBe(400);
  });

  it("last_o_at DESC orders by the latest O time and puts scenes without one last", async () => {
    const filter = {
      ids: {
        refs: ["1", "2", "3", "4"].map((id) => ({ id, instanceId: A })),
        modifier: "INCLUDES" as const,
        depth: 0,
      },
    };
    expect(await list("last_o_at", "DESC", filter)).toEqual([
      "2:so-a",
      "1:so-a",
      "4:so-a",
      "3:so-a",
    ]);
    // The scenes without a time keep the key's order in the direction
    expect(await list("last_o_at", "ASC", filter)).toEqual([
      "1:so-a",
      "2:so-a",
      "3:so-a",
      "4:so-a",
    ]);
  });
});
