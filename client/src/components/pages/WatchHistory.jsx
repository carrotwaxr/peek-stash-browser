import { useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useAllWatchHistory } from "../../hooks/useWatchHistory.js";
import { apiDelete, libraryApi } from "../../services/api.js";
import {
  Button,
  LoadingSpinner,
  PageHeader,
  PageLayout,
  SceneListItem,
} from "../ui/index.js";

const WatchHistory = () => {
  usePageTitle("Watch History");

  const [sortBy, setSortBy] = useState("recent"); // recent, most_watched, longest_duration
  const [filterBy, setFilterBy] = useState("all"); // all, in_progress, completed
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Fetch all watch history (not limited)
  const {
    data: watchHistoryList,
    loading: loadingHistory,
    error,
    refresh: refreshWatchHistory,
  } = useAllWatchHistory({
    inProgress: filterBy === "in_progress",
    limit: 100,
  });

  // Fetch full scene data for watch history
  useEffect(() => {
    const fetchScenes = async () => {
      if (!watchHistoryList || watchHistoryList.length === 0) {
        setScenes([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Extract scene IDs from watch history
        const sceneIds = watchHistoryList.map((wh) => wh.sceneId);

        // Fetch scenes in bulk - must set per_page to match number of IDs
        const response = await libraryApi.findScenes({
          ids: sceneIds,
          filter: { per_page: sceneIds.length },
        });
        const fetchedScenes = response?.findScenes?.scenes || [];

        // Match scenes with watch history data
        const scenesWithHistory = fetchedScenes.map((scene) => {
          const watchHistory = watchHistoryList.find(
            (wh) => wh.sceneId === scene.id
          );
          const duration = scene.files?.[0]?.duration || 0;
          const resumeTime = watchHistory?.resumeTime || 0;
          const isCompleted =
            duration > 0 && resumeTime > 0 && resumeTime / duration > 0.9;

          return {
            ...scene,
            watchHistory: watchHistory || null,
            resumeTime: resumeTime,
            playCount: watchHistory?.playCount || 0,
            playDuration: watchHistory?.playDuration || 0,
            lastPlayedAt: watchHistory?.lastPlayedAt || null,
            oCount: watchHistory?.oCount || 0,
            oHistory: watchHistory?.oHistory || [],
            isCompleted: isCompleted,
          };
        });

        // Apply filtering
        let filtered = scenesWithHistory;
        if (filterBy === "in_progress") {
          filtered = scenesWithHistory.filter(
            (s) => !s.isCompleted && s.resumeTime > 0
          );
        } else if (filterBy === "completed") {
          filtered = scenesWithHistory.filter((s) => s.isCompleted);
        }

        // Apply sorting
        let sorted = [...filtered];
        if (sortBy === "recent") {
          sorted.sort((a, b) => {
            const dateA = a.lastPlayedAt
              ? new Date(a.lastPlayedAt)
              : new Date(0);
            const dateB = b.lastPlayedAt
              ? new Date(b.lastPlayedAt)
              : new Date(0);
            return dateB - dateA;
          });
        } else if (sortBy === "most_watched") {
          sorted.sort((a, b) => b.playCount - a.playCount);
        } else if (sortBy === "longest_duration") {
          sorted.sort((a, b) => b.playDuration - a.playDuration);
        }

        setScenes(sorted);
      } catch (err) {
        console.error("Error fetching watch history scenes:", err);
        setScenes([]);
      } finally {
        setLoading(false);
      }
    };

    if (!loadingHistory) {
      fetchScenes();
    }
  }, [watchHistoryList, loadingHistory, sortBy, filterBy]);

  const formatDuration = (seconds) => {
    if (!seconds) return "0m";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const handleClearHistory = async () => {
    try {
      setIsClearing(true);
      await apiDelete("/watch-history");

      // Refresh watch history data from API
      await refreshWatchHistory();

      // Close dialog
      setShowConfirmDialog(false);
    } catch (err) {
      console.error("Error clearing watch history:", err);
      alert("Failed to clear watch history. Please try again.");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <PageLayout fullHeight style={{ backgroundColor: "var(--bg-primary)" }}>
      <PageHeader
        title="Watch History"
        subtitle="View your viewing history and continue watching"
        icon={<History className="w-8 h-8" />}
      />

      {/* Controls */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          {/* Sort and Filter - grouped on mobile */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Sort */}
            <div className="flex items-center gap-2">
              <label
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}
              >
                Sort:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
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
                className="text-sm font-medium whitespace-nowrap"
                style={{ color: "var(--text-secondary)" }}
              >
                Filter:
              </label>
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value)}
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
              <span>{scenes.length} scenes</span>
              {scenes.length > 0 && (
                <span>
                  Total watch time:{" "}
                  {formatDuration(
                    scenes.reduce((sum, s) => sum + s.playDuration, 0)
                  )}
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
              Error loading watch history: {error}
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
              No watch history yet
            </p>
            <p style={{ color: "var(--text-muted)" }}>
              Start watching some scenes to see them here
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {scenes.map((scene, index) => (
              <SceneListItem
                key={scene.id}
                scene={scene}
                watchHistory={{
                  resumeTime: scene.resumeTime,
                  playCount: scene.playCount,
                  playDuration: scene.playDuration,
                  lastPlayedAt: scene.lastPlayedAt,
                  oCount: scene.oCount,
                  oHistory: scene.oHistory,
                }}
                showSessionOIndicator={true}
                linkState={{
                  scene,
                  shouldResume: true, // Auto-resume from watch history
                  playlist: {
                    id: "virtual-history",
                    name: "Watch History",
                    shuffle: false,
                    repeat: "none",
                    scenes: scenes.map((s, idx) => ({
                      sceneId: s.id,
                      instanceId: s.instanceId,
                      scene: s,
                      position: idx,
                    })),
                    currentIndex: index,
                  },
                }}
                exists={true}
                sceneId={scene.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowConfirmDialog(false)}
        >
          <div
            className="p-6 rounded-lg max-w-md mx-4"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              className="text-xl font-bold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Clear Watch History?
            </h3>
            <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
              This will permanently delete all watch history records including
              resume times, play counts, O counters, and all viewing statistics.
              This will also reset O counter totals for all Performers, Studios,
              and Tags. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                onClick={() => setShowConfirmDialog(false)}
                disabled={isClearing}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                onClick={handleClearHistory}
                disabled={isClearing}
                variant="destructive"
                loading={isClearing}
              >
                Clear History
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default WatchHistory;
