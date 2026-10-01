import { useEffect, useState } from "react";
import type {
  GetUserRestrictionsResponse,
  StoredRestriction,
} from "@peek/shared-types";
import { apiDelete, apiGet, apiPut, getErrorMessage } from "../../api";
import {
  Button,
  ConfirmDialog,
  ErrorMessage,
  Modal,
  SearchableSelect,
} from "../ui/index";

interface UserData {
  id: number;
  username: string;
}

interface Props {
  user: UserData;
  onClose: () => void;
  onSave?: () => void;
}

type RestrictionMode = "INCLUDE" | "EXCLUDE";
type EntityType = "groups" | "tags" | "studios" | "galleries";

const ENTITY_TYPES: EntityType[] = ["groups", "tags", "studios", "galleries"];

/** One restrictable type: its two lists and its "no X" box. */
interface TypeState {
  include: string[];
  exclude: string[];
  restrictEmpty: boolean;
  /** True once a stored row or the admin has set the box; otherwise it follows the Show-only list. */
  restrictEmptyTouched: boolean;
  /**
   * A stored Show-only list with no items (every item was on a deleted
   * server): it still hides the whole type, so Save waits until the admin
   * adds items or removes the list.
   */
  includeEmptied: boolean;
}

const emptyTypeState = (): TypeState => ({
  include: [],
  exclude: [],
  restrictEmpty: false,
  restrictEmptyTouched: false,
  includeEmptied: false,
});

const emptyState = (): Record<EntityType, TypeState> => ({
  groups: emptyTypeState(),
  tags: emptyTypeState(),
  studios: emptyTypeState(),
  galleries: emptyTypeState(),
});

const LABELS: Record<EntityType, string> = {
  groups: "Collections",
  tags: "Tags",
  studios: "Studios",
  galleries: "Galleries",
};

const DESCRIPTIONS: Record<EntityType, string> = {
  groups:
    "Most reliable for content organization as groups are typically static and manually curated.",
  tags: "May change frequently if using Stash plugins. Use with caution for dynamic tagging systems.",
  studios: "Useful for limiting content by production company or studio name.",
  galleries: "Restrict access to specific gallery content.",
};

function isEntityType(value: string): value is EntityType {
  return (ENTITY_TYPES as string[]).includes(value);
}

/** Thrown for a stored list the server could not read */
class UnreadableRestrictionError extends Error {}

/**
 * A stored row's ids. A list the server could not read throws: read as
 * empty, a save would delete it, and a lost Show-only list shows the user
 * everything.
 */
function storedIds(row: StoredRestriction, entityType: EntityType): string[] {
  if (row.unreadable || row.entityIds === null) {
    const list = row.mode === "INCLUDE" ? "Show only" : "Always hide";
    throw new UnreadableRestrictionError(
      `The stored ${LABELS[entityType]} ${list} list could not be read.`
    );
  }
  return row.entityIds;
}

/** A type whose stored Show-only list was emptied and still has no items */
function blocksSave(state: TypeState): boolean {
  return state.includeEmptied && state.include.length === 0;
}

/** The box value the compute will see: the stored or hand-set value, else on with a Show-only list. */
function effectiveRestrictEmpty(state: TypeState): boolean {
  return state.restrictEmptyTouched
    ? state.restrictEmpty
    : state.include.length > 0;
}

/**
 * Content Restrictions Modal
 *
 * Lets admins edit, per type (Collections, Tags, Studios, Galleries), a
 * "Show only" list and an "Always hide" list plus the "Also hide items with
 * no X" box. Saves one row per non-empty list; the box value goes on both.
 */
