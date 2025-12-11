# SQLite Architecture Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor from incremental migrations to a clean single migration with table renames (Cached* -> Stash*), add missing junction tables for tags, remove denormalized counts, standardize on rating100, and rename pathMapping.ts to stashUrlProxy.ts.

**Architecture:** Squash 6 existing cache migrations into one clean migration that creates all Stash* tables, junction tables, and FTS5 search. Update all services to reference new table names. Normalize counts (computed via JOINs instead of stored). Keep URL proxy utility but rename it for clarity.

**Tech Stack:** Prisma 6, SQLite, TypeScript, Vitest, Express

---

## Session 1: Schema + Migration

### Task 1: Delete Old Cache Migrations

**Files:**
- Delete: `server/prisma/migrations/20251208160610_add_cached_entities/`
- Delete: `server/prisma/migrations/20251208160700_add_fts5_search/`
- Delete: `server/prisma/migrations/20251209000000_eliminate_json_blob/`
- Delete: `server/prisma/migrations/20251209100000_remove_junction_fk_constraints/`
- Delete: `server/prisma/migrations/20251209150000_add_entity_tags_and_gallery_performers/`
- Delete: `server/prisma/migrations/20251210180000_add_missing_entity_count_fields/`

**Step 1: Delete the migration directories**

```bash
rm -rf server/prisma/migrations/20251208160610_add_cached_entities
rm -rf server/prisma/migrations/20251208160700_add_fts5_search
rm -rf server/prisma/migrations/20251209000000_eliminate_json_blob
rm -rf server/prisma/migrations/20251209100000_remove_junction_fk_constraints
rm -rf server/prisma/migrations/20251209150000_add_entity_tags_and_gallery_performers
rm -rf server/prisma/migrations/20251210180000_add_missing_entity_count_fields
```

**Step 2: Verify deletions**

Run: `ls server/prisma/migrations/`
Expected: Only `0_baseline/` and `20251126202944_add_user_carousel/` remain

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove incremental cache migrations for squash"
```

---

### Task 2: Update Prisma Schema - Rename Tables

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Rename CachedScene to StashScene**

Find all occurrences of `CachedScene` and replace with `StashScene`:
- Model name: `model CachedScene` -> `model StashScene`
- Relations in junction tables: `CachedScene` -> `StashScene`

**Step 2: Rename CachedPerformer to StashPerformer**

Find all occurrences of `CachedPerformer` and replace with `StashPerformer`.

**Step 3: Rename CachedStudio to StashStudio**

Find all occurrences of `CachedStudio` and replace with `StashStudio`.

**Step 4: Rename CachedTag to StashTag**

Find all occurrences of `CachedTag` and replace with `StashTag`.

**Step 5: Rename CachedGroup to StashGroup**

Find all occurrences of `CachedGroup` and replace with `StashGroup`.

**Step 6: Rename CachedGallery to StashGallery**

Find all occurrences of `CachedGallery` and replace with `StashGallery`.

**Step 7: Rename CachedImage to StashImage**

Find all occurrences of `CachedImage` and replace with `StashImage`.

**Step 8: Validate schema syntax**

Run: `cd server && npx prisma validate`
Expected: "The Prisma schema is valid."

**Step 9: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "refactor: rename Cached* tables to Stash* prefix"
```

---

### Task 3: Update Prisma Schema - Add Tag Junction Tables

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add PerformerTag junction table**

Add after GalleryPerformer model:

```prisma
model PerformerTag {
    performerId     String
    tagId           String
    performer       StashPerformer @relation(fields: [performerId], references: [id], onDelete: Cascade)
    tag             StashTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

    @@id([performerId, tagId])
    @@index([tagId])
}
```

**Step 2: Add StudioTag junction table**

```prisma
model StudioTag {
    studioId        String
    tagId           String
    studio          StashStudio    @relation(fields: [studioId], references: [id], onDelete: Cascade)
    tag             StashTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

    @@id([studioId, tagId])
    @@index([tagId])
}
```

**Step 3: Add GalleryTag junction table**

```prisma
model GalleryTag {
    galleryId       String
    tagId           String
    gallery         StashGallery   @relation(fields: [galleryId], references: [id], onDelete: Cascade)
    tag             StashTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

    @@id([galleryId, tagId])
    @@index([tagId])
}
```

**Step 4: Add GroupTag junction table**

```prisma
model GroupTag {
    groupId         String
    tagId           String
    group           StashGroup     @relation(fields: [groupId], references: [id], onDelete: Cascade)
    tag             StashTag       @relation(fields: [tagId], references: [id], onDelete: Cascade)

    @@id([groupId, tagId])
    @@index([tagId])
}
```

**Step 5: Add relations to StashPerformer**

In `StashPerformer` model, add:
```prisma
    tags            PerformerTag[]
```

**Step 6: Add relations to StashStudio**

In `StashStudio` model, add:
```prisma
    tags            StudioTag[]
```

**Step 7: Add relations to StashGallery**

In `StashGallery` model, add:
```prisma
    tags            GalleryTag[]
```

