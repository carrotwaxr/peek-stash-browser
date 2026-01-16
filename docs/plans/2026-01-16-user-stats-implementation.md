# User Stats Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a `/user-stats` page showing personalized engagement statistics (library counts, watch time, top performers/studios/tags, highlights) for the logged-in user.

**Architecture:** Backend aggregation service computes exclusion-aware stats via Prisma queries, exposed through a single REST endpoint. React frontend fetches and displays in a card-based layout with loading/empty states.

**Tech Stack:** Express/TypeScript backend, Prisma ORM, React frontend, Tailwind CSS, existing Paper/Button components.

---

## Task 1: Create API Types

**Files:**
- Create: `server/types/api/userStats.ts`
- Modify: `server/types/api/index.ts`

**Step 1: Create the types file**

```typescript
// server/types/api/userStats.ts

export interface LibraryStats {
  sceneCount: number;
  performerCount: number;
  studioCount: number;
  tagCount: number;
  galleryCount: number;
  imageCount: number;
}

export interface EngagementStats {
  totalWatchTime: number; // seconds
  totalPlayCount: number;
  totalOCount: number; // scenes + images
  totalImagesViewed: number;
  uniqueScenesWatched: number;
}

export interface TopPerformer {
  id: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  oCount: number;
}

export interface TopStudio {
  id: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
  oCount: number;
}

export interface TopTag {
  id: string;
  name: string;
  playCount: number;
  oCount: number;
}

export interface HighlightScene {
  id: string;
  title: string;
  imageUrl: string | null;
  playCount?: number;
  oCount?: number;
}

export interface HighlightImage {
  id: string;
  title: string | null;
  imageUrl: string | null;
  viewCount: number;
}

export interface HighlightPerformer {
  id: string;
  name: string;
  imageUrl: string | null;
  oCount: number;
}

export interface UserStatsResponse {
  library: LibraryStats;
  engagement: EngagementStats;
  topPerformers: TopPerformer[];
  topStudios: TopStudio[];
  topTags: TopTag[];
  mostWatchedScene: HighlightScene | null;
  mostViewedImage: HighlightImage | null;
  mostOdScene: HighlightScene | null;
  mostOdPerformer: HighlightPerformer | null;
}
```

**Step 2: Export from index**

Add to `server/types/api/index.ts`:

```typescript
export * from "./userStats.js";
```

**Step 3: Commit**

```bash
git add server/types/api/userStats.ts server/types/api/index.ts
git commit -m "$(cat <<'EOF'
feat(api): add user stats API types

Define TypeScript interfaces for the user stats endpoint response
including library counts, engagement totals, top lists, and highlights.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create UserStatsAggregationService

**Files:**
- Create: `server/services/UserStatsAggregationService.ts`

**Step 1: Create the service**

```typescript
// server/services/UserStatsAggregationService.ts

import prisma from "../prisma/singleton.js";
import { logger } from "../utils/logger.js";
import type {
  UserStatsResponse,
  LibraryStats,
  EngagementStats,
  TopPerformer,
  TopStudio,
  TopTag,
  HighlightScene,
  HighlightImage,
  HighlightPerformer,
} from "../types/api/index.js";

class UserStatsAggregationService {
  /**
   * Get all user stats in a single call
   * All queries respect content exclusions via UserExcludedEntity
   */
  async getUserStats(userId: number): Promise<UserStatsResponse> {
    const [
      library,
      engagement,
      topPerformers,
      topStudios,
      topTags,
      mostWatchedScene,
      mostViewedImage,
      mostOdScene,
      mostOdPerformer,
    ] = await Promise.all([
      this.getLibraryStats(userId),
      this.getEngagementStats(userId),
      this.getTopPerformers(userId, 5),
      this.getTopStudios(userId, 5),
      this.getTopTags(userId, 5),
      this.getMostWatchedScene(userId),
      this.getMostViewedImage(userId),
      this.getMostOdScene(userId),
      this.getMostOdPerformer(userId),
    ]);

    return {
      library,
      engagement,
      topPerformers,
      topStudios,
      topTags,
      mostWatchedScene,
      mostViewedImage,
      mostOdScene,
      mostOdPerformer,
    };
  }

