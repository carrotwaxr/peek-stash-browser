import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  type NormalizedScene,
  WATCHED_SCENES_SORTS,
  WATCHED_SCENES_VIEWS,
  type WatchedScenesSort,
  type WatchedScenesView,
} from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { History, Trash2 } from "lucide-react";
import { apiDelete, getErrorMessage } from "../../api";
import { queryKeys } from "../../api/queryKeys";
import { useAuth } from "../../hooks/useAuth";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useWatchedScenes } from "../../hooks/useWatchHistory";
import { makeCompositeKey } from "../../utils/compositeKey";
import { formatDurationHumanReadable } from "../../utils/format";
import { buildPlaybackQueue } from "../../utils/playbackQueue";
import { showError } from "../../utils/toast";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import LoadingSpinner from "../ui/LoadingSpinner";
import PageHeader from "../ui/PageHeader";
import PageLayout from "../ui/PageLayout";
import Pagination from "../ui/Pagination";
import SceneListItem from "../ui/SceneListItem";

/** Scenes per page; the page has no per-page selector. */
const PER_PAGE = 24;

const DEFAULT_VIEW: WatchedScenesView = "all";
const DEFAULT_SORT: WatchedScenesSort = "recent";

/** A URL value that is one of the allowed ones, else the default. */
function pick<T extends string>(
  allowed: readonly T[],
  value: string | null,
  fallback: T
): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

const WatchHistory = () => {
  usePageTitle("Watch History");

  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // View, sort and page live in the URL; the defaults stay out of it
  const view = pick(
    WATCHED_SCENES_VIEWS,
    searchParams.get("view"),
    DEFAULT_VIEW
  );
  const sort = pick(
    WATCHED_SCENES_SORTS,
    searchParams.get("sort"),
    DEFAULT_SORT
  );
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const { user } = useAuth();
  const userId = user?.id;
  const {
    data,
    isLoading: loading,
    error,
  } = useWatchedScenes({ view, sort, page, perPage: PER_PAGE });
  const scenes = useMemo(() => data?.scenes ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // One queue for the page, each row at its own index; its key is new with
  // each page of rows (buildPlaybackQueue makes one)
  const queue = useMemo(
    () =>
      buildPlaybackQueue({
        userId,
        id: "virtual-history",
        name: "Watch History",
        scenes,
        currentIndex: 0,
      }),
    [scenes, userId]
  );

  /**
   * Writes the URL as a new history entry (Back undoes the change). The page
   * is dropped unless the change is to the page itself; a default stays out.
   */
  const updateUrl = (changes: {
    view?: WatchedScenesView;
    sort?: WatchedScenesSort;
    page?: number;
  }) => {
    const next = {
      view: changes.view ?? view,
      sort: changes.sort ?? sort,
      page: changes.page ?? 1,
    };
    const params = new URLSearchParams(searchParams);
    const set = (key: string, value: string, isDefault: boolean) => {
      if (isDefault) params.delete(key);
      else params.set(key, value);
    };
    set("view", next.view, next.view === DEFAULT_VIEW);
    set("sort", next.sort, next.sort === DEFAULT_SORT);
    set("page", String(next.page), next.page === 1);
    setSearchParams(params);
  };

  const handleClearHistory = async () => {
    try {
      setIsClearing(true);
      await apiDelete("/watch-history");

      // What the history fed is stale: this page, Home's Continue Watching
      // and the stats
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.watchHistory.all(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.homeCarousels.all(),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.user.stats() }),
      ]);

      // Close dialog
      setShowConfirmDialog(false);
    } catch (err) {
      console.error("Error clearing watch history:", err);
      showError("Failed to clear watch history. Please try again.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <PageLayout fullHeight>
      <PageHeader
        title={"Watch History" as string}
        subtitle={"View your viewing history and continue watching" as string}
      />

      {/* Controls */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          {/* Sort and Filter - grouped on mobile */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="watch-history-sort"
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}
              >
                Sort:
              </label>
              <select
                id="watch-history-sort"
                value={sort}
                onChange={(e) =>
                  updateUrl({
                    sort: pick(
                      WATCHED_SCENES_SORTS,
                      e.target.value,
                      DEFAULT_SORT
                    ),
                  })
                }
                className="px-3 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="recent">Recently Watched</option>
                <option value="most_watched">Most Watched</option>
                <option value="longest_duration">Longest Duration</option>
              </select>
            </div>

            {/* Filter */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="watch-history-view"
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}
              >
                Filter:
              </label>
              <select
                id="watch-history-view"
                value={view}
                onChange={(e) =>
                  updateUrl({
                    view: pick(
                      WATCHED_SCENES_VIEWS,
                      e.target.value,
                      DEFAULT_VIEW
                    ),
                  })
                }
                className="px-3 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="all">All</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Stats and Actions */}
          <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm md:ml-auto">
            <div
              className="flex items-center gap-3 md:gap-4"
              style={{ color: "var(--text-muted)" }}
            >
              <span>{total} scenes</span>
              {total > 0 && (
                <span>
                  Total watch time:{" "}
                  {formatDurationHumanReadable(data?.totalPlayDuration ?? 0, {
                    includeDays: false,
                  })}
                </span>
              )}
            </div>

            {/* Clear History Button */}
            {scenes.length > 0 && (
              <Button
                onClick={() => setShowConfirmDialog(true)}
                disabled={isClearing}
                variant="destructive"
                className="flex items-center gap-1.5"
                icon={<Trash2 size={14} />}
                title="Clear all watch history"
              >
                <span className="hidden sm:inline">Clear History</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scene List */}
      <div>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div
            className="flex items-center justify-center py-16 rounded-lg"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
          >
            <p style={{ color: "var(--status-error)" }}>
              Error loading watch history:{" "}
              {getErrorMessage(error, "Please try again.")}
            </p>
          </div>
        ) : scenes.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-lg"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
          >
            <History
              className="w-16 h-16 mb-4"
              style={{ color: "var(--text-muted)" }}
            />
            <p
              className="text-lg mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {view === "all"
                ? "No watch history yet"
                : "No scenes in this view"}
            </p>
            <p style={{ color: "var(--text-muted)" }}>
              {view === "all"
                ? "Start watching some scenes to see them here"
                : "Try another view to see more of your history"}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {scenes.map((scene, index) => (
              <SceneListItem
                key={makeCompositeKey(scene.id, scene.instanceId)}
                scene={scene}
                watchHistory={{
                  resumeTime: scene.resume_time,
                  playCount: scene.play_count,
                  playDuration: scene.play_duration,
                  lastPlayedAt: scene.last_played_at,
                  oCount: scene.o_counter,
                  lastOAt: scene.last_o_at,
                }}
                showSessionOIndicator={true}
                linkState={{
                  shouldResume: true, // Auto-resume from watch history
                  playlist: { ...queue, currentIndex: index },
                }}
                exists={true}
                sceneId={scene.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pages */}
      {!loading && !error && totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={(next) => updateUrl({ page: next })}
            perPage={PER_PAGE}
            totalCount={total}
            showPerPageSelector={false}
          />
        </div>
      )}

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        onClose={() => {
          if (!isClearing) setShowConfirmDialog(false);
        }}
        onConfirm={() => {
          if (!isClearing) void handleClearHistory();
        }}
        title="Clear Watch History?"
        message="This clears your scene watch history: plays, watch time, resume points and O counts, and the performer, studio and tag totals built from them. Image views and image O counts are kept. This cannot be undone."
        confirmText="Clear History"
      />
    </PageLayout>
  );
};

export default WatchHistory;