**Step 8: Add relations to StashGroup**

In `StashGroup` model, add:
```prisma
    tags            GroupTag[]
```

**Step 9: Add relations to StashTag**

In `StashTag` model, add:
```prisma
    performers      PerformerTag[]
    studios         StudioTag[]
    galleries       GalleryTag[]
    groups          GroupTag[]
```

**Step 10: Validate schema syntax**

Run: `cd server && npx prisma validate`
Expected: "The Prisma schema is valid."

**Step 11: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat: add tag junction tables (PerformerTag, StudioTag, GalleryTag, GroupTag)"
```

---

### Task 4: Update Prisma Schema - Remove Denormalized Count Fields

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Remove count fields from StashPerformer**

Remove these lines from `StashPerformer`:
```prisma
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)
    galleryCount    Int       @default(0)
    groupCount      Int       @default(0)
```

Also remove the index:
```prisma
    @@index([sceneCount])
```

**Step 2: Remove count fields from StashStudio**

Remove these lines from `StashStudio`:
```prisma
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)
    galleryCount    Int       @default(0)
    performerCount  Int       @default(0)
    groupCount      Int       @default(0)
```

Also remove the index:
```prisma
    @@index([sceneCount])
```

**Step 3: Remove count fields from StashTag**

Remove these lines from `StashTag`:
```prisma
    sceneCount      Int       @default(0)
    imageCount      Int       @default(0)
    galleryCount    Int       @default(0)
    performerCount  Int       @default(0)
    studioCount     Int       @default(0)
    groupCount      Int       @default(0)
    sceneMarkerCount Int      @default(0)
```

Also remove the index:
```prisma
    @@index([sceneCount])
```

**Step 4: Remove count fields from StashGroup**

Remove these lines from `StashGroup`:
```prisma
    sceneCount      Int       @default(0)
    performerCount  Int       @default(0)
```

Also remove the index:
```prisma
    @@index([sceneCount])
```

**Step 5: Remove count field from StashGallery**

Remove this line from `StashGallery`:
```prisma
    imageCount      Int       @default(0)
```

Also remove the index:
```prisma
    @@index([imageCount])
```

**Step 6: Validate schema syntax**

Run: `cd server && npx prisma validate`
Expected: "The Prisma schema is valid."

**Step 7: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "refactor: remove denormalized count fields (will compute via JOINs)"
```

---

### Task 5: Update Prisma Schema - Remove tagIds JSON Fields

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Remove tagIds from StashPerformer**

Remove this line from `StashPerformer`:
```prisma
    tagIds          String?                          // JSON array of tag IDs
```

**Step 2: Remove tagIds from StashStudio**

Remove this line from `StashStudio`:
```prisma
    tagIds          String?                          // JSON array of tag IDs
```

**Step 3: Remove tagIds from StashGroup**

Remove this line from `StashGroup`:
```prisma
    tagIds          String?                          // JSON array of tag IDs
```

**Step 4: Remove tagIds from StashGallery**

Remove this line from `StashGallery`:
```prisma
    tagIds          String?                          // JSON array of tag IDs
```

**Step 5: Validate schema syntax**

Run: `cd server && npx prisma validate`
Expected: "The Prisma schema is valid."

**Step 6: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "refactor: remove tagIds JSON columns (replaced by junction tables)"
```

---

### Task 6: Update Prisma Schema - Remove Deprecated data Field

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Remove data field from all Stash* models**

Remove from StashScene, StashPerformer, StashStudio, StashTag, StashGroup, StashGallery, StashImage:
```prisma
    data            String    @default("{}")         // DEPRECATED: JSON blob
```

**Step 2: Validate schema syntax**

Run: `cd server && npx prisma validate`
Expected: "The Prisma schema is valid."

**Step 3: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "refactor: remove deprecated data JSON blob field"
```

---

### Task 7: Create Squashed Migration File

**Files:**
- Create: `server/prisma/migrations/20251211000000_stash_entities/migration.sql`

**Step 1: Create migration directory**

```bash
mkdir -p server/prisma/migrations/20251211000000_stash_entities
```

**Step 2: Write the complete migration SQL**

Create `server/prisma/migrations/20251211000000_stash_entities/migration.sql` with all table definitions:

