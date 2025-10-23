# Watch History Implementation Plan

## Overview
Implement Stash-compatible per-user watch history tracking with optional sync to Stash server.

## Goals
1. Track user activity per-user in Peek database (matching Stash's pattern)
2. Optionally sync user activity to Stash (admin-controlled per-user setting)
3. Show each Peek user ONLY their own activity stats (even if Stash has aggregate)
4. Match Stash's tracking intervals and thresholds exactly

---

## Phase 1: stashapp-api Updates

### 1.1 Add GraphQL Mutation Operations
**File**: `stashapp-api/src/operations/sceneSaveActivity.graphql`
```graphql
mutation SceneSaveActivity($id: ID!, $resume_time: Float, $playDuration: Float) {
  sceneSaveActivity(id: $id, resume_time: $resume_time, playDuration: $playDuration)
}
```

**File**: `stashapp-api/src/operations/sceneAddPlay.graphql`
```graphql
mutation SceneAddPlay($id: ID!, $times: [Timestamp!]) {
  sceneAddPlay(id: $id, times: $times) {
    count
    history
  }
}
```

**File**: `stashapp-api/src/operations/sceneIncrementO.graphql`
```graphql
mutation SceneIncrementO($id: ID!) {
  sceneIncrementO(id: $id)
}
```

**File**: `stashapp-api/src/operations/sceneDecrementO.graphql`
```graphql
mutation SceneDecrementO($id: ID!) {
  sceneDecrementO(id: $id)
}
```

### 1.2 Export Methods from SDK
**File**: `stashapp-api/src/index.ts`
```typescript
// Add to StashApp class:
async sceneSaveActivity(id: string, resumeTime?: number, playDuration?: number) {
  return this.sdk.SceneSaveActivity({ id, resume_time: resumeTime, playDuration });
}

async sceneAddPlay(id: string, times?: string[]) {
  return this.sdk.SceneAddPlay({ id, times });
}

async sceneIncrementO(id: string) {
  return this.sdk.SceneIncrementO({ id });
}

async sceneDecrementO(id: string) {
  return this.sdk.SceneDecrementO({ id });
}
```

### 1.3 Build and Publish
```bash
cd stashapp-api
npm run codegen      # Regenerate types
npm run build        # Build TypeScript
npm run publish:patch # Bump version and publish
```

### 1.4 Update peek-stash-browser
```bash
cd peek-stash-browser/server
npm install stashapp-api@<new-version>
```

---

## Phase 2: Database Schema Updates

### 2.1 Update Prisma Schema
**File**: `server/prisma/schema.prisma`

```prisma
model User {
  // ... existing fields ...

  // Watch history settings
  minimumPlayPercent Int     @default(20)    // Percent of video to watch before incrementing play_count (0-100)
  syncToStash        Boolean @default(false) // Admin-only: Sync this user's activity to Stash
}
```

### 2.2 Create Migration
```bash
cd server
npx prisma migrate dev --name add_watch_history_settings
```

---

## Phase 3: Server Implementation

### 3.1 Update Watch History Ping Endpoint

**File**: `server/controllers/watchHistory.ts`

**Current flow** (30s pings, basic tracking):
- Receive: sceneId, currentTime, quality, sessionStart, seekEvents
- Update: resumeTime, lastPlayedAt
- Return: watchHistory

**New flow** (10s pings, Stash-compatible):
1. Calculate `percentPlayed` = (totalPlayDuration / videoDuration) * 100
2. Calculate `percentCompleted` = (currentTime / videoDuration) * 100
3. Check if `percentPlayed >= user.minimumPlayPercent` → increment play_count ONCE per session
4. If incrementing play_count → append current timestamp to playHistory array
5. If `percentCompleted >= 98` → set resumeTime = 0
6. Update playDuration (add elapsed time since last ping)
7. Update resumeTime (current position)
8. **If user.syncToStash enabled** → Call Stash mutations:
   - `sceneSaveActivity(sceneId, resumeTime, playDuration)`
   - `sceneAddPlay(sceneId, [timestamp])` (if play_count was incremented)

**Key changes**:
```typescript
// In ping endpoint:
const videoDuration = /* get from scene data */;
const sessionDuration = /* calculate from sessionStart */;
const percentPlayed = (sessionDuration / videoDuration) * 100;
const percentCompleted = (currentTime / videoDuration) * 100;

// Increment play count (once per session)
if (!hasIncrementedThisSession && percentPlayed >= user.minimumPlayPercent) {
  watchHistory.playCount += 1;
  const timestamp = new Date().toISOString();
  const playHistory = JSON.parse(watchHistory.playHistory);
  playHistory.push(timestamp);
  watchHistory.playHistory = JSON.stringify(playHistory);
  hasIncrementedThisSession = true; // Track in session state

  // Sync to Stash if enabled
  if (user.syncToStash) {
    await stashApp.sceneAddPlay(sceneId, [timestamp]);
  }
}

// Reset resume time if nearly complete
const resumeTime = percentCompleted >= 98 ? 0 : currentTime;

// Update duration
watchHistory.playDuration += elapsedSeconds;

// Sync to Stash if enabled
if (user.syncToStash) {
  await stashApp.sceneSaveActivity(sceneId, resumeTime, elapsedSeconds);
}
```

### 3.2 Update O Counter Increment

**File**: `server/controllers/watchHistory.ts`

```typescript
// In incrementOCounter endpoint:
if (user.syncToStash) {
  await stashApp.sceneIncrementO(sceneId);
}
```

### 3.3 Track Session State
Need to track `hasIncrementedPlayCount` per session. Options:
- **Option A**: Store in database (new field: `currentSessionId`)
- **Option B**: Track in memory (Map keyed by userId+sceneId)
- **Recommended**: Option B (simpler, session-scoped)

```typescript
// In-memory session tracker
const sessionPlayCountIncrements = new Map<string, boolean>();

function getSessionKey(userId: number, sceneId: string): string {
  return `${userId}:${sceneId}`;
}

// In ping handler:
const sessionKey = getSessionKey(userId, sceneId);
const hasIncremented = sessionPlayCountIncrements.get(sessionKey) || false;

if (!hasIncremented && percentPlayed >= user.minimumPlayPercent) {
  // Increment play count...
  sessionPlayCountIncrements.set(sessionKey, true);
}

// Clear on scene change or session end
```

---

## Phase 4: Scene Data Override (Per-User Stats)

### 4.1 Inject User Watch History into Scene Objects

**Current**: Scenes come from Stash with aggregate watch history (all Peek users combined)
**Goal**: Override scene watch history fields with per-user values from Peek database

**File**: `server/controllers/library.ts` (or wherever scenes are returned)

```typescript
// After fetching scenes from Stash:
async function injectUserWatchHistory(scenes, userId) {
  // Fetch watch history for these scenes for this user
  const sceneIds = scenes.map(s => s.id);
  const watchHistoryRecords = await prisma.watchHistory.findMany({
    where: {
      userId: userId,
      sceneId: { in: sceneIds }
    }
  });

  // Create lookup map
  const watchHistoryMap = new Map();
  for (const wh of watchHistoryRecords) {
    watchHistoryMap.set(wh.sceneId, wh);
  }

  // Override scene fields with per-user values
  return scenes.map(scene => {
    const userWatchHistory = watchHistoryMap.get(scene.id);

    if (userWatchHistory) {
      return {
        ...scene,
        resume_time: userWatchHistory.resumeTime || 0,
        play_duration: userWatchHistory.playDuration || 0,
        play_count: userWatchHistory.playCount || 0,
        play_history: JSON.parse(userWatchHistory.playHistory || '[]'),
        o_counter: userWatchHistory.oCount || 0,
        o_history: JSON.parse(userWatchHistory.oHistory || '[]'),
      };
    }

    // No watch history for this user - return zeros
    return {
      ...scene,
      resume_time: 0,
      play_duration: 0,
      play_count: 0,
      play_history: [],
      o_counter: 0,
      o_history: [],
    };
  });
}

// Apply to all scene-fetching endpoints:
// - GET /scenes
// - GET /scenes/:id
// - GET /performers/:id/scenes
// - etc.
```

**IMPORTANT**: This ensures each Peek user sees ONLY their own stats, regardless of what Stash returns.

---

## Phase 5: Client Updates

### 5.1 Update Ping Interval
**File**: `client/src/hooks/useWatchHistory.js`

Change from 30s to 10s:
```javascript
// Set up 10-second ping interval (match Stash)
pingIntervalRef.current = setInterval(() => {
  sendPing();
}, 10000); // 10 seconds (was 30000)
```

### 5.2 Add minimumPlayPercent Setting
**File**: `client/src/components/pages/Settings.jsx` (or UserSettings)

```jsx
<div>
  <label>Minimum Play Percent</label>
  <p>Percentage of video to watch before counting as "played"</p>
  <input
    type="range"
    min="0"
    max="100"
    value={minimumPlayPercent}
    onChange={(e) => setMinimumPlayPercent(e.target.value)}
  />
  <span>{minimumPlayPercent}%</span>
</div>
```

### 5.3 Add syncToStash Toggle (Admin Only)
**File**: `client/src/components/admin/UserManagement.jsx` (or similar)

```jsx
{currentUser.role === 'ADMIN' && (
  <div>
    <label>
      <input
        type="checkbox"
        checked={user.syncToStash}
        onChange={(e) => updateUserSync(user.id, e.target.checked)}
      />
      Sync activity to Stash
    </label>
    <p>When enabled, this user's watch history will be synced to Stash server</p>
  </div>
)}
```

---

## Phase 6: Testing Checklist

### Multi-User Testing
- [ ] User A watches 50% of video → play_count should NOT increment (if threshold is 60%)
- [ ] User A watches 70% of video → play_count should increment to 1
- [ ] User A watches same video again → play_count should increment to 2
- [ ] User B watches same video → User B should see play_count = 1 (not User A's count)
- [ ] Check Stash directly → If User A has sync enabled, Stash should show aggregate counts

### Stash Sync Testing (syncToStash = true)
- [ ] Watch video with sync enabled → Verify `sceneSaveActivity` called in Stash
- [ ] Increment O counter → Verify `sceneIncrementO` called in Stash
- [ ] Watch 60% of video → Verify `sceneAddPlay` called with timestamp
- [ ] Check Stash database → Verify play_history array contains timestamp

### Stash Sync Testing (syncToStash = false)
- [ ] Watch video without sync → Verify NO calls to Stash
- [ ] Only Peek database should be updated
- [ ] User should still see their own stats in Peek UI

### Resume Time Reset
- [ ] Watch video to 99% completion → resume_time should reset to 0
- [ ] Watch video to 50% completion → resume_time should be ~50% of duration

### Scene Data Override
- [ ] Query scenes via API → Verify returned fields match user's watch history
- [ ] User A and User B should see different values for same scene
- [ ] Values should come from Peek database, not Stash

---

## Configuration Summary

### Environment Variables (No new ones needed)
Existing:
- `STASH_URL` - GraphQL endpoint
- `STASH_API_KEY` - API key

### User Settings (Database)
New fields:
- `minimumPlayPercent` (default: 20) - User-configurable
- `syncToStash` (default: false) - Admin-only setting

### Intervals
- Ping interval: **10 seconds** (match Stash)
- Resume reset threshold: **98%** completion
- Play count threshold: **User-configurable %** (default 20%)

---

## Migration Path

1. ✅ **Phase 1**: Update stashapp-api → Publish → Update dependency
2. ✅ **Phase 2**: Add database fields → Run migration
3. ✅ **Phase 3**: Implement server tracking logic (works without sync first)
4. ✅ **Phase 4**: Add per-user data override in scene endpoints
5. ✅ **Phase 5**: Update client UI (settings, ping interval)
6. ✅ **Phase 6**: Test multi-user scenarios
7. ✅ **Enable Stash Sync**: Admin sets `syncToStash = true` for desired users

---

## Future Enhancements (Post-MVP)

- [ ] Bulk sync existing Peek watch history to Stash
- [ ] Import existing Stash watch history into Peek (per-user)
- [ ] Admin setting: "Default syncToStash for new users"
- [ ] Analytics dashboard showing aggregated user statistics
- [ ] Export user watch history (CSV, JSON)
- [ ] Scheduled sync (instead of real-time)

---

## Key Differences: Peek vs Stash

| Feature | Stash | Peek |
|---------|-------|------|
| Users | Single user | Multi-user |
| Storage | Single database | Per-user in Peek DB |
| Sync | N/A | Optional to Stash |
| Data shown | Aggregate | Per-user only |
| Settings | Global | Per-user |

---

## Notes

- **Session tracking**: Play count increment happens ONCE per viewing session (tracked in-memory)
- **Percentage calculation**: Based on total accumulated play_duration vs video duration
- **Resume time**: Reset to 0 when video is 98%+ complete (Stash's pattern)
- **Sync failures**: Log but don't block - Peek database is source of truth for per-user stats
- **Stash data**: After sync enabled, Stash will have aggregate of all synced users
- **Per-user override**: Always happens - even if user has sync enabled, they see their own stats in Peek UI
