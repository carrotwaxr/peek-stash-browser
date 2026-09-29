import { useState } from "react";
import { apiPost } from "../../api";
import { Button, Paper } from "../ui/index";

interface UserData {
  id: number;
  username: string;
}

interface SyncEntityStats {
  checked?: number;
  created?: number;
  updated?: number;
}

interface SyncStats {
  scenes: SyncEntityStats | null;
  performers: SyncEntityStats | null;
  studios: SyncEntityStats | null;
  tags: SyncEntityStats | null;
  galleries: SyncEntityStats | null;
  groups: SyncEntityStats | null;
  images: SyncEntityStats | null;
}

interface SyncOptions {
  scenes: {
    rating: boolean;
    favorite?: boolean;
    oCounter: boolean;
    playCount: boolean;
  };
  performers: { rating: boolean; favorite: boolean };
  studios: { rating: boolean; favorite: boolean };
  tags: { rating: boolean; favorite: boolean };
  galleries: { rating: boolean };
  groups: { rating: boolean };
  images: { rating: boolean };
}

interface Props {
  user: UserData;
  onClose: () => void;
  onSyncComplete: (username: string) => void;
}

const SyncFromStashModal = ({ user, onClose, onSyncComplete }: Props) => {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncStats | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncOptions, setSyncOptions] = useState<SyncOptions>({
    scenes: {
      rating: true,
      favorite: false,
      oCounter: false,
      playCount: false,
    },
    performers: { rating: true, favorite: true },
    studios: { rating: true, favorite: true },
    tags: { rating: false, favorite: true },
    galleries: { rating: true },
    groups: { rating: true },
    images: { rating: true },
  });

  const toggleSyncOption = (entityType: keyof SyncOptions, field: string) => {
    setSyncOptions((prev) => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        [field]: !(prev[entityType] as Record<string, boolean>)[field],
      },
    }));
  };

  const syncFromStash = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const data = await apiPost<{ stats: SyncStats }>(
        `/user/${user.id}/sync-from-stash`,
        {
          options: syncOptions,
        }
      );
      setSyncResult(data.stats);
      onSyncComplete(user.username);
    } catch (err) {
      setSyncError((err as Error).message || "Failed to sync from Stash");
    } finally {
      setSyncing(false);
    }
  };

  const handleClose = () => {
    if (!syncing) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <Paper
        className="max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header>
          <Paper.Title>Sync from Stash</Paper.Title>
          <Paper.Subtitle className="mt-1">
            Import ratings, favorites, O counts, plays, watch time and resume
            points for {user.username}
          </Paper.Subtitle>
        </Paper.Header>
        <Paper.Body>
          <div className="space-y-4">
            {/* Info Message */}
            <div
              className="p-4 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                color: "var(--text-secondary)",
              }}
            >
              <p className="mb-2">
                Select which data to import from Stash. Only fields that exist
                in Stash are shown.
              </p>
              <ul
                className="list-disc list-inside space-y-1 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <li>
                  Only imports items that have the selected fields set in Stash
                </li>
                <li>
                  A rating in Stash replaces the rating in Peek; a favorite in
                  Stash is added, and never removes one from Peek
                </li>
                <li>
                  O counts and play counts come with their dates. Dates Peek
                  already holds are kept, and a date Stash got from Peek is not
                  counted twice
                </li>
                <li>
                  Plays also bring watch time (the larger of Peek&apos;s and
                  Stash&apos;s) and a resume point for scenes without one in
                  Peek
                </li>
                <li>May take several minutes for large libraries</li>
              </ul>
            </div>

            {/* Sync Options */}
            {!syncing && !syncResult && (
              <div className="space-y-4">
                {/* Scenes */}
                <SyncOptionGroup title="Scenes">
                  <SyncCheckbox
                    label="Rating"
                    checked={syncOptions.scenes.rating}
                    onChange={() => toggleSyncOption("scenes", "rating")}
                  />
                  <SyncCheckbox
                    label="O counter and dates"
                    checked={syncOptions.scenes.oCounter}
                    onChange={() => toggleSyncOption("scenes", "oCounter")}
                  />
                  <SyncCheckbox
                    label="Plays, watch time and resume points"
                    checked={syncOptions.scenes.playCount}
                    onChange={() => toggleSyncOption("scenes", "playCount")}
                  />
                  <p
                    className="text-xs ml-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Scenes do not have favorites in Stash
                  </p>
                </SyncOptionGroup>

                {/* Performers */}
                <SyncOptionGroup title="Performers">
                  <SyncCheckbox
                    label="Rating"
                    checked={syncOptions.performers.rating}
                    onChange={() => toggleSyncOption("performers", "rating")}
                  />
                  <SyncCheckbox
                    label="Favorite"
                    checked={syncOptions.performers.favorite}
                    onChange={() => toggleSyncOption("performers", "favorite")}
                  />
                </SyncOptionGroup>

                {/* Studios */}
                <SyncOptionGroup title="Studios">
                  <SyncCheckbox
                    label="Rating"
                    checked={syncOptions.studios.rating}
                    onChange={() => toggleSyncOption("studios", "rating")}
                  />
                  <SyncCheckbox
                    label="Favorite"
                    checked={syncOptions.studios.favorite}
                    onChange={() => toggleSyncOption("studios", "favorite")}
                  />
                </SyncOptionGroup>

                {/* Tags */}
                <SyncOptionGroup title="Tags">
                  <SyncCheckbox
                    label="Favorite"
                    checked={syncOptions.tags.favorite}
                    onChange={() => toggleSyncOption("tags", "favorite")}
                  />
                  <p
                    className="text-xs ml-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Tags do not have ratings in Stash
                  </p>
                </SyncOptionGroup>

                {/* Galleries */}
                <SyncOptionGroup title="Galleries">
                  <SyncCheckbox
                    label="Rating"
                    checked={syncOptions.galleries.rating}
                    onChange={() => toggleSyncOption("galleries", "rating")}
                  />
                  <p
                    className="text-xs ml-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Galleries do not have favorites in Stash
                  </p>
                </SyncOptionGroup>

                {/* Groups */}
                <SyncOptionGroup title="Groups (Collections)">
                  <SyncCheckbox
                    label="Rating"
                    checked={syncOptions.groups.rating}
                    onChange={() => toggleSyncOption("groups", "rating")}
                  />
                  <p
                    className="text-xs ml-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Groups do not have favorites in Stash
                  </p>
                </SyncOptionGroup>

                {/* Images */}
                <SyncOptionGroup title="Images">
                  <SyncCheckbox
                    label="Rating"
                    checked={syncOptions.images.rating}
                    onChange={() => toggleSyncOption("images", "rating")}
                  />
                  <p
                    className="text-xs ml-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Images do not have favorites in Stash
                  </p>
                </SyncOptionGroup>
              </div>
            )}

            {/* Loading State */}
            {syncing && (
              <div
                className="p-6 rounded-lg text-center"
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.05)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                }}
              >
                <div className="flex flex-col items-center gap-4">
                  <div
                    className="animate-spin w-12 h-12 border-4 border-t-transparent rounded-full"
                    style={{
                      borderColor: "rgba(59, 130, 246, 0.3)",
                      borderTopColor: "transparent",
                    }}
                  ></div>
                  <div>
                    <p
                      className="font-medium mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Syncing from Stash...
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      This may take several minutes. Please wait.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Success Result */}
            {syncResult && !syncing && (
              <div
                className="p-4 rounded-lg"
                style={{
                  backgroundColor: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                }}
              >
                <p
                  className="font-medium mb-3"
                  style={{ color: "rgb(34, 197, 94)" }}
                >
                  Sync Completed Successfully
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <SyncResultItem label="Scenes" stats={syncResult.scenes} />
                  <SyncResultItem
                    label="Performers"
                    stats={syncResult.performers}
                  />
                  <SyncResultItem label="Studios" stats={syncResult.studios} />
                  <SyncResultItem label="Tags" stats={syncResult.tags} />
                  <SyncResultItem
                    label="Galleries"
                    stats={syncResult.galleries}
                  />
                  <SyncResultItem label="Groups" stats={syncResult.groups} />
                  <SyncResultItem label="Images" stats={syncResult.images} />
                </div>
              </div>
            )}

            {/* Error State */}
            {syncError && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  color: "rgb(239, 68, 68)",
                }}
              >
                {syncError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              {!syncing && !syncResult && (
                <>
                  <Button
                    onClick={() => void syncFromStash()}
                    variant="primary"
                    fullWidth
                  >
                    Start Sync
                  </Button>
                  <Button onClick={handleClose} variant="secondary">
                    Cancel
                  </Button>
                </>
              )}
              {syncResult && (
                <Button onClick={handleClose} variant="primary" fullWidth>
                  Close
                </Button>
              )}
            </div>
          </div>
        </Paper.Body>
      </Paper>
    </div>
  );
};

