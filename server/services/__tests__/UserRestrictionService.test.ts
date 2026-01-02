import { describe, it, expect, beforeEach, vi} from 'vitest';
import { userRestrictionService } from '../UserRestrictionService.js';
import type {
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
  NormalizedGroup,
  NormalizedGallery,
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

describe('UserRestrictionService', () => {
  describe('filterScenesForUser', () => {
    const mockScenes: NormalizedScene[] = [
      {
        id: '1',
        title: 'Scene 1',
        tags: [{ id: 'tag1', name: 'Tag 1' }],
        performers: [{ id: 'perf1', name: 'Performer 1', tags: [] }],
        studio: { id: 'studio1', name: 'Studio 1', tags: [] },
        groups: [{ id: 'group1', name: 'Group 1' }],
        galleries: [],
        inheritedTagIds: [], // No inherited tags
      } as unknown as NormalizedScene,
      {
        id: '2',
        title: 'Scene 2',
        tags: [{ id: 'tag2', name: 'Tag 2' }],
        performers: [{ id: 'perf2', name: 'Performer 2', tags: [{ id: 'tag3', name: 'Tag 3' }] }],
        studio: { id: 'studio2', name: 'Studio 2', tags: [{ id: 'tag4', name: 'Tag 4' }] },
        groups: [],
        galleries: [],
        inheritedTagIds: ['tag3', 'tag4'], // Inherited from performer and studio
      } as unknown as NormalizedScene,
      {
        id: '3',
        title: 'Scene 3',
        tags: [],
        performers: [],
        studio: { id: 'studio1', name: 'Studio 1', tags: [] },
        groups: [{ id: 'group2', name: 'Group 2' }],
        galleries: [{ id: 'gallery1' }],
        inheritedTagIds: [], // No inherited tags
      } as unknown as NormalizedScene,
      {
        id: '4',
        title: 'Scene 4 (no tags)',
        tags: [],
        performers: [],
        studio: null,
        groups: [],
        galleries: [],
        inheritedTagIds: [], // No inherited tags
      } as unknown as NormalizedScene,
    ];

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should return all scenes when no restrictions exist', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      expect(result).toHaveLength(4);
      expect(result).toEqual(mockScenes);
    });

    it('should exclude scenes with excluded tags (direct)', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      expect(result).toHaveLength(3);
      expect(result.map(s => s.id)).toEqual(['2', '3', '4']);
    });

    it('should exclude scenes from excluded studios', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'studios',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['studio1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id)).toEqual(['2', '4']);
    });

    it('should exclude scenes in excluded groups', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'groups',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['group1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      expect(result).toHaveLength(3);
      expect(result.map(s => s.id)).toEqual(['2', '3', '4']);
    });

    it('should exclude scenes with galleries containing excluded galleries', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'galleries',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['gallery1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      expect(result).toHaveLength(3);
      expect(result.map(s => s.id)).toEqual(['1', '2', '4']);
    });

    // FIXED: Now cascades properly
    it('should CASCADE: exclude scenes if performer has excluded tag', async () => {
      const prisma = await import('../../prisma/singleton.js');
      // Scene 2 has performer with tag3
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag3']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      // EXPECTED: Scene 2 should be excluded because performer has tag3
      expect(result.map(s => s.id)).not.toContain('2');
      // ACTUAL: Scene 2 is NOT excluded (bug)
    });

    // FIXED: Now cascades properly
    it('should CASCADE: exclude scenes if studio has excluded tag', async () => {
      const prisma = await import('../../prisma/singleton.js');
      // Scene 2 has studio with tag4
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag4']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      // EXPECTED: Scene 2 should be excluded because studio has tag4
      expect(result.map(s => s.id)).not.toContain('2');
      // ACTUAL: Scene 2 is NOT excluded (bug)
    });

    it('should apply INCLUDE filters (whitelist)', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'INCLUDE',
          entityIds: JSON.stringify(['tag1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      // Only Scene 1 has tag1
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should apply INCLUDE filters first, then EXCLUDE filters', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'studios',
          mode: 'INCLUDE',
          entityIds: JSON.stringify(['studio1', 'studio2']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      // INCLUDE studio1 and studio2 → Scenes 1, 2, 3
      // EXCLUDE tag1 → Remove Scene 1
      // Result: Scenes 2, 3
      expect(result.map(s => s.id)).toEqual(['2', '3']);
    });

    it('should respect restrictEmpty flag (exclude scenes with no tags)', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag1']),
          restrictEmpty: true, // Also exclude scenes with NO tags
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      // Scene 1 has tag1 → excluded
      // Scene 3 and 4 have no tags → excluded (restrictEmpty=true)
      // Only Scene 2 remains
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should handle multiple restrictions of different types', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          userId: 1,
          entityType: 'groups',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['group2']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterScenesForUser(mockScenes, 1);

      // Scene 1 has tag1 → excluded
      // Scene 3 has group2 → excluded
      // Scenes 2 and 4 remain
      expect(result.map(s => s.id)).toEqual(['2', '4']);
    });
  });

  describe('filterStudiosForUser', () => {
    const mockStudios: NormalizedStudio[] = [
      {
        id: 'studio1',
        name: 'Studio 1',
        tags: [{ id: 'tag1', name: 'Tag 1' }],
      } as unknown as NormalizedStudio,
      {
        id: 'studio2',
        name: 'Studio 2',
        tags: [{ id: 'tag2', name: 'Tag 2' }],
      } as unknown as NormalizedStudio,
      {
        id: 'studio3',
        name: 'Studio 3',
        tags: [],
      } as unknown as NormalizedStudio,
    ];

    it('should return all studios when no restrictions exist', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([]);

      const result = await userRestrictionService.filterStudiosForUser(mockStudios, 1);

      expect(result).toHaveLength(3);
      expect(result).toEqual(mockStudios);
    });

    it('should exclude studios with excluded studio IDs', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'studios',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['studio1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterStudiosForUser(mockStudios, 1);

      expect(result).toHaveLength(2);
      expect(result.map(s => s.id)).toEqual(['studio2', 'studio3']);
    });

    it('should apply INCLUDE mode (whitelist)', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'studios',
          mode: 'INCLUDE',
          entityIds: JSON.stringify(['studio1', 'studio2']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterStudiosForUser(mockStudios, 1);

      expect(result.map(s => s.id)).toEqual(['studio1', 'studio2']);
    });

    // FIXED: Now cascades properly
    it('should CASCADE: exclude studios with excluded tags', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterStudiosForUser(mockStudios, 1);

      // EXPECTED: Studio 1 should be excluded because it has tag1
      expect(result.map(s => s.id)).toEqual(['studio2', 'studio3']);
      // ACTUAL: Studio 1 is NOT excluded (bug)
    });
  });

  describe('filterPerformersForUser', () => {
    const mockPerformers: NormalizedPerformer[] = [
      {
        id: 'perf1',
        name: 'Performer 1',
        tags: [{ id: 'tag1', name: 'Tag 1' }],
      } as unknown as NormalizedPerformer,
      {
        id: 'perf2',
        name: 'Performer 2',
        tags: [{ id: 'tag2', name: 'Tag 2' }],
      } as unknown as NormalizedPerformer,
      {
        id: 'perf3',
        name: 'Performer 3',
        tags: [],
      } as unknown as NormalizedPerformer,
    ];

    // FIXED: Now filters properly
    it('should exclude performers with excluded tags', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterPerformersForUser(mockPerformers, 1);

      // EXPECTED: Performer 1 should be excluded
      expect(result.map(p => p.id)).toEqual(['perf2', 'perf3']);
      // ACTUAL: All performers returned (bug - no filtering implemented)
    });

    it('should return all performers when no restrictions exist', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([]);

      const result = await userRestrictionService.filterPerformersForUser(mockPerformers, 1);

      expect(result).toHaveLength(3);
      expect(result).toEqual(mockPerformers);
    });
  });

  describe('filterTagsForUser', () => {
    const mockTags: NormalizedTag[] = [
      {
        id: 'tag1',
        name: 'Tag 1',
      } as unknown as NormalizedTag,
      {
        id: 'tag2',
        name: 'Tag 2',
      } as unknown as NormalizedTag,
      {
        id: 'tag3',
        name: 'Tag 3',
      } as unknown as NormalizedTag,
    ];

    it('should return all tags when no restrictions exist', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([]);

      const result = await userRestrictionService.filterTagsForUser(mockTags, 1);

      expect(result).toHaveLength(3);
      expect(result).toEqual(mockTags);
    });

    it('should exclude tags by ID', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['tag1', 'tag2']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterTagsForUser(mockTags, 1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tag3');
    });

    it('should apply INCLUDE mode (whitelist)', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'tags',
          mode: 'INCLUDE',
          entityIds: JSON.stringify(['tag1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterTagsForUser(mockTags, 1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tag1');
    });
  });

  describe('filterGroupsForUser', () => {
    const mockGroups: NormalizedGroup[] = [
      {
        id: 'group1',
        name: 'Group 1',
      } as unknown as NormalizedGroup,
      {
        id: 'group2',
        name: 'Group 2',
      } as unknown as NormalizedGroup,
    ];

    it('should return all groups when no restrictions exist', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([]);

      const result = await userRestrictionService.filterGroupsForUser(mockGroups, 1);

      expect(result).toHaveLength(2);
      expect(result).toEqual(mockGroups);
    });

    it('should exclude groups by ID', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'groups',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['group1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterGroupsForUser(mockGroups, 1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('group2');
    });
  });

  describe('filterGalleriesForUser', () => {
    const mockGalleries: NormalizedGallery[] = [
      {
        id: 'gallery1',
        title: 'Gallery 1',
      } as unknown as NormalizedGallery,
      {
        id: 'gallery2',
        title: 'Gallery 2',
      } as unknown as NormalizedGallery,
    ];

    it('should return all galleries when no restrictions exist', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([]);

      const result = await userRestrictionService.filterGalleriesForUser(mockGalleries, 1);

      expect(result).toHaveLength(2);
      expect(result).toEqual(mockGalleries);
    });

    it('should exclude galleries by ID', async () => {
      const prisma = await import('../../prisma/singleton.js');
      vi.mocked(prisma.default.userContentRestriction.findMany).mockResolvedValue([
        {
          id: 1,
          userId: 1,
          entityType: 'galleries',
          mode: 'EXCLUDE',
          entityIds: JSON.stringify(['gallery1']),
          restrictEmpty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await userRestrictionService.filterGalleriesForUser(mockGalleries, 1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('gallery2');
    });
  });
});
