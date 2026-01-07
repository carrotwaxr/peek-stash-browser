# Rich Tooltip Indicators Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make indicator tooltips consistent across all card types by adding rich entity data to API responses and using TooltipEntityGrid.

**Architecture:** Extend QueryBuilder.populateRelations() methods to include additional entity relationships with minimal fields (id, name, image). Create client-side config for indicator behavior (rich/nav/count) that can later be user-customizable.

**Tech Stack:** TypeScript (server), React/JSX (client), Prisma, Vitest

---

## Task 1: Create Client Indicator Behavior Config

**Files:**
- Create: `client/src/config/indicatorBehaviors.js`

**Step 1: Create the config file**

```javascript
/**
 * Indicator behavior configuration
 *
 * Future: This will be sourced from user settings in the database.
 * Users will be able to customize behavior per card type per relationship.
 *
 * Behaviors:
 * - 'rich': Show TooltipEntityGrid with entity previews
 * - 'nav': Count + click navigates to filtered list
 * - 'count': Count only, no interaction
 */

export const INDICATOR_BEHAVIORS = {
  scene: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'count',
    images: 'count',
  },
  image: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'count',
    images: 'count',
  },
  gallery: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'count',
    scenes: 'nav',
    images: 'nav',
  },
  performer: {
    performers: 'count',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
  tag: {
    performers: 'rich',
    tags: 'count',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
  studio: {
    performers: 'rich',
    tags: 'rich',
    studios: 'count',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
  group: {
    performers: 'rich',
    tags: 'rich',
    studios: 'rich',
    groups: 'rich',
    galleries: 'rich',
    scenes: 'nav',
    images: 'nav',
  },
};

/**
 * Get indicator behavior for a card type and relationship
 * @param {string} cardType - The card type (scene, performer, tag, etc.)
 * @param {string} relationshipType - The relationship (performers, tags, etc.)
 * @returns {'rich'|'nav'|'count'} The behavior for this indicator
 */
export function getIndicatorBehavior(cardType, relationshipType) {
  return INDICATOR_BEHAVIORS[cardType]?.[relationshipType] ?? 'count';
}
```

**Step 2: Commit**

```bash
git add client/src/config/indicatorBehaviors.js
git commit -m "feat: add indicator behavior config for rich tooltips"
```

---

## Task 2: Write Integration Tests for Performer Tooltip Data

**Files:**
- Modify: `server/integration/api/performers.integration.test.ts`

**Step 1: Add test for tooltip entity data**

Add this test after the existing "returns performer by ID" test (around line 50):

```typescript
    it("returns performer with tooltip entity data (tags, groups, galleries, studios)", async () => {
      const response = await adminClient.post<FindPerformersResponse>("/api/library/performers", {
        ids: [TEST_ENTITIES.performerWithScenes],
      });

      expect(response.ok).toBe(true);
      const performer = response.data.findPerformers.performers[0];

      // Tags should have image_path for TooltipEntityGrid
      if (performer.tags && performer.tags.length > 0) {
        expect(performer.tags[0]).toHaveProperty('id');
        expect(performer.tags[0]).toHaveProperty('name');
        expect(performer.tags[0]).toHaveProperty('image_path');
      }

      // Groups should exist with tooltip data
      expect(performer).toHaveProperty('groups');
      if (performer.groups && performer.groups.length > 0) {
        expect(performer.groups[0]).toHaveProperty('id');
        expect(performer.groups[0]).toHaveProperty('name');
        expect(performer.groups[0]).toHaveProperty('front_image_path');
      }

      // Galleries should exist with tooltip data
      expect(performer).toHaveProperty('galleries');
      if (performer.galleries && performer.galleries.length > 0) {
        expect(performer.galleries[0]).toHaveProperty('id');
        expect(performer.galleries[0]).toHaveProperty('title');
        expect(performer.galleries[0]).toHaveProperty('cover');
      }

      // Studios should exist with tooltip data
      expect(performer).toHaveProperty('studios');
      if (performer.studios && performer.studios.length > 0) {
        expect(performer.studios[0]).toHaveProperty('id');
        expect(performer.studios[0]).toHaveProperty('name');
        expect(performer.studios[0]).toHaveProperty('image_path');
      }
    });
```

**Step 2: Update response type**

Update the FindPerformersResponse interface at the top of the file:

```typescript
interface FindPerformersResponse {
  findPerformers: {
    performers: Array<{
      id: string;
      name: string;
      tags?: Array<{ id: string; name: string; image_path: string | null }>;
      groups?: Array<{ id: string; name: string; front_image_path: string | null }>;
      galleries?: Array<{ id: string; title: string; cover: string | null }>;
      studios?: Array<{ id: string; name: string; image_path: string | null }>;
    }>;
    count: number;
  };
}
```

**Step 3: Run test to verify it fails**

```bash
cd server && npm run test:integration -- performers.integration.test.ts -v
```

Expected: FAIL - performer doesn't have groups, galleries, studios properties yet

**Step 4: Commit failing test**

