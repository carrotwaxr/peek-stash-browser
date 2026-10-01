import { useCallback, useEffect, useState } from "react";
import type {
  DiscardOrphanResponse,
  OrphanedScene,
  OrphanedScenesResponse,
} from "@peek/shared-types";
import { ChevronDown, ChevronRight } from "lucide-react";
import { apiGet, apiPost } from "../../../api";
import { ApiError } from "../../../api/client";
import { useConfirmDialog } from "../../../hooks/useConfirmDialog";
import { makeCompositeKey } from "../../../utils/compositeKey";
import { formatDate } from "../../../utils/date";
import { showError, showSuccess } from "../../../utils/toast";
import { Button } from "../../ui/index";

/** A live scene of the orphan's instance with the same phash */
interface MatchResult {
  sceneId: string;
  instanceId: string;
  instanceName: string;
  title: string | null;
  similarity: string;
  recommended: boolean;
}

/** The orphan as "id:instanceId": its row key and its ref in the API paths */
const orphanKey = (orphan: OrphanedScene) =>
  makeCompositeKey(orphan.id, orphan.instanceId);

const orphanPath = (orphan: OrphanedScene) =>
  `/admin/orphaned-scenes/${encodeURIComponent(orphanKey(orphan))}`;

/** What a refused discard or transfer of a restored scene says */
const RESTORED_MESSAGE = "This scene is back in Stash, so its data was kept";

