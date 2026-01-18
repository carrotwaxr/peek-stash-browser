# Scene Merge Reconciliation Design

## Problem Statement

When scenes are merged in Stash, the source scene is completely deleted (no audit trail). Peek's sync detects this as a deletion and soft-deletes the scene, but user activity data (WatchHistory, SceneRating) becomes orphaned - it's not transferred to the surviving scene.

**Use cases:**
- User downloads higher resolution version of a scene they already had
- User discovers duplicates after syncing to Peek
- User merges alternate versions (director's cut, different endings)

**Current behavior:** Orphaned user data is preserved indefinitely (no cleanup), but not reconciled with the surviving scene. Users lose their play history, ratings, O counts, and favorites when viewing the merged scene.

## Solution Overview

Two-pronged approach:

1. **Sync-time merge detection (automatic):** When a scene is about to be soft-deleted during sync, check if its PHASH matches another scene. If so, automatically transfer user data.

2. **Admin recovery tool (manual):** A new Settings subtab where admins can view orphaned scenes with user data and manually reconcile them to surviving scenes.

## Technical Background

### PHASH (Perceptual Hash)

Stash generates perceptual hashes for video files that:
- Match the same video at different resolutions (720p vs 1080p)
- Match across different codecs/bitrates
- Match re-encoded files
- Survive merges (all file fingerprints are preserved on destination scene)

PHASH is stored per-file in Stash's `files_fingerprints` table and exposed via GraphQL.

### Current Peek State

- Peek does NOT currently sync or store fingerprints
- Orphaned WatchHistory and SceneRating records are preserved (no FK constraints)
- Admin infrastructure exists (`requireAdmin` middleware)

## Data Model Changes

### StashScene Table Additions

```prisma
model StashScene {
  // ... existing fields ...

  phash         String?    // Primary perceptual hash (from first file)
  phashes       Json?      // Array of all phashes if scene has multiple files: ["hash1", "hash2"]
}
```

### New MergeRecord Table

```prisma
model MergeRecord {
  id              String   @id @default(uuid())
  sourceSceneId   String   // The scene that was merged away (soft-deleted)
  targetSceneId   String   // The scene it was merged into (survivor)
  matchedByPhash  String?  // The phash that linked them (null if manual reconciliation)

  // User data that was transferred
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Transfer details
  playCountTransferred    Int @default(0)
  playDurationTransferred Float @default(0)
  oCountTransferred       Int @default(0)
  ratingTransferred       Int?
  favoriteTransferred     Boolean @default(false)

  // Audit
  reconciledAt    DateTime @default(now())
  reconciledBy    String?  // Admin user ID (null if automatic)
  automatic       Boolean  @default(true)  // true = sync-time, false = manual

  createdAt       DateTime @default(now())

  @@index([sourceSceneId])
  @@index([targetSceneId])
  @@index([userId])
}
```

### GraphQL Query Update

Update `findScenesCompact.graphql` to request fingerprints:

```graphql
fragment SceneCompactData on Scene {
  # ... existing fields ...
  files {
    # ... existing fields ...
    fingerprints {
      type
      value
    }
  }
}
```

## Sync-Time Merge Detection

### Trigger Point

During `cleanupDeletedEntities("scene")` in `StashSyncService.ts`, when a scene is about to be soft-deleted.

### Detection Flow

```
1. Scene ID "abc123" is missing from Stash → about to be soft-deleted
2. Before soft-deleting, look up the scene's phash(es) from local DB
3. If no phash stored, skip detection (treat as normal deletion)
4. Search for any OTHER non-deleted scene that has a matching phash
5. If match found:
   a. This is a merge - the matching scene is the "survivor"
   b. For each user with activity on the deleted scene:
      - Transfer user data to survivor (see transfer rules below)
      - Create MergeRecord for audit trail
   c. Soft-delete the source scene
6. If no match found:
   a. This is a true deletion, not a merge
   b. Soft-delete as normal (user data preserved but orphaned)
```

### PHASH Matching Logic

```typescript
// Exact match first (most common case for merges)
const exactMatch = await prisma.stashScene.findFirst({
  where: {
    id: { not: sourceSceneId },
    deletedAt: null,
    OR: [
      { phash: sourcePhash },
      { phashes: { contains: sourcePhash } }
    ]
  }
});

// If no exact match, could optionally do Hamming distance matching
// for near-duplicates (future enhancement)
```

## User Data Transfer Rules

### WatchHistory Fields

| Field | Transfer Logic |
|-------|----------------|
| `playCount` | Sum both values |
| `playDuration` | Sum both values |
| `oCount` | Sum both values |
| `oHistory` | Merge JSON arrays, sort by timestamp, deduplicate |
| `playHistory` | Merge JSON arrays, sort by startTime |
| `resumeTime` | Survivor wins (keep existing) |
| `lastPlayedAt` | Keep the more recent timestamp |

### SceneRating Fields

| Field | Transfer Logic |
|-------|----------------|
| `rating` | Survivor wins (keep existing if set) |
| `favorite` | OR logic (if either was favorite, result is favorite) |

### Transfer Implementation

```typescript
async function transferUserData(
  sourceSceneId: string,
  targetSceneId: string,
  userId: string,
  reconciledBy?: string  // null for automatic
): Promise<MergeRecord> {

  const sourceHistory = await prisma.watchHistory.findUnique({
    where: { userId_sceneId: { userId, sceneId: sourceSceneId } }
  });

  const sourceRating = await prisma.sceneRating.findUnique({
    where: { userId_sceneId: { userId, sceneId: sourceSceneId } }
  });

  if (!sourceHistory && !sourceRating) {
    return null; // Nothing to transfer
  }

  // Upsert target WatchHistory
  if (sourceHistory) {
    await prisma.watchHistory.upsert({
      where: { userId_sceneId: { userId, sceneId: targetSceneId } },
      create: {
        userId,
        sceneId: targetSceneId,
        ...sourceHistory  // Copy all fields
      },
      update: {
        playCount: { increment: sourceHistory.playCount },
        playDuration: { increment: sourceHistory.playDuration },
        oCount: { increment: sourceHistory.oCount },
        oHistory: mergeJsonArrays(existing.oHistory, sourceHistory.oHistory),
        playHistory: mergeJsonArrays(existing.playHistory, sourceHistory.playHistory),
        lastPlayedAt: laterDate(existing.lastPlayedAt, sourceHistory.lastPlayedAt)
        // resumeTime: keep existing (survivor wins)
      }
    });
  }

  // Upsert target SceneRating
  if (sourceRating) {
    await prisma.sceneRating.upsert({
      where: { userId_sceneId: { userId, sceneId: targetSceneId } },
      create: {
        userId,
        sceneId: targetSceneId,
        rating: sourceRating.rating,
        favorite: sourceRating.favorite
      },
      update: {
        // Survivor wins for rating (only update if target has no rating)
        rating: existing.rating ?? sourceRating.rating,
        // OR logic for favorite
        favorite: existing.favorite || sourceRating.favorite
      }
    });
  }

  // Create audit record
  return prisma.mergeRecord.create({
    data: {
      sourceSceneId,
      targetSceneId,
      matchedByPhash: phash,
      userId,
      playCountTransferred: sourceHistory?.playCount ?? 0,
      playDurationTransferred: sourceHistory?.playDuration ?? 0,
      oCountTransferred: sourceHistory?.oCount ?? 0,
      ratingTransferred: sourceRating?.rating,
      favoriteTransferred: sourceRating?.favorite ?? false,
      reconciledBy,
      automatic: !reconciledBy
    }
  });
}
```

## Admin Recovery Tool

### Location

New subtab under Server Settings: "Merge Recovery" or "Orphaned Scenes"

### API Endpoints

```
GET  /api/admin/orphaned-scenes
     Returns scenes with deletedAt set that have WatchHistory or SceneRating records
     Response: { scenes: [...], totalCount: number }

GET  /api/admin/orphaned-scenes/:id/matches
     Returns potential phash matches for an orphaned scene
     Response: { matches: [{ scene, similarity, recommended }] }

POST /api/admin/orphaned-scenes/:id/reconcile
     Body: { targetSceneId: string }
     Transfers all user data from orphan to target, creates MergeRecords

POST /api/admin/orphaned-scenes/:id/discard
     Deletes orphaned WatchHistory and SceneRating records for the scene

POST /api/admin/reconcile-all
     Auto-reconciles all orphans with high-confidence (exact) phash matches
     Response: { reconciled: number, skipped: number }
```

### UI Design

```
Server Settings > Merge Recovery
────────────────────────────────────────────────────────────

[Auto-Reconcile All] (processes exact phash matches only)

Found 12 orphaned scenes with user activity

┌─────────────────────────────────────────────────────────────┐
│ "Beach Scene 4K" (deleted 2025-01-10)                       │
│ phash: a1b2c3d4e5f6                                         │
│                                                             │
│ User activity across all users:                             │
│   • 3 users with watch history (total 12 plays)             │
│   • 2 users with ratings                                    │
│   • 1 user favorited                                        │
│                                                             │
│ Potential matches:                                          │
│   ◉ "Beach Scene 1080p" (exact phash match) [Recommended]   │
│   ○ "Beach Scene Director Cut" (similar - 4 bit distance)   │
│   ○ Enter scene ID manually: [___________]                  │
│                                                             │
│ [Transfer Activity] [Discard Activity] [Skip]               │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ "Old Movie Clip" (deleted 2024-12-05)                       │
│ phash: (none - fingerprinting not run)                      │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Order

1. **Schema + Migration**
   - Add `phash`, `phashes` to StashScene
   - Create MergeRecord table
   - Run migration

2. **Sync Changes**
   - Update `findScenesCompact.graphql` to request fingerprints
   - Update `StashSyncService.ts` to extract and store phashes during scene sync

3. **MergeReconciliationService** (new file)
   - `findOrphanedScenesWithActivity()` - query orphans
   - `findPhashMatches(sceneId)` - find potential targets
   - `transferUserData(source, target, userId)` - core transfer logic
   - `reconcileScene(sourceId, targetId)` - transfer for all users
   - `discardOrphanedData(sceneId)` - delete orphaned records

4. **Sync-Time Detection**
   - Modify `cleanupDeletedEntities` to call reconciliation before soft-delete
   - Only for scenes with phashes

5. **Admin API Routes** (new file)
   - Wire up endpoints to MergeReconciliationService
   - Add `requireAdmin` middleware

6. **Admin UI**
   - New component under Settings
   - List orphans, show matches, reconcile/discard actions

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Scene has no phash | Skip auto-detection, show in admin tool with "no phash" note |
| Multiple phash matches | Pick scene with most recent `stashUpdatedAt` for auto-reconcile; show all options in admin tool |
| Phash matches deleted scene | Skip (both are deleted) |
| User data exists on both scenes | Merge using rules above (sum counts, survivor wins conflicts, OR for favorite) |
| Scene deleted before phash sync | Cannot auto-match; admin tool allows manual ID entry |
| Same scene merged multiple times | Each merge creates separate MergeRecord; data accumulates on survivor |

## Future Enhancements

- **Hamming distance matching**: For near-duplicates that aren't exact phash matches
- **Performer/Tag merge reconciliation**: Similar pattern for other mergeable entities
- **Undo reconciliation**: Use MergeRecord to reverse a transfer if needed
- **Bulk operations in admin UI**: Select multiple orphans, batch reconcile/discard