```bash
git add server/integration/api/performers.integration.test.ts
git commit -m "test: add integration test for performer tooltip entity data"
```

---

## Task 3: Add Tooltip Entity Data to PerformerQueryBuilder

**Files:**
- Modify: `server/services/PerformerQueryBuilder.ts:1025-1069`

**Step 1: Update populateRelations to add groups, galleries, studios**

Replace the entire `populateRelations` method (lines 1025-1069):

```typescript
  /**
   * Populate performer relations (tags, groups, galleries, studios)
   * Includes minimal data for TooltipEntityGrid: id, name, image_path/cover
   */
  async populateRelations(performers: NormalizedPerformer[]): Promise<void> {
    if (performers.length === 0) return;

    const performerIds = performers.map((p) => p.id);

    // Load all junctions in parallel
    const [tagJunctions, scenePerformers] = await Promise.all([
      prisma.performerTag.findMany({
        where: { performerId: { in: performerIds } },
      }),
      // Get scenes this performer appears in to derive groups, galleries, studios
      prisma.scenePerformer.findMany({
        where: { performerId: { in: performerIds } },
        select: { performerId: true, sceneId: true },
      }),
    ]);

    // Get scene IDs for this performer
    const sceneIds = [...new Set(scenePerformers.map((sp) => sp.sceneId))];

    // Load related entities from scenes
    const [sceneGroups, sceneGalleries, scenes] = await Promise.all([
      sceneIds.length > 0
        ? prisma.sceneGroup.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, groupId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGallery.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, galleryId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.stashScene.findMany({
            where: { id: { in: sceneIds } },
            select: { id: true, studioId: true },
          })
        : [],
    ]);

    // Get unique entity IDs
    const tagIds = [...new Set(tagJunctions.map((j) => j.tagId))];
    const groupIds = [...new Set(sceneGroups.map((sg) => sg.groupId))];
    const galleryIds = [...new Set(sceneGalleries.map((sg) => sg.galleryId))];
    const studioIds = [...new Set(scenes.map((s) => s.studioId).filter((id): id is string => !!id))];

    // Load all entities in parallel
    const [tags, groups, galleries, studios] = await Promise.all([
      tagIds.length > 0
        ? prisma.stashTag.findMany({ where: { id: { in: tagIds } } })
        : [],
      groupIds.length > 0
        ? prisma.stashGroup.findMany({ where: { id: { in: groupIds } } })
        : [],
      galleryIds.length > 0
        ? prisma.stashGallery.findMany({ where: { id: { in: galleryIds } } })
        : [],
      studioIds.length > 0
        ? prisma.stashStudio.findMany({ where: { id: { in: studioIds } } })
        : [],
    ]);

    // Build lookup maps with minimal tooltip data
    const tagsById = new Map(tags.map((t) => [t.id, {
      id: t.id,
      name: t.name,
      image_path: this.transformUrl(t.imagePath),
    }]));

    const groupsById = new Map(groups.map((g) => [g.id, {
      id: g.id,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath),
    }]));

    const galleriesById = new Map(galleries.map((g) => [g.id, {
      id: g.id,
      title: g.title,
      cover: this.transformUrl(g.coverPath),
    }]));

    const studiosById = new Map(studios.map((s) => [s.id, {
      id: s.id,
      name: s.name,
      image_path: this.transformUrl(s.imagePath),
    }]));

    // Build performer -> scene mapping
    const scenesByPerformer = new Map<string, Set<string>>();
    for (const sp of scenePerformers) {
      const set = scenesByPerformer.get(sp.performerId) || new Set();
      set.add(sp.sceneId);
      scenesByPerformer.set(sp.performerId, set);
    }

    // Build scene -> entities mappings
    const groupsByScene = new Map<string, Set<string>>();
    for (const sg of sceneGroups) {
      const set = groupsByScene.get(sg.sceneId) || new Set();
      set.add(sg.groupId);
      groupsByScene.set(sg.sceneId, set);
    }

    const galleriesByScene = new Map<string, Set<string>>();
    for (const sg of sceneGalleries) {
      const set = galleriesByScene.get(sg.sceneId) || new Set();
      set.add(sg.galleryId);
      galleriesByScene.set(sg.sceneId, set);
    }

    const studioByScene = new Map<string, string>();
    for (const s of scenes) {
      if (s.studioId) studioByScene.set(s.id, s.studioId);
    }

    // Build performer -> tags map
    const tagsByPerformer = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tag = tagsById.get(junction.tagId);
      if (!tag) continue;
      const list = tagsByPerformer.get(junction.performerId) || [];
      list.push(tag);
      tagsByPerformer.set(junction.performerId, list);
    }

    // Populate performers with all relations
    for (const performer of performers) {
      performer.tags = tagsByPerformer.get(performer.id) || [];

      // Derive groups, galleries, studios from performer's scenes
      const performerSceneIds = scenesByPerformer.get(performer.id) || new Set();

      const performerGroupIds = new Set<string>();
      const performerGalleryIds = new Set<string>();
      const performerStudioIds = new Set<string>();

      for (const sceneId of performerSceneIds) {
        for (const gid of groupsByScene.get(sceneId) || []) performerGroupIds.add(gid);
        for (const gid of galleriesByScene.get(sceneId) || []) performerGalleryIds.add(gid);
        const sid = studioByScene.get(sceneId);
        if (sid) performerStudioIds.add(sid);
      }

      (performer as any).groups = [...performerGroupIds].map((id) => groupsById.get(id)).filter(Boolean);
      (performer as any).galleries = [...performerGalleryIds].map((id) => galleriesById.get(id)).filter(Boolean);
      (performer as any).studios = [...performerStudioIds].map((id) => studiosById.get(id)).filter(Boolean);
    }
  }
```

