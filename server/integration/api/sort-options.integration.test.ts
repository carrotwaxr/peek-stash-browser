import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clipQueryBuilder } from "../../services/ClipQueryBuilder.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import {
  parsedClipRequest,
  parsedListRequest,
} from "../../tests/helpers/fixtures.js";
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
        .map((s) => s.title?.toLowerCase() ?? "")
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
        .map((s) => s.title?.toLowerCase() ?? "")
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
        (s) => s.play_count ?? 0
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
        (s) => s.o_counter ?? 0
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
        (p) => p.scene_count ?? 0
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
        (s) => s.scene_count ?? 0
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

      const counts = response.data.findTags.tags.map((t) => t.scene_count ?? 0);
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
      data: [
        ...[A, B].map((stashInstanceId) => ({
          id: "1",
          stashInstanceId,
          name: `Sort ${stashInstanceId}`,
        })),
        { id: "2", stashInstanceId: A, name: "Sort sub-collection" },
      ],
    });
    // Group 2 is a sub-collection of group 1 on so-a
    await prisma.groupRelation.create({
      data: {
        containingId: "1",
        containingInstanceId: A,
        subId: "2",
        subInstanceId: A,
        orderIndex: 0,
      },
    });
    const member = (
      sceneId: string,
      instance: string,
      sceneIndex: number,
      groupId = "1"
    ) => ({
      sceneId,
      sceneInstanceId: instance,
      groupId,
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
        member("4", A, 1, "2"),
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
    await prisma.groupRelation.deleteMany({
      where: { containingInstanceId: { in: [A, B] } },
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

  it("scene_index with sub-collections keeps a scene only in a sub-collection, last, in the page and the total", async () => {
    const filter = { groups: { ...collection("1"), depth: -1 } };
    const sorted = await sceneQueryBuilder.execute({
      userId,
      applyExclusions: false,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("scene", {
        perPage: 50,
        sort: { field: "scene_index", direction: "ASC", seed: undefined },
        filter,
      }),
    });
    expect(
      sorted.items.map((scene) => `${scene.id}:${scene.instanceId}`)
    ).toEqual(["2:so-a", "3:so-a", "1:so-a", "4:so-a"]);
    expect(sorted.total).toBe(4);
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

/**
 * The sorts F17 adds, on rows seeded under one made-up instance. Every list
 * is read as a viewer whose exclusions apply: a hidden performer, tag,
 * studio, scene or clip must not count toward a count sort, give a studio
 * name or a performer age, or lend a clip its title. Each hidden row is
 * chosen so that counting it would change the order. Counts that tie
 * without the hidden rows are told apart by the names (the tiebreak is
 * the name, ascending). Every seeded row is deleted.
 */
describe("Sorts for resolution, studio, code, performer age, organized, counts and collection order", () => {
  const I = "f17";
  const USERNAME = "sort-f17-user";
  const OTHER = "sort-f17-other";
  let userId = 0;
  let otherId = 0;

  type Direction = "ASC" | "DESC";
  interface Lister {
    execute(options: unknown): Promise<{ items: { id: string }[] }>;
  }
  const BUILDERS: Record<string, Lister> = {
    scene: sceneQueryBuilder,
    performer: performerQueryBuilder,
    studio: studioQueryBuilder,
    tag: tagQueryBuilder,
    group: groupQueryBuilder,
    gallery: galleryQueryBuilder,
    image: imageQueryBuilder,
  };

  const refs = (...ids: string[]): RefCriterion => ({
    refs: ids.map((id) => ({ id, instanceId: I })),
    modifier: "INCLUDES",
    depth: 0,
  });

  /** The ids of one list, in the order the sort gives, for the filter's rows */
  const list = async (
    kind: keyof typeof BUILDERS,
    field: string,
    direction: Direction,
    filter: object
  ) => {
    const { items } = await must(BUILDERS[kind]).execute({
      userId,
      applyExclusions: true,
      allowedInstanceIds: [I],
      request: parsedListRequest(kind as "scene", {
        perPage: 50,
        sort: { field, direction, seed: undefined } as never,
        filter: filter as never,
      }),
    });
    return items.map((item) => item.id);
  };
  const only = (...ids: string[]) => ({ ids: refs(...ids) });
  const both = async (
    kind: keyof typeof BUILDERS,
    field: string,
    filter: object
  ) => ({
    asc: await list(kind, field, "ASC", filter),
    desc: await list(kind, field, "DESC", filter),
  });

  const clips = async (direction: Direction) => {
    const { items } = await clipQueryBuilder.execute({
      userId,
      applyExclusions: true,
      allowedInstanceIds: [I],
      request: parsedClipRequest({
        sort: { field: "title", direction, seed: undefined },
      }),
    });
    return items.map((item) => item.id);
  };

  const tagged = <K extends string>(parent: string, tag: string, kind: K) =>
    ({
      [`${kind}Id`]: parent,
      [`${kind}InstanceId`]: I,
      tagId: tag,
      tagInstanceId: I,
    }) as Record<
      `${K}Id` | `${K}InstanceId` | "tagId" | "tagInstanceId",
      string
    >;

  beforeAll(async () => {
    userId = (
      await prisma.user.create({
        data: { username: USERNAME, password: "not-a-real-hash", role: "USER" },
      })
    ).id;
    otherId = (
      await prisma.user.create({
        data: { username: OTHER, password: "not-a-real-hash", role: "USER" },
      })
    ).id;

    const tag = (id: string, name: string, parents?: string[]) => ({
      id,
      stashInstanceId: I,
      name,
      ...(parents ? { parentIds: JSON.stringify(parents) } : {}),
    });
    await prisma.stashTag.createMany({
      data: [
        tag("tp1", "p1"),
        tag("tp2", "p2"),
        tag("tk", "k", ["tp1", "tp2"]),
        tag("tj", "j", ["tp1", "tx"]),
        tag("th1", "h1", ["tp2"]),
        tag("th2", "h2", ["tp2"]),
        tag("tx", "Zulu"),
        tag("ta", "Apple"),
        tag("tc", "cherry"),
      ],
    });

    const studio = (id: string, name: string, parentId?: string) => ({
      id,
      stashInstanceId: I,
      name,
      ...(parentId ? { parentId } : {}),
    });
    await prisma.stashStudio.createMany({
      data: [
        studio("stA", "Zeta"),
        studio("stB", "alpha"),
        studio("stC1", "c1", "stA"),
        studio("stC2", "c2", "stA"),
        studio("stC3", "c3", "stB"),
        studio("stH1", "Aardvark", "stA"),
        studio("stH2", "h2", "stB"),
        studio("stH3", "h3", "stB"),
      ],
    });
    await prisma.studioTag.createMany({
      data: [
        tagged("stA", "tp1", "studio"),
        tagged("stA", "tp2", "studio"),
        tagged("stB", "tk", "studio"),
        tagged("stB", "tx", "studio"),
      ],
    });

    const performer = (id: string, name: string, birthdate: string) => ({
      id,
      stashInstanceId: I,
      name,
      birthdate,
    });
    await prisma.stashPerformer.createMany({
      data: [
        performer("P1", "Zed", "1990-03-01"),
        performer("P2", "alpha", "1995"),
        performer("P3", "p3", "1980-12-31"),
        performer("P4", "hidden", "1970-01-01"),
        performer("P6", "p6", "1996-08"),
      ],
    });
    await prisma.performerTag.createMany({
      data: [
        tagged("P1", "tp1", "performer"),
        tagged("P1", "tp2", "performer"),
        tagged("P2", "tk", "performer"),
        tagged("P2", "tx", "performer"),
      ],
    });

    const scene = (
      id: string,
      extra: Record<string, string | number | boolean | null>
    ) => ({ id, stashInstanceId: I, ...extra });
    const file = (width: number, height: number) => ({
      fileWidth: width,
      fileHeight: height,
    });
    await prisma.stashScene.createMany({
      data: [
        scene("s1", {
          ...file(1920, 1080),
          studioId: "stA",
          code: "B",
          date: "2020-06-15",
        }),
        scene("s2", {
          ...file(1280, 720),
          studioId: "stB",
          code: "A",
          organized: true,
          date: "2020-06-15",
        }),
        scene("s3", { ...file(3840, 2160) }),
        scene("s4", {
          ...file(640, 360),
          studioId: "stH1",
          code: "D",
          organized: true,
          date: "2020-06-15",
        }),
        scene("s5", { code: "C", date: "2020-06-15" }),
        scene("s6", {}),
      ],
    });
    const onScene = (sceneId: string, performerId: string) => ({
      sceneId,
      sceneInstanceId: I,
      performerId,
      performerInstanceId: I,
    });
    await prisma.scenePerformer.createMany({
      data: [
        onScene("s1", "P1"),
        onScene("s1", "P3"),
        onScene("s2", "P2"),
        onScene("s3", "P1"),
        onScene("s4", "P4"),
        onScene("s4", "P6"),
      ],
    });

    const clip = (
      id: string,
      sceneId: string,
      title: string | null,
      primaryTagId: string | null
    ) => ({
      id,
      stashInstanceId: I,
      sceneId,
      sceneInstanceId: I,
      seconds: 1,
      title,
      primaryTagId,
      primaryTagInstanceId: primaryTagId === null ? null : I,
    });
    await prisma.stashClip.createMany({
      data: [
        clip("k1", "s1", "banana", null),
        clip("k2", "s1", null, "ta"),
        clip("k4", "s2", "", "tc"),
        clip("kh", "s2", "hidden", null),
        clip("k7", "s5", null, "tx"),
      ],
    });

    const image = (id: string, size?: [number, number]) => ({
      id,
      stashInstanceId: I,
      ...(size ? { width: size[0], height: size[1] } : {}),
    });
    await prisma.stashImage.createMany({
      data: [
        image("i1", [4000, 3000]),
        image("i2", [640, 480]),
        image("i3", [1000, 2000]),
        image("i4"),
      ],
    });
    await prisma.imageTag.createMany({
      data: [
        ["i1", "tp1"],
        ["i1", "tp2"],
        ["i2", "tk"],
        ["i3", "tp1"],
        ["i3", "tp2"],
        ["i3", "tk"],
      ].map(([i, t]) => ({
        imageId: must(i),
        imageInstanceId: I,
        tagId: must(t),
        tagInstanceId: I,
      })),
    });
    const holders = [
      ["1", "P1"],
      ["1", "P2"],
      ["2", "P1"],
      ["2", "P4"],
      ["3", "P1"],
      ["3", "P2"],
      ["3", "P6"],
    ] as const;
    await prisma.imagePerformer.createMany({
      data: holders.map(([n, p]) => ({
        imageId: `i${n}`,
        imageInstanceId: I,
        performerId: p,
        performerInstanceId: I,
      })),
    });

    await prisma.stashGallery.createMany({
      data: ["g1", "g2", "g3", "g4"].map((id) => ({ id, stashInstanceId: I })),
    });
    await prisma.galleryTag.createMany({
      data: [
        ["g1", "tp1"],
        ["g1", "tp2"],
        ["g2", "tk"],
        ["g3", "tp1"],
        ["g3", "tp2"],
        ["g3", "tk"],
      ].map(([g, t]) => ({
        galleryId: must(g),
        galleryInstanceId: I,
        tagId: must(t),
        tagInstanceId: I,
      })),
    });
    await prisma.galleryPerformer.createMany({
      data: holders.map(([n, p]) => ({
        galleryId: `g${n}`,
        galleryInstanceId: I,
        performerId: p,
        performerInstanceId: I,
      })),
    });

    await prisma.stashGroup.createMany({
      data: [
        ["gA", "Zeta"],
        ["gB", "alpha"],
        ["gC", "c"],
        ["gP", "parent"],
        ["gQ", "other"],
      ].map(([id, name]) => ({
        id: must(id),
        stashInstanceId: I,
        name: must(name),
      })),
    });
    const relation = (containing: string, sub: string, orderIndex: number) => ({
      containingId: containing,
      containingInstanceId: I,
      subId: sub,
      subInstanceId: I,
      orderIndex,
    });
    await prisma.groupRelation.createMany({
      data: [
        relation("gP", "gA", 2),
        relation("gP", "gB", 1),
        relation("gP", "gC", 3),
        relation("gQ", "gA", 0),
      ],
    });
    await prisma.groupTag.createMany({
      data: [
        tagged("gA", "tp1", "group"),
        tagged("gA", "tp2", "group"),
        tagged("gB", "tk", "group"),
        tagged("gB", "tx", "group"),
      ],
    });
    const member = (sceneId: string, groupId: string) => ({
      sceneId,
      sceneInstanceId: I,
      groupId,
      groupInstanceId: I,
    });
    await prisma.sceneGroup.createMany({
      data: [member("s1", "gA"), member("s2", "gB"), member("s6", "gB")],
    });
    const history = (user: number, sceneId: string, oCount: number) => ({
      userId: user,
      instanceId: I,
      sceneId,
      oCount,
    });
    await prisma.watchHistory.createMany({
      data: [
        history(userId, "s1", 3),
        history(userId, "s2", 1),
        history(userId, "s6", 10),
        history(otherId, "s2", 20),
      ],
    });

    const hide = (entityType: string, entityId: string) => ({
      userId,
      entityType,
      entityId,
      instanceId: I,
      reason: "hidden",
    });
    await prisma.userExcludedEntity.createMany({
      data: [
        hide("tag", "tx"),
        hide("tag", "th1"),
        hide("tag", "th2"),
        hide("performer", "P4"),
        hide("studio", "stH1"),
        hide("studio", "stH2"),
        hide("studio", "stH3"),
        hide("scene", "s6"),
        hide("clip", "kh"),
      ],
    });
  });

  afterAll(async () => {
    await prisma.stashClip.deleteMany({ where: { stashInstanceId: I } });
    await prisma.stashScene.deleteMany({ where: { stashInstanceId: I } });
    await prisma.stashImage.deleteMany({ where: { stashInstanceId: I } });
    await prisma.stashGallery.deleteMany({ where: { stashInstanceId: I } });
    await prisma.stashGroup.deleteMany({ where: { stashInstanceId: I } });
    await prisma.stashPerformer.deleteMany({ where: { stashInstanceId: I } });
    await prisma.stashStudio.deleteMany({ where: { stashInstanceId: I } });
    await prisma.stashTag.deleteMany({ where: { stashInstanceId: I } });
    await prisma.user.deleteMany({
      where: { username: { in: [USERNAME, OTHER] } },
    });
  });

  describe("scenes", () => {
    it("resolution orders by the shorter side of the file", async () => {
      expect(
        await both("scene", "resolution", only("s1", "s2", "s3", "s4"))
      ).toEqual({
        asc: ["s4", "s2", "s1", "s3"],
        desc: ["s3", "s1", "s2", "s4"],
      });
    });

    it("studio orders by the studio's name, scenes without one (or with a hidden one) last in both directions", async () => {
      expect(
        await both("scene", "studio", only("s1", "s2", "s3", "s4", "s5"))
      ).toEqual({
        asc: ["s2", "s1", "s3", "s4", "s5"],
        desc: ["s1", "s2", "s5", "s4", "s3"],
      });
    });

    it("code orders by the scene's code", async () => {
      expect(await both("scene", "code", only("s1", "s2", "s4", "s5"))).toEqual(
        {
          asc: ["s2", "s1", "s5", "s4"],
          desc: ["s4", "s5", "s1", "s2"],
        }
      );
    });

    it("organized lists the unorganized first ascending", async () => {
      expect(
        await both("scene", "organized", only("s1", "s2", "s3", "s4", "s5"))
      ).toEqual({
        asc: ["s1", "s3", "s5", "s2", "s4"],
        desc: ["s4", "s2", "s5", "s3", "s1"],
      });
    });

    it("performer_age orders by the youngest performer ascending and the oldest descending, at the scene date, ignoring a hidden performer and partial birthdates; undated or performer-less scenes are last", async () => {
      // s1: 30 and 39; s2: born "1995" (1 January) is 25; s4: the hidden
      // performer (50) is ignored, "1996-08" (1 August) is 23; s3 has no
      // date and s5 no performer
      expect(
        await both("scene", "performer_age", only("s1", "s2", "s3", "s4", "s5"))
      ).toEqual({
        asc: ["s4", "s2", "s1", "s3", "s5"],
        desc: ["s1", "s2", "s4", "s5", "s3"],
      });
    });
  });

  describe("images and galleries", () => {
    it("image resolution orders by the shorter side", async () => {
      expect(await both("image", "resolution", only("i1", "i2", "i3"))).toEqual(
        {
          asc: ["i2", "i3", "i1"],
          desc: ["i1", "i3", "i2"],
        }
      );
    });

    it.each([
      ["image", "i"],
      ["gallery", "g"],
    ])("%s tag_count orders by the tag rows", async (kind, p) => {
      const ids = [1, 2, 3, 4].map((n) => `${p}${n}`);
      expect(await both(kind, "tag_count", only(...ids))).toEqual({
        asc: [`${p}4`, `${p}2`, `${p}1`, `${p}3`],
        desc: [`${p}3`, `${p}1`, `${p}2`, `${p}4`],
      });
    });

    it.each([
      ["image", "i"],
      ["gallery", "g"],
    ])(
      "%s performer_count does not count a hidden performer",
      async (kind, p) => {
        const ids = [1, 2, 3, 4].map((n) => `${p}${n}`);
        // 2 has the hidden performer: 1 visible, which counted would tie 1
        expect(await both(kind, "performer_count", only(...ids))).toEqual({
          asc: [`${p}4`, `${p}2`, `${p}1`, `${p}3`],
          desc: [`${p}3`, `${p}1`, `${p}2`, `${p}4`],
        });
      }
    );
  });

  describe("studios and tags", () => {
    it("studio child_count counts the children the viewer can see", async () => {
      // stA has 2 visible of 3, stB 1 of 3: counted raw they tie and the
      // name puts alpha (stB) first
      expect(
        await both("studio", "child_count", only("stA", "stB", "stC1"))
      ).toEqual({
        asc: ["stC1", "stB", "stA"],
        desc: ["stA", "stB", "stC1"],
      });
    });

    it("studio tag_count counts the tags the viewer can see", async () => {
      expect(
        await both("studio", "tag_count", only("stA", "stB", "stC1"))
      ).toEqual({
        asc: ["stC1", "stB", "stA"],
        desc: ["stA", "stB", "stC1"],
      });
    });

    it("tag child_count counts the children the viewer can see", async () => {
      // tp1 has 2 children, tp2 has 1 visible and 2 hidden
      expect(
        await both("tag", "child_count", only("tp1", "tp2", "tk", "tj"))
      ).toEqual({
        asc: ["tj", "tk", "tp2", "tp1"],
        desc: ["tp1", "tp2", "tj", "tk"],
      });
    });

    it("tag parent_count counts the parents the viewer can see", async () => {
      // tk has 2 parents; tj has 1 visible and a hidden one
      expect(
        await both("tag", "parent_count", only("tp1", "tp2", "tk", "tj"))
      ).toEqual({
        asc: ["tp1", "tp2", "tj", "tk"],
        desc: ["tk", "tj", "tp1", "tp2"],
      });
    });
  });

  describe("collections and performers", () => {
    it("collection tag_count counts the tags the viewer can see", async () => {
      expect(await both("group", "tag_count", only("gA", "gB", "gC"))).toEqual({
        asc: ["gC", "gB", "gA"],
        desc: ["gA", "gB", "gC"],
      });
    });

    it("collection o_counter sums the viewer's own O counts over the scenes they can see", async () => {
      // gA 3; gB 1, not the hidden scene's 10 nor the other user's 20
      expect(await both("group", "o_counter", only("gA", "gB", "gC"))).toEqual({
        asc: ["gC", "gB", "gA"],
        desc: ["gA", "gB", "gC"],
      });
    });

    it("sub_group_order orders by the index within the one collection the filter names", async () => {
      const filter = { containing_groups: refs("gP") };
      expect(await both("group", "sub_group_order", filter)).toEqual({
        asc: ["gB", "gA", "gC"],
        desc: ["gC", "gA", "gB"],
      });
    });

    it("performer tag_count counts the tags the viewer can see", async () => {
      // P6 has none, which the name order (alpha, p6, Zed) would not give
      expect(
        await both("performer", "tag_count", only("P1", "P2", "P6"))
      ).toEqual({
        asc: ["P6", "P2", "P1"],
        desc: ["P1", "P2", "P6"],
      });
    });

    it("performer marker_count counts the clips the viewer can see", async () => {
      // P1 has 2 of 2; P2 has 1 of 2 (the second clip is hidden)
      expect(
        await both("performer", "marker_count", only("P1", "P2", "P6"))
      ).toEqual({
        asc: ["P6", "P2", "P1"],
        desc: ["P1", "P2", "P6"],
      });
    });
  });

  describe("clips", () => {
    it("title falls back to the primary tag's name, a hidden tag lends none", async () => {
      expect(await clips("ASC")).toEqual(["k7", "k2", "k1", "k4"]);
      expect(await clips("DESC")).toEqual(["k4", "k1", "k2", "k7"]);
    });
  });
});
