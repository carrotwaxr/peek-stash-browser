# JSON Blob Elimination - Implementation Plan

**Date**: 2025-12-09
**Feature**: Eliminate JSON blob storage to achieve ~5 minute sync for 22k scenes (vs 3.6 hours)
**Branch**: `feature/cache-scalability-investigation`
**Design Doc**: [json-blob-elimination-plan.md](../design/json-blob-elimination-plan.md)

---

## Overview

This plan eliminates the JSON blob (`data` column) from cached entities and replaces it with explicit database columns. URL transformation moves from sync-time to read-time.

**Current State**:
- Scenes/Images sync stores `data: "{}"` (empty JSON) - never worked properly
- Performers/Studios/Tags/Groups/Galleries store full JSON blob in `data` column
- ~100 scenes/minute sync speed (3.6 hours for 22k scenes)

**Target State**:
- All entity fields stored as individual columns
- URLs transformed at read time via proxy
- Batch SQL operations for sync
- ~5 minute sync for 22k scenes

---

## Task 1: Add Scene Schema Columns

### 1.1 Update Prisma Schema - CachedScene

**File**: `server/prisma/schema.prisma`

**Location**: Lines 396-431 (CachedScene model)

**Replace**:
```prisma
model CachedScene {
    id              String    @id                    // Stash scene ID
    stashInstanceId String?                          // Which Stash server

    // Indexed fields for filtering/sorting
    title           String?
    code            String?
    date            String?                          // YYYY-MM-DD
    studioId        String?
    rating100       Int?
    duration        Int?                             // seconds (from file)
    organized       Boolean   @default(false)

    // Full entity data as JSON (performers, tags, files, paths, streams, etc.)
    data            String                           // JSON blob

    // Sync metadata
    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    // Junction table relations
    performers      ScenePerformer[]
    tags            SceneTag[]
    groups          SceneGroup[]
    galleries       SceneGallery[]

    @@index([studioId])
    @@index([date])
    @@index([stashCreatedAt])
    @@index([stashUpdatedAt])
    @@index([rating100])
    @@index([duration])
    @@index([deletedAt])
}
```

**With**:
```prisma
model CachedScene {
    id              String    @id                    // Stash scene ID
    stashInstanceId String?                          // Which Stash server

    // === Core fields (indexed) ===
    title           String?
    code            String?
    date            String?                          // YYYY-MM-DD
    studioId        String?
    rating100       Int?
    duration        Int?                             // seconds (from primary file)
    organized       Boolean   @default(false)

    // === Content fields ===
    details         String?                          // Scene description

    // === Primary file metadata ===
    filePath        String?                          // Primary file path
    fileBitRate     Int?                             // bits/second
    fileFrameRate   Float?                           // fps
    fileWidth       Int?                             // pixels
    fileHeight      Int?                             // pixels
    fileVideoCodec  String?                          // e.g., "h264", "hevc"
    fileAudioCodec  String?                          // e.g., "aac", "ac3"
    fileSize        BigInt?                          // bytes (can be > 4GB)

    // === Stash paths (raw, transformed at read time) ===
    pathScreenshot  String?                          // Screenshot URL path
    pathPreview     String?                          // Preview video path
    pathSprite      String?                          // Sprite sheet path
    pathVtt         String?                          // VTT chapter path
    pathChaptersVtt String?                          // Chapters VTT path
    pathStream      String?                          // Primary stream path
    pathCaption     String?                          // Caption path

    // === Stream data (small JSON array) ===
    streams         String?                          // JSON: [{url, mime_type, label}]

    // === Stash counter data ===
    oCounter        Int       @default(0)            // Stash o_counter
    playCount       Int       @default(0)            // Stash play_count
    playDuration    Float     @default(0)            // Stash play_duration

    // === Sync metadata ===
    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    // === Junction table relations ===
    performers      ScenePerformer[]
    tags            SceneTag[]
    groups          SceneGroup[]
    galleries       SceneGallery[]

    @@index([studioId])
    @@index([date])
    @@index([stashCreatedAt])
    @@index([stashUpdatedAt])
    @@index([rating100])
    @@index([duration])
    @@index([deletedAt])
    @@index([oCounter])
    @@index([playCount])
}
```

**Verification**:
```bash
cd server && npx prisma validate
```

Expected: "Your schema is valid"

---

### 1.2 Update Prisma Schema - CachedImage

**File**: `server/prisma/schema.prisma`

**Location**: Lines 578-608 (CachedImage model)

