import { useState } from "react";
import type {
  SyncFromStashBody,
  SyncFromStashOptions,
  SyncFromStashResponse,
  SyncTypeStats,
} from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../../api";
import { invalidateLibraryQueries } from "../../api/hooks/useLibraryReady";
import { useAuth } from "../../hooks/useAuth";
import { Button, Modal, StatusMessage } from "../ui/index";

interface UserData {
  id: number;
  username: string;
}

interface Props {
  user: UserData;
  onClose: () => void;
  /** `partial`: some Stash servers failed while the others imported */
  onSyncComplete: (
    username: string,
    outcome: { partial: boolean; failedInstances: string[] }
  ) => void;
}

const SyncFromStashModal = ({ user, onClose, onSyncComplete }: Props) => {
  const { user: signedIn } = useAuth();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncFromStashResponse | null>(
    null
  );
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncOptions, setSyncOptions] = useState<SyncFromStashOptions>({
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

  const toggleSyncOption = <K extends keyof SyncFromStashOptions>(
    entityType: K,
    field: keyof SyncFromStashOptions[K]
  ) => {
    setSyncOptions((prev) => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        [field]: !prev[entityType][field],
      },
    }));
  };

  const syncFromStash = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);

    try {
      const body: SyncFromStashBody = { options: syncOptions };
      const data = await apiPost<SyncFromStashResponse>(
        `/user/${user.id}/sync-from-stash`,
        body
      );
      setSyncResult(data);
      // An admin who imports into their own account changed the ratings and
      // favorites every open list and detail shows
      if (signedIn?.id === user.id) void invalidateLibraryQueries(queryClient);
      onSyncComplete(user.username, {
        partial: !data.success,
        failedInstances: data.failedInstances.map((f) => f.name || f.id),
      });
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
    <Modal
      isOpen
      onClose={handleClose}
      title="Sync from Stash"
      dismissible={!syncing}
    >
      <div className="space-y-4">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Import ratings, favorites, O counts, plays, watch time and resume
          points for {user.username}
        </p>

        {/* Info Message */}
        <StatusMessage variant="info" title={null} className="text-sm">
          <p className="mb-2">
            Select which data to import from Stash. Only fields that exist in
            Stash are shown.
          </p>
          <ul
            className="list-disc list-inside space-y-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <li>
              Only imports items that have the selected fields set in Stash
            </li>
            <li>
              A rating in Stash replaces the rating in Peek; a favorite in Stash
              is added, and never removes one from Peek
            </li>
            <li>
              O counts and play counts come with their dates. Dates Peek already
              holds are kept, and a date Stash got from Peek is not counted
              twice
            </li>
            <li>
              Plays also bring watch time (the larger of Peek&apos;s and
              Stash&apos;s) and a resume point for scenes without one in Peek
            </li>
            <li>May take several minutes for large libraries</li>
          </ul>
        </StatusMessage>

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
              backgroundColor:
                "color-mix(in srgb, var(--status-info) 5%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--status-info) 20%, transparent)",
            }}
          >
            <div className="flex flex-col items-center gap-4">
              <div
                className="animate-spin w-12 h-12 border-4 border-t-transparent rounded-full"
                style={{
                  borderColor: "var(--status-info-border)",
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

        {/* Result: the counts of what imported, with a warning when a server failed */}
        {syncResult && !syncing && (
          <StatusMessage
            variant={syncResult.success ? "success" : "warning"}
            title={null}
          >
            <p
              className="font-medium mb-3"
              style={{
                color: syncResult.success
                  ? "var(--status-success)"
                  : "var(--status-warning)",
              }}
            >
              {syncResult.success
                ? "Sync Completed Successfully"
                : `Partly imported: ${syncResult.failedInstances.map((f) => f.name || f.id).join(", ")} failed, so only the other servers' data came in. Run the sync again once it is back.`}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <SyncResultItem label="Scenes" stats={syncResult.stats.scenes} />
              <SyncResultItem
                label="Performers"
                stats={syncResult.stats.performers}
              />
              <SyncResultItem
                label="Studios"
                stats={syncResult.stats.studios}
              />
              <SyncResultItem label="Tags" stats={syncResult.stats.tags} />
              <SyncResultItem
                label="Galleries"
                stats={syncResult.stats.galleries}
              />
              <SyncResultItem label="Groups" stats={syncResult.stats.groups} />
              <SyncResultItem label="Images" stats={syncResult.stats.images} />
            </div>
          </StatusMessage>
        )}

        {/* Error State */}
        {syncError && (
          <StatusMessage
            variant="error"
            title={null}
            className="text-sm"
            message={syncError}
          />
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
    </Modal>
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
  stats: SyncTypeStats | null;
}

const SyncResultItem = ({ label, stats }: SyncResultItemProps) => {
  if (!stats) return null;
  return (
    <div>
      <p className="font-medium mb-1" style={{ color: "var(--text-primary)" }}>
        {label}
      </p>
      <p style={{ color: "var(--text-secondary)" }}>
        {stats.checked.toLocaleString()} checked
        <br />
        {stats.created} new
        <br />
        {stats.updated} updated
      </p>
    </div>
  );
};

export default SyncFromStashModal;
