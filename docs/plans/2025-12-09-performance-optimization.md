# Scene Query Performance Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce scene browse query time from 22+ seconds to under 1 second by pushing pagination to SQLite and eliminating redundant data transfer.

**Architecture:** Replace the current "load all 22k scenes → filter in JS" pattern with database-level pagination. Exclude heavy columns (`streams`, `data`) from browse queries. Generate stream URLs on-demand only when playing a scene.

**Tech Stack:** Prisma 6, SQLite, TypeScript, Express

---

## Background

**Current baseline (measured):**
- SQLite query: 19.9 seconds (fetching 22k rows with 4.4KB `streams` column each)
- Transform to JS objects: 2.7 seconds
- Total: 22.8 seconds per request

**Root causes:**
1. `getAllScenes()` fetches every row on every request
2. `streams` column contains redundant JSON (~96MB total) - same 13 URLs per scene, only ID differs
3. `data` column is legacy JSON blob (empty but still transferred)

---

## Task 1: Add BROWSE_SELECT Constant

**Files:**
- Modify: `server/services/CachedEntityQueryService.ts:88-111`

**Step 1: Add the select constant at class level**

Add this after line 88 (inside the class, before the first method):

```typescript
  // Columns to select for browse queries (excludes heavy streams/data columns)
  private readonly BROWSE_SELECT = {
    id: true,
    stashInstanceId: true,
    title: true,
    code: true,
    date: true,
    studioId: true,
    rating100: true,
    duration: true,
    organized: true,
    details: true,
    filePath: true,
    fileBitRate: true,
    fileFrameRate: true,
    fileWidth: true,
    fileHeight: true,
    fileVideoCodec: true,
    fileAudioCodec: true,
    fileSize: true,
    pathScreenshot: true,
    pathPreview: true,
    pathSprite: true,
    pathVtt: true,
    pathChaptersVtt: true,
    pathStream: true,
    pathCaption: true,
    // Explicitly NOT selecting: streams, data
    oCounter: true,
    playCount: true,
    playDuration: true,
    stashCreatedAt: true,
    stashUpdatedAt: true,
    syncedAt: true,
    deletedAt: true,
  } as const;
```

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/CachedEntityQueryService.ts
git commit -m "feat: add BROWSE_SELECT constant for optimized scene queries"
```

---

## Task 2: Create transformSceneForBrowse Method

**Files:**
- Modify: `server/services/CachedEntityQueryService.ts` (after transformScene method, around line 674)

**Step 1: Add the new transform method**

Add this method after `transformScene` (around line 674):

```typescript
  /**
   * Transform scene for browse queries (no streams - generated on demand)
   */
  private transformSceneForBrowse(scene: any): NormalizedScene {
    return {
      // User fields (defaults first, then override with actual values)
      ...DEFAULT_SCENE_USER_FIELDS,

      id: scene.id,
      title: scene.title,
      code: scene.code,
      date: scene.date,
      details: scene.details,
      rating100: scene.rating100,
      organized: scene.organized,

      // File metadata
      files: scene.filePath ? [{
        path: scene.filePath,
        duration: scene.duration,
        bit_rate: scene.fileBitRate,
        frame_rate: scene.fileFrameRate,
        width: scene.fileWidth,
        height: scene.fileHeight,
        video_codec: scene.fileVideoCodec,
        audio_codec: scene.fileAudioCodec,
        size: scene.fileSize ? Number(scene.fileSize) : null,
      }] : [],

      // Transformed URLs
      paths: {
        screenshot: this.transformUrl(scene.pathScreenshot),
        preview: this.transformUrl(scene.pathPreview),
        sprite: this.transformUrl(scene.pathSprite),
        vtt: this.transformUrl(scene.pathVtt),
        chapters_vtt: this.transformUrl(scene.pathChaptersVtt),
        stream: this.transformUrl(scene.pathStream),
        caption: this.transformUrl(scene.pathCaption),
      },

      // Empty sceneStreams for browse - generated on demand for playback
      sceneStreams: [],

      // Stash counters (override defaults)
      o_counter: scene.oCounter ?? 0,
      play_count: scene.playCount ?? 0,
      play_duration: scene.playDuration ?? 0,

      // Timestamps
      created_at: scene.stashCreatedAt?.toISOString() ?? null,
      updated_at: scene.stashUpdatedAt?.toISOString() ?? null,

      // Nested entities (empty - loaded separately or via include)
      studio: null,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
    } as unknown as NormalizedScene;
  }
