import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { ChevronDown, ChevronRight } from "lucide-react";
import { showError, showSuccess } from "../../../utils/toast.jsx";
import { Button } from "../../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const MergeRecoveryTab = () => {
  const [orphans, setOrphans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [expandedOrphan, setExpandedOrphan] = useState(null);
  const [matches, setMatches] = useState({});
  const [manualTargetId, setManualTargetId] = useState({});

  const fetchOrphans = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/admin/orphaned-scenes");
      setOrphans(response.data.scenes);
    } catch {
      showError("Failed to load orphaned scenes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrphans();
  }, [fetchOrphans]);

  const fetchMatches = async (sceneId) => {
    if (matches[sceneId]) return;
    try {
      const response = await api.get(`/admin/orphaned-scenes/${sceneId}/matches`);
      setMatches((prev) => ({ ...prev, [sceneId]: response.data.matches }));
    } catch {
      showError("Failed to load matches");
    }
  };

  const handleExpand = (sceneId) => {
    if (expandedOrphan === sceneId) {
      setExpandedOrphan(null);
    } else {
      setExpandedOrphan(sceneId);
      fetchMatches(sceneId);
    }
  };

  const handleReconcile = async (sourceId, targetId) => {
    try {
      setProcessing(sourceId);
      await api.post(`/admin/orphaned-scenes/${sourceId}/reconcile`, { targetSceneId: targetId });
      showSuccess("Activity transferred successfully");
      fetchOrphans();
    } catch {
      showError("Failed to reconcile scene");
    } finally {
      setProcessing(null);
    }
  };

  const handleDiscard = async (sceneId) => {
    if (!confirm("Are you sure you want to discard this orphaned data? This cannot be undone.")) {
      return;
    }
    try {
      setProcessing(sceneId);
      await api.post(`/admin/orphaned-scenes/${sceneId}/discard`);
      showSuccess("Orphaned data discarded");
      fetchOrphans();
    } catch {
      showError("Failed to discard data");
    } finally {
      setProcessing(null);
    }
  };

  const handleReconcileAll = async () => {
    if (!confirm("This will auto-reconcile all orphans with exact PHASH matches. Continue?")) {
      return;
    }
    try {
      setProcessing("all");
      const response = await api.post("/admin/reconcile-all");
      showSuccess(`Reconciled ${response.data.reconciled} scenes, skipped ${response.data.skipped}`);
      fetchOrphans();
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
            <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Merge Recovery
            </h3>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Recover user activity from scenes that were merged in Stash
            </p>
          </div>
          <Button
            onClick={handleReconcileAll}
            disabled={processing === "all" || orphans.length === 0}
            variant="primary"
          >
            {processing === "all" ? "Processing..." : "Auto-Reconcile All"}
          </Button>
        </div>

        {orphans.length === 0 ? (
          <p style={{ color: "var(--text-secondary)" }}>No orphaned scenes with user activity found.</p>
        ) : (
          <div className="space-y-4">
            <p style={{ color: "var(--text-secondary)" }}>
              Found {orphans.length} orphaned scene{orphans.length !== 1 ? "s" : ""} with user activity
            </p>

            {orphans.map((orphan) => (
              <div
                key={orphan.id}
                className="p-4 rounded-lg border"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-color)",
                }}
              >
                <div
                  className="flex justify-between items-start cursor-pointer"
                  onClick={() => handleExpand(orphan.id)}
                >
                  <div>
                    <h4 className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {orphan.title || orphan.id}
                    </h4>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Deleted: {new Date(orphan.deletedAt).toLocaleDateString()}
                      {orphan.phash ? ` | PHASH: ${orphan.phash.substring(0, 12)}...` : " | No PHASH"}
                    </p>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      Activity: {orphan.totalPlayCount} plays
                      {orphan.hasRatings && " | Has ratings"}
                      {orphan.hasFavorites && " | Favorited"}
                    </p>
                  </div>
                  {expandedOrphan === orphan.id ? (
                    <ChevronDown size={20} style={{ color: "var(--text-secondary)" }} />
                  ) : (
                    <ChevronRight size={20} style={{ color: "var(--text-secondary)" }} />
                  )}
                </div>

                {expandedOrphan === orphan.id && (
                  <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--border-color)" }}>
                    <p className="text-sm mb-2" style={{ color: "var(--text-primary)" }}>
                      Potential matches:
                    </p>

                    {!matches[orphan.id] ? (
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        Loading matches...
                      </p>
                    ) : matches[orphan.id].length === 0 ? (
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        No PHASH matches found
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {matches[orphan.id].map((match) => (
                          <div
                            key={match.sceneId}
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
                              onClick={() => handleReconcile(orphan.id, match.sceneId)}
                              disabled={processing === orphan.id}
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
                        placeholder="Manual scene ID"
                        value={manualTargetId[orphan.id] || ""}
                        onChange={(e) =>
                          setManualTargetId((prev) => ({ ...prev, [orphan.id]: e.target.value }))
                        }
                        className="flex-1 p-2 rounded border"
                        style={{
                          backgroundColor: "var(--bg-primary)",
                          borderColor: "var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                      />
                      <Button
                        onClick={() => handleReconcile(orphan.id, manualTargetId[orphan.id])}
                        disabled={!manualTargetId[orphan.id] || processing === orphan.id}
                        variant="primary"
                        size="sm"
                      >
                        Transfer
                      </Button>
                    </div>

                    <div className="mt-4">
                      <Button
                        onClick={() => handleDiscard(orphan.id)}
                        disabled={processing === orphan.id}
                        variant="danger"
                        size="sm"
                      >
                        Discard Activity
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MergeRecoveryTab;
