// client/src/components/pages/UserStats/UserStats.jsx

import { useState } from "react";
import { BarChart3, Info, RefreshCw } from "lucide-react";
import { usePageTitle } from "../../../hooks/usePageTitle.js";
import { useUserStats } from "../../../hooks/useUserStats.js";
import { PageHeader, PageLayout, LoadingSpinner, Tooltip } from "../../ui/index.js";
import {
  LibraryOverview,
  EngagementTotals,
  TopList,
  HighlightCard,
} from "./components/index.js";

/**
 * Section info tooltip: wraps content with consistent sizing
 */
const SectionInfo = ({ children, position = "right" }) => (
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
  const [sortBy, setSortBy] = useState("engagement");

  const { data, loading, error, refresh } = useUserStats({ sortBy });
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh(false);
    } finally {
      setRefreshing(false);
    }
  };

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
      <div className="flex items-start justify-between">
        <PageHeader
          title="My Stats"
          subtitle="Your viewing statistics"
          icon={<BarChart3 className="w-8 h-8" />}
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
          <LibraryOverview library={data.library} />
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
                engagement={data.engagement}
                librarySceneCount={data.library.sceneCount}
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
                  items={data.topScenes}
                  linkPrefix="/scene"
                  entityType="scene"
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
                <TopList
                  key={`performers-${sortBy}`}
                  title="Top Performers"
                  items={data.topPerformers}
                  linkPrefix="/performer"
                  entityType="performer"
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
                <TopList
                  key={`studios-${sortBy}`}
                  title="Top Studios"
                  items={data.topStudios}
                  linkPrefix="/studio"
                  entityType="studio"
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                />
                <TopList
                  key={`tags-${sortBy}`}
                  title="Top Tags"
                  items={data.topTags}
                  linkPrefix="/tag"
                  entityType="tag"
                  sortBy={sortBy}
                  onSortChange={setSortBy}
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
                  item={data.mostWatchedScene}
                  linkPrefix="/scene"
                  entityType="scene"
                  statLabel="plays"
                  statValue={data.mostWatchedScene?.playCount || 0}
                />
                <HighlightCard
                  title="Most Viewed Image"
                  item={data.mostViewedImage}
                  linkPrefix="/image"
                  entityType="image"
                  statLabel="views"
                  statValue={data.mostViewedImage?.viewCount || 0}
                />
                <HighlightCard
                  title="Most O'd Scene"
                  item={data.mostOdScene}
                  linkPrefix="/scene"
                  entityType="scene"
                  statLabel="Os"
                  statValue={data.mostOdScene?.oCount || 0}
                />
                <HighlightCard
                  title="Most O'd Performer"
                  item={data.mostOdPerformer}
                  linkPrefix="/performer"
                  entityType="performer"
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