  /**
   * Get library counts from pre-computed UserEntityStats
   */
  private async getLibraryStats(userId: number): Promise<LibraryStats> {
    const stats = await prisma.userEntityStats.findMany({
      where: { userId },
      select: { entityType: true, visibleCount: true },
    });

    const statsMap = new Map(stats.map((s) => [s.entityType, s.visibleCount]));

    return {
      sceneCount: statsMap.get("scene") ?? 0,
      performerCount: statsMap.get("performer") ?? 0,
      studioCount: statsMap.get("studio") ?? 0,
      tagCount: statsMap.get("tag") ?? 0,
      galleryCount: statsMap.get("gallery") ?? 0,
      imageCount: statsMap.get("image") ?? 0,
    };
  }

  /**
   * Get engagement totals with exclusion filtering
   */
  private async getEngagementStats(userId: number): Promise<EngagementStats> {
    // Scene engagement (filtered by exclusions)
    const sceneStats = await prisma.$queryRaw<
      Array<{
        totalWatchTime: number | null;
        totalPlayCount: number | null;
        totalOCount: number | null;
        uniqueScenesWatched: number | null;
      }>
    >`
      SELECT
        COALESCE(SUM(w.playDuration), 0) as totalWatchTime,
        COALESCE(SUM(w.playCount), 0) as totalPlayCount,
        COALESCE(SUM(w.oCount), 0) as totalOCount,
        COUNT(DISTINCT w.sceneId) as uniqueScenesWatched
      FROM WatchHistory w
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'scene'
        AND e.entityId = w.sceneId
      WHERE w.userId = ${userId}
        AND e.id IS NULL
    `;

    // Image engagement (filtered by exclusions)
    const imageStats = await prisma.$queryRaw<
      Array<{
        totalImagesViewed: number | null;
        imageOCount: number | null;
      }>
    >`
      SELECT
        COUNT(DISTINCT iv.imageId) as totalImagesViewed,
        COALESCE(SUM(iv.oCount), 0) as imageOCount
      FROM ImageViewHistory iv
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'image'
        AND e.entityId = iv.imageId
      WHERE iv.userId = ${userId}
        AND e.id IS NULL
    `;

    const scene = sceneStats[0] || {};
    const image = imageStats[0] || {};

    return {
      totalWatchTime: Number(scene.totalWatchTime) || 0,
      totalPlayCount: Number(scene.totalPlayCount) || 0,
      totalOCount:
        (Number(scene.totalOCount) || 0) + (Number(image.imageOCount) || 0),
      totalImagesViewed: Number(image.totalImagesViewed) || 0,
      uniqueScenesWatched: Number(scene.uniqueScenesWatched) || 0,
    };
  }

  /**
   * Get top performers by play count (exclusion-aware)
   */
  private async getTopPerformers(
    userId: number,
    limit: number
  ): Promise<TopPerformer[]> {
    const stats = await prisma.$queryRaw<
      Array<{
        performerId: string;
        playCount: number;
        oCounter: number;
      }>
    >`
      SELECT
        ups.performerId,
        ups.playCount,
        ups.oCounter
      FROM UserPerformerStats ups
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'performer'
        AND e.entityId = ups.performerId
      WHERE ups.userId = ${userId}
        AND e.id IS NULL
        AND ups.playCount > 0
      ORDER BY ups.playCount DESC
      LIMIT ${limit}
    `;

    if (stats.length === 0) return [];

    // Fetch performer details
    const performers = await prisma.stashPerformer.findMany({
      where: { id: { in: stats.map((s) => s.performerId) } },
      select: { id: true, name: true, imagePath: true },
    });

    const performerMap = new Map(performers.map((p) => [p.id, p]));

    return stats.map((s) => {
      const performer = performerMap.get(s.performerId);
      return {
        id: s.performerId,
        name: performer?.name ?? "Unknown",
        imageUrl: performer?.imagePath ?? null,
        playCount: s.playCount,
        oCount: s.oCounter,
      };
    });
  }

