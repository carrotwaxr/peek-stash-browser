import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { getMyGroups, getPlaylistShares, updatePlaylistShares } from "../../services/api.js";
import { showError, showSuccess } from "../../utils/toast.jsx";
import { Button, Paper } from "../ui/index.js";

const SharePlaylistModal = ({ playlistId, playlistName, isOpen, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState(new Set());

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, playlistId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [groupsResult, sharesResult] = await Promise.all([
        getMyGroups(),
        getPlaylistShares(playlistId),
      ]);

      setUserGroups(groupsResult.groups || []);
      setSelectedGroupIds(new Set(sharesResult.shares.map((s) => s.groupId)));
    } catch (error) {
      console.error("Error loading share data:", error);
      showError("Failed to load sharing options");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleGroup = (groupId) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updatePlaylistShares(playlistId, Array.from(selectedGroupIds));
      showSuccess(
        selectedGroupIds.size > 0
          ? "Playlist sharing updated"
          : "Playlist is no longer shared"
      );
      onClose();
    } catch (error) {
      console.error("Error updating shares:", error);
      const message = error.data?.error || "Failed to update sharing";
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <Paper
        className="max-w-md w-full m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header
          title={
            <div className="flex items-center gap-2">
              <Share2 size={20} />
              <span>Share Playlist</span>
            </div>
          }
        />
        <Paper.Body>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : userGroups.length === 0 ? (
            <div className="text-center py-8">
              <p style={{ color: "var(--text-secondary)" }}>
                You are not a member of any groups.
              </p>
              <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
                Ask an admin to add you to a group to enable sharing.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-4" style={{ color: "var(--text-secondary)" }}>
                Share "{playlistName}" with:
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {userGroups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                    style={{
                      backgroundColor: selectedGroupIds.has(group.id)
                        ? "rgba(59, 130, 246, 0.1)"
                        : "var(--bg-secondary)",
                      border: selectedGroupIds.has(group.id)
                        ? "1px solid rgba(59, 130, 246, 0.3)"
                        : "1px solid var(--border-color)",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.has(group.id)}
                      onChange={() => handleToggleGroup(group.id)}
                      className="w-4 h-4 rounded"
                    />
                    <span style={{ color: "var(--text-primary)" }}>
                      {group.name}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-3 justify-end mt-6">
            <Button onClick={onClose} variant="secondary">
              Cancel
            </Button>
            {userGroups.length > 0 && (
              <Button
                onClick={handleSave}
                variant="primary"
                disabled={saving}
                loading={saving}
              >
                {saving ? "Saving..." : "Save"}
              </Button>
            )}
          </div>
        </Paper.Body>
      </Paper>
    </div>
  );
};

export default SharePlaylistModal;