```sql
-- CreateTable: StashScene
CREATE TABLE "StashScene" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
    "code" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "duration" INTEGER,
    "organized" BOOLEAN NOT NULL DEFAULT false,
    "details" TEXT,
    "filePath" TEXT,
    "fileBitRate" INTEGER,
    "fileFrameRate" REAL,
    "fileWidth" INTEGER,
    "fileHeight" INTEGER,
    "fileVideoCodec" TEXT,
    "fileAudioCodec" TEXT,
    "fileSize" BIGINT,
    "pathScreenshot" TEXT,
    "pathPreview" TEXT,
    "pathSprite" TEXT,
    "pathVtt" TEXT,
    "pathChaptersVtt" TEXT,
    "pathStream" TEXT,
    "pathCaption" TEXT,
    "streams" TEXT,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "playDuration" REAL NOT NULL DEFAULT 0,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashPerformer
CREATE TABLE "StashPerformer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "disambiguation" TEXT,
    "gender" TEXT,
    "birthdate" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating100" INTEGER,
    "details" TEXT,
    "aliasList" TEXT,
    "country" TEXT,
    "ethnicity" TEXT,
    "hairColor" TEXT,
    "eyeColor" TEXT,
    "heightCm" INTEGER,
    "weightKg" INTEGER,
    "measurements" TEXT,
    "tattoos" TEXT,
    "piercings" TEXT,
    "careerLength" TEXT,
    "deathDate" TEXT,
    "url" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashStudio
CREATE TABLE "StashStudio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "rating100" INTEGER,
    "details" TEXT,
    "url" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashTag
CREATE TABLE "StashTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "aliases" TEXT,
    "parentIds" TEXT,
    "imagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashGroup
CREATE TABLE "StashGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "name" TEXT NOT NULL,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "duration" INTEGER,
    "director" TEXT,
    "synopsis" TEXT,
    "urls" TEXT,
    "frontImagePath" TEXT,
    "backImagePath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashGallery
CREATE TABLE "StashGallery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "details" TEXT,
    "url" TEXT,
    "code" TEXT,
    "folderPath" TEXT,
    "coverPath" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: StashImage
CREATE TABLE "StashImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stashInstanceId" TEXT,
    "title" TEXT,
    "date" TEXT,
    "studioId" TEXT,
    "rating100" INTEGER,
    "oCounter" INTEGER NOT NULL DEFAULT 0,
    "organized" BOOLEAN NOT NULL DEFAULT false,
    "filePath" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "fileSize" BIGINT,
    "pathThumbnail" TEXT,
    "pathPreview" TEXT,
    "pathImage" TEXT,
    "stashCreatedAt" DATETIME,
    "stashUpdatedAt" DATETIME,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable: ScenePerformer
CREATE TABLE "ScenePerformer" (
    "sceneId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "performerId"),
    CONSTRAINT "ScenePerformer_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScenePerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "StashPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SceneTag
CREATE TABLE "SceneTag" (
    "sceneId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "tagId"),
    CONSTRAINT "SceneTag_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SceneGroup
CREATE TABLE "SceneGroup" (
    "sceneId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sceneIndex" INTEGER,

    PRIMARY KEY ("sceneId", "groupId"),
    CONSTRAINT "SceneGroup_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StashGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SceneGallery
CREATE TABLE "SceneGallery" (
    "sceneId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,

    PRIMARY KEY ("sceneId", "galleryId"),
    CONSTRAINT "SceneGallery_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "StashScene" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SceneGallery_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "StashGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: ImagePerformer
CREATE TABLE "ImagePerformer" (
    "imageId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "performerId"),
    CONSTRAINT "ImagePerformer_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "StashImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImagePerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "StashPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: ImageTag
CREATE TABLE "ImageTag" (
    "imageId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "tagId"),
    CONSTRAINT "ImageTag_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "StashImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: ImageGallery
CREATE TABLE "ImageGallery" (
    "imageId" TEXT NOT NULL,
    "galleryId" TEXT NOT NULL,

    PRIMARY KEY ("imageId", "galleryId"),
    CONSTRAINT "ImageGallery_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "StashImage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImageGallery_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "StashGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: GalleryPerformer
CREATE TABLE "GalleryPerformer" (
    "galleryId" TEXT NOT NULL,
    "performerId" TEXT NOT NULL,

    PRIMARY KEY ("galleryId", "performerId"),
    CONSTRAINT "GalleryPerformer_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "StashGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryPerformer_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "StashPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: PerformerTag
CREATE TABLE "PerformerTag" (
    "performerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("performerId", "tagId"),
    CONSTRAINT "PerformerTag_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "StashPerformer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PerformerTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: StudioTag
CREATE TABLE "StudioTag" (
    "studioId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("studioId", "tagId"),
    CONSTRAINT "StudioTag_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "StashStudio" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudioTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: GalleryTag
CREATE TABLE "GalleryTag" (
    "galleryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("galleryId", "tagId"),
    CONSTRAINT "GalleryTag_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "StashGallery" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GalleryTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: GroupTag
CREATE TABLE "GroupTag" (
    "groupId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("groupId", "tagId"),
    CONSTRAINT "GroupTag_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "StashGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "StashTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SyncState
CREATE TABLE "SyncState" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "stashInstanceId" TEXT,
    "entityType" TEXT NOT NULL,
    "lastFullSync" DATETIME,
    "lastIncrementalSync" DATETIME,
    "lastSyncCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncDurationMs" INTEGER,
    "lastError" TEXT,
    "totalEntities" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable: SyncSettings
CREATE TABLE "SyncSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "syncIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "enableScanSubscription" BOOLEAN NOT NULL DEFAULT true,
    "enablePluginWebhook" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex: StashScene indexes
CREATE INDEX "StashScene_studioId_idx" ON "StashScene"("studioId");
CREATE INDEX "StashScene_date_idx" ON "StashScene"("date");
CREATE INDEX "StashScene_stashCreatedAt_idx" ON "StashScene"("stashCreatedAt");
CREATE INDEX "StashScene_stashUpdatedAt_idx" ON "StashScene"("stashUpdatedAt");
CREATE INDEX "StashScene_rating100_idx" ON "StashScene"("rating100");
CREATE INDEX "StashScene_duration_idx" ON "StashScene"("duration");
CREATE INDEX "StashScene_deletedAt_idx" ON "StashScene"("deletedAt");
CREATE INDEX "StashScene_oCounter_idx" ON "StashScene"("oCounter");
CREATE INDEX "StashScene_playCount_idx" ON "StashScene"("playCount");
CREATE INDEX "StashScene_browse_idx" ON "StashScene"("deletedAt", "stashCreatedAt" DESC);
CREATE INDEX "StashScene_browse_updated_idx" ON "StashScene"("deletedAt", "stashUpdatedAt" DESC);
CREATE INDEX "StashScene_browse_date_idx" ON "StashScene"("deletedAt", "date" DESC);
CREATE INDEX "StashScene_browse_title_idx" ON "StashScene"("deletedAt", "title");
CREATE INDEX "StashScene_browse_duration_idx" ON "StashScene"("deletedAt", "duration" DESC);

-- CreateIndex: StashPerformer indexes
CREATE INDEX "StashPerformer_name_idx" ON "StashPerformer"("name");
CREATE INDEX "StashPerformer_gender_idx" ON "StashPerformer"("gender");
CREATE INDEX "StashPerformer_favorite_idx" ON "StashPerformer"("favorite");
CREATE INDEX "StashPerformer_rating100_idx" ON "StashPerformer"("rating100");
CREATE INDEX "StashPerformer_stashUpdatedAt_idx" ON "StashPerformer"("stashUpdatedAt");
CREATE INDEX "StashPerformer_deletedAt_idx" ON "StashPerformer"("deletedAt");

-- CreateIndex: StashStudio indexes
CREATE INDEX "StashStudio_name_idx" ON "StashStudio"("name");
CREATE INDEX "StashStudio_parentId_idx" ON "StashStudio"("parentId");
CREATE INDEX "StashStudio_favorite_idx" ON "StashStudio"("favorite");
CREATE INDEX "StashStudio_rating100_idx" ON "StashStudio"("rating100");
CREATE INDEX "StashStudio_stashUpdatedAt_idx" ON "StashStudio"("stashUpdatedAt");
CREATE INDEX "StashStudio_deletedAt_idx" ON "StashStudio"("deletedAt");

-- CreateIndex: StashTag indexes
CREATE INDEX "StashTag_name_idx" ON "StashTag"("name");
CREATE INDEX "StashTag_favorite_idx" ON "StashTag"("favorite");
CREATE INDEX "StashTag_stashUpdatedAt_idx" ON "StashTag"("stashUpdatedAt");
CREATE INDEX "StashTag_deletedAt_idx" ON "StashTag"("deletedAt");

-- CreateIndex: StashGroup indexes
CREATE INDEX "StashGroup_name_idx" ON "StashGroup"("name");
CREATE INDEX "StashGroup_date_idx" ON "StashGroup"("date");
CREATE INDEX "StashGroup_studioId_idx" ON "StashGroup"("studioId");
CREATE INDEX "StashGroup_rating100_idx" ON "StashGroup"("rating100");
CREATE INDEX "StashGroup_stashUpdatedAt_idx" ON "StashGroup"("stashUpdatedAt");
CREATE INDEX "StashGroup_deletedAt_idx" ON "StashGroup"("deletedAt");

-- CreateIndex: StashGallery indexes
CREATE INDEX "StashGallery_title_idx" ON "StashGallery"("title");
CREATE INDEX "StashGallery_date_idx" ON "StashGallery"("date");
CREATE INDEX "StashGallery_studioId_idx" ON "StashGallery"("studioId");
CREATE INDEX "StashGallery_rating100_idx" ON "StashGallery"("rating100");
CREATE INDEX "StashGallery_stashUpdatedAt_idx" ON "StashGallery"("stashUpdatedAt");
CREATE INDEX "StashGallery_deletedAt_idx" ON "StashGallery"("deletedAt");

-- CreateIndex: StashImage indexes
CREATE INDEX "StashImage_studioId_idx" ON "StashImage"("studioId");
CREATE INDEX "StashImage_date_idx" ON "StashImage"("date");
CREATE INDEX "StashImage_rating100_idx" ON "StashImage"("rating100");
CREATE INDEX "StashImage_stashUpdatedAt_idx" ON "StashImage"("stashUpdatedAt");
CREATE INDEX "StashImage_deletedAt_idx" ON "StashImage"("deletedAt");

-- CreateIndex: Junction table indexes
CREATE INDEX "ScenePerformer_performerId_idx" ON "ScenePerformer"("performerId");
CREATE INDEX "SceneTag_tagId_idx" ON "SceneTag"("tagId");
CREATE INDEX "SceneGroup_groupId_idx" ON "SceneGroup"("groupId");
CREATE INDEX "SceneGallery_galleryId_idx" ON "SceneGallery"("galleryId");
CREATE INDEX "ImagePerformer_performerId_idx" ON "ImagePerformer"("performerId");
CREATE INDEX "ImageTag_tagId_idx" ON "ImageTag"("tagId");
CREATE INDEX "ImageGallery_galleryId_idx" ON "ImageGallery"("galleryId");
CREATE INDEX "GalleryPerformer_performerId_idx" ON "GalleryPerformer"("performerId");
CREATE INDEX "PerformerTag_tagId_idx" ON "PerformerTag"("tagId");
CREATE INDEX "StudioTag_tagId_idx" ON "StudioTag"("tagId");
CREATE INDEX "GalleryTag_tagId_idx" ON "GalleryTag"("tagId");
CREATE INDEX "GroupTag_tagId_idx" ON "GroupTag"("tagId");

-- CreateIndex: SyncState unique constraint
CREATE UNIQUE INDEX "SyncState_stashInstanceId_entityType_key" ON "SyncState"("stashInstanceId", "entityType");

-- FTS5 Virtual Table for scene search
CREATE VIRTUAL TABLE IF NOT EXISTS scene_fts USING fts5(
    id,
    title,
    details,
    code,
    content='StashScene',
    content_rowid='rowid'
);

-- FTS5 Triggers for automatic sync
CREATE TRIGGER IF NOT EXISTS scene_fts_insert AFTER INSERT ON StashScene BEGIN
    INSERT INTO scene_fts(rowid, id, title, details, code)
    VALUES (NEW.rowid, NEW.id, NEW.title, NEW.details, NEW.code);
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_delete AFTER DELETE ON StashScene BEGIN
    INSERT INTO scene_fts(scene_fts, rowid, id, title, details, code)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.title, OLD.details, OLD.code);
END;

CREATE TRIGGER IF NOT EXISTS scene_fts_update AFTER UPDATE ON StashScene BEGIN
    INSERT INTO scene_fts(scene_fts, rowid, id, title, details, code)
    VALUES ('delete', OLD.rowid, OLD.id, OLD.title, OLD.details, OLD.code);
    INSERT INTO scene_fts(rowid, id, title, details, code)
    VALUES (NEW.rowid, NEW.id, NEW.title, NEW.details, NEW.code);
END;
```

