# User Stats Page Design

**Issue:** #194
**Date:** 2026-01-16
**Status:** Draft

## Overview

A dedicated page showing personalized engagement statistics for the logged-in user, accessed via the user context menu in the navigation (alongside Watch History).

**Route:** `/user-stats`

## Goals

- Surface library composition at a glance (counts)
- Highlight personal engagement metrics (watch time, play counts, O counts)
- Show "top" lists for performers, studios, tags, scenes, images
- Track streaks and personal records (future)
- Provide time-based insights (future)
- Include fun/novelty stats that make the data feel personal (future)

## Context

This feature prepares for Issue #290 (homepage options) by creating a stats page that could become one of several homepage landing options. Inspired by Stash's stats page but focused on per-user engagement rather than just library counts.

---

## MVP Scope

### Features Included

1. **Library Overview** - Counts of visible entities (scenes, performers, studios, tags, galleries, images)
2. **Engagement Totals** - Total watch time, play count, O count, images viewed, unique scenes watched
3. **Top 5 Lists** - Top performers, studios, and tags by play count
4. **Highlights** - Most watched scene, most viewed image, most O'd scene, most O'd performer

### Features Excluded from MVP

- Streaks (activity, O count)
- Personal records
- Time-based patterns (day of week, time of day)
- Calendar heatmap
- Time period filtering
- Personality types
- Shareable cards

---

## Data Architecture

### Exclusion Handling

All stats must respect content restrictions and hidden items using the established pattern:

```sql
-- Filter excluded content via LEFT JOIN
LEFT JOIN UserExcludedEntity e
  ON e.userId = ?
  AND e.entityType = 'scene'
  AND e.entityId = w.sceneId
WHERE e.id IS NULL  -- Only include non-excluded
```

### Data Sources

| Stat | Source | Exclusion Handling |
|------|--------|-------------------|
| Library counts | `UserEntityStats.visibleCount` | Already exclusion-aware |
| Watch time | `WatchHistory.playDuration` | JOIN with scene exclusions |
| Play count | `WatchHistory.playCount` | JOIN with scene exclusions |
| Scene O count | `WatchHistory.oCount` | JOIN with scene exclusions |
| Image O count | `ImageViewHistory.oCount` | JOIN with image exclusions |
| Image views | `ImageViewHistory.viewCount` | JOIN with image exclusions |
| Top performers | `UserPerformerStats` | JOIN with performer exclusions |
| Top studios | `UserStudioStats` | JOIN with studio exclusions |
| Top tags | `UserTagStats` | JOIN with tag exclusions |
| Most watched scene | `WatchHistory` | JOIN with scene exclusions |
| Most viewed image | `ImageViewHistory` | JOIN with image exclusions |

### New API Endpoint

```
GET /api/user-stats
```

Single endpoint returning all aggregated stats for the authenticated user.

### Response Schema

```typescript
interface UserStatsResponse {
  library: {
    sceneCount: number
    performerCount: number
    studioCount: number
    tagCount: number
    galleryCount: number
    imageCount: number
  }
  engagement: {
    totalWatchTime: number        // seconds
    totalPlayCount: number
    totalOCount: number           // scenes + images combined
    totalImagesViewed: number
    uniqueScenesWatched: number
  }
  topPerformers: Array<{
    id: string
    name: string
    imageUrl: string | null
    playCount: number
    oCount: number
  }>  // top 5
  topStudios: Array<{
    id: string
    name: string
    imageUrl: string | null
    playCount: number
    oCount: number
  }>  // top 5
  topTags: Array<{
    id: string
    name: string
    playCount: number
    oCount: number
  }>  // top 5
  mostWatchedScene: {
    id: string
    title: string
    imageUrl: string | null
    playCount: number
  } | null
  mostViewedImage: {
    id: string
    title: string | null
    imageUrl: string | null
    viewCount: number
  } | null
  mostOdScene: {
    id: string
    title: string
    imageUrl: string | null
    oCount: number
  } | null
  mostOdPerformer: {
    id: string
    name: string
    imageUrl: string | null
    oCount: number
  } | null
}
```

### New Service

**`UserStatsAggregationService`** - Dedicated service for computing aggregated stats with proper exclusion handling. Uses raw SQL queries (like QueryBuilders) for performance.

---

## UI Design

### Page Structure

```
UserStatsPage
├── PageLayout
│   ├── Header: "My Stats"
│   └── Content
│       ├── LibraryOverview (compact row of counts)
│       ├── EngagementTotals (prominent metrics)
│       ├── TopLists (grid of top 5 lists)
│       │   ├── TopPerformers
│       │   ├── TopStudios
│       │   └── TopTags
│       └── Highlights (most watched/viewed/O'd)
│           ├── MostWatchedScene
│           ├── MostViewedImage
│           ├── MostOdScene
│           └── MostOdPerformer
```

### Component Descriptions

**LibraryOverview**
- Compact horizontal row of 6 stat boxes
- Shows: Scenes, Performers, Studios, Tags, Galleries, Images
- Count + label per box
- Uses existing `Paper` component styling

**EngagementTotals**
- Hero section with larger numbers
- Total Watch Time (formatted: "2d 14h 32m" or "47h 12m")
- Total Play Count
- Total O Count
- Unique Scenes Watched (with % of library)
- Images Viewed

**TopLists**
- Grid of 3 ranked lists (performers, studios, tags)
- Each shows rank 1-5 with:
  - Small thumbnail
  - Name (clickable link to entity page)
  - Play count and O count as secondary info
- Responsive: 3 columns desktop, stacks mobile

