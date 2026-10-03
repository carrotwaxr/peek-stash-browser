import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PreviewCarouselResponse } from "@peek/shared-types";
import { AlertCircle, ArrowLeft, Eye, Loader2, Save } from "lucide-react";
import { libraryApi } from "../../api";
import { useSaveCarousel } from "../../api/hooks/useCarousels";
import {
  CAROUSEL_FIELDS,
  buildCarouselRules,
  carouselRulesToFilterState,
} from "../../utils/filterConfig";
import {
  type EditTree,
  type KeptLeaf,
  type PanelTable,
  countRows,
  editTreeOf,
  panelTableOf,
  panelTreeOf,
  stateOf,
  treeOf,
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The stored rules no row can edit, as kept rows at the root: one per
 * field, or one for a stored tree the interim reader keeps whole (A6 reads
 * trees). Each leaf is the part of the stored rules it stands for.
 */
const keptLeavesOf = (kept: Readonly<Record<string, unknown>>): KeptLeaf[] =>
  "match" in kept && "rules" in kept
    ? [{ group: 0, leaf: kept }]
    : Object.entries(kept).map(([field, criterion]) => ({
        group: 0,
        leaf: { [field]: criterion },
      }));

/** The kept rows' rules, as `buildCarouselRules` lays them under the rows */
const keptRulesOf = (tree: EditTree): Record<string, unknown> =>
  Object.assign(
    {},
    ...panelTreeOf(tree).kept.flatMap((each) =>
      isRecord(each.leaf) ? [each.leaf] : []
    )
  ) as Record<string, unknown>;

/** The editing tree of a carousel's stored rules: its rows and the rules kept as they are */
const editTreeOfRules = (rules: unknown): EditTree => {
  const stored = carouselRulesToFilterState(rules);
  return editTreeOf(
    "scene",
    treeOf("scene", stored.state),
    keptLeavesOf(stored.kept)
  );
};

/**
 * A row now edits a field a kept rule holds: the kept rule goes, as the
 * save would overwrite it
 */
const withoutReplacedKept = (tree: EditTree): EditTree => {
  const edited = new Set(
    tree.rows.flatMap((item) => (item.kind === "row" ? [item.field.field] : []))
  );
  const replaced = (leaf: unknown) =>
    isRecord(leaf) &&
    !("match" in leaf && "rules" in leaf) &&
    Object.keys(leaf).every((field) => edited.has(field));
  return tree.rows.some((item) => item.kind === "kept" && replaced(item.leaf))
    ? {
        ...tree,
        rows: tree.rows.filter(
          (item) => item.kind !== "kept" || !replaced(item.leaf)
        ),
      }
    : tree;
};

/**
 * CarouselBuilder Component
 * Full-page editor for creating and editing custom carousels.
 * Supports adding filter rules, previewing results, and saving.
 */
const CarouselBuilder = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);
  const saveCarousel = useSaveCarousel();

  // Form state
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("Film");
  // The rules as an editing tree (root rows only until A6), with the
  // stored rules no row can edit as kept rows
  const [tree, setTree] = useState<EditTree>(() => editTreeOfRules({}));
  const [sort, setSort] = useState("random");
  const [direction, setDirection] = useState("DESC");

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

  // Load existing carousel if editing
  useEffect(() => {
    if (!isEditing || !id) return;

    const loadCarousel = async () => {
      setLoading(true);
      try {
        const { carousel } = await libraryApi.getCarousel(id);
        setTitle(carousel.title);
        setIcon(carousel.icon);
        setSort(carousel.sort);
        setDirection(carousel.direction);

        // The stored rules as rows, keeping the rest as they are
        setTree(editTreeOfRules(carousel.rules));
      } catch (err) {
        setError((err as Error).message || "Failed to load carousel");
      } finally {
        setLoading(false);
      }
    };

    void loadCarousel();
  }, [id, isEditing]);

  // The rows' state, and the rules a preview and a save send
  const filterState = stateOf("scene", panelTreeOf(tree).tree);
  const ruleCount = countRows(tree, "scene");
  const apiRules = () => buildCarouselRules(filterState, keptRulesOf(tree));

  // A sort the rules do not offer (its rule was removed) reads as Random
  const sortOptions = sortOptionsFor("scene", filterState);
  const effectiveSort = sortOptions.some((option) => option.value === sort)
    ? sort
    : "random";

  /** A rule changed: the preview is stale */
  const changeTree = (next: EditTree) => {
    setTree(withoutReplacedKept(next));
    setPreviewValid(false);
    setPreviewScenes(null);
  };

  /**
   * Preview the carousel results
   */
  const handlePreview = async () => {
    if (ruleCount === 0) {
      setPreviewError("Add at least one rule to preview");
      return;
    }

    setPreviewing(true);
    setPreviewError(null);

    try {
      const result = await libraryApi.previewCarousel({
        rules: apiRules(),
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

    if (ruleCount === 0) {
      setError("Add at least one rule");
      return;
    }

    if (!previewValid) {
      setError("Preview must succeed before saving");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const carouselData = {
        title: title.trim(),
        icon,
        rules: apiRules(),
        sort: effectiveSort,
        direction,
      };

      // Home's list and every carousel's scenes are asked for again
      await saveCarousel.mutateAsync({ id, data: carouselData });

      void navigate("/settings?section=user&tab=customization");
    } catch (err) {
      setError((err as Error).message || "Failed to save carousel");
    } finally {
      setSaving(false);
    }
  };

  const IconComponent = getCarouselIcon(icon);
  const canSave = title.trim() && ruleCount > 0 && previewValid;

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
              onClick={() =>
                void navigate("/settings?section=user&tab=customization")
              }
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
            <Button
              variant="secondary"
              onClick={() => void handlePreview()}
              disabled={previewing || ruleCount === 0}
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
            Filter Rules (ALL must match)
          </h2>

          <FilterRowsEditor
            kind="scene"
            table={CAROUSEL_TABLE}
            tree={tree}
            onChange={changeTree}
            allowGroups={false}
            pickFromAll
          />
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

        {/* Preview Section */}
        <CarouselPreview
          scenes={previewScenes}
          error={previewError}
          loading={previewing}
          onPreview={() => void handlePreview()}
        />

        {/* Save Hint */}
        {!previewValid && ruleCount > 0 && (
          <p
            className="text-center text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Preview your carousel to enable saving
          </p>
        )}
      </div>
    </div>
  );
};

export default CarouselBuilder;