```

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/CachedEntityQueryService.ts
git commit -m "feat: add transformSceneForBrowse method without streams"
```

---

## Task 3: Update getAllScenes to Use BROWSE_SELECT

**Files:**
- Modify: `server/services/CachedEntityQueryService.ts:95-111`

**Step 1: Update the getAllScenes method**

Replace the current `getAllScenes` method with:

```typescript
  async getAllScenes(): Promise<NormalizedScene[]> {
    const startTotal = Date.now();

    const queryStart = Date.now();
    const cached = await prisma.cachedScene.findMany({
      where: { deletedAt: null },
      select: this.BROWSE_SELECT,
    });
    const queryTime = Date.now() - queryStart;

    const transformStart = Date.now();
    const result = cached.map((c) => this.transformSceneForBrowse(c));
    const transformTime = Date.now() - transformStart;

    logger.info(`getAllScenes: query=${queryTime}ms, transform=${transformTime}ms, total=${Date.now() - startTotal}ms, count=${cached.length}`);

    return result;
  }
```

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/CachedEntityQueryService.ts
git commit -m "feat: getAllScenes now uses BROWSE_SELECT (excludes streams/data)"
```

---

## Task 4: Add generateSceneStreams Helper

**Files:**
- Modify: `server/services/CachedEntityQueryService.ts` (add before transformScene method)

**Step 1: Add the stream URL generator**

Add this method before `transformScene`:

```typescript
  /**
   * Generate scene stream URLs on-demand
   * All scenes have the same stream formats - only the ID varies
   * This eliminates storing ~4.4KB of redundant JSON per scene
   */
  private generateSceneStreams(sceneId: string): Array<{url: string; mime_type: string; label: string}> {
    const formats = [
      { ext: '', mime: 'video/mp4', label: 'Direct stream', resolution: null },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4', resolution: 'ORIGINAL' },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4 Standard (480p)', resolution: 'STANDARD' },
      { ext: '.mp4', mime: 'video/mp4', label: 'MP4 Low (240p)', resolution: 'LOW' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM', resolution: 'ORIGINAL' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM Standard (480p)', resolution: 'STANDARD' },
      { ext: '.webm', mime: 'video/webm', label: 'WEBM Low (240p)', resolution: 'LOW' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS', resolution: 'ORIGINAL' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS Standard (480p)', resolution: 'STANDARD' },
      { ext: '.m3u8', mime: 'application/vnd.apple.mpegurl', label: 'HLS Low (240p)', resolution: 'LOW' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH', resolution: 'ORIGINAL' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH Standard (480p)', resolution: 'STANDARD' },
      { ext: '.mpd', mime: 'application/dash+xml', label: 'DASH Low (240p)', resolution: 'LOW' },
    ];

    return formats.map(f => {
      const basePath = `/scene/${sceneId}/stream${f.ext}`;
      const fullPath = f.resolution ? `${basePath}?resolution=${f.resolution}` : basePath;
      return {
        url: `/api/proxy/stash?path=${encodeURIComponent(fullPath)}`,
        mime_type: f.mime,
        label: f.label,
      };
    });
  }
```

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/CachedEntityQueryService.ts
git commit -m "feat: add generateSceneStreams helper for on-demand URL generation"
```

---

## Task 5: Update getScene to Generate Streams On-Demand

**Files:**
- Modify: `server/services/CachedEntityQueryService.ts` - the `getScene` method (around line 116)

**Step 1: Find and read current getScene method**

The current `getScene` method should be around line 116. It needs to generate streams instead of reading from DB.