**Step 2: Run test to verify it passes**

```bash
cd server && npm run test:integration -- performers.integration.test.ts -v
```

Expected: PASS

**Step 3: Commit**

```bash
git add server/services/PerformerQueryBuilder.ts
git commit -m "feat: add groups, galleries, studios relations to performer response"
```

---

## Task 4: Write Integration Tests for Tag Tooltip Data

**Files:**
- Modify: `server/integration/api/tags.integration.test.ts`

**Step 1: Add test for tooltip entity data**

Add after existing tests:

```typescript
    it("returns tag with tooltip entity data (performers, studios, groups, galleries)", async () => {
      const response = await adminClient.post<FindTagsResponse>("/api/library/tags", {
        ids: [TEST_ENTITIES.tagWithEntities],
      });

      expect(response.ok).toBe(true);
      const tag = response.data.findTags.tags[0];

      // Performers should exist with tooltip data
      expect(tag).toHaveProperty('performers');
      if (tag.performers && tag.performers.length > 0) {
        expect(tag.performers[0]).toHaveProperty('id');
        expect(tag.performers[0]).toHaveProperty('name');
        expect(tag.performers[0]).toHaveProperty('image_path');
      }

      // Studios should exist with tooltip data
      expect(tag).toHaveProperty('studios');
      if (tag.studios && tag.studios.length > 0) {
        expect(tag.studios[0]).toHaveProperty('id');
        expect(tag.studios[0]).toHaveProperty('name');
        expect(tag.studios[0]).toHaveProperty('image_path');
      }

      // Groups should exist with tooltip data
      expect(tag).toHaveProperty('groups');
      if (tag.groups && tag.groups.length > 0) {
        expect(tag.groups[0]).toHaveProperty('id');
        expect(tag.groups[0]).toHaveProperty('name');
        expect(tag.groups[0]).toHaveProperty('front_image_path');
      }

      // Galleries should exist with tooltip data
      expect(tag).toHaveProperty('galleries');
      if (tag.galleries && tag.galleries.length > 0) {
        expect(tag.galleries[0]).toHaveProperty('id');
        expect(tag.galleries[0]).toHaveProperty('title');
        expect(tag.galleries[0]).toHaveProperty('cover');
      }
    });
```

**Step 2: Run test to verify it fails**

```bash
cd server && npm run test:integration -- tags.integration.test.ts -v
```

Expected: FAIL

**Step 3: Commit failing test**

```bash
git add server/integration/api/tags.integration.test.ts
git commit -m "test: add integration test for tag tooltip entity data"
```

---

## Task 5: Add Tooltip Entity Data to TagQueryBuilder

**Files:**
- Modify: `server/services/TagQueryBuilder.ts`

**Step 1: Add populateRelations method after transformRow (around line 736)**

