/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { userRestrictionService } from '../UserRestrictionService.js';
import { emptyEntityFilterService } from '../EmptyEntityFilterService.js';
import type {
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
  NormalizedGroup,
} from '../../types/index.js';

// Mock Prisma
vi.mock('../../prisma/singleton.js', () => ({
  default: {
    userContentRestriction: {
      findMany: vi.fn(),
    },
    userHiddenEntity: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

/**
 * INTEGRATION TESTS - Real-World Scenarios
 *
 * These tests define EXPECTED behavior based on user requirements:
 * "If I exclude a Group, I should NOT see:
 *  - That Group
 *  - ANY Studios that only produce content in that Group
 *  - ANY Performers that only appear in that Group
 *  - ANY Tags that only appear in that Group
 *  - ANY Scenes in that Group"
 *
 * This is TDD: Tests define the requirements FIRST, then we make them pass.
 */
describe('UserRestrictionService - Integration Tests (TDD)', () => {
  describe('Scenario: User excludes Group "Bestiality" (real-world critical test)', () => {
    // Setup: Group "Bestiality" contains 3 scenes
    // Studio "AnimalFarm" only produces content in this Group
    // Performer "John" only appears in this Group
    // Tag "Animals" only appears in this Group
    // Tag "Extreme" appears in BOTH this Group and other content

    const groupBestiality = {
      id: 'group_bestiality',
      name: 'Bestiality',
      scene_count: 3,
      sub_groups: [],
    } as any;

    const groupNormal = {
      id: 'group_normal',
      name: 'Normal Content',
      scene_count: 2,
      sub_groups: [],
    } as any;

    const tagAnimals = {
      id: 'tag_animals',
      name: 'Animals',
      scene_count: 3, // All 3 scenes are in restricted group
      group_count: 1,
    } as any;

    const tagExtreme = {
      id: 'tag_extreme',
      name: 'Extreme',
      scene_count: 10, // 3 in restricted group, 7 in normal content
      group_count: 2,
    } as any;

    const tagSafe = {
      id: 'tag_safe',
      name: 'Safe',
      scene_count: 5, // All in normal content
      group_count: 1,
    } as any;

    const studioAnimalFarm = {
      id: 'studio_animalfarm',
      name: 'AnimalFarm Productions',
      scene_count: 3, // All scenes are in restricted group
      tags: [tagAnimals, tagExtreme],
    } as any;

    const studioNormalProductions = {
      id: 'studio_normal',
      name: 'Normal Productions',
      scene_count: 10,
      tags: [tagExtreme, tagSafe],
    } as any;

    const performerJohn = {
      id: 'perf_john',
      name: 'John',
      scene_count: 3, // All scenes are in restricted group
      tags: [],
    } as any;

    const performerJane = {
      id: 'perf_jane',
      name: 'Jane',
      scene_count: 10, // Appears in both groups
      tags: [],
    } as any;

    const scenesBestiality = [
      {
        id: 'scene1',
        title: 'Bestiality Scene 1',
        groups: [{ id: 'group_bestiality' }],
        tags: [tagAnimals, tagExtreme],
        performers: [performerJohn],
        studio: studioAnimalFarm,
      },
      {
        id: 'scene2',
        title: 'Bestiality Scene 2',
        groups: [{ id: 'group_bestiality' }],
        tags: [tagAnimals],
        performers: [performerJohn, performerJane],
        studio: studioAnimalFarm,
      },
      {
        id: 'scene3',
        title: 'Bestiality Scene 3',
        groups: [{ id: 'group_bestiality' }],
        tags: [tagAnimals, tagExtreme],
        performers: [performerJohn],
        studio: studioAnimalFarm,
      },
    ] as any[];

    const scenesNormal = [
      {
        id: 'scene4',
        title: 'Normal Scene 1',
        groups: [{ id: 'group_normal' }],
        tags: [tagExtreme, tagSafe],
        performers: [performerJane],
        studio: studioNormalProductions,
      },
      {
        id: 'scene5',
        title: 'Normal Scene 2',
        groups: [{ id: 'group_normal' }],
        tags: [tagSafe],
        performers: [performerJane],
        studio: studioNormalProductions,
      },
    ] as any[];

    const allScenes = [...scenesBestiality, ...scenesNormal];
    const allGroups = [groupBestiality, groupNormal];
    const allTags = [tagAnimals, tagExtreme, tagSafe];
    const allStudios = [studioAnimalFarm, studioNormalProductions];
    const allPerformers = [performerJohn, performerJane];

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('CRITICAL: should hide ALL scenes in excluded Group', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'groups',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['group_bestiality']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const filteredScenes = await userRestrictionService.filterScenesForUser(allScenes, 1);

      // EXPECTED: Only normal scenes should remain
      expect(filteredScenes.map(s => s.id)).toEqual(['scene4', 'scene5']);
      expect(filteredScenes.map(s => s.id)).not.toContain('scene1');
      expect(filteredScenes.map(s => s.id)).not.toContain('scene2');
      expect(filteredScenes.map(s => s.id)).not.toContain('scene3');
    });

    it('CRITICAL: should hide Studio that ONLY produces content in excluded Group', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'groups',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['group_bestiality']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Step 1: Filter groups
      const filteredGroups = await userRestrictionService.filterGroupsForUser(allGroups, 1);

      // Step 2: Filter scenes to get visibility baseline
      const filteredScenes = await userRestrictionService.filterScenesForUser(allScenes, 1);

      // Step 3: Filter studios
      const filteredStudios = await userRestrictionService.filterStudiosForUser(allStudios, 1);

      // Step 4: Apply empty entity filtering
      const visibleGroups = emptyEntityFilterService.filterEmptyGroups(filteredGroups);
      const visibleGalleries: any[] = [];

      const finalStudios = emptyEntityFilterService.filterEmptyStudios(
        filteredStudios,
        visibleGroups,
        visibleGalleries,
        filteredScenes // ← Pass visible scenes
      );

      // EXPECTED: AnimalFarm studio should be hidden (all its content is in restricted group)
      expect(finalStudios.map(s => s.id)).toEqual(['studio_normal']);
      expect(finalStudios.map(s => s.id)).not.toContain('studio_animalfarm');
    });

    it('CRITICAL: should hide Performer that ONLY appears in excluded Group', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'groups',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['group_bestiality']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Step 1: Filter groups
      const filteredGroups = await userRestrictionService.filterGroupsForUser(allGroups, 1);

      // Step 2: Filter scenes to get visibility baseline
      const filteredScenes = await userRestrictionService.filterScenesForUser(allScenes, 1);

      // Step 3: Filter performers
      const filteredPerformers = await userRestrictionService.filterPerformersForUser(allPerformers, 1);

      // Step 4: Apply empty entity filtering
      const visibleGroups = emptyEntityFilterService.filterEmptyGroups(filteredGroups);
      const visibleGalleries: any[] = [];

      const finalPerformers = emptyEntityFilterService.filterEmptyPerformers(
        filteredPerformers,
        visibleGroups,
        visibleGalleries,
        filteredScenes // ← Pass visible scenes
      );

      // EXPECTED: John should be hidden (only appears in restricted group)
      // Jane should be visible (appears in normal content too)
      expect(finalPerformers.map(p => p.id)).toEqual(['perf_jane']);
      expect(finalPerformers.map(p => p.id)).not.toContain('perf_john');
    });

    it('CRITICAL: should hide Tag that ONLY appears in excluded Group', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'groups',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['group_bestiality']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Step 1: Filter scenes to get visibility baseline
      const filteredScenes = await userRestrictionService.filterScenesForUser(allScenes, 1);

      // Step 2: Filter tags directly
      const filteredTags = await userRestrictionService.filterTagsForUser(allTags, 1);

      // Step 3: Filter groups
      const filteredGroups = await userRestrictionService.filterGroupsForUser(allGroups, 1);

      // Step 4: Apply empty entity filtering
      const visibleGroups = emptyEntityFilterService.filterEmptyGroups(filteredGroups);
      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set(visibleGroups.map(g => g.id)),
        studios: new Set<string>(),
        performers: new Set<string>(),
      };

      const finalTags = emptyEntityFilterService.filterEmptyTags(
        filteredTags,
        visibilitySet,
        filteredScenes // ← Pass visible scenes
      );

      // EXPECTED:
      // - "Animals" tag should be HIDDEN (only appears in restricted group)
      // - "Extreme" tag should be VISIBLE (appears in both groups)
      // - "Safe" tag should be VISIBLE (only appears in normal group)
      expect(finalTags.map(t => t.id)).toEqual(['tag_extreme', 'tag_safe']);
      expect(finalTags.map(t => t.id)).not.toContain('tag_animals');
    });

    it('CRITICAL: Full integration - exclude Group should cascade to ALL related entities', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'groups',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['group_bestiality']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      // Simulate full filtering pipeline (as done in controllers)

      // 1. Filter all entity types by restrictions
      const filteredScenes = await userRestrictionService.filterScenesForUser(allScenes, 1);
      const filteredGroups = await userRestrictionService.filterGroupsForUser(allGroups, 1);
      const filteredTags = await userRestrictionService.filterTagsForUser(allTags, 1);
      const filteredStudios = await userRestrictionService.filterStudiosForUser(allStudios, 1);
      const filteredPerformers = await userRestrictionService.filterPerformersForUser(allPerformers, 1);

      // 2. Apply empty entity filtering
      const visibleGroups = emptyEntityFilterService.filterEmptyGroups(filteredGroups);
      const visibleGalleries: any[] = [];

      const visibleStudios = emptyEntityFilterService.filterEmptyStudios(
        filteredStudios,
        visibleGroups,
        visibleGalleries,
        filteredScenes // ← Pass visible scenes
      );

      const visiblePerformers = emptyEntityFilterService.filterEmptyPerformers(
        filteredPerformers,
        visibleGroups,
        visibleGalleries,
        filteredScenes // ← Pass visible scenes
      );

      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set(visibleGroups.map(g => g.id)),
        studios: new Set(visibleStudios.map(s => s.id)),
        performers: new Set(visiblePerformers.map(p => p.id)),
      };

      const visibleTags = emptyEntityFilterService.filterEmptyTags(
        filteredTags,
        visibilitySet,
        filteredScenes // ← Pass visible scenes
      );

      // FINAL ASSERTIONS - This is what the user should see:
      expect(filteredScenes.map(s => s.id)).toEqual(['scene4', 'scene5']);
      expect(visibleGroups.map(g => g.id)).toEqual(['group_normal']);
      expect(visibleStudios.map(s => s.id)).toEqual(['studio_normal']);
      expect(visiblePerformers.map(p => p.id)).toEqual(['perf_jane']);
      expect(visibleTags.map(t => t.id)).toEqual(['tag_extreme', 'tag_safe']);

      // Verify nothing from the restricted group is visible
      expect(visibleGroups.map(g => g.id)).not.toContain('group_bestiality');
      expect(visibleStudios.map(s => s.id)).not.toContain('studio_animalfarm');
      expect(visiblePerformers.map(p => p.id)).not.toContain('perf_john');
      expect(visibleTags.map(t => t.id)).not.toContain('tag_animals');
    });
  });
});