**Step 2: Update transformScene to use generateSceneStreams**

Modify the `transformScene` method to generate streams instead of parsing from DB. Change this section:

```typescript
      // Parse streams JSON
      sceneStreams: scene.streams
        ? JSON.parse(scene.streams).map((s: any) => ({
            ...s,
            url: this.transformUrl(s.url),
          }))
        : [],
```

To:

```typescript
      // Generate streams on-demand (no longer stored in DB)
      sceneStreams: this.generateSceneStreams(scene.id),
```

**Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/services/CachedEntityQueryService.ts
git commit -m "feat: getScene now generates streams on-demand"
```

---

## Task 6: Run Linting

**Step 1: Run ESLint on modified files**

Run: `cd server && npm run lint`
Expected: No errors (or only pre-existing warnings)

**Step 2: Fix any lint errors if present**

If there are errors, fix them.

**Step 3: Commit any lint fixes**

```bash
git add server/services/CachedEntityQueryService.ts
git commit -m "fix: lint fixes for CachedEntityQueryService"
```

---

## Task 7: Build and Test Phase 1

**Step 1: Rebuild Docker containers**

Run: `docker-compose up --build -d`
Expected: Containers start successfully

**Step 2: Wait for server to be ready**

Run: `docker-compose logs -f peek-server 2>&1 | head -50`
Expected: See "Peek Server Ready" message

**Step 3: Test scenes page load**

Open browser to Peek app, navigate to Scenes page.
Watch server logs for timing:

Run: `docker-compose logs --tail=50 peek-server 2>&1 | grep -E "(getAllScenes|findScenes)"`

**Step 4: Document results**

Expected improvement: Query time should drop significantly (from ~20s to ~2-5s) due to excluding `streams` column.

Record the new timings in this format:
```
getAllScenes: query=XXXXms, transform=XXXXms, total=XXXXms
findScenes: TOTAL request took XXXXms
```

---

## Task 8: Test Scene Detail Playback

**Step 1: Navigate to a scene detail page**

Click on any scene card to open the scene detail/player page.

**Step 2: Verify video player shows stream options**

The video player source selector should show all stream formats:
- Direct stream
- MP4 / MP4 Standard / MP4 Low
- WEBM / WEBM Standard / WEBM Low
- HLS / HLS Standard / HLS Low
- DASH / DASH Standard / DASH Low

**Step 3: Test playback**

Click play and verify the video streams correctly.

**Step 4: If playback fails, check logs**

Run: `docker-compose logs --tail=100 peek-server 2>&1 | grep -i error`

If there are issues with stream URLs, we may need to adjust the `generateSceneStreams` method.

---

## Task 9: Commit Phase 1 Complete

**Step 1: Verify all changes are committed**

Run: `git status`
Expected: Clean working directory

**Step 2: If uncommitted changes exist, commit them**

```bash
git add -A
git commit -m "feat: phase 1 complete - exclude streams from browse queries"
```

---

## Phase 2 Tasks (Database-Level Pagination)

These tasks will be detailed in a follow-up plan after Phase 1 results are measured. The approach depends on how much improvement we get from Phase 1:

- If Phase 1 gets us to <5 seconds: Phase 2 adds pagination for further improvement
- If Phase 1 still shows >10 seconds: We need to investigate other bottlenecks first

**Phase 2 will include:**
- Task 10: Add getScenesPagedWithFilters method
- Task 11: Add filter-to-Prisma-where conversion
- Task 12: Update findScenes controller to use paginated queries
- Task 13: Update carousel queries
- Task 14: Schema migration to drop streams/data columns

---

## Verification Checklist

After all tasks:
- [ ] TypeScript compiles: `cd server && npx tsc --noEmit`
- [ ] Linting passes: `cd server && npm run lint`
- [ ] Scenes page loads in <5 seconds (Phase 1 target)
- [ ] Scene detail page loads correctly
- [ ] Video playback works with all stream formats
- [ ] All commits are clean and atomic
