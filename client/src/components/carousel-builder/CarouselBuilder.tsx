import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { PreviewCarouselResponse } from "@peek/shared-types";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { libraryApi } from "../../api";
import { useSaveCarousel } from "../../api/hooks/useCarousels";
import {
  CAROUSEL_FIELDS,
  CAROUSEL_FILTER_DEFINITIONS,
  SCENE_SORT_OPTIONS,
  buildCarouselRules,
  carouselRulesToFilterState,
} from "../../utils/filterConfig";
import { type PanelState, codecOf } from "../../utils/filterFields";
import { Button } from "../ui/index";
import CarouselPreview from "./CarouselPreview";
import IconPickerButton from "./IconPickerButton";
import RuleEditor from "./RuleEditor";
import { getCarouselIcon } from "./carouselIcons";

// Simple ID generator for rule keys (doesn't need to be cryptographically secure)
let ruleIdCounter = 0;
const generateRuleId = () => `rule-${++ruleIdCounter}`;

interface CarouselRule {
  id: string;
  filterKey: string;
  value: unknown;
  modifier?: string;
  depth?: number;
}

/** A modifier as a rule holds it: a string, else none */
const modifierOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** A depth as a rule holds it: a number, else none */
const depthOf = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

/**
 * The builder's rules from the scene rows' state: one rule per row that
 * filters, with its modifier and depth companions
 */
function convertFilterStateToRules(state: PanelState): CarouselRule[] {
  return CAROUSEL_FIELDS.filter((row) => codecOf(row).isActive(row, state)).map(
    (row) => ({
      id: generateRuleId(),
      filterKey: row.key,
      value: state[row.key],
      modifier:
        row.modifierKey === undefined
          ? undefined
          : modifierOf(state[row.modifierKey]),
      depth:
        row.hierarchyKey === undefined
          ? undefined
          : depthOf(state[row.hierarchyKey]),
    })
  );
}

/** The scene rows' state from the builder's rules, for `buildCarouselRules` */
function convertRulesToFilterState(rules: readonly CarouselRule[]): PanelState {
  const state: Record<string, unknown> = {};
  for (const rule of rules) {
    const row = CAROUSEL_FIELDS.find((each) => each.key === rule.filterKey);
    if (row === undefined) continue;
    state[row.key] = rule.value;
    if (row.modifierKey !== undefined && rule.modifier !== undefined) {
      state[row.modifierKey] = rule.modifier;
    }
    if (row.hierarchyKey !== undefined && rule.depth !== undefined) {
      state[row.hierarchyKey] = rule.depth;
    }
  }
  return state;
}

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
  const [rules, setRules] = useState<CarouselRule[]>([]); // Array of rule objects
  // Stored rules no row can edit: saved and previewed as they are
  const [kept, setKept] = useState<Readonly<Record<string, unknown>>>({});
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

        // Convert stored rules back to editable format, keeping the rest
        const stored = carouselRulesToFilterState(carousel.rules);
        setRules(convertFilterStateToRules(stored.state));
        setKept(stored.kept);
      } catch (err) {
        setError((err as Error).message || "Failed to load carousel");
      } finally {
        setLoading(false);
      }
    };

    void loadCarousel();
  }, [id, isEditing]);

  /**
   * Add a new rule
   */
  const addRule = () => {
    const usedKeys = new Set(rules.map((r) => r.filterKey));
    const availableFilter = CAROUSEL_FILTER_DEFINITIONS.find(
      (f) => !usedKeys.has(f.key)
    );

    if (!availableFilter) {
      return; // All filters already used
    }

    const newRule = {
      id: generateRuleId(),
      filterKey: availableFilter.key,
      value:
        availableFilter.type === "checkbox"
          ? true
          : availableFilter.multi
            ? []
            : "",
      modifier: availableFilter.defaultModifier,
    };

    setRules([...rules, newRule]);
    setPreviewValid(false);
    setPreviewScenes(null);
  };

  /**
   * Update a rule
   */
  const updateRule = (ruleId: string, updates: Partial<CarouselRule>) => {
    setRules(rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)));
    setPreviewValid(false);
    setPreviewScenes(null);
  };

  /**
   * Remove a rule
   */
  const removeRule = (ruleId: string) => {
    setRules(rules.filter((r) => r.id !== ruleId));
    setPreviewValid(false);
    setPreviewScenes(null);
  };

  /**
   * Drop the stored rules the editor cannot show
   */
  const removeKept = () => {
    setKept({});
    setPreviewValid(false);
    setPreviewScenes(null);
  };

  /**
   * Preview the carousel results
   */
  const handlePreview = async () => {
    if (rules.length === 0) {
      setPreviewError("Add at least one rule to preview");
      return;
    }

    setPreviewing(true);
    setPreviewError(null);

    try {
      const apiRules = buildCarouselRules(
        convertRulesToFilterState(rules),
        kept
      );

      const result = await libraryApi.previewCarousel({
        rules: apiRules,
        sort,
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

    if (rules.length === 0) {
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
      const apiRules = buildCarouselRules(
        convertRulesToFilterState(rules),
        kept
      );

      const carouselData = {
        title: title.trim(),
        icon,
        rules: apiRules,
        sort,
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
  const canSave = title.trim() && rules.length > 0 && previewValid;
  const usedFilterKeys = new Set(rules.map((r) => r.filterKey));
  const hasMoreFilters = CAROUSEL_FILTER_DEFINITIONS.some(
    (f) => !usedFilterKeys.has(f.key)
  );

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
              disabled={previewing || rules.length === 0}
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
          <div className="flex items-center justify-between">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              Filter Rules (ALL must match)
            </h2>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {rules.length} rule{rules.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Rule List */}
          <div className="space-y-3">
            {rules.map((rule) => (
              <RuleEditor
                key={rule.id}
                rule={rule}
                usedFilterKeys={usedFilterKeys}
                onChange={(updates) => updateRule(rule.id, updates)}
                onRemove={() => removeRule(rule.id)}
              />
            ))}

            {rules.length === 0 && (
              <div
                className="text-center py-8 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                No rules added yet. Click &quot;Add Rule&quot; to get started.
              </div>
            )}
          </div>

          {/* Stored rules no row can edit: kept until removed */}
          {Object.keys(kept).length > 0 && (
            <div
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
                color: "var(--text-secondary)",
              }}
            >
              <span>
                {Object.keys(kept).length} more{" "}
                {Object.keys(kept).length === 1 ? "rule" : "rules"} this editor
                can&apos;t show
              </span>
              <Button variant="secondary" size="sm" onClick={removeKept}>
                Remove
              </Button>
            </div>
          )}

          {/* Add Rule Button */}
          <Button
            variant="secondary"
            onClick={addRule}
            disabled={!hasMoreFilters}
            icon={<Plus className="w-4 h-4" />}
          >
            Add Rule
          </Button>
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
                className="block text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                Sort By
              </label>
              <select
                value={sort}
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
                {SCENE_SORT_OPTIONS.map((opt) => (
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
        </div>

        {/* Preview Section */}
        <CarouselPreview
          scenes={previewScenes}
          error={previewError}
          loading={previewing}
          onPreview={() => void handlePreview()}
        />

        {/* Save Hint */}
        {!previewValid && rules.length > 0 && (
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