**Highlights**
- 2x2 grid of feature cards
- Each card shows:
  - Larger thumbnail
  - Title/name
  - The highlighted stat
- Clickable to navigate to entity

### States

**Loading:** Skeleton loaders matching layout structure

**Empty:** Friendly message if no watch history ("Start watching to see your stats!")

**Partial:** Individual sections hide if no data (e.g., no images viewed = hide image-related stats)

### File Structure

```
client/src/pages/
  UserStats/
    UserStats.jsx
    components/
      LibraryOverview.jsx
      EngagementTotals.jsx
      TopList.jsx
      HighlightCard.jsx
    hooks/
      useUserStats.js
```

---

## Navigation Integration

Add "My Stats" to the user context menu in the navigation, positioned after "Watch History":

```
User Menu
├── Watch History
├── My Stats        ← new
├── Hidden Items
├── Settings
└── Logout
```

---

## Future Enhancements

### Streaks & Records

| Stat | Description | Data Source |
|------|-------------|-------------|
| Current activity streak | Consecutive days with play activity | `playHistory` timestamps |
| Longest activity streak | All-time record | `playHistory` timestamps |
| Current O streak | Consecutive days with O activity | `oHistory` timestamps |
| Longest O streak | All-time record | `oHistory` timestamps |
| Day with most Os | Single day highest O count | Aggregate by date |
| Day with most watch time | Single day highest duration | Aggregate by date |
| Longest single session | Longest continuous viewing | Session detection |
| Most scenes in one day | Single day record | Count by date |

**Notes:**
- Streak calculation requires iterating sorted timestamps
- Consider pre-computing and caching streaks
- Session detection: gap > 2 minutes = new session

### Time-Based Insights

| Stat | Visualization |
|------|---------------|
| Day of week patterns | Bar chart (Mon-Sun) |
| Time of day patterns | Pie/bar chart (Morning/Afternoon/Evening/Night) |
| Monthly trends | Line or bar chart |
| Busiest week | Text callout |
| First watched this year | Feature card |
| Calendar heatmap | GitHub-style activity grid |

**Notes:**
- Parse timestamps from `playHistory` and `oHistory`
- Calendar heatmap: 52×7 grid, color intensity by activity

### Advanced Top Lists

| Stat | Description |
|------|-------------|
| Top by watch time | Ranked by total seconds |
| Top by O count | Ranked by total Os |
| Most loyal performer | Most consistent returns over time |
| Recent discoveries | First watched in last 30 days |
| Rising favorites | Increasing activity trend |

### Comparative Stats

| Stat | Description |
|------|-------------|
| Library coverage | % of scenes watched |
| Performer coverage | % of performers with watched scenes |
| Average rating given | Mean of all ratings |
| Rating distribution | Histogram (0-100) |
| Favorites count | Total favorites by type |

### Fun/Novelty Stats

| Stat | Description |
|------|-------------|
| Viewer personality type | Behavior-based type assignment |
| Surprising insights | Unexpected correlations |
| Rarest tag watched | Least common tag in watched content |
| Average scene length preference | Short vs long preference |
| Completion rate | % of scenes watched to completion |

**Personality Types:**
- "Night Owl" - mostly late night activity
- "Weekend Warrior" - weekend activity spikes
- "Completionist" - high completion rate
- "Explorer" - many different performers/tags
- "Loyalist" - returns to same favorites
- "Binger" - long sessions, many scenes per day

### Time Period Filtering

Dropdown options:
- All time (default)
- This year
- This month
- Last 30 days
- Last 7 days
- Custom date range

**Notes:**
- Filter timestamps in history arrays
- Consider caching common periods

### Shareable Cards

- Generate image cards summarizing stats
- "Wrapped" style year-end presentation
- Download as image for sharing

### UI Enhancements

| Enhancement | Description |
|-------------|-------------|
| Animated counters | Numbers count up on load |
| Charts library | recharts or similar |
| Theme-aware charts | Match dark/light theme |
| Print/export | PDF or image export |
| Comparison mode | Compare two time periods |

---

## Technical Considerations

### Performance

- Single API call for all stats (reduce round trips)
- Use `UserEntityStats` for pre-computed library counts
- Use `UserPerformerStats`, `UserStudioStats`, `UserTagStats` for top lists
- Raw SQL with proper indexes for aggregations
- Consider caching response (invalidate on activity)

### Database Indexes

Existing indexes should be sufficient:
- `WatchHistory`: `userId`, `sceneId`, `lastPlayedAt`
- `ImageViewHistory`: `userId`, `imageId`, `lastViewedAt`
- `UserExcludedEntity`: `[userId, entityType]`
- `User*Stats`: `userId`

### Security

- Endpoint requires authentication
- Stats only returned for requesting user
- No cross-user data exposure

---

## Implementation Checklist

### Backend

- [ ] Create `UserStatsAggregationService`
- [ ] Implement exclusion-aware aggregation queries
- [ ] Add `GET /api/user-stats` endpoint
- [ ] Add route to Express router
- [ ] Write integration tests

### Frontend

- [ ] Create `UserStats` page component
- [ ] Create `LibraryOverview` component
- [ ] Create `EngagementTotals` component
- [ ] Create `TopList` component
- [ ] Create `HighlightCard` component
- [ ] Create `useUserStats` hook
- [ ] Add route to React Router
- [ ] Add "My Stats" to user context menu
- [ ] Implement loading skeletons
- [ ] Implement empty state
- [ ] Write component tests

### Polish

- [ ] Responsive layout testing
- [ ] TV mode navigation support
- [ ] Time formatting utilities (duration display)
- [ ] Link all clickable entities to their pages
