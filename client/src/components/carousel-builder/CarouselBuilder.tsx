import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { type PreviewCarouselResponse, isWhereGroup } from "@peek/shared-types";
import { AlertCircle, ArrowLeft, Eye, Loader2, Save } from "lucide-react";
import { libraryApi } from "../../api";
import { useSaveCarousel } from "../../api/hooks/useCarousels";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import {
  CAROUSEL_FIELDS,
  carouselBody,
  carouselEditTree,
} from "../../utils/filterConfig";
import {
  type EditTree,
  type PanelTable,
  countRows,
  overLimit,
  panelTableOf,
  panelTreeOf,
  stateOf,
} from "../../utils/filterFields";
import { sortOptionsFor } from "../../utils/listQuery";
import FilterRowsEditor from "../filter-rows/FilterRowsEditor";
import { Button, StatusMessage } from "../ui/index";
import CarouselPreview from "./CarouselPreview";
import IconPickerButton from "./IconPickerButton";
import { getCarouselIcon } from "./carouselIcons";

/** Why a sort the rules no longer allow is replaced, by the sort's value */
const SORT_NEEDS: Readonly<Record<string, string>> = {
  playlist_position: "Playlist order needs one playlist rule",
  scene_index: "Scene Number needs a collection rule",
};

/** The scene rows a carousel offers */
const CAROUSEL_TABLE: PanelTable = {
  ...panelTableOf("scene"),
  rows: CAROUSEL_FIELDS,
};

/** Why a locked carousel's rules show read-only */
const LOCKED_NOTE =
  "These rules were saved by an older version and pick fixed scenes; they can't be edited here";

/** Where the builder goes back to: the carousel list, under Settings, User Preferences, Navigation */
const SETTINGS = "/settings?section=user&tab=navigation";

/** What a save sends, as compared for unsaved changes */
interface Draft {
  readonly title: string;
  readonly icon: string;
  readonly rules: string;
  readonly sort: string;
  readonly direction: string;
}

const NEW_CAROUSEL = {
  title: "",
  icon: "Film",
  sort: "random",
  direction: "DESC",
} as const;

/**
 * CarouselBuilder Component
 * Full-page editor for creating and editing custom carousels: rules in the
 * row editor (root rows and "Match any" or "Match all" groups, stored as a
 * where tree), a preview, and a save.
 */