**Step 3: Verify migration file exists**

Run: `ls -la server/prisma/migrations/20251211000000_stash_entities/`
Expected: migration.sql file present

**Step 4: Commit**

```bash
git add server/prisma/migrations/20251211000000_stash_entities/
git commit -m "feat: add squashed stash_entities migration"
```

---

### Task 8: Verify Prisma Schema Consistency

**Files:**
- Test: `server/prisma/schema.prisma`

**Step 1: Format schema**

Run: `cd server && npx prisma format`
Expected: Schema formatted successfully

**Step 2: Validate schema**

Run: `cd server && npx prisma validate`
Expected: "The Prisma schema is valid."

**Step 3: Generate Prisma client**

Run: `cd server && npx prisma generate`
Expected: "Generated Prisma Client"

**Step 4: Commit any formatting changes**

```bash
git add server/prisma/schema.prisma
git commit -m "style: format prisma schema" --allow-empty
```

---

## Session 2: Server Code Refactor

### Task 9: Rename pathMapping.ts to stashUrlProxy.ts

**Files:**
- Rename: `server/utils/pathMapping.ts` -> `server/utils/stashUrlProxy.ts`
- Modify: `server/controllers/playlist.ts`
- Modify: `server/controllers/library/galleries.ts`
- Modify: `server/controllers/library/images.ts`
- Modify: `server/services/StashCacheManager.ts`
- Modify: `server/services/__tests__/StashSyncService.integration.test.ts`