```typescript
  /**
   * Populate tag relations (performers, studios, groups, galleries)
   * Includes minimal data for TooltipEntityGrid: id, name, image_path/cover
   */
  async populateRelations(tags: NormalizedTag[]): Promise<void> {
    if (tags.length === 0) return;

    const tagIds = tags.map((t) => t.id);

    // Load all junctions in parallel
    const [performerTags, studioTags, groupTags, galleryTags] = await Promise.all([
      prisma.performerTag.findMany({
        where: { tagId: { in: tagIds } },
        select: { tagId: true, performerId: true },
      }),
      prisma.studioTag.findMany({
        where: { tagId: { in: tagIds } },
        select: { tagId: true, studioId: true },
      }),
      prisma.groupTag.findMany({
        where: { tagId: { in: tagIds } },
        select: { tagId: true, groupId: true },
      }),
      prisma.galleryTag.findMany({
        where: { tagId: { in: tagIds } },
        select: { tagId: true, galleryId: true },
      }),
    ]);

    // Get unique entity IDs
    const performerIds = [...new Set(performerTags.map((pt) => pt.performerId))];
    const studioIds = [...new Set(studioTags.map((st) => st.studioId))];
    const groupIds = [...new Set(groupTags.map((gt) => gt.groupId))];
    const galleryIds = [...new Set(galleryTags.map((gt) => gt.galleryId))];

    // Load all entities in parallel
    const [performers, studios, groups, galleries] = await Promise.all([
      performerIds.length > 0
        ? prisma.stashPerformer.findMany({ where: { id: { in: performerIds } } })
        : [],
      studioIds.length > 0
        ? prisma.stashStudio.findMany({ where: { id: { in: studioIds } } })
        : [],
      groupIds.length > 0
        ? prisma.stashGroup.findMany({ where: { id: { in: groupIds } } })
        : [],
      galleryIds.length > 0
        ? prisma.stashGallery.findMany({ where: { id: { in: galleryIds } } })
        : [],
    ]);

    // Build lookup maps with minimal tooltip data
    const performersById = new Map(performers.map((p) => [p.id, {
      id: p.id,
      name: p.name,
      image_path: this.transformUrl(p.imagePath),
    }]));

    const studiosById = new Map(studios.map((s) => [s.id, {
      id: s.id,
      name: s.name,
      image_path: this.transformUrl(s.imagePath),
    }]));

    const groupsById = new Map(groups.map((g) => [g.id, {
      id: g.id,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath),
    }]));

    const galleriesById = new Map(galleries.map((g) => [g.id, {
      id: g.id,
      title: g.title,
      cover: this.transformUrl(g.coverPath),
    }]));

    // Build tag -> entities maps
    const performersByTag = new Map<string, any[]>();
    for (const pt of performerTags) {
      const performer = performersById.get(pt.performerId);
      if (!performer) continue;
      const list = performersByTag.get(pt.tagId) || [];
      list.push(performer);
      performersByTag.set(pt.tagId, list);
    }

    const studiosByTag = new Map<string, any[]>();
    for (const st of studioTags) {
      const studio = studiosById.get(st.studioId);
      if (!studio) continue;
      const list = studiosByTag.get(st.tagId) || [];
      list.push(studio);
      studiosByTag.set(st.tagId, list);
    }

    const groupsByTag = new Map<string, any[]>();
    for (const gt of groupTags) {
      const group = groupsById.get(gt.groupId);
      if (!group) continue;
      const list = groupsByTag.get(gt.tagId) || [];
      list.push(group);
      groupsByTag.set(gt.tagId, list);
    }

    const galleriesByTag = new Map<string, any[]>();
    for (const gt of galleryTags) {
      const gallery = galleriesById.get(gt.galleryId);
      if (!gallery) continue;
      const list = galleriesByTag.get(gt.tagId) || [];
      list.push(gallery);
      galleriesByTag.set(gt.tagId, list);
    }

    // Populate tags with all relations
    for (const tag of tags) {
      (tag as any).performers = performersByTag.get(tag.id) || [];
      (tag as any).studios = studiosByTag.get(tag.id) || [];
      (tag as any).groups = groupsByTag.get(tag.id) || [];
      (tag as any).galleries = galleriesByTag.get(tag.id) || [];
    }
  }
```

**Step 2: Call populateRelations in execute method**

Find the execute method (around line 677) and add after `const tags = rows.map(...)`:

```typescript
    const tags = rows.map((row) => this.transformRow(row));

    // Populate relations for tooltip data
    await this.populateRelations(tags);
```

**Step 3: Run test to verify it passes**

```bash
cd server && npm run test:integration -- tags.integration.test.ts -v
```

Expected: PASS

**Step 4: Commit**

```bash
git add server/services/TagQueryBuilder.ts
git commit -m "feat: add performers, studios, groups, galleries relations to tag response"
```

---

## Task 6: Write Integration Tests for Studio Tooltip Data

**Files:**
- Modify: `server/integration/api/studios.integration.test.ts`

**Step 1: Add test for tooltip entity data**

```typescript
    it("returns studio with tooltip entity data (performers, groups, galleries)", async () => {
      const response = await adminClient.post<FindStudiosResponse>("/api/library/studios", {
        ids: [TEST_ENTITIES.studioWithScenes],
      });

      expect(response.ok).toBe(true);
      const studio = response.data.findStudios.studios[0];

      // Tags should have image_path (already exists)
      if (studio.tags && studio.tags.length > 0) {
        expect(studio.tags[0]).toHaveProperty('id');
        expect(studio.tags[0]).toHaveProperty('name');
        expect(studio.tags[0]).toHaveProperty('image_path');
      }

      // Performers should exist with tooltip data
      expect(studio).toHaveProperty('performers');
      if (studio.performers && studio.performers.length > 0) {
        expect(studio.performers[0]).toHaveProperty('id');
        expect(studio.performers[0]).toHaveProperty('name');
        expect(studio.performers[0]).toHaveProperty('image_path');
      }

      // Groups should exist with tooltip data
      expect(studio).toHaveProperty('groups');
      if (studio.groups && studio.groups.length > 0) {
        expect(studio.groups[0]).toHaveProperty('id');
        expect(studio.groups[0]).toHaveProperty('name');
        expect(studio.groups[0]).toHaveProperty('front_image_path');
      }

      // Galleries should exist with tooltip data
      expect(studio).toHaveProperty('galleries');
      if (studio.galleries && studio.galleries.length > 0) {
        expect(studio.galleries[0]).toHaveProperty('id');
        expect(studio.galleries[0]).toHaveProperty('title');
        expect(studio.galleries[0]).toHaveProperty('cover');
      }
    });
```