const CarouselBuilder = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const saveCarousel = useSaveCarousel();
  const { confirm, dialog } = useConfirmDialog();

  // Form state
  const [title, setTitle] = useState<string>(NEW_CAROUSEL.title);
  const [icon, setIcon] = useState<string>(NEW_CAROUSEL.icon);
  // The rules as an editing tree, with the stored leaves no row can edit as
  // kept rows in their containers
  const [tree, setTree] = useState<EditTree>(() =>
    carouselEditTree({ rules: { match: "all", rules: [] } })
  );
  const [sort, setSort] = useState<string>(NEW_CAROUSEL.sort);
  const [direction, setDirection] = useState<string>(NEW_CAROUSEL.direction);
  // The stored rules pick fixed scenes no row can hold: they show read-only,
  // a save sends none (the server keeps them) and needs no preview
  const [rulesLocked, setRulesLocked] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewScenes, setPreviewScenes] = useState<
    PreviewCarouselResponse["scenes"] | null
  >(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewValid, setPreviewValid] = useState(false);

  // The rules a preview and a save send
  const body = carouselBody(tree);
  const ruleCount = countRows(tree, "scene");
  // Over the limits, as the Advanced view refuses them: the editor's rows
  // (a container past 20 would lose rows silently) and the groups sent
  const refused = overLimit(ruleCount, body.rules.filter(isWhereGroup).length);

  // A sort the rules do not offer (its rule was removed, or it sits in a
  // group or under "Match any") reads as Random
  const sortOptions = sortOptionsFor(
    "scene",
    stateOf("scene", panelTreeOf(tree).tree)
  );
  const effectiveSort = sortOptions.some((option) => option.value === sort)
    ? sort
    : "random";

  // What the carousel was when loaded (or a new one), for unsaved changes
  const draft: Draft = {
    title: title.trim(),
    icon,
    rules: JSON.stringify(body),
    sort: effectiveSort,
    direction,
  };
  const [base, setBase] = useState<Draft | null>(() =>
    isEditing ? null : draft
  );
  const dirty =
    base !== null &&
    (Object.keys(draft) as (keyof Draft)[]).some(
      (key) => draft[key] !== base[key]
    );

  // Load existing carousel if editing
  useEffect(() => {
    if (!isEditing || !id) return;

    const loadCarousel = async () => {
      setLoading(true);
      try {
        const { carousel } = await libraryApi.getCarousel(id);
        const loaded = carouselEditTree(carousel);
        setTitle(carousel.title);
        setIcon(carousel.icon);
        setSort(carousel.sort);
        setDirection(carousel.direction);
        setTree(loaded);
        setRulesLocked(carousel.rulesLocked);
        // The stored sort as the rules offer it, as the draft reads it
        const offered = sortOptionsFor(
          "scene",
          stateOf("scene", panelTreeOf(loaded).tree)
        ).some((option) => option.value === carousel.sort);
        setBase({
          title: carousel.title.trim(),
          icon: carousel.icon,
          rules: JSON.stringify(carouselBody(loaded)),
          sort: offered ? carousel.sort : "random",
          direction: carousel.direction,
        });
      } catch (err) {
        setError((err as Error).message || "Failed to load carousel");
      } finally {
        setLoading(false);
      }
    };

    void loadCarousel();
  }, [id, isEditing]);

  /** A rule changed: the preview is stale */
  const changeTree = (next: EditTree) => {
    setTree(next);
    setPreviewValid(false);
    setPreviewScenes(null);
  };

  /** Back to Settings; with unsaved changes, only once the user agrees */
  const handleBack = async () => {
    if (dirty) {
      const discard = await confirm({
        title: "Discard changes?",
        message: "Your changes to this carousel are not saved.",
        confirmText: "Discard",
        cancelText: "Keep editing",
        confirmStyle: "danger",
      });
      if (!discard) return;
    }
    void navigate(SETTINGS);
  };

  /**
   * Preview the carousel results
   */
  const handlePreview = async () => {
    if (ruleCount === 0) {
      setPreviewError("Add at least one rule to preview");
      return;
    }
    if (refused !== null) {
      setPreviewError(refused);
      return;
    }

    setPreviewing(true);
    setPreviewError(null);

    try {
      const result = await libraryApi.previewCarousel({
        rules: body,
        sort: effectiveSort,
        direction,
      });

      setPreviewScenes(result.scenes);
      setPreviewValid(true);
      setPreviewError(null);
    } catch (err) {
      setPreviewError((err as Error).message || "Failed to preview carousel");
      setPreviewValid(false);
    } finally {
      setPreviewing(false);
    }
  };

  /**
   * Save the carousel
   */
  const handleSave = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    if (!rulesLocked && ruleCount === 0) {
      setError("Add at least one rule");
      return;
    }

    if (!rulesLocked && refused !== null) {
      setError(refused);
      return;
    }

    if (!rulesLocked && !previewValid) {
      setError("Preview must succeed before saving");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const parts = {
        title: title.trim(),
        icon,
        sort: effectiveSort,
        direction,
      };

      // Home's list and every carousel's scenes are asked for again. A
      // locked carousel sends no rules: the server keeps the stored ones
      await saveCarousel.mutateAsync(
        id
          ? { id, data: rulesLocked ? parts : { ...parts, rules: body } }
          : { data: { ...parts, rules: body } }
      );

      // Saved: nothing is unsaved any more
      setBase(draft);
      void navigate(SETTINGS);
    } catch (err) {
      setError((err as Error).message || "Failed to save carousel");
    } finally {
      setSaving(false);
    }
  };

  const IconComponent = getCarouselIcon(icon);
  const canSave =
    title.trim() &&
    (rulesLocked || (ruleCount > 0 && refused === null && previewValid));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--accent-primary)" }}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b px-4 py-3"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
        }}
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => void handleBack()}
              icon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </Button>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {isEditing ? "Edit Carousel" : "Create Carousel"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {!rulesLocked && (
              <Button
                variant="secondary"
                onClick={() => void handlePreview()}
                disabled={previewing || ruleCount === 0 || refused !== null}
                icon={
                  previewing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )
                }
              >
                Preview
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
              icon={
                saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )
              }
            >
              {isEditing ? "Update" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Error Banner */}
        {error && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg border"
            style={{
              backgroundColor: "var(--status-error-bg)",
              borderColor: "var(--status-error)",
              color: "var(--status-error)",
            }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Title & Icon */}
        <div
          className="rounded-lg border p-4 space-y-4"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            Carousel Details
          </h2>

          <div className="flex items-start gap-4">
            {/* Icon */}
            <div
              className="flex-shrink-0 w-14 h-14 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <IconComponent
                className="w-7 h-7"
                style={{ color: "var(--accent-primary)" }}
              />
            </div>

            {/* Title Input */}
            <div className="flex-1 space-y-2">
              <label
                className="block text-sm font-medium"
                style={{ color: "var(--text-primary)" }}
              >
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My Custom Carousel"
                className="w-full px-3 py-2 rounded-lg border text-base"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>

          {/* Icon Picker */}
          <IconPickerButton icon={icon} onChange={setIcon} />
        </div>

        {/* Filter Rules */}
        <div
          className="rounded-lg border p-4 space-y-4"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            Filter Rules
          </h2>

          {rulesLocked && (
            <StatusMessage variant="info" title={null} message={LOCKED_NOTE} />
          )}

          <fieldset
            disabled={rulesLocked}
            inert={rulesLocked}
            className="m-0 p-0 border-0 min-w-0"
          >
            <FilterRowsEditor
              kind="scene"
              table={CAROUSEL_TABLE}
              tree={tree}
              onChange={rulesLocked ? () => undefined : changeTree}
              allowGroups
              pickFromAll
            />
          </fieldset>
          {!rulesLocked && refused !== null && (
            <StatusMessage variant="info" title={null} message={refused} />
          )}
        </div>

        {/* Sort Options */}
        <div
          className="rounded-lg border p-4 space-y-4"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            Sort Order
          </h2>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <label
                htmlFor="carousel-sort"
                className="block text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Sort By
              </label>
              <select
                id="carousel-sort"
                value={effectiveSort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPreviewValid(false);
                  setPreviewScenes(null);
                }}
                className="px-3 py-2 rounded-lg border text-sm min-w-[150px]"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label
                className="block text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Direction
              </label>
              <select
                value={direction}
                onChange={(e) => {
                  setDirection(e.target.value);
                  setPreviewValid(false);
                  setPreviewScenes(null);
                }}
                className="px-3 py-2 rounded-lg border text-sm"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                }}
              >
                <option value="DESC">Descending</option>
                <option value="ASC">Ascending</option>
              </select>
            </div>
          </div>

          {effectiveSort !== sort && (
            <StatusMessage
              variant="info"
              title={null}
              message={`${SORT_NEEDS[sort] ?? "That sort is not available with these rules"}; sorted by Random`}
            />
          )}
        </div>

        {/* Preview Section: a locked carousel's rules cannot be sent to preview */}
        {!rulesLocked && (
          <CarouselPreview
            scenes={previewScenes}
            error={previewError}
            loading={previewing}
            onPreview={() => void handlePreview()}
          />
        )}

        {/* Save Hint */}
        {!rulesLocked && !previewValid && ruleCount > 0 && (
          <p
            className="text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Preview your carousel to enable saving
          </p>
        )}
      </div>

      {dialog}
    </div>
  );
};

export default CarouselBuilder;