**Step 1: Rename the file**

```bash
git mv server/utils/pathMapping.ts server/utils/stashUrlProxy.ts
```

**Step 2: Update import in server/controllers/playlist.ts**

Find:
```typescript
import { transformScene } from "../utils/pathMapping.js";
```

Replace:
```typescript
import { transformScene } from "../utils/stashUrlProxy.js";
```

**Step 3: Update import in server/controllers/library/galleries.ts**

Find:
```typescript
import { transformGallery } from "../../utils/pathMapping.js";
```

Replace:
```typescript
import { transformGallery } from "../../utils/stashUrlProxy.js";
```

**Step 4: Update import in server/controllers/library/images.ts**

Find:
```typescript
import { transformImage } from "../../utils/pathMapping.js";
```

Replace:
```typescript
import { transformImage } from "../../utils/stashUrlProxy.js";
```

**Step 5: Update import in server/services/StashCacheManager.ts**

Find:
```typescript
import { ... } from "../utils/pathMapping.js";
```

Replace:
```typescript
import { ... } from "../utils/stashUrlProxy.js";
```

**Step 6: Update import in StashSyncService.integration.test.ts**

Find:
```typescript
import { ... } from "../../utils/pathMapping.js";
```

Replace:
```typescript
import { ... } from "../../utils/stashUrlProxy.js";
```