**Step 2: Run test to verify it fails**

```bash
cd server && npm run test:integration -- studios.integration.test.ts -v
```

**Step 3: Commit failing test**

```bash
git add server/integration/api/studios.integration.test.ts
git commit -m "test: add integration test for studio tooltip entity data"
```

---

## Task 7: Add Tooltip Entity Data to StudioQueryBuilder

**Files:**
- Modify: `server/services/StudioQueryBuilder.ts:571-615`

**Step 1: Replace populateRelations method**

```typescript
  /**
   * Populate studio relations (tags, performers, groups, galleries)
   * Includes minimal data for TooltipEntityGrid
   */
  async populateRelations(studios: NormalizedStudio[]): Promise<void> {
    if (studios.length === 0) return;

    const studioIds = studios.map((s) => s.id);

    // Load tag junctions and scenes for this studio
    const [tagJunctions, scenes] = await Promise.all([
      prisma.studioTag.findMany({
        where: { studioId: { in: studioIds } },
      }),
      prisma.stashScene.findMany({
        where: { studioId: { in: studioIds } },
        select: { id: true, studioId: true },
      }),
    ]);

    const sceneIds = scenes.map((s) => s.id);

    // Load scene relationships
    const [scenePerformers, sceneGroups, sceneGalleries] = await Promise.all([
      sceneIds.length > 0
        ? prisma.scenePerformer.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, performerId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGroup.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, groupId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGallery.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, galleryId: true },
          })
        : [],
    ]);

    // Get unique entity IDs
    const tagIds = [...new Set(tagJunctions.map((j) => j.tagId))];
    const performerIds = [...new Set(scenePerformers.map((sp) => sp.performerId))];
    const groupIds = [...new Set(sceneGroups.map((sg) => sg.groupId))];
    const galleryIds = [...new Set(sceneGalleries.map((sg) => sg.galleryId))];

    // Load all entities in parallel
    const [tags, performers, groups, galleries] = await Promise.all([
      tagIds.length > 0 ? prisma.stashTag.findMany({ where: { id: { in: tagIds } } }) : [],
      performerIds.length > 0 ? prisma.stashPerformer.findMany({ where: { id: { in: performerIds } } }) : [],
      groupIds.length > 0 ? prisma.stashGroup.findMany({ where: { id: { in: groupIds } } }) : [],
      galleryIds.length > 0 ? prisma.stashGallery.findMany({ where: { id: { in: galleryIds } } }) : [],
    ]);

    // Build lookup maps
    const tagsById = new Map(tags.map((t) => [t.id, {
      id: t.id,
      name: t.name,
      image_path: this.transformUrl(t.imagePath),
    }]));

    const performersById = new Map(performers.map((p) => [p.id, {
      id: p.id,
      name: p.name,
      image_path: this.transformUrl(p.imagePath),
    }]));

    const groupsById = new Map(groups.map((g) => [g.id, {
      id: g.id,
      name: g.name,
      front_image_path: this.transformUrl(g.frontImagePath),
    }]));

    const galleriesById = new Map(galleries.map((g) => [g.id, {
      id: g.id,
      title: g.title,
      cover: this.transformUrl(g.coverPath),
    }]));

    // Build scene -> studio mapping
    const studioByScene = new Map(scenes.map((s) => [s.id, s.studioId]));

    // Build studio -> entities maps
    const tagsByStudio = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tag = tagsById.get(junction.tagId);
      if (!tag) continue;
      const list = tagsByStudio.get(junction.studioId) || [];
      list.push(tag);
      tagsByStudio.set(junction.studioId, list);
    }

    const performersByStudio = new Map<string, Set<string>>();
    const groupsByStudio = new Map<string, Set<string>>();
    const galleriesByStudio = new Map<string, Set<string>>();

    for (const sp of scenePerformers) {
      const studioId = studioByScene.get(sp.sceneId);
      if (!studioId) continue;
      const set = performersByStudio.get(studioId) || new Set();
      set.add(sp.performerId);
      performersByStudio.set(studioId, set);
    }

    for (const sg of sceneGroups) {
      const studioId = studioByScene.get(sg.sceneId);
      if (!studioId) continue;
      const set = groupsByStudio.get(studioId) || new Set();
      set.add(sg.groupId);
      groupsByStudio.set(studioId, set);
    }

    for (const sg of sceneGalleries) {
      const studioId = studioByScene.get(sg.sceneId);
      if (!studioId) continue;
      const set = galleriesByStudio.get(studioId) || new Set();
      set.add(sg.galleryId);
      galleriesByStudio.set(studioId, set);
    }

    // Populate studios
    for (const studio of studios) {
      studio.tags = tagsByStudio.get(studio.id) || [];
      (studio as any).performers = [...(performersByStudio.get(studio.id) || [])].map((id) => performersById.get(id)).filter(Boolean);
      (studio as any).groups = [...(groupsByStudio.get(studio.id) || [])].map((id) => groupsById.get(id)).filter(Boolean);
      (studio as any).galleries = [...(galleriesByStudio.get(studio.id) || [])].map((id) => galleriesById.get(id)).filter(Boolean);
    }
  }
```