**Replace**:
```prisma
model CachedImage {
    id              String    @id
    stashInstanceId String?

    title           String?
    date            String?
    studioId        String?
    rating100       Int?
    oCounter        Int       @default(0)
    organized       Boolean   @default(false)
    width           Int?
    height          Int?
    fileSize        Int?

    data            String

    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    performers      ImagePerformer[]
    tags            ImageTag[]
    galleries       ImageGallery[]

    @@index([studioId])
    @@index([date])
    @@index([rating100])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

**With**:
```prisma
model CachedImage {
    id              String    @id
    stashInstanceId String?

    // === Core fields ===
    title           String?
    date            String?
    studioId        String?
    rating100       Int?
    oCounter        Int       @default(0)
    organized       Boolean   @default(false)

    // === File metadata ===
    filePath        String?                          // Image file path
    width           Int?
    height          Int?
    fileSize        BigInt?                          // bytes

    // === Stash paths (raw, transformed at read time) ===
    pathThumbnail   String?                          // Thumbnail URL path
    pathPreview     String?                          // Preview URL path
    pathImage       String?                          // Full image URL path

    // === Sync metadata ===
    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    // === Relations ===
    performers      ImagePerformer[]
    tags            ImageTag[]
    galleries       ImageGallery[]

    @@index([studioId])
    @@index([date])
    @@index([rating100])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

**Verification**:
```bash
cd server && npx prisma validate
```

---

### 1.3 Update Prisma Schema - CachedPerformer

**File**: `server/prisma/schema.prisma`

**Location**: Lines 433-464 (CachedPerformer model)

**Replace**:
```prisma
model CachedPerformer {
    id              String    @id
    stashInstanceId String?

    name            String
    disambiguation  String?
    gender          String?
    birthdate       String?
    favorite        Boolean   @default(false)
    rating100       Int?
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)
    galleryCount    Int       @default(0)

    data            String

    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    scenes          ScenePerformer[]
    images          ImagePerformer[]

    @@index([name])
    @@index([gender])
    @@index([favorite])
    @@index([rating100])
    @@index([sceneCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

**With**:
```prisma
model CachedPerformer {
    id              String    @id
    stashInstanceId String?

    // === Core fields ===
    name            String
    disambiguation  String?
    gender          String?
    birthdate       String?
    favorite        Boolean   @default(false)
    rating100       Int?
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)
    galleryCount    Int       @default(0)

    // === Extended fields ===
    details         String?                          // Biography
    aliasList       String?                          // JSON array of aliases
    country         String?
    ethnicity       String?
    hairColor       String?
    eyeColor        String?
    heightCm        Int?                             // Height in cm
    weightKg        Int?                             // Weight in kg
    measurements    String?                          // e.g., "34D-24-34"
    tattoos         String?
    piercings       String?
    careerLength    String?
    deathDate       String?
    url             String?                          // Homepage

    // === Stash paths (raw, transformed at read time) ===
    imagePath       String?                          // Profile image path

    // === Sync metadata ===
    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    // === Relations ===
    scenes          ScenePerformer[]
    images          ImagePerformer[]

    @@index([name])
    @@index([gender])
    @@index([favorite])
    @@index([rating100])
    @@index([sceneCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

---

### 1.4 Update Prisma Schema - CachedStudio

**File**: `server/prisma/schema.prisma`

**Location**: Lines 466-492 (CachedStudio model)

**Replace**:
```prisma
model CachedStudio {
    id              String    @id
    stashInstanceId String?

    name            String
    parentId        String?
    favorite        Boolean   @default(false)
    rating100       Int?
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)
    galleryCount    Int       @default(0)

    data            String

    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    @@index([name])
    @@index([parentId])
    @@index([favorite])
    @@index([rating100])
    @@index([sceneCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

**With**:
```prisma
model CachedStudio {
    id              String    @id
    stashInstanceId String?

    // === Core fields ===
    name            String
    parentId        String?
    favorite        Boolean   @default(false)
    rating100       Int?
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)
    galleryCount    Int       @default(0)

    // === Extended fields ===
    details         String?                          // Studio description
    url             String?                          // Studio website

    // === Stash paths (raw, transformed at read time) ===
    imagePath       String?                          // Logo image path

    // === Sync metadata ===
    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    @@index([name])
    @@index([parentId])
    @@index([favorite])
    @@index([rating100])
    @@index([sceneCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

---

### 1.5 Update Prisma Schema - CachedTag

**File**: `server/prisma/schema.prisma`

**Location**: Lines 494-518 (CachedTag model)

**Replace**:
```prisma
model CachedTag {
    id              String    @id
    stashInstanceId String?

    name            String
    favorite        Boolean   @default(false)
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)

    data            String

    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    scenes          SceneTag[]
    images          ImageTag[]

    @@index([name])
    @@index([favorite])
    @@index([sceneCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

**With**:
```prisma
model CachedTag {
    id              String    @id
    stashInstanceId String?

    // === Core fields ===
    name            String
    favorite        Boolean   @default(false)
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)

    // === Extended fields ===
    description     String?                          // Tag description
    parentIds       String?                          // JSON array of parent tag IDs

    // === Stash paths (raw, transformed at read time) ===
    imagePath       String?                          // Tag image path

    // === Sync metadata ===
    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    // === Relations ===
    scenes          SceneTag[]
    images          ImageTag[]

    @@index([name])
    @@index([favorite])
    @@index([sceneCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

---

### 1.6 Update Prisma Schema - CachedGroup

**File**: `server/prisma/schema.prisma`

**Location**: Lines 520-547 (CachedGroup model)

**Replace**:
```prisma
model CachedGroup {
    id              String    @id
    stashInstanceId String?

    name            String
    date            String?
    studioId        String?
    rating100       Int?
    duration        Int?
    sceneCount      Int       @default(0)

    data            String

    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    scenes          SceneGroup[]

    @@index([name])
    @@index([date])
    @@index([studioId])
    @@index([rating100])
    @@index([sceneCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

**With**:
```prisma
model CachedGroup {
    id              String    @id
    stashInstanceId String?

    // === Core fields ===
    name            String
    date            String?
    studioId        String?
    rating100       Int?
    duration        Int?
    sceneCount      Int       @default(0)

    // === Extended fields ===
    director        String?
    synopsis        String?
    urls            String?                          // JSON array of URLs

    // === Stash paths (raw, transformed at read time) ===
    frontImagePath  String?                          // Front cover image
    backImagePath   String?                          // Back cover image

    // === Sync metadata ===
    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    // === Relations ===
    scenes          SceneGroup[]

    @@index([name])
    @@index([date])
    @@index([studioId])
    @@index([rating100])
    @@index([sceneCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

---

### 1.7 Update Prisma Schema - CachedGallery

**File**: `server/prisma/schema.prisma`

**Location**: Lines 549-576 (CachedGallery model)

**Replace**:
```prisma
model CachedGallery {
    id              String    @id
    stashInstanceId String?

    title           String?
    date            String?
    studioId        String?
    rating100       Int?
    imageCount      Int       @default(0)

    data            String

    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    scenes          SceneGallery[]
    images          ImageGallery[]

    @@index([title])
    @@index([date])
    @@index([studioId])
    @@index([rating100])
    @@index([imageCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

**With**:
```prisma
model CachedGallery {
    id              String    @id
    stashInstanceId String?

    // === Core fields ===
    title           String?
    date            String?
    studioId        String?
    rating100       Int?
    imageCount      Int       @default(0)

    // === Extended fields ===
    details         String?                          // Gallery description
    url             String?                          // Gallery URL
    code            String?                          // Gallery code

    // === File metadata ===
    folderPath      String?                          // Folder path if folder-based

    // === Stash paths (raw, transformed at read time) ===
    coverPath       String?                          // Cover image path

    // === Sync metadata ===
    stashCreatedAt  DateTime?
    stashUpdatedAt  DateTime?
    syncedAt        DateTime  @default(now())
    deletedAt       DateTime?

    // === Relations ===
    scenes          SceneGallery[]
    images          ImageGallery[]

    @@index([title])
    @@index([date])
    @@index([studioId])
    @@index([rating100])
    @@index([imageCount])
    @@index([stashUpdatedAt])
    @@index([deletedAt])
}
```

---

### 1.8 Create Migration

**Command**:
```bash
cd server && npx prisma migrate dev --name eliminate_json_blob
```

**Verification**:
- Migration file created in `server/prisma/migrations/`
- No errors during migration
- Database has new columns

---

## Task 2: Update StashSyncService - Scene Sync

### 2.1 Update processScenesBatch

**File**: `server/services/StashSyncService.ts`

**Location**: Lines 617-715 (processScenesBatch method)

**Replace the entire method with**:
```typescript
private async processScenesBatch(
  scenes: Scene[],
  stashInstanceId: string | undefined,
  batchStart: number,
  totalCount: number
): Promise<void> {
  const sceneIds = scenes.map(s => s.id);

  // Bulk delete all junction records for this batch
  await Promise.all([
    prisma.scenePerformer.deleteMany({ where: { sceneId: { in: sceneIds } } }),
    prisma.sceneTag.deleteMany({ where: { sceneId: { in: sceneIds } } }),
    prisma.sceneGroup.deleteMany({ where: { sceneId: { in: sceneIds } } }),
    prisma.sceneGallery.deleteMany({ where: { sceneId: { in: sceneIds } } }),
  ]);

  // Build bulk scene upsert using raw SQL
  const sceneValues = scenes.map(scene => {
    const file = scene.files?.[0];
    const paths = scene.paths;

    return `(
      '${this.escape(scene.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
      ${this.escapeNullable(scene.title)},
      ${this.escapeNullable(scene.code)},
      ${this.escapeNullable(scene.date)},
      ${scene.studio?.id ? `'${this.escape(scene.studio.id)}'` : 'NULL'},
      ${scene.rating100 ?? 'NULL'},
      ${file?.duration ? Math.round(file.duration) : 'NULL'},
      ${scene.organized ? 1 : 0},
      ${this.escapeNullable(scene.details)},
      ${this.escapeNullable(file?.path)},
      ${file?.bit_rate ?? 'NULL'},
      ${file?.frame_rate ?? 'NULL'},
      ${file?.width ?? 'NULL'},
      ${file?.height ?? 'NULL'},
      ${this.escapeNullable(file?.video_codec)},
      ${this.escapeNullable(file?.audio_codec)},
      ${file?.size ?? 'NULL'},
      ${this.escapeNullable(paths?.screenshot)},
      ${this.escapeNullable(paths?.preview)},
      ${this.escapeNullable(paths?.sprite)},
      ${this.escapeNullable(paths?.vtt)},
      ${this.escapeNullable(paths?.chapters_vtt)},
      ${this.escapeNullable(paths?.stream)},
      ${this.escapeNullable(paths?.caption)},
      ${this.escapeNullable(JSON.stringify(scene.sceneStreams || []))},
      ${scene.o_counter ?? 0},
      ${scene.play_count ?? 0},
      ${scene.play_duration ?? 0},
      ${scene.created_at ? `'${scene.created_at}'` : 'NULL'},
      ${scene.updated_at ? `'${scene.updated_at}'` : 'NULL'},
      datetime('now'),
      NULL
    )`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO CachedScene (
      id, stashInstanceId, title, code, date, studioId, rating100, duration,
      organized, details, filePath, fileBitRate, fileFrameRate, fileWidth,
      fileHeight, fileVideoCodec, fileAudioCodec, fileSize, pathScreenshot,
      pathPreview, pathSprite, pathVtt, pathChaptersVtt, pathStream, pathCaption,
      streams, oCounter, playCount, playDuration, stashCreatedAt, stashUpdatedAt,
      syncedAt, deletedAt
    ) VALUES ${sceneValues}
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      code = excluded.code,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      duration = excluded.duration,
      organized = excluded.organized,
      details = excluded.details,
      filePath = excluded.filePath,
      fileBitRate = excluded.fileBitRate,
      fileFrameRate = excluded.fileFrameRate,
      fileWidth = excluded.fileWidth,
      fileHeight = excluded.fileHeight,
      fileVideoCodec = excluded.fileVideoCodec,
      fileAudioCodec = excluded.fileAudioCodec,
      fileSize = excluded.fileSize,
      pathScreenshot = excluded.pathScreenshot,
      pathPreview = excluded.pathPreview,
      pathSprite = excluded.pathSprite,
      pathVtt = excluded.pathVtt,
      pathChaptersVtt = excluded.pathChaptersVtt,
      pathStream = excluded.pathStream,
      pathCaption = excluded.pathCaption,
      streams = excluded.streams,
      oCounter = excluded.oCounter,
      playCount = excluded.playCount,
      playDuration = excluded.playDuration,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);

  // Collect all junction records
  const performerRecords: string[] = [];
  const tagRecords: string[] = [];
  const groupRecords: string[] = [];
  const galleryRecords: string[] = [];

  for (const scene of scenes) {
    for (const p of scene.performers || []) {
      performerRecords.push(`('${this.escape(scene.id)}', '${this.escape(p.id)}')`);
    }
    for (const t of scene.tags || []) {
      tagRecords.push(`('${this.escape(scene.id)}', '${this.escape(t.id)}')`);
    }
    for (const g of scene.groups || []) {
      const groupObj = (g as any).group || g;
      const index = (g as any).scene_index ?? 'NULL';
      groupRecords.push(`('${this.escape(scene.id)}', '${this.escape(groupObj.id)}', ${index})`);
    }
    for (const g of scene.galleries || []) {
      galleryRecords.push(`('${this.escape(scene.id)}', '${this.escape(g.id)}')`);
    }
  }

  // Batch insert junction records
  const inserts = [];

  if (performerRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO ScenePerformer (sceneId, performerId) VALUES ${performerRecords.join(',')}`
    ));
  }
  if (tagRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO SceneTag (sceneId, tagId) VALUES ${tagRecords.join(',')}`
    ));
  }
  if (groupRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO SceneGroup (sceneId, groupId, sceneIndex) VALUES ${groupRecords.join(',')}`
    ));
  }
  if (galleryRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO SceneGallery (sceneId, galleryId) VALUES ${galleryRecords.join(',')}`
    ));
  }

  await Promise.all(inserts);

  // Log progress
  const currentTotal = batchStart + scenes.length;
  logger.info(
    `Scenes: ${currentTotal}/${totalCount} (${Math.round((currentTotal / totalCount) * 100)}%)`
  );
}
```

---

### 2.2 Add SQL Escape Helpers

**File**: `server/services/StashSyncService.ts`

**Location**: After line 51 (after class declaration, before methods)

**Add**:
```typescript
/**
 * Escape a string for SQL, handling quotes
 */
private escape(value: string): string {
  return value.replace(/'/g, "''");
}

/**
 * Escape a nullable string for SQL
 * Returns 'value' or NULL
 */
private escapeNullable(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${this.escape(value)}'`;
}
```

---

### 2.3 Update syncScenes PAGE_SIZE

**File**: `server/services/StashSyncService.ts`

**Location**: Line 53

**Replace**:
```typescript
private readonly PAGE_SIZE = 100; // Very small batches for scene junction tables
```

**With**:
```typescript
private readonly PAGE_SIZE = 500; // Larger batches now that we use bulk SQL
```

---

## Task 3: Update Other Entity Sync Methods

### 3.1 Update processPerformersBatch

**File**: `server/services/StashSyncService.ts`

**Location**: Lines 797-849 (processPerformersBatch method)

**Replace with**:
```typescript
private async processPerformersBatch(
  performers: Performer[],
  stashInstanceId?: string
): Promise<void> {
  const values = performers.map(performer => {
    return `(
      '${this.escape(performer.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
      ${this.escapeNullable(performer.name)},
      ${this.escapeNullable(performer.disambiguation)},
      ${this.escapeNullable(performer.gender)},
      ${this.escapeNullable(performer.birthdate)},
      ${performer.favorite ? 1 : 0},
      ${performer.rating100 ?? 'NULL'},
      ${performer.scene_count ?? 0},
      ${performer.image_count ?? 0},
      ${performer.gallery_count ?? 0},
      ${this.escapeNullable(performer.details)},
      ${this.escapeNullable(JSON.stringify(performer.alias_list || []))},
      ${this.escapeNullable(performer.country)},
      ${this.escapeNullable(performer.ethnicity)},
      ${this.escapeNullable(performer.hair_color)},
      ${this.escapeNullable(performer.eye_color)},
      ${performer.height_cm ?? 'NULL'},
      ${performer.weight ?? 'NULL'},
      ${this.escapeNullable(performer.measurements)},
      ${this.escapeNullable(performer.tattoos)},
      ${this.escapeNullable(performer.piercings)},
      ${this.escapeNullable(performer.career_length)},
      ${this.escapeNullable(performer.death_date)},
      ${this.escapeNullable(performer.url)},
      ${this.escapeNullable(performer.image_path)},
      ${performer.created_at ? `'${performer.created_at}'` : 'NULL'},
      ${performer.updated_at ? `'${performer.updated_at}'` : 'NULL'},
      datetime('now'),
      NULL
    )`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO CachedPerformer (
      id, stashInstanceId, name, disambiguation, gender, birthdate, favorite,
      rating100, sceneCount, imageCount, galleryCount, details, aliasList,
      country, ethnicity, hairColor, eyeColor, heightCm, weightKg, measurements,
      tattoos, piercings, careerLength, deathDate, url, imagePath,
      stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      disambiguation = excluded.disambiguation,
      gender = excluded.gender,
      birthdate = excluded.birthdate,
      favorite = excluded.favorite,
      rating100 = excluded.rating100,
      sceneCount = excluded.sceneCount,
      imageCount = excluded.imageCount,
      galleryCount = excluded.galleryCount,
      details = excluded.details,
      aliasList = excluded.aliasList,
      country = excluded.country,
      ethnicity = excluded.ethnicity,
      hairColor = excluded.hairColor,
      eyeColor = excluded.eyeColor,
      heightCm = excluded.heightCm,
      weightKg = excluded.weightKg,
      measurements = excluded.measurements,
      tattoos = excluded.tattoos,
      piercings = excluded.piercings,
      careerLength = excluded.careerLength,
      deathDate = excluded.deathDate,
      url = excluded.url,
      imagePath = excluded.imagePath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);
}
```

---

### 3.2 Update processStudiosBatch

**File**: `server/services/StashSyncService.ts`

**Location**: Lines 931-970 (processStudiosBatch method)

**Replace with**:
```typescript
private async processStudiosBatch(studios: Studio[], stashInstanceId?: string): Promise<void> {
  const values = studios.map(studio => {
    return `(
      '${this.escape(studio.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
      ${this.escapeNullable(studio.name)},
      ${studio.parent_studio?.id ? `'${this.escape(studio.parent_studio.id)}'` : 'NULL'},
      ${studio.favorite ? 1 : 0},
      ${studio.rating100 ?? 'NULL'},
      ${studio.scene_count ?? 0},
      ${studio.image_count ?? 0},
      ${studio.gallery_count ?? 0},
      ${this.escapeNullable(studio.details)},
      ${this.escapeNullable(studio.url)},
      ${this.escapeNullable(studio.image_path)},
      ${studio.created_at ? `'${studio.created_at}'` : 'NULL'},
      ${studio.updated_at ? `'${studio.updated_at}'` : 'NULL'},
      datetime('now'),
      NULL
    )`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO CachedStudio (
      id, stashInstanceId, name, parentId, favorite, rating100, sceneCount,
      imageCount, galleryCount, details, url, imagePath, stashCreatedAt,
      stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      parentId = excluded.parentId,
      favorite = excluded.favorite,
      rating100 = excluded.rating100,
      sceneCount = excluded.sceneCount,
      imageCount = excluded.imageCount,
      galleryCount = excluded.galleryCount,
      details = excluded.details,
      url = excluded.url,
      imagePath = excluded.imagePath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);
}
```

---

### 3.3 Update processTagsBatch

**File**: `server/services/StashSyncService.ts`

**Location**: Lines 1052-1085 (processTagsBatch method)

**Replace with**:
```typescript
private async processTagsBatch(tags: Tag[], stashInstanceId?: string): Promise<void> {
  const values = tags.map(tag => {
    const parentIds = tag.parents?.map(p => p.id) || [];
    return `(
      '${this.escape(tag.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
      ${this.escapeNullable(tag.name)},
      ${tag.favorite ? 1 : 0},
      ${tag.scene_count ?? 0},
      ${tag.image_count ?? 0},
      ${this.escapeNullable(tag.description)},
      ${this.escapeNullable(JSON.stringify(parentIds))},
      ${this.escapeNullable(tag.image_path)},
      ${tag.created_at ? `'${tag.created_at}'` : 'NULL'},
      ${tag.updated_at ? `'${tag.updated_at}'` : 'NULL'},
      datetime('now'),
      NULL
    )`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO CachedTag (
      id, stashInstanceId, name, favorite, sceneCount, imageCount, description,
      parentIds, imagePath, stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      favorite = excluded.favorite,
      sceneCount = excluded.sceneCount,
      imageCount = excluded.imageCount,
      description = excluded.description,
      parentIds = excluded.parentIds,
      imagePath = excluded.imagePath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);
}
```

---

### 3.4 Update processGroupsBatch

**File**: `server/services/StashSyncService.ts`

**Location**: Lines 1167-1205 (processGroupsBatch method)

**Replace with**:
```typescript
private async processGroupsBatch(groups: Group[], stashInstanceId?: string): Promise<void> {
  const values = groups.map(group => {
    const duration = group.duration || null;
    const urls = group.urls || [];
    return `(
      '${this.escape(group.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
      ${this.escapeNullable(group.name)},
      ${this.escapeNullable(group.date)},
      ${group.studio?.id ? `'${this.escape(group.studio.id)}'` : 'NULL'},
      ${group.rating100 ?? 'NULL'},
      ${duration ? Math.round(duration) : 'NULL'},
      ${group.scene_count ?? 0},
      ${this.escapeNullable(group.director)},
      ${this.escapeNullable(group.synopsis)},
      ${this.escapeNullable(JSON.stringify(urls))},
      ${this.escapeNullable(group.front_image_path)},
      ${this.escapeNullable(group.back_image_path)},
      ${group.created_at ? `'${group.created_at}'` : 'NULL'},
      ${group.updated_at ? `'${group.updated_at}'` : 'NULL'},
      datetime('now'),
      NULL
    )`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO CachedGroup (
      id, stashInstanceId, name, date, studioId, rating100, duration, sceneCount,
      director, synopsis, urls, frontImagePath, backImagePath, stashCreatedAt,
      stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      duration = excluded.duration,
      sceneCount = excluded.sceneCount,
      director = excluded.director,
      synopsis = excluded.synopsis,
      urls = excluded.urls,
      frontImagePath = excluded.frontImagePath,
      backImagePath = excluded.backImagePath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);
}
```

---

### 3.5 Update processGalleriesBatch

**File**: `server/services/StashSyncService.ts`

**Location**: Lines 1287-1325 (processGalleriesBatch method)

**Replace with**:
```typescript
private async processGalleriesBatch(
  galleries: Gallery[],
  stashInstanceId?: string
): Promise<void> {
  const values = galleries.map(gallery => {
    const folder = gallery.folder;
    return `(
      '${this.escape(gallery.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
      ${this.escapeNullable(gallery.title)},
      ${this.escapeNullable(gallery.date)},
      ${gallery.studio?.id ? `'${this.escape(gallery.studio.id)}'` : 'NULL'},
      ${gallery.rating100 ?? 'NULL'},
      ${gallery.image_count ?? 0},
      ${this.escapeNullable(gallery.details)},
      ${this.escapeNullable(gallery.url)},
      ${this.escapeNullable(gallery.code)},
      ${this.escapeNullable(folder?.path)},
      ${this.escapeNullable(gallery.cover?.paths?.thumbnail)},
      ${gallery.created_at ? `'${gallery.created_at}'` : 'NULL'},
      ${gallery.updated_at ? `'${gallery.updated_at}'` : 'NULL'},
      datetime('now'),
      NULL
    )`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO CachedGallery (
      id, stashInstanceId, title, date, studioId, rating100, imageCount,
      details, url, code, folderPath, coverPath, stashCreatedAt, stashUpdatedAt,
      syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      imageCount = excluded.imageCount,
      details = excluded.details,
      url = excluded.url,
      code = excluded.code,
      folderPath = excluded.folderPath,
      coverPath = excluded.coverPath,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);
}
```

---

### 3.6 Update processImagesBatch

**File**: `server/services/StashSyncService.ts`

**Location**: Lines 1407-1482 (processImagesBatch method)

**Replace with**:
```typescript
private async processImagesBatch(images: any[], stashInstanceId?: string): Promise<void> {
  const imageIds = images.map(i => i.id);

  // Bulk delete junction records
  await Promise.all([
    prisma.imagePerformer.deleteMany({ where: { imageId: { in: imageIds } } }),
    prisma.imageTag.deleteMany({ where: { imageId: { in: imageIds } } }),
    prisma.imageGallery.deleteMany({ where: { imageId: { in: imageIds } } }),
  ]);

  // Build bulk image upsert
  const values = images.map(image => {
    const visualFile = image.visual_files?.[0];
    const paths = image.paths;
    return `(
      '${this.escape(image.id)}',
      ${stashInstanceId ? `'${this.escape(stashInstanceId)}'` : 'NULL'},
      ${this.escapeNullable(image.title)},
      ${this.escapeNullable(image.date)},
      ${image.studio?.id ? `'${this.escape(image.studio.id)}'` : 'NULL'},
      ${image.rating100 ?? 'NULL'},
      ${image.o_counter ?? 0},
      ${image.organized ? 1 : 0},
      ${this.escapeNullable(visualFile?.path)},
      ${visualFile?.width ?? 'NULL'},
      ${visualFile?.height ?? 'NULL'},
      ${visualFile?.size ?? 'NULL'},
      ${this.escapeNullable(paths?.thumbnail)},
      ${this.escapeNullable(paths?.preview)},
      ${this.escapeNullable(paths?.image)},
      ${image.created_at ? `'${image.created_at}'` : 'NULL'},
      ${image.updated_at ? `'${image.updated_at}'` : 'NULL'},
      datetime('now'),
      NULL
    )`;
  }).join(',\n');

  await prisma.$executeRawUnsafe(`
    INSERT INTO CachedImage (
      id, stashInstanceId, title, date, studioId, rating100, oCounter, organized,
      filePath, width, height, fileSize, pathThumbnail, pathPreview, pathImage,
      stashCreatedAt, stashUpdatedAt, syncedAt, deletedAt
    ) VALUES ${values}
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      date = excluded.date,
      studioId = excluded.studioId,
      rating100 = excluded.rating100,
      oCounter = excluded.oCounter,
      organized = excluded.organized,
      filePath = excluded.filePath,
      width = excluded.width,
      height = excluded.height,
      fileSize = excluded.fileSize,
      pathThumbnail = excluded.pathThumbnail,
      pathPreview = excluded.pathPreview,
      pathImage = excluded.pathImage,
      stashCreatedAt = excluded.stashCreatedAt,
      stashUpdatedAt = excluded.stashUpdatedAt,
      syncedAt = excluded.syncedAt,
      deletedAt = NULL
  `);

  // Collect junction records
  const performerRecords: string[] = [];
  const tagRecords: string[] = [];
  const galleryRecords: string[] = [];

  for (const image of images) {
    for (const p of image.performers || []) {
      performerRecords.push(`('${this.escape(image.id)}', '${this.escape(p.id)}')`);
    }
    for (const t of image.tags || []) {
      tagRecords.push(`('${this.escape(image.id)}', '${this.escape(t.id)}')`);
    }
    for (const g of image.galleries || []) {
      galleryRecords.push(`('${this.escape(image.id)}', '${this.escape(g.id)}')`);
    }
  }

  // Batch insert junction records
  const inserts = [];

  if (performerRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO ImagePerformer (imageId, performerId) VALUES ${performerRecords.join(',')}`
    ));
  }
  if (tagRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO ImageTag (imageId, tagId) VALUES ${tagRecords.join(',')}`
    ));
  }
  if (galleryRecords.length > 0) {
    inserts.push(prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO ImageGallery (imageId, galleryId) VALUES ${galleryRecords.join(',')}`
    ));
  }

  await Promise.all(inserts);
}
```

---

### 3.7 Remove Transform Imports

**File**: `server/services/StashSyncService.ts`

**Location**: Lines 19-27

**Replace**:
```typescript
import {
  transformGallery,
  transformGroup,
  transformImage,
  transformPerformer,
  transformScene,
  transformStudio,
  transformTag,
} from "../utils/pathMapping.js";
```

**With**:
```typescript
// Transform functions no longer needed - URLs transformed at read time
```

---

## Task 4: Update CachedEntityQueryService

### 4.1 Update Scene Query Methods

**File**: `server/services/CachedEntityQueryService.ts`

**Location**: Lines 95-101 (getAllScenes method)

**Replace**:
```typescript
async getAllScenes(): Promise<NormalizedScene[]> {
  const cached = await prisma.cachedScene.findMany({
    where: { deletedAt: null },
  });

  return cached.map((c) => this.parseSceneData(c.data));
}
```

**With**:
```typescript
async getAllScenes(): Promise<NormalizedScene[]> {
  const cached = await prisma.cachedScene.findMany({
    where: { deletedAt: null },
  });

  return cached.map((c) => this.transformScene(c));
}
```

---

### 4.2 Update getScene Method

**File**: `server/services/CachedEntityQueryService.ts`

**Location**: Lines 106-113 (getScene method)

**Replace**:
```typescript
async getScene(id: string): Promise<NormalizedScene | null> {
  const cached = await prisma.cachedScene.findFirst({
    where: { id, deletedAt: null },
  });

  if (!cached) return null;
  return this.parseSceneData(cached.data);
}
```

**With**:
```typescript
async getScene(id: string): Promise<NormalizedScene | null> {
  const cached = await prisma.cachedScene.findFirst({
    where: { id, deletedAt: null },
    include: {
      performers: { include: { performer: true } },
      tags: { include: { tag: true } },
      groups: { include: { group: true } },
      galleries: { include: { gallery: true } },
    },
  });

  if (!cached) return null;
  return this.transformSceneWithRelations(cached);
}
```

---

### 4.3 Add New Transform Methods

**File**: `server/services/CachedEntityQueryService.ts`

**Location**: After line 563 (replace existing parseSceneData and other parse methods)

**Replace parseSceneData and add new methods**:
```typescript
// ==================== Data Transform Helpers ====================

private transformScene(scene: any): NormalizedScene {
  return {
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

    // Parse streams JSON
    sceneStreams: scene.streams
      ? JSON.parse(scene.streams).map((s: any) => ({
          ...s,
          url: this.transformUrl(s.url),
        }))
      : [],

    // Stash counters
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

    // User fields (defaults)
    ...DEFAULT_SCENE_USER_FIELDS,
  } as NormalizedScene;
}

private transformSceneWithRelations(scene: any): NormalizedScene {
  const base = this.transformScene(scene);

  // Add nested entities
  if (scene.performers) {
    base.performers = scene.performers.map((sp: any) =>
      this.transformPerformer(sp.performer)
    );
  }
  if (scene.tags) {
    base.tags = scene.tags.map((st: any) =>
      this.transformTag(st.tag)
    );
  }
  if (scene.groups) {
    base.groups = scene.groups.map((sg: any) => ({
      ...this.transformGroup(sg.group),
      scene_index: sg.sceneIndex,
    }));
  }
  if (scene.galleries) {
    base.galleries = scene.galleries.map((sg: any) =>
      this.transformGallery(sg.gallery)
    );
  }

  return base;
}

private transformPerformer(performer: any): NormalizedPerformer {
  return {
    id: performer.id,
    name: performer.name,
    disambiguation: performer.disambiguation,
    gender: performer.gender,
    birthdate: performer.birthdate,
    favorite: performer.favorite ?? false,
    rating100: performer.rating100,
    scene_count: performer.sceneCount ?? 0,
    image_count: performer.imageCount ?? 0,
    gallery_count: performer.galleryCount ?? 0,
    details: performer.details,
    alias_list: performer.aliasList ? JSON.parse(performer.aliasList) : [],
    country: performer.country,
    ethnicity: performer.ethnicity,
    hair_color: performer.hairColor,
    eye_color: performer.eyeColor,
    height_cm: performer.heightCm,
    weight: performer.weightKg,
    measurements: performer.measurements,
    tattoos: performer.tattoos,
    piercings: performer.piercings,
    career_length: performer.careerLength,
    death_date: performer.deathDate,
    url: performer.url,
    image_path: this.transformUrl(performer.imagePath),
    created_at: performer.stashCreatedAt?.toISOString() ?? null,
    updated_at: performer.stashUpdatedAt?.toISOString() ?? null,
    ...DEFAULT_PERFORMER_USER_FIELDS,
  } as NormalizedPerformer;
}

private transformStudio(studio: any): NormalizedStudio {
  return {
    id: studio.id,
    name: studio.name,
    parent_studio: studio.parentId ? { id: studio.parentId } : null,
    favorite: studio.favorite ?? false,
    rating100: studio.rating100,
    scene_count: studio.sceneCount ?? 0,
    image_count: studio.imageCount ?? 0,
    gallery_count: studio.galleryCount ?? 0,
    details: studio.details,
    url: studio.url,
    image_path: this.transformUrl(studio.imagePath),
    created_at: studio.stashCreatedAt?.toISOString() ?? null,
    updated_at: studio.stashUpdatedAt?.toISOString() ?? null,
    ...DEFAULT_STUDIO_USER_FIELDS,
  } as NormalizedStudio;
}

private transformTag(tag: any): NormalizedTag {
  return {
    id: tag.id,
    name: tag.name,
    favorite: tag.favorite ?? false,
    scene_count: tag.sceneCount ?? 0,
    image_count: tag.imageCount ?? 0,
    description: tag.description,
    parents: tag.parentIds ? JSON.parse(tag.parentIds).map((id: string) => ({ id })) : [],
    image_path: this.transformUrl(tag.imagePath),
    created_at: tag.stashCreatedAt?.toISOString() ?? null,
    updated_at: tag.stashUpdatedAt?.toISOString() ?? null,
    ...DEFAULT_TAG_USER_FIELDS,
  } as NormalizedTag;
}

private transformGroup(group: any): NormalizedGroup {
  return {
    id: group.id,
    name: group.name,
    date: group.date,
    studio: group.studioId ? { id: group.studioId } : null,
    rating100: group.rating100,
    duration: group.duration,
    scene_count: group.sceneCount ?? 0,
    director: group.director,
    synopsis: group.synopsis,
    urls: group.urls ? JSON.parse(group.urls) : [],
    front_image_path: this.transformUrl(group.frontImagePath),
    back_image_path: this.transformUrl(group.backImagePath),
    created_at: group.stashCreatedAt?.toISOString() ?? null,
    updated_at: group.stashUpdatedAt?.toISOString() ?? null,
    ...DEFAULT_GROUP_USER_FIELDS,
  } as NormalizedGroup;
}

private transformGallery(gallery: any): NormalizedGallery {
  return {
    id: gallery.id,
    title: gallery.title,
    date: gallery.date,
    studio: gallery.studioId ? { id: gallery.studioId } : null,
    rating100: gallery.rating100,
    image_count: gallery.imageCount ?? 0,
    details: gallery.details,
    url: gallery.url,
    code: gallery.code,
    folder: gallery.folderPath ? { path: gallery.folderPath } : null,
    cover: gallery.coverPath ? { paths: { thumbnail: this.transformUrl(gallery.coverPath) } } : null,
    created_at: gallery.stashCreatedAt?.toISOString() ?? null,
    updated_at: gallery.stashUpdatedAt?.toISOString() ?? null,
    ...DEFAULT_GALLERY_USER_FIELDS,
  } as NormalizedGallery;
}

private transformUrl(path: string | null): string | null {
  if (!path) return null;
  // Replace Stash host with proxy prefix
  return `/api/proxy/stash${path}`;
}
```

---

### 4.4 Update All Other Query Methods

**File**: `server/services/CachedEntityQueryService.ts`

Update all methods that use `parseXxxData` to use the new `transformXxx` methods:

- `getScenesByIds`: Use `this.transformScene(c)` instead of `this.parseSceneData(c.data)`
- `getAllPerformers`: Use `this.transformPerformer(c)` instead of `this.parsePerformerData(c.data)`
- `getPerformer`: Use `this.transformPerformer(cached)` instead of `this.parsePerformerData(cached.data)`
- `getPerformersByIds`: Use `this.transformPerformer(c)` instead of `this.parsePerformerData(c.data)`
- (Similar for all other entity types)

---

## Task 5: Clean Up

### 5.1 Remove pathMapping Transform Functions

**File**: `server/utils/pathMapping.ts`

Remove `transformScene`, `transformPerformer`, `transformStudio`, `transformTag`, `transformGroup`, `transformGallery`, `transformImage` functions as they're no longer needed.

Keep only the path mapping utilities for file path translation.

---

### 5.2 Delete Old Parse Methods

**File**: `server/services/CachedEntityQueryService.ts`

Remove the old methods:
- `parseSceneData`
- `parsePerformerData`
- `parseStudioData`
- `parseTagData`
- `parseGalleryData`
- `parseGroupData`

---

## Task 6: Test and Verify

### 6.1 Run Type Check

```bash
cd server && npx tsc --noEmit
```

**Expected**: No TypeScript errors

### 6.2 Run Lint

```bash
cd server && npm run lint
```

**Expected**: No lint errors

### 6.3 Test Full Sync

```bash
docker-compose up -d
docker-compose logs -f peek-server
```

**Expected**:
- Sync completes without errors
- Sync time < 10 minutes for 22k scenes
- All entity types show correct counts

### 6.4 Test Query Responses

Test API endpoints return correct data:
- GET /api/library/scenes - Verify scenes have all fields
- GET /api/library/scenes/:id - Verify nested entities load
- GET /api/library/performers - Verify performers have fields
- GET /api/library/studios - Verify studios have fields

---

## Rollback Plan

If issues arise:

1. Revert migration: `npx prisma migrate reset`
2. Restore old code from git
3. Re-run sync with old code

---

## Summary

**Total Tasks**: 6 major tasks with ~25 sub-tasks

**Key Changes**:
1. Schema: Add ~50 new columns across 7 entity types
2. Sync: Replace individual Prisma upserts with bulk SQL
3. Query: Transform URLs at read time instead of sync time
4. Remove: JSON blob column and transform functions

**Expected Outcome**:
- Sync time: 3.6 hours → ~5 minutes
- DB operations per batch: ~500 → ~9
- Query performance: No JSON.parse overhead
