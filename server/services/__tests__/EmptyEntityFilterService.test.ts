import { describe, it, expect } from 'vitest';
import { emptyEntityFilterService } from '../EmptyEntityFilterService.js';

describe('EmptyEntityFilterService', () => {
  describe('filterEmptyGalleries', () => {
    it('should remove galleries with no images', () => {
      const galleries = [
        { id: '1', image_count: 5 },
        { id: '2', image_count: 0 },
        { id: '3', image_count: null },
        { id: '4', image_count: 10 },
      ];

      const result = emptyEntityFilterService.filterEmptyGalleries(galleries);

      expect(result).toHaveLength(2);
      expect(result.map(g => g.id)).toEqual(['1', '4']);
    });

    it('should keep galleries with images', () => {
      const galleries = [
        { id: '1', image_count: 1 },
        { id: '2', image_count: 100 },
      ];

      const result = emptyEntityFilterService.filterEmptyGalleries(galleries);

      expect(result).toHaveLength(2);
    });

    it('should handle empty input', () => {
      const result = emptyEntityFilterService.filterEmptyGalleries([]);
      expect(result).toEqual([]);
    });
  });

  describe('filterEmptyGroups', () => {
    it('should remove groups with no scenes', () => {
      const groups = [
        { id: '1', scene_count: 5, sub_groups: [] },
        { id: '2', scene_count: 0, sub_groups: [] },
        { id: '3', scene_count: null, sub_groups: [] },
      ];

      const result = emptyEntityFilterService.filterEmptyGroups(groups);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should keep parent groups if child has scenes', () => {
      const groups = [
        {
          id: 'parent',
          scene_count: 0,
          sub_groups: [{ group: { id: 'child', scene_count: 5, sub_groups: [] } }],
        },
        { id: 'child', scene_count: 5, sub_groups: [] },
      ];

      const result = emptyEntityFilterService.filterEmptyGroups(groups);

      // Both parent and child should be kept (parent has child with content)
      expect(result).toHaveLength(2);
      expect(result.map(g => g.id)).toEqual(['parent', 'child']);
    });

    it('should handle nested group hierarchies', () => {
      const groups = [
        {
          id: 'grandparent',
          scene_count: 0,
          sub_groups: [
            {
              group: {
                id: 'parent',
                scene_count: 0,
                sub_groups: [{ group: { id: 'child', scene_count: 10, sub_groups: [] } }],
              },
            },
          ],
        },
        {
          id: 'parent',
          scene_count: 0,
          sub_groups: [{ group: { id: 'child', scene_count: 10, sub_groups: [] } }],
        },
        { id: 'child', scene_count: 10, sub_groups: [] },
      ];

      const result = emptyEntityFilterService.filterEmptyGroups(groups);

      // All should be kept (grandparent → parent → child chain with content at leaf)
      expect(result).toHaveLength(3);
    });

    it('should handle circular group hierarchies gracefully', () => {
      const childGroup: any = { id: 'child', scene_count: 0, sub_groups: [] };
      const parentGroup: any = { id: 'parent', scene_count: 5, sub_groups: [{ group: childGroup }] };

      // Create circular reference
      childGroup.sub_groups = [{ group: parentGroup }];

      const groups = [parentGroup, childGroup];

      const result = emptyEntityFilterService.filterEmptyGroups(groups);

      // Should not infinite loop, should keep both (parent has scenes)
      expect(result).toHaveLength(2);
    });

    it('should handle empty input', () => {
      const result = emptyEntityFilterService.filterEmptyGroups([]);
      expect(result).toEqual([]);
    });
  });

  describe('filterEmptyPerformers', () => {
    const visibleGroups = [
      { id: 'group1', performers: [{ id: 'perf1' }, { id: 'perf2' }] },
      { id: 'group2', performers: [{ id: 'perf3' }] },
    ];

    const visibleGalleries = [
      { id: 'gallery1', performers: [{ id: 'perf2' }] },
      { id: 'gallery2', performers: [{ id: 'perf4' }] },
    ];

    it('should keep performers with scenes', () => {
      const performers = [
        { id: 'perf1', scene_count: 5, image_count: 0 },
        { id: 'perf2', scene_count: 0, image_count: 0 },
      ];

      const result = emptyEntityFilterService.filterEmptyPerformers(
        performers,
        visibleGroups as any,
        visibleGalleries as any
      );

      // perf1 has scenes, should be kept
      expect(result.map(p => p.id)).toContain('perf1');
    });

    it('should keep performers with images', () => {
      const performers = [
        { id: 'perf1', scene_count: 0, image_count: 10 },
        { id: 'perf2', scene_count: 0, image_count: 0 },
      ];

      const result = emptyEntityFilterService.filterEmptyPerformers(
        performers,
        visibleGroups as any,
        visibleGalleries as any
      );

      // perf1 has images, should be kept
      expect(result.map(p => p.id)).toContain('perf1');
    });

    it('should keep performers in visible groups', () => {
      const performers = [
        { id: 'perf1', scene_count: 0, image_count: 0 }, // In group1
        { id: 'perf3', scene_count: 0, image_count: 0 }, // In group2
        { id: 'perf5', scene_count: 0, image_count: 0 }, // Not in any group
      ];

      const result = emptyEntityFilterService.filterEmptyPerformers(
        performers,
        visibleGroups as any,
        visibleGalleries as any
      );

      // perf1 and perf3 should be kept (in visible groups)
      expect(result.map(p => p.id)).toEqual(['perf1', 'perf3']);
    });

    it('should keep performers with visible galleries', () => {
      const performers = [
        { id: 'perf2', scene_count: 0, image_count: 0 }, // In gallery1
        { id: 'perf4', scene_count: 0, image_count: 0 }, // In gallery2
        { id: 'perf5', scene_count: 0, image_count: 0 }, // Not in any gallery
      ];

      const result = emptyEntityFilterService.filterEmptyPerformers(
        performers,
        visibleGroups as any,
        visibleGalleries as any
      );

      // perf2 and perf4 should be kept (have visible galleries)
      expect(result.map(p => p.id)).toEqual(['perf2', 'perf4']);
    });

    it('should remove performers with no content', () => {
      const performers = [
        { id: 'perf1', scene_count: 5, image_count: 0 },
        { id: 'perf2', scene_count: 0, image_count: 10 },
        { id: 'perf_orphan', scene_count: 0, image_count: 0 },
      ];

      const result = emptyEntityFilterService.filterEmptyPerformers(
        performers,
        [] as any, // No visible groups
        [] as any  // No visible galleries
      );

      // Only perf1 and perf2 kept, perf_orphan removed
      expect(result.map(p => p.id)).toEqual(['perf1', 'perf2']);
    });
  });

  describe('filterEmptyStudios', () => {
    const visibleGroups = [{ id: 'group1' }, { id: 'group2' }];
    // Galleries include studio references for the gallery->studio lookup
    const visibleGalleries = [
      { id: 'gallery1', studio: { id: 'studio_with_gallery' } },
      { id: 'gallery2' },
    ];

    it('should keep studios with scenes', () => {
      const studios = [
        { id: 'studio1', scene_count: 5, image_count: 0 },
        { id: 'studio2', scene_count: 0, image_count: 0 },
      ];

      const result = emptyEntityFilterService.filterEmptyStudios(
        studios,
        visibleGroups as any,
        visibleGalleries as any
      );

      expect(result.map(s => s.id)).toEqual(['studio1']);
    });

    it('should keep studios with images', () => {
      const studios = [
        { id: 'studio1', scene_count: 0, image_count: 10 },
        { id: 'studio2', scene_count: 0, image_count: 0 },
      ];

      const result = emptyEntityFilterService.filterEmptyStudios(
        studios,
        visibleGroups as any,
        visibleGalleries as any
      );

      expect(result.map(s => s.id)).toEqual(['studio1']);
    });

    it('should keep studios with visible groups', () => {
      const studios = [
        { id: 'studio1', scene_count: 0, image_count: 0, groups: [{ id: 'group1' }] },
        { id: 'studio2', scene_count: 0, image_count: 0, groups: [{ id: 'group_hidden' }] },
      ];

      const result = emptyEntityFilterService.filterEmptyStudios(
        studios,
        visibleGroups as any,
        visibleGalleries as any
      );

      // studio1 has visible group, studio2 doesn't
      expect(result.map(s => s.id)).toEqual(['studio1']);
    });

    it('should keep studios with visible galleries', () => {
      // The new implementation looks up gallery.studio.id, not studio.galleries[]
      const studios = [
        { id: 'studio_with_gallery', scene_count: 0, image_count: 0 },
        { id: 'studio2', scene_count: 0, image_count: 0 },
      ];

      const result = emptyEntityFilterService.filterEmptyStudios(
        studios,
        visibleGroups as any,
        visibleGalleries as any
      );

      // studio_with_gallery has visible gallery (gallery1), studio2 doesn't
      expect(result.map(s => s.id)).toEqual(['studio_with_gallery']);
    });

    it('should keep parent studios with visible child studios', () => {
      const studios = [
        { id: 'parent_studio', scene_count: 0, image_count: 0 },
        { id: 'child_studio', scene_count: 5, image_count: 0, parent_studio: { id: 'parent_studio' } },
        { id: 'orphan_parent', scene_count: 0, image_count: 0 },
      ];

      const result = emptyEntityFilterService.filterEmptyStudios(
        studios,
        visibleGroups as any,
        visibleGalleries as any
      );

      // parent_studio should be kept because child_studio has scenes
      // child_studio has scenes directly
      // orphan_parent has no content and no children with content
      expect(result.map(s => s.id)).toEqual(['parent_studio', 'child_studio']);
    });

    it('should remove studios with no content', () => {
      const studios = [
        { id: 'studio_orphan', scene_count: 0, image_count: 0, groups: [], galleries: [] },
      ];

      const result = emptyEntityFilterService.filterEmptyStudios(
        studios,
        visibleGroups as any,
        visibleGalleries as any
      );

      expect(result).toHaveLength(0);
    });

    // BUG TEST: Empty filtering uses Stash counts (not restriction-aware)
    it.fails('should use restriction-aware counts, not Stash counts', () => {
      // This studio has 100 scenes according to Stash
      // BUT if all 100 scenes are excluded by user restrictions,
      // the studio should be considered empty
      const studios = [
        { id: 'studio1', scene_count: 100, image_count: 0, groups: [], galleries: [] },
      ];

      // In reality, user can't see any of those 100 scenes (all restricted)
      // EXPECTED: Studio should be removed
      const result = emptyEntityFilterService.filterEmptyStudios(
        studios,
        visibleGroups as any,
        visibleGalleries as any
      );

      // ACTUAL: Studio is kept because scene_count > 0
      expect(result).toHaveLength(0); // Bug: will be 1
    });
  });

  describe('filterEmptyTags', () => {
    it('should keep tags with scenes', () => {
      const tags = [
        { id: 'tag1', scene_count: 5, image_count: 0, gallery_count: 0, group_count: 0, performer_count: 0, studio_count: 0 },
        { id: 'tag2', scene_count: 0, image_count: 0, gallery_count: 0, group_count: 0, performer_count: 0, studio_count: 0 },
      ];

      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set<string>(),
        performers: new Set<string>(),
        studios: new Set<string>(),
      };

      const result = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);

      expect(result.map(t => t.id)).toEqual(['tag1']);
    });

    it('should keep tags with images', () => {
      const tags = [
        { id: 'tag1', scene_count: 0, image_count: 10, gallery_count: 0, group_count: 0, performer_count: 0, studio_count: 0 },
      ];

      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set<string>(),
        performers: new Set<string>(),
        studios: new Set<string>(),
      };

      const result = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);

      expect(result).toHaveLength(1);
    });

    it('should keep tags attached to galleries', () => {
      const tags = [
        { id: 'tag1', scene_count: 0, image_count: 0, gallery_count: 5, group_count: 0, performer_count: 0, studio_count: 0 },
      ];

      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set<string>(),
        performers: new Set<string>(),
        studios: new Set<string>(),
      };

      const result = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);

      expect(result).toHaveLength(1);
    });

    it('should keep parent tags if child has content', () => {
      const tags = [
        {
          id: 'parent',
          scene_count: 0,
          image_count: 0,
          gallery_count: 0,
          group_count: 0,
          performer_count: 0,
          studio_count: 0,
          children: [{ id: 'child' }],
        },
        {
          id: 'child',
          scene_count: 10,
          image_count: 0,
          gallery_count: 0,
          group_count: 0,
          performer_count: 0,
          studio_count: 0,
          children: [],
        },
      ];

      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set<string>(),
        performers: new Set<string>(),
        studios: new Set<string>(),
      };

      const result = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);

      // Both parent and child should be kept
      expect(result).toHaveLength(2);
      expect(result.map(t => t.id)).toEqual(['parent', 'child']);
    });

    it('should handle complex tag DAG', () => {
      const tags = [
        {
          id: 'grandparent',
          scene_count: 0,
          image_count: 0,
          gallery_count: 0,
          group_count: 0,
          performer_count: 0,
          studio_count: 0,
          children: [{ id: 'parent1' }, { id: 'parent2' }],
        },
        {
          id: 'parent1',
          scene_count: 0,
          image_count: 0,
          gallery_count: 0,
          group_count: 0,
          performer_count: 0,
          studio_count: 0,
          children: [{ id: 'child' }],
        },
        {
          id: 'parent2',
          scene_count: 0,
          image_count: 0,
          gallery_count: 0,
          group_count: 0,
          performer_count: 0,
          studio_count: 0,
          children: [{ id: 'child' }],
        },
        {
          id: 'child',
          scene_count: 5,
          image_count: 0,
          gallery_count: 0,
          group_count: 0,
          performer_count: 0,
          studio_count: 0,
          children: [],
        },
      ];

      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set<string>(),
        performers: new Set<string>(),
        studios: new Set<string>(),
      };

      const result = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);

      // All should be kept (child has content → parent1 has content → grandparent has content)
      expect(result).toHaveLength(4);
    });

    it('should remove tags with no attachments', () => {
      const tags = [
        { id: 'tag_orphan', scene_count: 0, image_count: 0, gallery_count: 0, group_count: 0, performer_count: 0, studio_count: 0, children: [] },
      ];

      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set<string>(),
        performers: new Set<string>(),
        studios: new Set<string>(),
      };

      const result = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);

      expect(result).toHaveLength(0);
    });

    it('should handle circular references gracefully', () => {
      const tagA = {
        id: 'tagA',
        scene_count: 5,
        image_count: 0,
        gallery_count: 0,
        group_count: 0,
        performer_count: 0,
        studio_count: 0,
        children: [] as any[],
      };

      const tagB = {
        id: 'tagB',
        scene_count: 0,
        image_count: 0,
        gallery_count: 0,
        group_count: 0,
        performer_count: 0,
        studio_count: 0,
        children: [{ id: 'tagA' }],
      };

      tagA.children = [{ id: 'tagB' }];

      const tags = [tagA, tagB];

      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set<string>(),
        performers: new Set<string>(),
        studios: new Set<string>(),
      };

      const result = emptyEntityFilterService.filterEmptyTags(tags, visibilitySet);

      // Should not infinite loop, both should be kept (tagA has scenes)
      expect(result).toHaveLength(2);
    });

    it('should handle empty input', () => {
      const visibilitySet = {
        galleries: new Set<string>(),
        groups: new Set<string>(),
        performers: new Set<string>(),
        studios: new Set<string>(),
      };

      const result = emptyEntityFilterService.filterEmptyTags([], visibilitySet);
      expect(result).toEqual([]);
    });
  });

  describe('filterAllEntities', () => {
    it('should filter all entity types in correct dependency order', () => {
      const entities = {
        galleries: [
          { id: 'gallery1', image_count: 5 },
          { id: 'gallery2', image_count: 0 },
        ],
        groups: [
          { id: 'group1', scene_count: 10, sub_groups: [] },
          { id: 'group2', scene_count: 0, sub_groups: [] },
        ],
        studios: [
          { id: 'studio1', scene_count: 5, image_count: 0 },
          { id: 'studio2', scene_count: 0, image_count: 0, groups: [], galleries: [] },
        ],
        performers: [
          { id: 'perf1', scene_count: 5, image_count: 0 },
          { id: 'perf2', scene_count: 0, image_count: 0 },
        ],
        tags: [
          { id: 'tag1', scene_count: 5, image_count: 0, gallery_count: 0, group_count: 0, performer_count: 0, studio_count: 0, children: [] },
          { id: 'tag2', scene_count: 0, image_count: 0, gallery_count: 0, group_count: 0, performer_count: 0, studio_count: 0, children: [] },
        ],
      };

      const result = emptyEntityFilterService.filterAllEntities(entities);

      // Galleries: gallery1 kept
      expect(result.galleries).toHaveLength(1);
      expect(result.galleries![0].id).toBe('gallery1');

      // Groups: group1 kept
      expect(result.groups).toHaveLength(1);
      expect(result.groups![0].id).toBe('group1');

      // Studios: studio1 kept
      expect(result.studios).toHaveLength(1);
      expect(result.studios![0].id).toBe('studio1');

      // Performers: perf1 kept
      expect(result.performers).toHaveLength(1);
      expect(result.performers![0].id).toBe('perf1');

      // Tags: tag1 kept
      expect(result.tags).toHaveLength(1);
      expect(result.tags![0].id).toBe('tag1');

      // Visibility sets should be populated
      expect(result.visibilitySets.galleries.has('gallery1')).toBe(true);
      expect(result.visibilitySets.groups.has('group1')).toBe(true);
      expect(result.visibilitySets.studios.has('studio1')).toBe(true);
      expect(result.visibilitySets.performers.has('perf1')).toBe(true);
    });
  });
});