const ContentRestrictionsModal = ({ user, onClose, onSave }: Props) => {
  const [loading, setLoading] = useState(true);
  // Set while the stored restrictions have not loaded: the editor is hidden
  // and Save is off, since saving replaces every stored row (CS-11)
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Set when a stored list could not be read: the admin may clear them all
  const [unreadable, setUnreadable] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restrictions, setRestrictions] =
    useState<Record<EntityType, TypeState>>(emptyState);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        setUnreadable(false);
        const data = await apiGet<Partial<GetUserRestrictionsResponse>>(
          `/user/${user.id}/restrictions`
        );
        const next = emptyState();
        for (const row of data.restrictions ?? []) {
          if (!isEntityType(row.entityType)) continue;
          const state = next[row.entityType];
          if (row.mode === "INCLUDE") {
            state.include = storedIds(row, row.entityType);
            state.includeEmptied = state.include.length === 0;
          } else if (row.mode === "EXCLUDE") {
            state.exclude = storedIds(row, row.entityType);
          } else {
            continue;
          }
          // One setting per type: the OR of its rows, and stored means set
          state.restrictEmpty = state.restrictEmpty || row.restrictEmpty;
          state.restrictEmptyTouched = true;
        }
        if (!cancelled) setRestrictions(next);
      } catch (err) {
        if (cancelled) return;
        setLoadError(getErrorMessage(err));
        setUnreadable(err instanceof UnreadableRestrictionError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user.id, loadAttempt]);

  const loaded = !loading && loadError === null;
  const saveBlocked = ENTITY_TYPES.some((t) => blocksSave(restrictions[t]));

  const setList = (
    entityType: EntityType,
    list: "include" | "exclude",
    ids: string[]
  ) => {
    setRestrictions((prev) => ({
      ...prev,
      [entityType]: { ...prev[entityType], [list]: ids },
    }));
  };

  const setRestrictEmpty = (entityType: EntityType, checked: boolean) => {
    setRestrictions((prev) => ({
      ...prev,
      [entityType]: {
        ...prev[entityType],
        restrictEmpty: checked,
        restrictEmptyTouched: true,
      },
    }));
  };

  const removeEmptiedInclude = (entityType: EntityType) => {
    setRestrictions((prev) => ({
      ...prev,
      [entityType]: { ...prev[entityType], includeEmptied: false },
    }));
  };

  /** Deletes every stored list (the unreadable one too), then reloads */
  const handleClearAll = async () => {
    setConfirmingClear(false);
    try {
      setClearing(true);
      setClearError(null);
      await apiDelete(`/user/${user.id}/restrictions`);
      setLoadAttempt((n) => n + 1);
    } catch (err) {
      setClearError(getErrorMessage(err, "Failed to clear restrictions"));
    } finally {
      setClearing(false);
    }
  };

  const handleSave = async () => {
    if (!loaded || saveBlocked) return;
    try {
      setSaving(true);
      setSaveError(null);

      const restrictionsToSave = ENTITY_TYPES.flatMap((entityType) => {
        const state = restrictions[entityType];
        const restrictEmpty = effectiveRestrictEmpty(state);
        const rows: Array<{
          entityType: EntityType;
          mode: RestrictionMode;
          entityIds: string[];
          restrictEmpty: boolean;
        }> = [];
        if (state.include.length > 0) {
          rows.push({
            entityType,
            mode: "INCLUDE",
            entityIds: state.include,
            restrictEmpty,
          });
        }
        if (state.exclude.length > 0) {
          rows.push({
            entityType,
            mode: "EXCLUDE",
            entityIds: state.exclude,
            restrictEmpty,
          });
        }
        return rows;
      });

      await apiPut(`/user/${user.id}/restrictions`, {
        restrictions: restrictionsToSave,
      });

      onSave?.();
      onClose();
    } catch (err) {
      setSaveError(getErrorMessage(err, "Failed to save restrictions"));
    } finally {
      setSaving(false);
    }
  };

  const renderEntitySection = (entityType: EntityType) => {
    const state = restrictions[entityType];
    const label = LABELS[entityType];
    const lower = label.toLowerCase();
    const listsEmpty = state.include.length === 0 && state.exclude.length === 0;
    const overlap = state.include.filter((id) =>
      state.exclude.includes(id)
    ).length;

    return (
      <div
        key={entityType}
        className="p-4 rounded-lg"
        style={{
          backgroundColor: "var(--bg-secondary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div className="mb-3">
          <h4
            className="font-medium mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            {label}
          </h4>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {DESCRIPTIONS[entityType]}
          </p>
        </div>

        <div className="mb-3">
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Show only
          </label>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            If this list has items, the user sees only content with at least one
            of them. Child tags and studios count.
          </p>
          <SearchableSelect
            entityType={entityType}
            value={state.include}
            onChange={(ids) =>
              setList(entityType, "include", Array.isArray(ids) ? ids : [ids])
            }
            multi={true}
            placeholder={`Show only these ${lower}...`}
            scope="allEnabled"
          />
          {blocksSave(state) && (
            <div
              className="mt-2 p-2 rounded text-xs flex items-start justify-between gap-2"
              style={{
                backgroundColor: "var(--status-warning-bg)",
                border: "1px solid var(--status-warning-border)",
                color: "var(--status-warning)",
              }}
            >
              <p>
                Show only: nothing (every item was on a deleted server). This
                user sees no {lower} until you choose items or remove this list.
              </p>
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Remove the ${lower} Show-only list`}
                onClick={() => removeEmptiedInclude(entityType)}
              >
                Remove list
              </Button>
            </div>
          )}
        </div>

        <div className="mb-3">
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Always hide
          </label>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            Hidden even if it is also in Show only. Children are hidden too.
          </p>
          <SearchableSelect
            entityType={entityType}
            value={state.exclude}
            onChange={(ids) =>
              setList(entityType, "exclude", Array.isArray(ids) ? ids : [ids])
            }
            multi={true}
            placeholder={`Always hide these ${lower}...`}
            scope="allEnabled"
          />
        </div>

        <label
          className={`flex items-start gap-2 ${listsEmpty ? "opacity-60" : "cursor-pointer"}`}
        >
          <input
            type="checkbox"
            aria-label={`Also hide items with no ${lower}`}
            checked={effectiveRestrictEmpty(state)}
            disabled={listsEmpty}
            onChange={(e) => setRestrictEmpty(entityType, e.target.checked)}
            className="w-4 h-4 rounded mt-0.5"
            style={{ accentColor: "var(--accent-primary)" }}
          />
          <div className="flex-1">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Also hide items with no {lower}
            </span>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Hides scenes, galleries and images that have no {lower} at all.
              Starts ticked with a Show-only list and unticked with only an
              Always-hide list.
            </p>
          </div>
        </label>

        {overlap > 0 && (
          <p
            className="text-xs mt-2"
            style={{ color: "var(--status-warning)" }}
          >
            {overlap} {overlap === 1 ? "item is" : "items are"} in both lists:
            Always hide wins.
          </p>
        )}
      </div>
    );
  };

  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        title="Content Restrictions"
        size="lg"
        dismissible={!saving}
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Configure content visibility for {user.username}
          </p>

          <div
            className="p-4 rounded-lg text-sm"
            style={{
              backgroundColor: "var(--status-info-bg)",
              border: "1px solid var(--status-info-border)",
              color: "var(--text-secondary)",
            }}
          >
            <p
              className="mb-2 font-medium"
              style={{ color: "var(--status-info)" }}
            >
              How Content Restrictions Work
            </p>
            <ul
              className="list-disc list-inside space-y-1 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <li>
                <strong>Show only:</strong> the user sees only content with at
                least one listed item.
              </li>
              <li>
                <strong>Always hide:</strong> listed items and their content are
                hidden.
              </li>
              <li>
                <strong>Always hide wins</strong> when the same item is listed
                twice.
              </li>
              <li>
                <strong>Child tags and studios</strong> are covered by their
                parent in either list; parents are not covered by a child.
              </li>
              <li>
                <strong>Also hide items with no X:</strong> hides content with
                none of that type. It starts ticked with a Show-only list and
                unticked with only an Always-hide list.
              </li>
              <li>
                <strong>Reach:</strong> restrictions apply to scenes, galleries,
                images and clip markers. Performers, studios, collections and
                tags with no visible content disappear too.
              </li>
              <li>
                <strong>Recommended:</strong> use Collections (Groups) as your
                primary filtering mechanism since they are the most reliable and
                static.
              </li>
              <li>
                <strong>Admin accounts:</strong> Administrators are never
                restricted; this editor is not shown for admin accounts.
              </li>
            </ul>
          </div>

          {loading && (
            <div className="p-6 text-center">
              <div
                className="animate-spin w-8 h-8 border-4 border-t-transparent rounded-full mx-auto mb-2"
                style={{
                  borderColor: "var(--status-info-border)",
                  borderTopColor: "transparent",
                }}
              ></div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Loading restrictions...
              </p>
            </div>
          )}

          {loadError && (
            <div className="space-y-2">
              <ErrorMessage
                title="Failed to load restrictions"
                error={loadError}
                onRetry={() => setLoadAttempt((n) => n + 1)}
              />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Nothing can be saved until {user.username}&apos;s restrictions
                load.
              </p>
              {unreadable && (
                <div className="space-y-2">
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    A stored list that cannot be read cannot be edited. Clear
                    all of {user.username}&apos;s restrictions to start again.
                  </p>
                  <Button
                    variant="destructive"
                    size="sm"
                    loading={clearing}
                    disabled={clearing}
                    onClick={() => setConfirmingClear(true)}
                  >
                    Clear all restrictions
                  </Button>
                  {clearError && (
                    <p
                      className="text-xs"
                      style={{ color: "var(--status-error)" }}
                    >
                      {clearError}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {saveError && (
            <div
              className="p-3 rounded-lg text-sm"
              style={{
                backgroundColor: "var(--status-error-bg)",
                color: "var(--status-error)",
              }}
            >
              {saveError}
            </div>
          )}

          {loaded && (
            <div className="space-y-4">
              <div
                className="p-3 rounded-lg"
                style={{
                  backgroundColor: "var(--status-success-bg)",
                  border: "2px solid var(--status-success-border)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--status-success-bg)",
                      color: "var(--status-success)",
                    }}
                  >
                    RECOMMENDED
                  </span>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Collections are the most reliable organizational unit for
                    content restrictions
                  </p>
                </div>
                {renderEntitySection("groups")}
              </div>

              {renderEntitySection("tags")}
              {renderEntitySection("studios")}
              {renderEntitySection("galleries")}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              onClick={() => void handleSave()}
              disabled={saving || !loaded || saveBlocked}
              variant="primary"
              fullWidth
              loading={saving}
            >
              Save Restrictions
            </Button>
            <Button onClick={onClose} disabled={saving} variant="secondary">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        isOpen={confirmingClear}
        title="Clear all restrictions?"
        message={`Every Show-only and Always-hide list of ${user.username} is deleted, the unreadable one too. ${user.username} then sees everything on their servers except what they hid, until you set new restrictions.`}
        confirmText="Clear all restrictions"
        onConfirm={() => void handleClearAll()}
        onClose={() => setConfirmingClear(false)}
      />
    </>
  );
};

export default ContentRestrictionsModal;