**Step 2: Run test to verify it passes**

```bash
cd server && npm run test:integration -- studios.integration.test.ts -v
```

**Step 3: Commit**

```bash
git add server/services/StudioQueryBuilder.ts
git commit -m "feat: add performers, groups, galleries relations to studio response"
```

---

## Task 8: Write Integration Tests for Group Tooltip Data

**Files:**
- Modify: `server/integration/api/groups.integration.test.ts`

**Step 1: Add test for tooltip entity data**

```typescript
    it("returns group with tooltip entity data (performers, galleries)", async () => {
      const response = await adminClient.post<FindGroupsResponse>("/api/library/groups", {
        ids: [TEST_ENTITIES.groupWithScenes],
      });

      expect(response.ok).toBe(true);
      const group = response.data.findGroups.groups[0];

      // Tags should have image_path (already exists)
      if (group.tags && group.tags.length > 0) {
        expect(group.tags[0]).toHaveProperty('id');
        expect(group.tags[0]).toHaveProperty('name');
        expect(group.tags[0]).toHaveProperty('image_path');
      }

      // Studio should have image_path (already exists)
      if (group.studio) {
        expect(group.studio).toHaveProperty('id');
        expect(group.studio).toHaveProperty('name');
        expect(group.studio).toHaveProperty('image_path');
      }

      // Performers should exist with tooltip data
      expect(group).toHaveProperty('performers');
      if (group.performers && group.performers.length > 0) {
        expect(group.performers[0]).toHaveProperty('id');
        expect(group.performers[0]).toHaveProperty('name');
        expect(group.performers[0]).toHaveProperty('image_path');
      }

      // Galleries should exist with tooltip data
      expect(group).toHaveProperty('galleries');
      if (group.galleries && group.galleries.length > 0) {
        expect(group.galleries[0]).toHaveProperty('id');
        expect(group.galleries[0]).toHaveProperty('title');
        expect(group.galleries[0]).toHaveProperty('cover');
      }
    });
```

**Step 2: Run test to verify it fails**

```bash
cd server && npm run test:integration -- groups.integration.test.ts -v
```

**Step 3: Commit failing test**

```bash
git add server/integration/api/groups.integration.test.ts
git commit -m "test: add integration test for group tooltip entity data"
```

---

## Task 9: Add Tooltip Entity Data to GroupQueryBuilder

**Files:**
- Modify: `server/services/GroupQueryBuilder.ts:741-810`

**Step 1: Replace populateRelations method**