  /**
   * Get top studios by play count (exclusion-aware)
   */
  private async getTopStudios(
    userId: number,
    limit: number
  ): Promise<TopStudio[]> {
    const stats = await prisma.$queryRaw<
      Array<{
        studioId: string;
        playCount: number;
        oCounter: number;
      }>
    >`
      SELECT
        uss.studioId,
        uss.playCount,
        uss.oCounter
      FROM UserStudioStats uss
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'studio'
        AND e.entityId = uss.studioId
      WHERE uss.userId = ${userId}
        AND e.id IS NULL
        AND uss.playCount > 0
      ORDER BY uss.playCount DESC
      LIMIT ${limit}
    `;

    if (stats.length === 0) return [];

    // Fetch studio details
    const studios = await prisma.stashStudio.findMany({
      where: { id: { in: stats.map((s) => s.studioId) } },
      select: { id: true, name: true, imagePath: true },
    });

    const studioMap = new Map(studios.map((s) => [s.id, s]));

    return stats.map((s) => {
      const studio = studioMap.get(s.studioId);
      return {
        id: s.studioId,
        name: studio?.name ?? "Unknown",
        imageUrl: studio?.imagePath ?? null,
        playCount: s.playCount,
        oCount: s.oCounter,
      };
    });
  }

  /**
   * Get top tags by play count (exclusion-aware)
   */
  private async getTopTags(userId: number, limit: number): Promise<TopTag[]> {
    const stats = await prisma.$queryRaw<
      Array<{
        tagId: string;
        playCount: number;
        oCounter: number;
      }>
    >`
      SELECT
        uts.tagId,
        uts.playCount,
        uts.oCounter
      FROM UserTagStats uts
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'tag'
        AND e.entityId = uts.tagId
      WHERE uts.userId = ${userId}
        AND e.id IS NULL
        AND uts.playCount > 0
      ORDER BY uts.playCount DESC
      LIMIT ${limit}
    `;

    if (stats.length === 0) return [];

    // Fetch tag details
    const tags = await prisma.stashTag.findMany({
      where: { id: { in: stats.map((s) => s.tagId) } },
      select: { id: true, name: true },
    });

    const tagMap = new Map(tags.map((t) => [t.id, t]));

    return stats.map((s) => {
      const tag = tagMap.get(s.tagId);
      return {
        id: s.tagId,
        name: tag?.name ?? "Unknown",
        playCount: s.playCount,
        oCount: s.oCounter,
      };
    });
  }

  /**
   * Get most watched scene (by play count, exclusion-aware)
   */
  private async getMostWatchedScene(
    userId: number
  ): Promise<HighlightScene | null> {
    const result = await prisma.$queryRaw<
      Array<{
        sceneId: string;
        playCount: number;
      }>
    >`
      SELECT
        w.sceneId,
        w.playCount
      FROM WatchHistory w
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'scene'
        AND e.entityId = w.sceneId
      WHERE w.userId = ${userId}
        AND e.id IS NULL
        AND w.playCount > 0
      ORDER BY w.playCount DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const scene = await prisma.stashScene.findUnique({
      where: { id: result[0].sceneId },
      select: { id: true, title: true, screenshotPath: true },
    });

    if (!scene) return null;

    return {
      id: scene.id,
      title: scene.title ?? "Untitled",
      imageUrl: scene.screenshotPath ?? null,
      playCount: result[0].playCount,
    };
  }

  /**
   * Get most viewed image (by view count, exclusion-aware)
   */
  private async getMostViewedImage(
    userId: number
  ): Promise<HighlightImage | null> {
    const result = await prisma.$queryRaw<
      Array<{
        imageId: string;
        viewCount: number;
      }>
    >`
      SELECT
        iv.imageId,
        iv.viewCount
      FROM ImageViewHistory iv
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'image'
        AND e.entityId = iv.imageId
      WHERE iv.userId = ${userId}
        AND e.id IS NULL
        AND iv.viewCount > 0
      ORDER BY iv.viewCount DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const image = await prisma.stashImage.findUnique({
      where: { id: result[0].imageId },
      select: { id: true, title: true, thumbnailPath: true },
    });

    if (!image) return null;

    return {
      id: image.id,
      title: image.title ?? null,
      imageUrl: image.thumbnailPath ?? null,
      viewCount: result[0].viewCount,
    };
  }