**Step 7: Search for any other references**

Run: `cd server && grep -r "pathMapping" --include="*.ts" --include="*.js"`
Expected: No results (all imports updated)

**Step 8: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 9: Commit**

```bash
git add -A
git commit -m "refactor: rename pathMapping.ts to stashUrlProxy.ts"
```

---

### Task 10: Update CachedEntityQueryService - Rename to StashEntityService

**Files:**
- Rename: `server/services/CachedEntityQueryService.ts` -> `server/services/StashEntityService.ts`
- Modify: All files that import CachedEntityQueryService

**Step 1: Rename the file**

```bash
git mv server/services/CachedEntityQueryService.ts server/services/StashEntityService.ts
```

**Step 2: Update class name and export in the renamed file**

Find:
```typescript
class CachedEntityQueryService {
```

Replace:
```typescript
class StashEntityService {
```

Find:
```typescript
export const cachedEntityQueryService = new CachedEntityQueryService();
```

Replace:
```typescript
export const stashEntityService = new StashEntityService();
```

**Step 3: Update all table references in StashEntityService.ts**

Replace all occurrences:
- `CachedScene` -> `StashScene`
- `CachedPerformer` -> `StashPerformer`
- `CachedStudio` -> `StashStudio`
- `CachedTag` -> `StashTag`
- `CachedGroup` -> `StashGroup`
- `CachedGallery` -> `StashGallery`
- `CachedImage` -> `StashImage`
- `cachedScene` -> `stashScene`
- `cachedPerformer` -> `stashPerformer`
- `cachedStudio` -> `stashStudio`
- `cachedTag` -> `stashTag`
- `cachedGroup` -> `stashGroup`
- `cachedGallery` -> `stashGallery`
- `cachedImage` -> `stashImage`

**Step 4: Update imports across codebase**

Search and replace in all .ts files:
```typescript
// Old
import { cachedEntityQueryService } from "./CachedEntityQueryService.js";
import { cachedEntityQueryService } from "../services/CachedEntityQueryService.js";

// New
import { stashEntityService } from "./StashEntityService.js";
import { stashEntityService } from "../services/StashEntityService.js";
```

**Step 5: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename CachedEntityQueryService to StashEntityService"
```

---

### Task 11: Update StashSyncService - Table References

**Files:**
- Modify: `server/services/StashSyncService.ts`

**Step 1: Update all Prisma table references**

Replace all occurrences:
- `prisma.cachedScene` -> `prisma.stashScene`
- `prisma.cachedPerformer` -> `prisma.stashPerformer`
- `prisma.cachedStudio` -> `prisma.stashStudio`
- `prisma.cachedTag` -> `prisma.stashTag`
- `prisma.cachedGroup` -> `prisma.stashGroup`
- `prisma.cachedGallery` -> `prisma.stashGallery`
- `prisma.cachedImage` -> `prisma.stashImage`

**Step 2: Update SQL string references**

Replace in raw SQL queries:
- `"CachedScene"` -> `"StashScene"`
- `"CachedPerformer"` -> `"StashPerformer"`
- `"CachedStudio"` -> `"StashStudio"`
- `"CachedTag"` -> `"StashTag"`
- `"CachedGroup"` -> `"StashGroup"`
- `"CachedGallery"` -> `"StashGallery"`
- `"CachedImage"` -> `"StashImage"`

**Step 3: Remove count field updates**

Remove any code that updates:
- `sceneCount`
- `imageCount`
- `galleryCount`
- `groupCount`
- `performerCount`
- `studioCount`
- `sceneMarkerCount`

**Step 4: Add tag junction table syncing**

When syncing performers/studios/groups/galleries, add code to sync their tags to the new junction tables (PerformerTag, StudioTag, GroupTag, GalleryTag).

**Step 5: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add server/services/StashSyncService.ts
git commit -m "refactor: update StashSyncService for new table names and junction tables"
```

---

### Task 12: Update SceneQueryBuilder - Table References

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts`

**Step 1: Update all SQL table references**

Replace all occurrences:
- `CachedScene` -> `StashScene`
- `CachedPerformer` -> `StashPerformer`
- `CachedStudio` -> `StashStudio`
- `CachedTag` -> `StashTag`
- `CachedGroup` -> `StashGroup`
- `CachedGallery` -> `StashGallery`
- `CachedImage` -> `StashImage`

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "refactor: update SceneQueryBuilder for new table names"
```

---

### Task 13: Update UserRestrictionService - Table References

**Files:**
- Modify: `server/services/UserRestrictionService.ts`

**Step 1: Update all SQL table references**