```typescript
  /**
   * Populate group relations (tags, studio, performers, galleries)
   * Includes minimal data for TooltipEntityGrid
   */
  async populateRelations(groups: NormalizedGroup[]): Promise<void> {
    if (groups.length === 0) return;

    const groupIds = groups.map((g) => g.id);

    // Load tag junctions and scene groups
    const [tagJunctions, sceneGroups] = await Promise.all([
      prisma.groupTag.findMany({
        where: { groupId: { in: groupIds } },
      }),
      prisma.sceneGroup.findMany({
        where: { groupId: { in: groupIds } },
        select: { groupId: true, sceneId: true },
      }),
    ]);

    const sceneIds = [...new Set(sceneGroups.map((sg) => sg.sceneId))];

    // Load scene relationships
    const [scenePerformers, sceneGalleries] = await Promise.all([
      sceneIds.length > 0
        ? prisma.scenePerformer.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, performerId: true },
          })
        : [],
      sceneIds.length > 0
        ? prisma.sceneGallery.findMany({
            where: { sceneId: { in: sceneIds } },
            select: { sceneId: true, galleryId: true },
          })
        : [],
    ]);

    // Get unique IDs
    const tagIds = [...new Set(tagJunctions.map((j) => j.tagId))];
    const studioIds = [...new Set(groups.map((g) => g.studio?.id).filter((id): id is string => !!id))];
    const performerIds = [...new Set(scenePerformers.map((sp) => sp.performerId))];
    const galleryIds = [...new Set(sceneGalleries.map((sg) => sg.galleryId))];

    // Load all entities in parallel
    const [tags, studios, performers, galleries] = await Promise.all([
      tagIds.length > 0 ? prisma.stashTag.findMany({ where: { id: { in: tagIds } } }) : [],
      studioIds.length > 0 ? prisma.stashStudio.findMany({ where: { id: { in: studioIds } } }) : [],
      performerIds.length > 0 ? prisma.stashPerformer.findMany({ where: { id: { in: performerIds } } }) : [],
      galleryIds.length > 0 ? prisma.stashGallery.findMany({ where: { id: { in: galleryIds } } }) : [],
    ]);

    // Build lookup maps
    const tagsById = new Map(tags.map((t) => [t.id, {
      id: t.id,
      name: t.name,
      image_path: this.transformUrl(t.imagePath),
    }]));

    const studiosById = new Map(studios.map((s) => [s.id, {
      id: s.id,
      name: s.name,
      image_path: this.transformUrl(s.imagePath),
    }]));

    const performersById = new Map(performers.map((p) => [p.id, {
      id: p.id,
      name: p.name,
      image_path: this.transformUrl(p.imagePath),
    }]));

    const galleriesById = new Map(galleries.map((g) => [g.id, {
      id: g.id,
      title: g.title,
      cover: this.transformUrl(g.coverPath),
    }]));

    // Build group -> tags map
    const tagsByGroup = new Map<string, any[]>();
    for (const junction of tagJunctions) {
      const tag = tagsById.get(junction.tagId);
      if (!tag) continue;
      const list = tagsByGroup.get(junction.groupId) || [];
      list.push(tag);
      tagsByGroup.set(junction.groupId, list);
    }

    // Build group -> scene mapping
    const scenesByGroup = new Map<string, Set<string>>();
    for (const sg of sceneGroups) {
      const set = scenesByGroup.get(sg.groupId) || new Set();
      set.add(sg.sceneId);
      scenesByGroup.set(sg.groupId, set);
    }

    // Build scene -> entities mappings
    const performersByScene = new Map<string, Set<string>>();
    for (const sp of scenePerformers) {
      const set = performersByScene.get(sp.sceneId) || new Set();
      set.add(sp.performerId);
      performersByScene.set(sp.sceneId, set);
    }

    const galleriesByScene = new Map<string, Set<string>>();
    for (const sg of sceneGalleries) {
      const set = galleriesByScene.get(sg.sceneId) || new Set();
      set.add(sg.galleryId);
      galleriesByScene.set(sg.sceneId, set);
    }

    // Populate groups
    for (const group of groups) {
      group.tags = tagsByGroup.get(group.id) || [];

      // Hydrate studio with full data
      if (group.studio?.id) {
        const fullStudio = studiosById.get(group.studio.id);
        if (fullStudio) {
          group.studio = fullStudio;
        }
      }

      // Derive performers and galleries from group's scenes
      const groupSceneIds = scenesByGroup.get(group.id) || new Set();

      const groupPerformerIds = new Set<string>();
      const groupGalleryIds = new Set<string>();

      for (const sceneId of groupSceneIds) {
        for (const pid of performersByScene.get(sceneId) || []) groupPerformerIds.add(pid);
        for (const gid of galleriesByScene.get(sceneId) || []) groupGalleryIds.add(gid);
      }

      (group as any).performers = [...groupPerformerIds].map((id) => performersById.get(id)).filter(Boolean);
      (group as any).galleries = [...groupGalleryIds].map((id) => galleriesById.get(id)).filter(Boolean);
    }
  }
```

**Step 2: Run test to verify it passes**

```bash
cd server && npm run test:integration -- groups.integration.test.ts -v
```

**Step 3: Commit**

```bash
git add server/services/GroupQueryBuilder.ts
git commit -m "feat: add performers, galleries relations to group response"
```

---

## Task 10: Run Full Integration Test Suite

**Step 1: Run all integration tests**

```bash
cd server && npm run test:integration
```

Expected: All tests pass

**Step 2: Commit if any cleanup needed**

---

## Task 11: Update PerformerCard to Use Rich Tooltips

**Files:**
- Modify: `client/src/components/cards/PerformerCard.jsx`

**Step 1: Import dependencies and config**

Add at the top after existing imports:

```javascript
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TooltipEntityGrid from "../ui/TooltipEntityGrid.jsx";
import { getIndicatorBehavior } from "../../config/indicatorBehaviors.js";
```

**Step 2: Replace the indicators array and component body**