const MergeRecoveryTab = () => {
  const [orphans, setOrphans] = useState<OrphanedScene[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  // The orphan key being processed, or "all"
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedOrphan, setExpandedOrphan] = useState<string | null>(null);
  // Matches and manual target ids by orphan key
  const [matches, setMatches] = useState<Record<string, MatchResult[]>>({});
  const [manualTargetId, setManualTargetId] = useState<Record<string, string>>(
    {}
  );

  const fetchOrphans = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<OrphanedScenesResponse>(
        "/admin/orphaned-scenes"
      );
      setOrphans(data.scenes);
    } catch {
      showError("Failed to load orphaned scenes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrphans();
  }, [fetchOrphans]);

  const fetchMatches = async (orphan: OrphanedScene) => {
    const key = orphanKey(orphan);
    if (matches[key]) return;
    try {
      const data = await apiGet<{ matches: MatchResult[] }>(
        `${orphanPath(orphan)}/matches`
      );
      setMatches((prev) => ({ ...prev, [key]: data.matches }));
    } catch {
      showError("Failed to load matches");
    }
  };

  const handleExpand = (orphan: OrphanedScene) => {
    const key = orphanKey(orphan);
    if (expandedOrphan === key) {
      setExpandedOrphan(null);
    } else {
      setExpandedOrphan(key);
      void fetchMatches(orphan);
    }
  };

  /**
   * The server refuses (409) a scene a sync restored since the list was
   * read: say its data stays and read the list again, which no longer
   * holds it. True when the error was that refusal.
   */
  const keptBecauseRestored = (error: unknown): boolean => {
    if (!(error instanceof ApiError) || error.status !== 409) return false;
    showError(RESTORED_MESSAGE);
    void fetchOrphans();
    return true;
  };

  /** Transfer to `targetId`, a scene id on the orphan's instance */
  const handleReconcile = async (orphan: OrphanedScene, targetId: string) => {
    try {
      setProcessing(orphanKey(orphan));
      await apiPost(`${orphanPath(orphan)}/reconcile`, {
        targetSceneId: targetId,
      });
      showSuccess("Activity transferred successfully");
      void fetchOrphans();
    } catch (error) {
      if (!keptBecauseRestored(error)) showError("Failed to reconcile scene");
    } finally {
      setProcessing(null);
    }
  };

  const handleDiscard = async (orphan: OrphanedScene) => {
    if (
      !(await confirm({
        title: "Discard orphaned data?",
        message:
          "Are you sure you want to discard this orphaned data? It also removes the scene from every playlist that holds it. This cannot be undone.",
        confirmText: "Discard",
      }))
    ) {
      return;
    }
    try {
      setProcessing(orphanKey(orphan));
      await apiPost<DiscardOrphanResponse>(`${orphanPath(orphan)}/discard`);
      showSuccess("Orphaned data discarded");
      void fetchOrphans();
    } catch (error) {
      if (!keptBecauseRestored(error)) showError("Failed to discard data");
    } finally {
      setProcessing(null);
    }
  };

  const handleReconcileAll = async () => {
    if (
      !(await confirm({
        title: "Auto-reconcile all orphans?",
        message:
          "This transfers the activity of every orphan with exactly one PHASH match on its instance. Orphans with several matches stay here for you to choose.",
        confirmText: "Reconcile all",
        confirmStyle: "primary",
      }))
    ) {
      return;
    }
    try {
      setProcessing("all");
      const data = await apiPost<{ reconciled: number; skipped: number }>(
        "/admin/reconcile-all"
      );
      showSuccess(
        `Reconciled ${data.reconciled} scenes, skipped ${data.skipped}`
      );
      void fetchOrphans();
    } catch {
      showError("Failed to reconcile all");
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return <div className="p-6">Loading orphaned scenes...</div>;
  }

  return (
    <div className="space-y-6">
      <div
        className="p-6 rounded-lg border"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              Merge Recovery
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Recover user activity from scenes that were merged in Stash
            </p>
          </div>
          <Button
            onClick={() => void handleReconcileAll()}
            disabled={processing === "all" || orphans.length === 0}
            variant="primary"
          >
            {processing === "all" ? "Processing..." : "Auto-Reconcile All"}
          </Button>
        </div>

        {orphans.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>
            No orphaned scenes with user activity found.
          </p>
        ) : (
          <div className="space-y-4">
            <p style={{ color: "var(--text-secondary)" }}>
              Found {orphans.length} orphaned scene
              {orphans.length !== 1 ? "s" : ""} with user activity
            </p>

            {orphans.map((orphan) => {
              const key = orphanKey(orphan);
              const orphanMatches = matches[key];
              const manualTarget = manualTargetId[key];
              const expanded = expandedOrphan === key;
              return (
                <div
                  key={key}
                  className="p-4 rounded-lg border"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                  }}
                >
                  <div
                    className="flex justify-between items-start cursor-pointer"
                    onClick={() => handleExpand(orphan)}
                  >
                    <div>
                      <h4
                        className="font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span>{orphan.title || orphan.id}</span>{" "}
                        <span
                          className="text-sm font-normal"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          on {orphan.instanceName}
                        </span>
                      </h4>
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Deleted: {formatDate(orphan.deletedAt)}
                        {orphan.phash
                          ? ` | PHASH: ${orphan.phash.substring(0, 12)}...`
                          : " | No PHASH"}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Activity: {orphan.totalPlayCount} plays
                        {orphan.hasRatings && " | Has ratings"}
                        {orphan.hasFavorites && " | Favorited"}
                        {orphan.playlistEntryCount > 0 &&
                          ` | In ${orphan.playlistEntryCount} playlist${orphan.playlistEntryCount === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    {expanded ? (
                      <ChevronDown
                        size={20}
                        style={{ color: "var(--text-secondary)" }}
                      />
                    ) : (
                      <ChevronRight
                        size={20}
                        style={{ color: "var(--text-secondary)" }}
                      />
                    )}
                  </div>

                  {expanded && (
                    <div
                      className="mt-4 pt-4 border-t"
                      style={{ borderColor: "var(--border-color)" }}
                    >
                      <p
                        className="text-sm mb-2"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Potential matches:
                      </p>

                      {!orphanMatches ? (
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          Loading matches...
                        </p>
                      ) : orphanMatches.length === 0 ? (
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          No PHASH matches found
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {orphanMatches.map((match) => (
                            <div
                              key={makeCompositeKey(
                                match.sceneId,
                                match.instanceId
                              )}
                              className="flex justify-between items-center p-2 rounded"
                              style={{ backgroundColor: "var(--bg-card)" }}
                            >
                              <div>
                                <span style={{ color: "var(--text-primary)" }}>
                                  {match.title || match.sceneId}
                                </span>
                                <span
                                  className="ml-2 text-sm"
                                  style={{ color: "var(--text-secondary)" }}
                                >
                                  ({match.similarity} match)
                                  {match.recommended && " ★ Recommended"}
                                </span>
                              </div>
                              <Button
                                onClick={() =>
                                  void handleReconcile(orphan, match.sceneId)
                                }
                                disabled={processing === key}
                                variant="primary"
                                size="sm"
                              >
                                Transfer
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-2">
                        <input
                          type="text"
                          placeholder={`Scene ID on ${orphan.instanceName}`}
                          value={manualTarget || ""}
                          onChange={(e) =>
                            setManualTargetId((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                          className="flex-1 p-2 rounded border"
                          style={{
                            backgroundColor: "var(--bg-primary)",
                            borderColor: "var(--border-color)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <Button
                          onClick={() => {
                            if (manualTarget) {
                              void handleReconcile(orphan, manualTarget);
                            }
                          }}
                          disabled={!manualTarget || processing === key}
                          variant="primary"
                          size="sm"
                        >
                          Transfer
                        </Button>
                      </div>

                      <div className="mt-4">
                        <Button
                          onClick={() => void handleDiscard(orphan)}
                          disabled={processing === key}
                          variant="destructive"
                          size="sm"
                        >
                          Discard Activity
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
};

export default MergeRecoveryTab;
