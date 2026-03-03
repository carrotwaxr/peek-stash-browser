// client/src/components/pages/UserStats/UserStats.tsx

import { type ReactNode, useState } from "react";
import { BarChart3, Info, RefreshCw } from "lucide-react";
import { usePageTitle } from "../../../hooks/usePageTitle";
import { useUserStats } from "../../../hooks/useUserStats";
import { PageHeader, PageLayout, LoadingSpinner, Tooltip } from "../../ui/index";
import {
  LibraryOverview,
  EngagementTotals,
  TopList,
  HighlightCard,
} from "./components/index";

type TopListSortBy = "engagement" | "oCount" | "playCount";

/** Matches TopList's internal TopListItem interface for type-safe prop passing */
interface TopListItem {
  id: string;
  name?: string;
  title?: string;
  filePath?: string;
  imageUrl?: string;
  playDuration: number;
  playCount: number;
  oCount: number;
  score: number;
}

interface SectionInfoProps {
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

/**
 * Section info tooltip: wraps content with consistent sizing
 */
const SectionInfo = ({ children, position = "right" }: SectionInfoProps) => (
  <Tooltip content={children} position={position}>
    <button
      className="p-1 rounded-full hover:bg-[var(--bg-secondary)] transition-colors"
      aria-label="Info"
    >
      <Info size={16} style={{ color: "var(--text-muted)" }} />
    </button>
  </Tooltip>
);

const LibraryInfoContent = () => (
  <div className="text-sm max-w-xs">
    <p>
      Total counts of each entity type cached from your connected Stash
      instances. Updated when Peek syncs with Stash (default: every 60 minutes).
    </p>
  </div>
);

const EngagementInfoContent = () => (
  <div className="text-sm max-w-xs">
    <p>
      Aggregated from your watch and browsing history across all instances.
      Watch time and play counts update in real-time as you watch. O-count
      updates when you tap the O button.
    </p>
  </div>
);

const TopContentInfoContent = () => (
  <div className="text-sm max-w-xs">
    <p className="mb-2">
      Entities ranked by your personal engagement. Engagement score = (O-count
      &times; 5) + watch duration + play count, divided by how often the entity
      appears in your library.
    </p>
    <p className="mb-2">
      Percentile rank shows where each entity falls among all your engaged
      entities (100 = top, 0 = bottom). Rankings refresh on login and
      periodically while browsing.
    </p>
    <p className="font-semibold mb-1">Sort Options</p>
    <ul className="space-y-1">
      <li>
        <span className="font-medium">Engagement:</span> Percentile rank as
        described above.
      </li>
      <li>
        <span className="font-medium">O-Count:</span> Total Os for scenes
        featuring this entity.
      </li>
      <li>
        <span className="font-medium">Play Count:</span> Total plays for scenes
        featuring this entity.
      </li>
    </ul>
  </div>
);

const HighlightsInfoContent = () => (
  <div className="text-sm max-w-xs">
    <p>
      Your single highest-engagement entity in each category, based on raw
      counts (most plays, most O&apos;s, most views). These update in real-time
      with your activity.
    </p>
  </div>
);

const UserStats = () => {
  usePageTitle("My Stats");

  // Sort state for top lists - shared across all lists
  const [sortBy, setSortBy] = useState<TopListSortBy>("engagement");

  const { data, loading, error, refresh } = useUserStats({ sortBy });
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      refresh();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <PageLayout fullHeight>
        <div className="flex items-center justify-center h-64" style={{ backgroundColor: "var(--bg-primary)" }}>
          <LoadingSpinner />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout fullHeight>
        <PageHeader
          title="My Stats"
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
  const engagement = data?.engagement as Record<string, unknown> | undefined;
  const hasEngagement =
    (engagement?.totalPlayCount as number) > 0 ||
    (engagement?.totalImagesViewed as number) > 0;

  return (
    <PageLayout fullHeight>
      <div className="flex items-start justify-between">
        <PageHeader
          title="My Stats"
          subtitle="Your viewing statistics"
        />
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors disabled:opacity-50"
          aria-label="Refresh stats"
          title="Refresh stats"
        >
          <RefreshCw
            size={20}
            className={refreshing ? "animate-spin" : ""}
            style={{ color: "var(--text-muted)" }}
          />
        </button>
      </div>

      <div className="space-y-8 pb-8">
        {/* Library Overview */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <h2
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Library
            </h2>
            <SectionInfo>
              <LibraryInfoContent />
            </SectionInfo>
          </div>
          <LibraryOverview library={data.library as { sceneCount: number; performerCount: number; studioCount: number; tagCount: number; galleryCount: number; imageCount: number; clipCount: number }} />
        </section>

        {/* Engagement Stats */}
        {hasEngagement ? (
          <>
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Engagement
                </h2>
                <SectionInfo>
                  <EngagementInfoContent />
                </SectionInfo>
              </div>
              <EngagementTotals
                engagement={data.engagement as { totalWatchTime: number; totalPlayCount: number; totalOCount: number; uniqueScenesWatched: number; totalImagesViewed: number }}
                librarySceneCount={(data.library as { sceneCount: number }).sceneCount}
              />
            </section>

            {/* Top Lists */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Top Content
                </h2>
                <SectionInfo>
                  <TopContentInfoContent />
                </SectionInfo>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TopList
                  key={`scenes-${sortBy}`}
                  title="Top Scenes"
                  items={data.topScenes as TopListItem[]}
                  linkPrefix="/scene"
                  entityType="scene"
                  sortBy={sortBy}
                  onSortChange={setSortBy as (sortBy: string) => void}
                />
                <TopList
                  key={`performers-${sortBy}`}
                  title="Top Performers"
                  items={data.topPerformers as TopListItem[]}
                  linkPrefix="/performer"
                  entityType="performer"
                  sortBy={sortBy}
                  onSortChange={setSortBy as (sortBy: string) => void}
                />
                <TopList
                  key={`studios-${sortBy}`}
                  title="Top Studios"
                  items={data.topStudios as TopListItem[]}
                  linkPrefix="/studio"
                  entityType="studio"
                  sortBy={sortBy}
                  onSortChange={setSortBy as (sortBy: string) => void}
                />
                <TopList
                  key={`tags-${sortBy}`}
                  title="Top Tags"
                  items={data.topTags as TopListItem[]}
                  linkPrefix="/tag"
                  entityType="tag"
                  sortBy={sortBy}
                  onSortChange={setSortBy as (sortBy: string) => void}
                />
              </div>
            </section>

            {/* Highlights */}
            <section>
              <div className="flex items-center gap-2 mb-4">
                <h2
                  className="text-lg font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Highlights
                </h2>
                <SectionInfo>
                  <HighlightsInfoContent />
                </SectionInfo>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <HighlightCard
                  title="Most Watched Scene"
                  item={data.mostWatchedScene as { id: string; name?: string; title?: string; filePath?: string; imageUrl?: string } | null}
                  linkPrefix="/scene"
                  entityType="scene"
                  statLabel="plays"
                  statValue={(data.mostWatchedScene as Record<string, unknown> | undefined)?.playCount as number || 0}
                />
                <HighlightCard
                  title="Most Viewed Image"
                  item={data.mostViewedImage as { id: string; name?: string; title?: string; filePath?: string; imageUrl?: string } | null}
                  linkPrefix="/image"
                  entityType="image"
                  statLabel="views"
                  statValue={(data.mostViewedImage as Record<string, unknown> | undefined)?.viewCount as number || 0}
                />
                <HighlightCard
                  title="Most O'd Scene"
                  item={data.mostOdScene as { id: string; name?: string; title?: string; filePath?: string; imageUrl?: string } | null}
                  linkPrefix="/scene"
                  entityType="scene"
                  statLabel="Os"
                  statValue={(data.mostOdScene as Record<string, unknown> | undefined)?.oCount as number || 0}
                />
                <HighlightCard
                  title="Most O'd Performer"
                  item={data.mostOdPerformer as { id: string; name?: string; title?: string; filePath?: string; imageUrl?: string } | null}
                  linkPrefix="/performer"
                  entityType="performer"
                  statLabel="Os"
                  statValue={(data.mostOdPerformer as Record<string, unknown> | undefined)?.oCount as number || 0}
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