```javascript
const PerformerCard = forwardRef(
  ({ performer, referrerUrl, isTVMode, tabIndex, onHideSuccess, displayPreferences, ...rest }, ref) => {
    const navigate = useNavigate();

    const indicators = useMemo(() => {
      const tagsTooltip = getIndicatorBehavior('performer', 'tags') === 'rich' &&
        performer.tags?.length > 0 && (
          <TooltipEntityGrid entityType="tag" entities={performer.tags} title="Tags" />
        );

      const groupsTooltip = getIndicatorBehavior('performer', 'groups') === 'rich' &&
        performer.groups?.length > 0 && (
          <TooltipEntityGrid entityType="group" entities={performer.groups} title="Collections" />
        );

      const galleriesTooltoip = getIndicatorBehavior('performer', 'galleries') === 'rich' &&
        performer.galleries?.length > 0 && (
          <TooltipEntityGrid entityType="gallery" entities={performer.galleries} title="Galleries" />
        );

      const studiosTooltip = getIndicatorBehavior('performer', 'studios') === 'rich' &&
        performer.studios?.length > 0 && (
          <TooltipEntityGrid entityType="studio" entities={performer.studios} title="Studios" />
        );

      return [
        { type: "PLAY_COUNT", count: performer.play_count },
        {
          type: "SCENES",
          count: performer.scene_count,
          onClick: performer.scene_count > 0 ? () => navigate(`/scenes?performerId=${performer.id}`) : undefined,
        },
        {
          type: "GROUPS",
          count: performer.groups?.length || performer.group_count || 0,
          tooltipContent: groupsTooltip,
          onClick: (performer.groups?.length || performer.group_count) > 0 ? () => navigate(`/collections?performerId=${performer.id}`) : undefined,
        },
        {
          type: "IMAGES",
          count: performer.image_count,
          onClick: performer.image_count > 0 ? () => navigate(`/images?performerId=${performer.id}`) : undefined,
        },
        {
          type: "GALLERIES",
          count: performer.galleries?.length || performer.gallery_count || 0,
          tooltipContent: galleriesTooltoip,
          onClick: (performer.galleries?.length || performer.gallery_count) > 0 ? () => navigate(`/galleries?performerId=${performer.id}`) : undefined,
        },
        {
          type: "TAGS",
          count: performer.tags?.length || 0,
          tooltipContent: tagsTooltip,
          onClick: performer.tags?.length > 0 ? () => navigate(`/tags?performerId=${performer.id}`) : undefined,
        },
        {
          type: "STUDIOS",
          count: performer.studios?.length || 0,
          tooltipContent: studiosTooltip,
          onClick: performer.studios?.length > 0 ? () => navigate(`/studios?performerId=${performer.id}`) : undefined,
        },
      ];
    }, [performer, navigate]);

    return (
      <BaseCard
        ref={ref}
        entityType="performer"
        imagePath={performer.image_path}
        title={
          <div className="flex items-center justify-center gap-2">
            {performer.name}
            <GenderIcon gender={performer.gender} size={16} />
          </div>
        }
        linkTo={`/performer/${performer.id}`}
        referrerUrl={referrerUrl}
        tabIndex={isTVMode ? tabIndex : -1}
        hideDescription
        hideSubtitle
        indicators={indicators}
        displayPreferences={displayPreferences}
        ratingControlsProps={{
          entityId: performer.id,
          initialRating: performer.rating,
          initialFavorite: performer.favorite || false,
          initialOCounter: performer.o_counter,
          onHideSuccess,
        }}
        {...rest}
      />
    );
  }
);
```

**Step 3: Run client tests**

```bash
cd client && npm test -- PerformerCard.test.jsx
```

**Step 4: Commit**

```bash
git add client/src/components/cards/PerformerCard.jsx
git commit -m "feat: add rich tooltip indicators to PerformerCard"
```

---

## Task 12: Update TagCard to Use Rich Tooltips

**Files:**
- Modify: `client/src/components/cards/TagCard.jsx`

Similar pattern to PerformerCard - add imports, use `useMemo` for indicators with `TooltipEntityGrid` and `getIndicatorBehavior`.

**Step 1: Update TagCard.jsx**

(Full code similar to PerformerCard pattern)

**Step 2: Commit**

```bash
git add client/src/components/cards/TagCard.jsx
git commit -m "feat: add rich tooltip indicators to TagCard"
```

---

## Task 13: Update StudioCard to Use Rich Tooltips

**Files:**
- Modify: `client/src/components/cards/StudioCard.jsx`

Similar pattern.

**Step 1: Update StudioCard.jsx**

**Step 2: Commit**

```bash
git add client/src/components/cards/StudioCard.jsx
git commit -m "feat: add rich tooltip indicators to StudioCard"
```

---

## Task 14: Update GroupCard to Use Rich Tooltips

**Files:**
- Modify: `client/src/components/cards/GroupCard.jsx`

Similar pattern.

**Step 1: Update GroupCard.jsx**

**Step 2: Commit**

```bash
git add client/src/components/cards/GroupCard.jsx
git commit -m "feat: add rich tooltip indicators to GroupCard"
```

---

## Task 15: Final Verification

**Step 1: Run all server tests**

```bash
cd server && npm run test:integration
```

**Step 2: Run all client tests**

```bash
cd client && npm test
```

**Step 3: Run linting**

```bash
cd server && npm run lint
cd client && npm run lint
```

**Step 4: Manual verification**

- Browse to Performers page, hover over tag/group/gallery/studio indicators
- Browse to Tags page, hover over performer/studio/group/gallery indicators
- Browse to Studios page, hover over performer/tag/group/gallery indicators
- Browse to Collections page, hover over performer/tag/studio/gallery indicators
- Verify rich tooltips show entity previews with images and names

---

## Summary

This plan adds rich tooltip entity data to:
- **PerformerCard**: tags (with image), groups, galleries, studios
- **TagCard**: performers, studios, groups, galleries
- **StudioCard**: performers, groups, galleries (tags already had image_path)
- **GroupCard**: performers, galleries (tags and studio already had image_path)

All indicators use the centralized `indicatorBehaviors.js` config for determining behavior, making it easy to add user settings later.