// Helper components
interface SyncOptionGroupProps {
  title: string;
  children: React.ReactNode;
}

const SyncOptionGroup = ({ title, children }: SyncOptionGroupProps) => (
  <div
    className="p-4 rounded-lg"
    style={{
      backgroundColor: "var(--bg-secondary)",
      border: "1px solid var(--border-color)",
    }}
  >
    <h4 className="font-medium mb-3" style={{ color: "var(--text-primary)" }}>
      {title}
    </h4>
    <div className="space-y-2">{children}</div>
  </div>
);

interface SyncCheckboxProps {
  label: string;
  checked: boolean;
  onChange: () => void;
}

const SyncCheckbox = ({ label, checked, onChange }: SyncCheckboxProps) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className="w-4 h-4 rounded cursor-pointer"
      style={{ accentColor: "var(--primary-color)" }}
    />
    <span style={{ color: "var(--text-primary)" }}>{label}</span>
  </label>
);

interface SyncResultItemProps {
  label: string;
  stats: { checked?: number; created?: number; updated?: number } | null;
}

const SyncResultItem = ({ label, stats }: SyncResultItemProps) => {
  if (!stats) return null;
  return (
    <div>
      <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
        {label}
      </p>
      <p style={{ color: "var(--text-secondary)" }}>
        {stats.checked?.toLocaleString() || 0} checked
        <br />
        {stats.created || 0} new
        <br />
        {stats.updated || 0} updated
      </p>
    </div>
  );
};

export default SyncFromStashModal;