  /**
   * Get scene with most Os (exclusion-aware)
   */
  private async getMostOdScene(userId: number): Promise<HighlightScene | null> {
    const result = await prisma.$queryRaw<
      Array<{
        sceneId: string;
        oCount: number;
      }>
    >`
      SELECT
        w.sceneId,
        w.oCount
      FROM WatchHistory w
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'scene'
        AND e.entityId = w.sceneId
      WHERE w.userId = ${userId}
        AND e.id IS NULL
        AND w.oCount > 0
      ORDER BY w.oCount DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const scene = await prisma.stashScene.findUnique({
      where: { id: result[0].sceneId },
      select: { id: true, title: true, screenshotPath: true },
    });

    if (!scene) return null;

    return {
      id: scene.id,
      title: scene.title ?? "Untitled",
      imageUrl: scene.screenshotPath ?? null,
      oCount: result[0].oCount,
    };
  }

  /**
   * Get performer with most Os (exclusion-aware)
   */
  private async getMostOdPerformer(
    userId: number
  ): Promise<HighlightPerformer | null> {
    const result = await prisma.$queryRaw<
      Array<{
        performerId: string;
        oCounter: number;
      }>
    >`
      SELECT
        ups.performerId,
        ups.oCounter
      FROM UserPerformerStats ups
      LEFT JOIN UserExcludedEntity e
        ON e.userId = ${userId}
        AND e.entityType = 'performer'
        AND e.entityId = ups.performerId
      WHERE ups.userId = ${userId}
        AND e.id IS NULL
        AND ups.oCounter > 0
      ORDER BY ups.oCounter DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const performer = await prisma.stashPerformer.findUnique({
      where: { id: result[0].performerId },
      select: { id: true, name: true, imagePath: true },
    });

    if (!performer) return null;

    return {
      id: performer.id,
      name: performer.name ?? "Unknown",
      imageUrl: performer.imagePath ?? null,
      oCount: result[0].oCounter,
    };
  }
}

export const userStatsAggregationService = new UserStatsAggregationService();
export default userStatsAggregationService;
```

**Step 2: Commit**

```bash
git add server/services/UserStatsAggregationService.ts
git commit -m "$(cat <<'EOF'
feat(service): add UserStatsAggregationService

Implements exclusion-aware stats aggregation:
- Library counts from UserEntityStats
- Engagement totals from WatchHistory/ImageViewHistory
- Top performers/studios/tags from pre-computed stats
- Highlight cards for most watched/viewed/O'd content

All queries filter out excluded content via UserExcludedEntity JOIN.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create Controller and Route

**Files:**
- Create: `server/controllers/userStats.ts`
- Create: `server/routes/userStats.ts`
- Modify: `server/initializers/api.ts`

**Step 1: Create the controller**

```typescript
// server/controllers/userStats.ts

import type {
  TypedAuthRequest,
  TypedResponse,
  ApiErrorResponse,
  UserStatsResponse,
} from "../types/api/index.js";
import { userStatsAggregationService } from "../services/UserStatsAggregationService.js";
import { logger } from "../utils/logger.js";

/**
 * Get aggregated user stats
 */
export async function getUserStats(
  req: TypedAuthRequest,
  res: TypedResponse<UserStatsResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const stats = await userStatsAggregationService.getUserStats(userId);

    res.json(stats);
  } catch (error) {
    logger.error("Error fetching user stats", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    res.status(500).json({ error: "Failed to fetch user stats" });
  }
}
```

**Step 2: Create the route**

```typescript
// server/routes/userStats.ts

import express from "express";
import { getUserStats } from "../controllers/userStats.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All user stats routes require authentication
router.use(authenticate);

// Get user stats
router.get("/", authenticated(getUserStats));

export default router;
```

**Step 3: Register route in api.ts**

Add import at top of `server/initializers/api.ts` (around line 33):

