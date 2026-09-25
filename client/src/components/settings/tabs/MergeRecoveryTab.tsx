import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { apiGet, apiPost } from "../../../api";
import { makeCompositeKey } from "../../../utils/compositeKey";
import { showError, showSuccess } from "../../../utils/toast";
import { Button } from "../../ui/index";

/** A deleted scene with activity; its id is meaningful on its instance only */
interface OrphanScene {
  id: string;
  instanceId: string;
  instanceName: string;
  title: string | null;
  deletedAt: string;
  phash: string | null;
  totalPlayCount: number;
  hasRatings: boolean;
  hasFavorites: boolean;
}

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
const orphanKey = (orphan: OrphanScene) =>
  makeCompositeKey(orphan.id, orphan.instanceId);

const orphanPath = (orphan: OrphanScene) =>
  `/admin/orphaned-scenes/${encodeURIComponent(orphanKey(orphan))}`;

const MergeRecoveryTab = () => {
  const [orphans, setOrphans] = useState<OrphanScene[]>([]);
  const [loading, setLoading] = useState(true);
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
      const data = await apiGet<{ scenes: OrphanScene[] }>(
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

  const fetchMatches = async (orphan: OrphanScene) => {
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

  const handleExpand = (orphan: OrphanScene) => {
    const key = orphanKey(orphan);
    if (expandedOrphan === key) {
      setExpandedOrphan(null);
    } else {
      setExpandedOrphan(key);
      void fetchMatches(orphan);
    }
  };

  /** Transfer to `targetId`, a scene id on the orphan's instance */
  const handleReconcile = async (orphan: OrphanScene, targetId: string) => {
    try {
      setProcessing(orphanKey(orphan));
      await apiPost(`${orphanPath(orphan)}/reconcile`, {
        targetSceneId: targetId,
      });
      showSuccess("Activity transferred successfully");
      void fetchOrphans();
    } catch {
      showError("Failed to reconcile scene");
    } finally {
      setProcessing(null);
    }
  };

  const handleDiscard = async (orphan: OrphanScene) => {
    if (
      !confirm(
        "Are you sure you want to discard this orphaned data? This cannot be undone."
      )
    ) {
      return;
    }
    try {
      setProcessing(orphanKey(orphan));
      await apiPost(`${orphanPath(orphan)}/discard`);
      showSuccess("Orphaned data discarded");
      void fetchOrphans();
    } catch {
      showError("Failed to discard data");
    } finally {
      setProcessing(null);
    }
  };

  const handleReconcileAll = async () => {
    if (
      !confirm(
        "This transfers the activity of every orphan with exactly one PHASH match on its instance. Orphans with several matches stay here for you to choose. Continue?"
      )
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
                        Deleted:{" "}
                        {new Date(orphan.deletedAt).toLocaleDateString()}
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
    </div>
  );
};

export default MergeRecoveryTab;