Replace all occurrences:
- `CachedScene` -> `StashScene`
- `CachedPerformer` -> `StashPerformer`
- `CachedStudio` -> `StashStudio`
- `CachedTag` -> `StashTag`
- `CachedGroup` -> `StashGroup`
- `CachedGallery` -> `StashGallery`
- `CachedImage` -> `StashImage`

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/UserRestrictionService.ts
git commit -m "refactor: update UserRestrictionService for new table names"
```

---

### Task 14: Update StashCacheManager - Table References

**Files:**
- Modify: `server/services/StashCacheManager.ts`

**Step 1: Update all Prisma table references**

Replace all occurrences:
- `prisma.cachedScene` -> `prisma.stashScene`
- `prisma.cachedPerformer` -> `prisma.stashPerformer`
- `prisma.cachedStudio` -> `prisma.stashStudio`
- `prisma.cachedTag` -> `prisma.stashTag`
- `prisma.cachedGroup` -> `prisma.stashGroup`
- `prisma.cachedGallery` -> `prisma.stashGallery`
- `prisma.cachedImage` -> `prisma.stashImage`

**Step 2: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add server/services/StashCacheManager.ts
git commit -m "refactor: update StashCacheManager for new table names"
```

---

### Task 15: Update Library Controllers - Import Changes

**Files:**
- Modify: `server/controllers/library/scenes.ts`
- Modify: `server/controllers/library/performers.ts`
- Modify: `server/controllers/library/studios.ts`
- Modify: `server/controllers/library/tags.ts`
- Modify: `server/controllers/library/galleries.ts`
- Modify: `server/controllers/library/groups.ts`
- Modify: `server/controllers/library/images.ts`

**Step 1: Update imports to use stashEntityService**

In each file, change:
```typescript
import { cachedEntityQueryService } from "../../services/CachedEntityQueryService.js";
```
To:
```typescript
import { stashEntityService } from "../../services/StashEntityService.js";
```

**Step 2: Update service calls**

Replace all `cachedEntityQueryService.` with `stashEntityService.`

**Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add server/controllers/library/
git commit -m "refactor: update library controllers to use StashEntityService"
```

---

### Task 16: Update Other Services and Controllers

**Files:**
- Modify: `server/services/FilteredEntityCacheService.ts`
- Modify: `server/services/UserHiddenEntityService.ts`
- Modify: `server/services/UserStatsService.ts`
- Modify: `server/services/SyncScheduler.ts`
- Modify: `server/controllers/sync.ts`
- Modify: Any other files referencing old names

**Step 1: Search for all remaining references**

Run: `cd server && grep -r "CachedEntityQueryService\|cachedEntityQueryService\|CachedScene\|CachedPerformer\|CachedStudio\|CachedTag\|CachedGroup\|CachedGallery\|CachedImage" --include="*.ts"`

**Step 2: Update each file found**

For each file with old references:
- Update imports
- Update table/service references

**Step 3: Verify TypeScript compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: update remaining services for new naming convention"
```

---

### Task 17: Update Tests - Table and Service References

**Files:**
- Modify: `server/services/__tests__/CachedEntityQueryService.test.ts` -> rename and update
- Modify: `server/services/__tests__/StashSyncService.integration.test.ts`
- Modify: `server/tests/services/SceneQueryBuilder.test.ts`
- Modify: `server/tests/services/SceneQueryBuilder.integration.test.ts`
- Modify: Other test files

**Step 1: Rename CachedEntityQueryService.test.ts**

```bash
git mv server/services/__tests__/CachedEntityQueryService.test.ts server/services/__tests__/StashEntityService.test.ts
```

**Step 2: Update test file imports and references**

In the renamed test file:
- Update import to use `StashEntityService`
- Update mock table names to `StashScene`, etc.
- Update variable names

**Step 3: Update other test files**

Search and update all test files for table name references.

**Step 4: Run tests**

Run: `cd server && npm test`
Expected: All tests pass (or skip integration tests as expected)

**Step 5: Commit**

```bash
git add -A
git commit -m "test: update tests for new naming convention"
```

---

## Session 3: Client Updates

### Task 18: Rename CacheLoadingBanner to SyncProgressBanner

**Files:**
- Rename: `client/src/components/ui/CacheLoadingBanner.jsx` -> `client/src/components/ui/SyncProgressBanner.jsx`
- Modify: All files that import CacheLoadingBanner

**Step 1: Rename the file**

```bash
git mv client/src/components/ui/CacheLoadingBanner.jsx client/src/components/ui/SyncProgressBanner.jsx
```

**Step 2: Update component name and default export**

In the renamed file, change:
```jsx
const CacheLoadingBanner = ({ message, className = "" }) => {
```
To:
```jsx
const SyncProgressBanner = ({ message, className = "" }) => {
```

And:
```jsx
export default CacheLoadingBanner;
```
To:
```jsx
export default SyncProgressBanner;
```

**Step 3: Update default message text**

Change:
```jsx
{message || "Server is loading cache, please wait..."}
```
To:
```jsx
{message || "Syncing library, please wait..."}
```

