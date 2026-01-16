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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TopList
                  title="Top Scenes"
                  items={data.topScenes}
                  linkPrefix="/scene"
                  entityType="scene"
                />
                <TopList
                  title="Top Performers"
                  items={data.topPerformers}
                  linkPrefix="/performer"
                  entityType="performer"
                />
                <TopList
                  title="Top Studios"
                  items={data.topStudios}
                  linkPrefix="/studio"
                  entityType="studio"
                />
                <TopList
                  title="Top Tags"
                  items={data.topTags}
                  linkPrefix="/tag"
                  entityType="tag"
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
