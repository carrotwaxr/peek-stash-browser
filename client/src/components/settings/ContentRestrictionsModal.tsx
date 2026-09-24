import { useEffect, useState } from "react";
import { apiGet, apiPut } from "../../api";
import { Button, Paper, SearchableSelect } from "../ui/index";

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
}

interface StoredRestriction {
  entityType: EntityType;
  mode: RestrictionMode;
  entityIds: string;
  restrictEmpty: boolean;
}

const emptyTypeState = (): TypeState => ({
  include: [],
  exclude: [],
  restrictEmpty: false,
  restrictEmptyTouched: false,
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

function parseStoredIds(entityIds: string): string[] {
  try {
    const parsed: unknown = JSON.parse(entityIds);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restrictions, setRestrictions] =
    useState<Record<EntityType, TypeState>>(emptyState);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiGet<{ restrictions: StoredRestriction[] }>(
          `/user/${user.id}/restrictions`
        );
        const next = emptyState();
        for (const row of data.restrictions || []) {
          const state = next[row.entityType];
          if (!state) continue;
          if (row.mode === "INCLUDE") {
            state.include = parseStoredIds(row.entityIds);
          } else if (row.mode === "EXCLUDE") {
            state.exclude = parseStoredIds(row.entityIds);
          } else {
            continue;
          }
          // One setting per type: the OR of its rows, and stored means set
          state.restrictEmpty = state.restrictEmpty || row.restrictEmpty;
          state.restrictEmptyTouched = true;
        }
        if (!cancelled) setRestrictions(next);
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message || "Failed to load restrictions");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

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

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

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
      setError((err as Error).message || "Failed to save restrictions");
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
          />
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
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={() => !saving && onClose()}
    >
      <Paper
        className="max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <Paper.Header>
          <Paper.Title>Content Restrictions</Paper.Title>
          <Paper.Subtitle className="mt-1">
            Configure content visibility for {user.username}
          </Paper.Subtitle>
        </Paper.Header>

        <Paper.Body>
          <div className="space-y-4">
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
                  <strong>Always hide:</strong> listed items and their content
                  are hidden.
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
                  <strong>Reach:</strong> restrictions apply to scenes,
                  galleries, images and clip markers. Performers, studios,
                  collections and tags with no visible content disappear too.
                </li>
                <li>
                  <strong>Recommended:</strong> use Collections (Groups) as your
                  primary filtering mechanism since they are the most reliable
                  and static.
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
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Loading restrictions...
                </p>
              </div>
            )}

            {error && (
              <div
                className="p-3 rounded-lg text-sm"
                style={{
                  backgroundColor: "var(--status-error-bg)",
                  color: "var(--status-error)",
                }}
              >
                {error}
              </div>
            )}

            {!loading && (
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
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
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
                disabled={saving || loading}
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
        </Paper.Body>
      </Paper>
    </div>
  );
};

export default ContentRestrictionsModal;