Change:
```jsx
This may take a minute on first startup. Checking every 5 seconds...
```
To:
```jsx
This may take a minute on first sync. Checking every 5 seconds...
```

**Step 4: Search for imports and update**

Run: `cd client && grep -r "CacheLoadingBanner" --include="*.jsx" --include="*.tsx" --include="*.js"`

Update each import found:
```jsx
// Old
import CacheLoadingBanner from "../components/ui/CacheLoadingBanner";
// New
import SyncProgressBanner from "../components/ui/SyncProgressBanner";
```

And update JSX usage:
```jsx
// Old
<CacheLoadingBanner />
// New
<SyncProgressBanner />
```

**Step 5: Verify client builds**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: rename CacheLoadingBanner to SyncProgressBanner"
```

---

### Task 19: Update Client Terminology - Cache to Library

**Files:**
- Modify: `client/src/components/settings/ServerStatsSection.jsx`
- Modify: `client/src/pages/*.jsx` (pages that reference "cache")
- Modify: Any other client files with "cache" terminology

**Step 1: Search for "cache" in user-facing strings**

Run: `cd client && grep -rn "cache\|Cache" --include="*.jsx" --include="*.tsx" --include="*.js"`

**Step 2: Update terminology in each file**

Replace user-facing strings:
- "cache" -> "library" (lowercase)
- "Cache" -> "Library" (capitalized)
- "loading cache" -> "syncing library"
- "refresh cache" -> "sync library"
- "cache ready" -> "library ready"

Do NOT replace:
- Variable names (keep internal code naming)
- Technical comments
- API endpoint names

**Step 3: Verify client builds**

Run: `cd client && npm run build`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: update client terminology from cache to library"
```

---

### Task 20: Run Linting and Fix Issues

**Files:**
- All modified server files
- All modified client files

**Step 1: Run server linting**

Run: `cd server && npm run lint`
Expected: No errors (fix any that appear)

**Step 2: Run client linting**

Run: `cd client && npm run lint`
Expected: No errors (fix any that appear)

**Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "style: fix linting issues" --allow-empty
```

---

## Session 4: Testing and Documentation

### Task 21: Delete Local Database and Test Fresh Install

**Files:**
- Delete: `server/prisma/peek.db` (local development database)

**Step 1: Stop the application**

```bash
docker-compose down
```

**Step 2: Delete local database**

```bash
rm -f server/prisma/peek.db server/prisma/peek.db-journal
```

**Step 3: Start fresh**

```bash
docker-compose up --build
```

**Step 4: Verify migrations run**

Check logs for: "Applied migration: 20251211000000_stash_entities"

**Step 5: Verify app starts correctly**

Open http://localhost:5173 and verify the setup wizard appears (fresh install).

---

### Task 22: Run All Tests

**Files:**
- All test files

**Step 1: Run server tests**

Run: `cd server && npm test`
Expected: All non-skipped tests pass

**Step 2: Run client tests**

Run: `cd client && npm test`
Expected: All tests pass

**Step 3: Fix any failing tests**

If tests fail, update them to match new naming/structure.

**Step 4: Commit test fixes**

```bash
git add -A
git commit -m "test: fix tests for refactored schema" --allow-empty
```

---

### Task 23: Update README Documentation

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md` (if needed)

**Step 1: Update any cache references in README**

Search for "cache" in README.md and update user-facing terminology to "library" where appropriate.

**Step 2: Update CLAUDE.md if terminology changed**

Search for outdated terminology and update.

**Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: update terminology in documentation" --allow-empty
```

---

### Task 24: Final Verification and Cleanup

**Files:**
- All project files

**Step 1: Search for any remaining old references**

Run from project root:
```bash
grep -r "CachedScene\|CachedPerformer\|CachedStudio\|CachedTag\|CachedGroup\|CachedGallery\|CachedImage\|CachedEntityQueryService\|cachedEntityQueryService\|pathMapping" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" server/ client/
```

Expected: No results

**Step 2: Verify Docker build works**

Run: `docker-compose build`
Expected: Build succeeds

**Step 3: Full application test**

Run: `docker-compose up -d`
- Verify API endpoints respond
- Verify sync runs
- Verify scene list loads
- Verify performer list loads
- Verify search works

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final cleanup for schema refactor" --allow-empty
```

---

## Summary

**Total Tasks:** 24

**Breaking Changes:**
- Database tables renamed (Cached* -> Stash*)
- `pathMapping.ts` renamed to `stashUrlProxy.ts`
- `CachedEntityQueryService` renamed to `StashEntityService`
- Denormalized count fields removed (computed via JOINs now)
- `tagIds` JSON fields removed (use junction tables)
- `data` JSON blob field removed

**Migration Strategy:**
- All 6 incremental migrations squashed into single `20251211000000_stash_entities` migration
- Users with existing databases will need to either:
  1. Delete database and re-sync (recommended for beta users)
  2. Wait for data migration script (if needed for production)

**Testing:**
- Run all unit tests
- Run fresh install test
- Run full application test with Docker