```typescript
import userStatsRoutes from "../routes/userStats.js";
```

Add route registration after watch history routes (around line 128):

```typescript
  // User stats routes (protected)
  app.use("/api/user-stats", userStatsRoutes);
```

**Step 4: Commit**

```bash
git add server/controllers/userStats.ts server/routes/userStats.ts server/initializers/api.ts
git commit -m "$(cat <<'EOF'
feat(api): add GET /api/user-stats endpoint

Exposes user stats aggregation through authenticated REST endpoint.
Returns library counts, engagement totals, top lists, and highlights.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create Frontend Hook

**Files:**
- Create: `client/src/hooks/useUserStats.js`

**Step 1: Create the hook**

```javascript
// client/src/hooks/useUserStats.js

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth.js";
import { apiGet } from "../services/api.js";

/**
 * Hook for fetching user stats
 * @returns {Object} { data, loading, error, refresh }
 */
export function useUserStats() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiGet("/user-stats");
      setData(response);
    } catch (err) {
      console.error("Error fetching user stats:", err);
      setError(err.message || "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { data, loading, error, refresh: fetchStats };
}
```

**Step 2: Commit**

```bash
git add client/src/hooks/useUserStats.js
git commit -m "$(cat <<'EOF'
feat(client): add useUserStats hook

Fetches user stats from /api/user-stats with loading/error states.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create UI Components

**Files:**
- Create: `client/src/components/pages/UserStats/components/StatCard.jsx`
- Create: `client/src/components/pages/UserStats/components/LibraryOverview.jsx`
- Create: `client/src/components/pages/UserStats/components/EngagementTotals.jsx`
- Create: `client/src/components/pages/UserStats/components/TopList.jsx`
- Create: `client/src/components/pages/UserStats/components/HighlightCard.jsx`
- Create: `client/src/components/pages/UserStats/components/index.js`

**Step 1: Create StatCard component**

```jsx
// client/src/components/pages/UserStats/components/StatCard.jsx

import { Paper } from "../../../ui/index.js";

/**
 * Simple stat display card
 */
const StatCard = ({ label, value, subtitle, icon }) => (
  <Paper padding="md" className="text-center flex flex-col items-center gap-1">
    {icon && (
      <div style={{ color: "var(--text-muted)" }} className="mb-1">
        {icon}
      </div>
    )}
    <div
      style={{ color: "var(--text-primary)" }}
      className="text-2xl font-bold"
    >
      {value}
    </div>
    <div style={{ color: "var(--text-secondary)" }} className="text-sm">
      {label}
    </div>
    {subtitle && (
      <div style={{ color: "var(--text-muted)" }} className="text-xs">
        {subtitle}
      </div>
    )}
  </Paper>
);

export default StatCard;
```

**Step 2: Create LibraryOverview component**

```jsx
// client/src/components/pages/UserStats/components/LibraryOverview.jsx

import { Film, Users, Building2, Tag, Images, Image } from "lucide-react";
import StatCard from "./StatCard.jsx";

/**
 * Compact row of library count stats
 */
const LibraryOverview = ({ library }) => {
  const stats = [
    { label: "Scenes", value: library.sceneCount, icon: <Film size={20} /> },
    { label: "Performers", value: library.performerCount, icon: <Users size={20} /> },
    { label: "Studios", value: library.studioCount, icon: <Building2 size={20} /> },
    { label: "Tags", value: library.tagCount, icon: <Tag size={20} /> },
    { label: "Galleries", value: library.galleryCount, icon: <Images size={20} /> },
    { label: "Images", value: library.imageCount, icon: <Image size={20} /> },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {stats.map((stat) => (
        <StatCard
          key={stat.label}
          label={stat.label}
          value={stat.value.toLocaleString()}
          icon={stat.icon}
        />
      ))}
    </div>
  );
};

export default LibraryOverview;
```

**Step 3: Create EngagementTotals component**

```jsx
// client/src/components/pages/UserStats/components/EngagementTotals.jsx

import { Clock, Play, Heart, Image, Film } from "lucide-react";
import StatCard from "./StatCard.jsx";

/**
 * Format seconds as human-readable duration
 */
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return "0m";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

/**
 * Hero section with engagement totals
 */
const EngagementTotals = ({ engagement, librarySceneCount }) => {
  const coveragePercent =
    librarySceneCount > 0
      ? Math.round((engagement.uniqueScenesWatched / librarySceneCount) * 100)
      : 0;

  const stats = [
    {
      label: "Watch Time",
      value: formatDuration(engagement.totalWatchTime),
      icon: <Clock size={24} />,
    },
    {
      label: "Play Count",
      value: engagement.totalPlayCount.toLocaleString(),
      icon: <Play size={24} />,
    },
    {
      label: "O Count",
      value: engagement.totalOCount.toLocaleString(),
      icon: <Heart size={24} />,
    },
    {
      label: "Scenes Watched",
      value: engagement.uniqueScenesWatched.toLocaleString(),
      subtitle: `${coveragePercent}% of library`,
      icon: <Film size={24} />,
    },
    {
      label: "Images Viewed",
      value: engagement.totalImagesViewed.toLocaleString(),
      icon: <Image size={24} />,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((stat) => (
        <StatCard
          key={stat.label}
          label={stat.label}
          value={stat.value}
          subtitle={stat.subtitle}
          icon={stat.icon}
        />
      ))}
    </div>
  );
};

export default EngagementTotals;
```

**Step 4: Create TopList component**

```jsx
// client/src/components/pages/UserStats/components/TopList.jsx

import { Link } from "react-router-dom";
import { Paper } from "../../../ui/index.js";

/**
 * Ranked list of top items
 */
const TopList = ({ title, items, linkPrefix, showImage = true }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <Paper padding="none">
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h3
          className="font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border-color)" }}>
        {items.map((item, index) => (
          <Link
            key={item.id}
            to={`${linkPrefix}/${item.id}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <span
              className="w-6 text-center font-bold"
              style={{ color: "var(--text-muted)" }}
            >
              {index + 1}
            </span>
            {showImage && (
              <div
                className="w-10 h-10 rounded overflow-hidden flex-shrink-0"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                {item.imageUrl ? (
                  <img
                    src={`/api/proxy/stash?url=${encodeURIComponent(item.imageUrl)}`}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs">
                    ?
                  </div>
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div
                className="font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {item.name}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {item.playCount} plays • {item.oCount} Os
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Paper>
  );
};

export default TopList;
```

**Step 5: Create HighlightCard component**

```jsx
// client/src/components/pages/UserStats/components/HighlightCard.jsx

import { Link } from "react-router-dom";
import { Paper } from "../../../ui/index.js";

/**
 * Feature card for highlight stats (most watched, etc.)
 */
const HighlightCard = ({ title, item, linkPrefix, statLabel, statValue }) => {
  if (!item) {
    return null;
  }

  const displayName = item.name || item.title || "Unknown";

  return (
    <Paper padding="none" className="overflow-hidden">
      <div
        className="px-4 py-2 border-b"
        style={{ borderColor: "var(--border-color)" }}
      >
        <h3
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          {title}
        </h3>
      </div>
      <Link
        to={`${linkPrefix}/${item.id}`}
        className="block hover:bg-[var(--bg-secondary)] transition-colors"
      >
        <div className="aspect-video relative overflow-hidden">
          {item.imageUrl ? (
            <img
              src={`/api/proxy/stash?url=${encodeURIComponent(item.imageUrl)}`}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <span style={{ color: "var(--text-muted)" }}>No image</span>
            </div>
          )}
        </div>
        <div className="p-3">
          <div
            className="font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {displayName}
          </div>
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            {statValue.toLocaleString()} {statLabel}
          </div>
        </div>
      </Link>
    </Paper>
  );
};

export default HighlightCard;
```

**Step 6: Create index export**

```javascript
// client/src/components/pages/UserStats/components/index.js

export { default as StatCard } from "./StatCard.jsx";
export { default as LibraryOverview } from "./LibraryOverview.jsx";
export { default as EngagementTotals } from "./EngagementTotals.jsx";
export { default as TopList } from "./TopList.jsx";
export { default as HighlightCard } from "./HighlightCard.jsx";
```

**Step 7: Commit**

```bash
git add client/src/components/pages/UserStats/components/
git commit -m "$(cat <<'EOF'
feat(client): add user stats UI components

- StatCard: Simple stat display with icon/value/label
- LibraryOverview: Grid of library counts
- EngagementTotals: Hero section with watch time, plays, Os
- TopList: Ranked list for performers/studios/tags
- HighlightCard: Feature card for most watched/viewed

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Create UserStats Page

**Files:**
- Create: `client/src/components/pages/UserStats/UserStats.jsx`
- Create: `client/src/components/pages/UserStats/index.js`

**Step 1: Create the page component**

```jsx
// client/src/components/pages/UserStats/UserStats.jsx

import { BarChart3 } from "lucide-react";
import { usePageTitle } from "../../../hooks/usePageTitle.js";
import { useUserStats } from "../../../hooks/useUserStats.js";
import { PageHeader, PageLayout, LoadingSpinner } from "../../ui/index.js";
import {
  LibraryOverview,
  EngagementTotals,
  TopList,
  HighlightCard,
} from "./components/index.js";

const UserStats = () => {
  usePageTitle("My Stats");

  const { data, loading, error } = useUserStats();

  if (loading) {
    return (
      <PageLayout fullHeight style={{ backgroundColor: "var(--bg-primary)" }}>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout fullHeight style={{ backgroundColor: "var(--bg-primary)" }}>
        <PageHeader
          title="My Stats"
          icon={<BarChart3 className="w-8 h-8" />}
        />
        <div
          className="text-center py-12"
          style={{ color: "var(--status-error)" }}
        >
          Failed to load stats: {error}
        </div>
      </PageLayout>
    );
  }

  // Check if user has any engagement data
  const hasEngagement =
    data?.engagement?.totalPlayCount > 0 ||
    data?.engagement?.totalImagesViewed > 0;

  return (
    <PageLayout fullHeight style={{ backgroundColor: "var(--bg-primary)" }}>
      <PageHeader
        title="My Stats"
        subtitle="Your viewing statistics"
        icon={<BarChart3 className="w-8 h-8" />}
      />

      <div className="space-y-8 pb-8">
        {/* Library Overview */}
        <section>
          <h2
            className="text-lg font-semibold mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Library
          </h2>
          <LibraryOverview library={data.library} />
        </section>

        {/* Engagement Stats */}
        {hasEngagement ? (
          <>
            <section>
              <h2
                className="text-lg font-semibold mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                Engagement
              </h2>
              <EngagementTotals
                engagement={data.engagement}
                librarySceneCount={data.library.sceneCount}
              />
            </section>

            {/* Top Lists */}
            <section>
              <h2
                className="text-lg font-semibold mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                Top Content
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TopList
                  title="Top Performers"
                  items={data.topPerformers}
                  linkPrefix="/performer"
                />
                <TopList
                  title="Top Studios"
                  items={data.topStudios}
                  linkPrefix="/studio"
                />
                <TopList
                  title="Top Tags"
                  items={data.topTags}
                  linkPrefix="/tag"
                  showImage={false}
                />
              </div>
            </section>

            {/* Highlights */}
            <section>
              <h2
                className="text-lg font-semibold mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                Highlights
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <HighlightCard
                  title="Most Watched Scene"
                  item={data.mostWatchedScene}
                  linkPrefix="/scene"
                  statLabel="plays"
                  statValue={data.mostWatchedScene?.playCount || 0}
                />
                <HighlightCard
                  title="Most Viewed Image"
                  item={data.mostViewedImage}
                  linkPrefix="/image"
                  statLabel="views"
                  statValue={data.mostViewedImage?.viewCount || 0}
                />
                <HighlightCard
                  title="Most O'd Scene"
                  item={data.mostOdScene}
                  linkPrefix="/scene"
                  statLabel="Os"
                  statValue={data.mostOdScene?.oCount || 0}
                />
                <HighlightCard
                  title="Most O'd Performer"
                  item={data.mostOdPerformer}
                  linkPrefix="/performer"
                  statLabel="Os"
                  statValue={data.mostOdPerformer?.oCount || 0}
                />
              </div>
            </section>
          </>
        ) : (
          <div
            className="text-center py-12"
            style={{ color: "var(--text-muted)" }}
          >
            <BarChart3
              size={48}
              className="mx-auto mb-4"
              style={{ color: "var(--text-muted)" }}
            />
            <p className="text-lg mb-2">No engagement data yet</p>
            <p>Start watching content to see your stats!</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default UserStats;
```

**Step 2: Create index export**

```javascript
// client/src/components/pages/UserStats/index.js

export { default } from "./UserStats.jsx";
```

**Step 3: Commit**

```bash
git add client/src/components/pages/UserStats/
git commit -m "$(cat <<'EOF'
feat(client): add UserStats page component

Main page displaying library overview, engagement totals,
top performers/studios/tags, and highlight cards.
Includes loading and empty states.

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add Route and Navigation

**Files:**
- Modify: `client/src/App.jsx`
- Modify: `client/src/components/ui/UserMenu.jsx`

**Step 1: Add lazy import in App.jsx**

Add after WatchHistory import (around line 41):

```jsx
const UserStats = lazy(() => import("./components/pages/UserStats/index.js"));
```

**Step 2: Add route in App.jsx**

Add after `/watch-history` route (around line 270):

```jsx
          <Route
            path="/user-stats"
            element={
              <ProtectedRoute setupStatus={safeSetupStatus} checkingSetup={checkingSetup}>
                <GlobalLayout>
                  <UserStats />
                </GlobalLayout>
              </ProtectedRoute>
            }
          />
```

**Step 3: Add menu item in UserMenu.jsx**

Add after Watch History link (after line 121):

```jsx
            <Link
              to="/user-stats"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200"
              style={{
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <ThemedIcon name="bar-chart-3" size={16} />
              <span>My Stats</span>
            </Link>
```

**Step 4: Commit**

```bash
git add client/src/App.jsx client/src/components/ui/UserMenu.jsx
git commit -m "$(cat <<'EOF'
feat(client): add user stats route and navigation

- Add /user-stats route with ProtectedRoute wrapper
- Add "My Stats" link to user context menu

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Manual Testing

**Step 1: Start development servers**

```bash
# Terminal 1 - Server
cd /home/carrot/code/peek-stash-browser/server && npm run dev

# Terminal 2 - Client
cd /home/carrot/code/peek-stash-browser/client && npm run dev
```

**Step 2: Test the feature**

1. Open browser to `http://localhost:5173`
2. Log in with test user
3. Click user icon in nav → verify "My Stats" appears in menu
4. Click "My Stats" → verify page loads
5. Verify library counts display correctly
6. If you have watch history, verify engagement stats display
7. If you have watch history, verify top lists show correct data
8. Test clicking on items to verify navigation works
9. Test with a user that has no watch history → verify empty state

**Step 3: Test exclusions**

1. Hide a performer via Hidden Items page
2. Refresh user stats page
3. Verify hidden performer doesn't appear in top lists
4. Verify engagement totals don't include hidden content

---

## Task 9: Final Commit

**Step 1: Verify all changes**

```bash
git status
git log --oneline -10
```

**Step 2: Create summary commit if needed**

If there are any uncommitted fixes from testing:

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix: address issues found during manual testing

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Summary

This plan creates:

1. **Backend:**
   - `server/types/api/userStats.ts` - TypeScript interfaces
   - `server/services/UserStatsAggregationService.ts` - Exclusion-aware stats queries
   - `server/controllers/userStats.ts` - Controller function
   - `server/routes/userStats.ts` - Express route
   - Modified `server/initializers/api.ts` - Route registration

2. **Frontend:**
   - `client/src/hooks/useUserStats.js` - Data fetching hook
   - `client/src/components/pages/UserStats/` - Page and components
   - Modified `client/src/App.jsx` - Route
   - Modified `client/src/components/ui/UserMenu.jsx` - Navigation link

All stats respect content exclusions via `UserExcludedEntity` JOIN pattern.
