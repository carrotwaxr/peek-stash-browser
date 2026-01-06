import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as LucideIcons from "lucide-react";
import {
  ArrowLeft,
  Save,
  Eye,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/index.js";
import IconPickerButton from "./IconPickerButton.jsx";
import RuleEditor from "./RuleEditor.jsx";
import CarouselPreview from "./CarouselPreview.jsx";
import { libraryApi } from "../../services/api.js";
import {
  SCENE_SORT_OPTIONS,
  CAROUSEL_FILTER_DEFINITIONS,
  buildSceneFilter,
  carouselRulesToFilterState,
} from "../../utils/filterConfig.js";

// Simple ID generator for rule keys (doesn't need to be cryptographically secure)
let ruleIdCounter = 0;
const generateRuleId = () => `rule-${++ruleIdCounter}`;

/**
 * CarouselBuilder Component
 * Full-page editor for creating and editing custom carousels.
 * Supports adding filter rules, previewing results, and saving.
 */
const CarouselBuilder = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = Boolean(id);

  // Form state
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("Film");
  const [rules, setRules] = useState([]); // Array of rule objects
  const [sort, setSort] = useState("random");
  const [direction, setDirection] = useState("DESC");

  // UI state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewScenes, setPreviewScenes] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [error, setError] = useState(null);
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

        // Convert stored rules back to editable format
        const filterState = carouselRulesToFilterState(carousel.rules);
        const ruleList = convertFilterStateToRules(filterState);
        setRules(ruleList);
      } catch (err) {
        setError(err.message || "Failed to load carousel");
      } finally {
        setLoading(false);
      }
    };

    loadCarousel();
  }, [id, isEditing]);

  /**
   * Convert filter state (flat object) to rule array for the editor
   */
  const convertFilterStateToRules = (filterState) => {
    const ruleList = [];

    // Entity selection rules
    if (filterState.performerIds?.length > 0) {
      ruleList.push({
        id: generateRuleId(),
        filterKey: "performerIds",
        value: filterState.performerIds,
        modifier: filterState.performerIdsModifier || "INCLUDES",
      });
    }

    if (filterState.studioId) {
      ruleList.push({
        id: generateRuleId(),
        filterKey: "studioId",
        value: filterState.studioId,
        depth: filterState.studioIdDepth,
      });
    }

    if (filterState.tagIds?.length > 0) {
      ruleList.push({
        id: generateRuleId(),
        filterKey: "tagIds",
        value: filterState.tagIds,
        modifier: filterState.tagIdsModifier || "INCLUDES_ALL",
        depth: filterState.tagIdsDepth,
      });
    }

    if (filterState.groupIds?.length > 0) {
      ruleList.push({
        id: generateRuleId(),
        filterKey: "groupIds",
        value: filterState.groupIds,
        modifier: filterState.groupIdsModifier || "INCLUDES",
      });
    }

    // Range rules
    ["rating", "oCount", "duration", "playCount", "playDuration", "performerCount", "performerAge", "bitrate"].forEach(
      (key) => {
        if (filterState[key]?.min !== undefined || filterState[key]?.max !== undefined) {
          ruleList.push({
            id: generateRuleId(),
            filterKey: key,
            value: filterState[key],
          });
        }
      }
    );

    // Boolean rules
    ["favorite", "performerFavorite", "studioFavorite", "tagFavorite"].forEach((key) => {
      if (filterState[key] === true) {
        ruleList.push({
          id: generateRuleId(),
          filterKey: key,
          value: true,
        });
      }
    });

    // Resolution
    if (filterState.resolution) {
      ruleList.push({
        id: generateRuleId(),
        filterKey: "resolution",
        value: filterState.resolution,
        modifier: filterState.resolutionModifier || "EQUALS",
      });
    }

    // Text rules
    ["title", "details"].forEach((key) => {
      if (filterState[key]) {
        ruleList.push({
          id: generateRuleId(),
          filterKey: key,
          value: filterState[key],
        });
      }
    });

    // Date range rules
    ["date", "createdAt", "lastPlayedAt"].forEach((key) => {
      if (filterState[key]?.min || filterState[key]?.max) {
        ruleList.push({
          id: generateRuleId(),
          filterKey: key,
          value: filterState[key],
        });
      }
    });

    return ruleList;
  };

  /**
   * Convert rule array back to filter state for buildSceneFilter
   */
  const convertRulesToFilterState = useCallback(() => {
    const filterState = {};

    rules.forEach((rule) => {
      const def = CAROUSEL_FILTER_DEFINITIONS.find((d) => d.key === rule.filterKey);
      if (!def) return;

      switch (def.type) {
        case "searchable-select":
          if (def.multi) {
            filterState[rule.filterKey] = rule.value || [];
            if (def.modifierOptions && rule.modifier) {
              filterState[`${rule.filterKey}Modifier`] = rule.modifier;
            }
          } else {
            filterState[rule.filterKey] = rule.value || "";
          }
          if (def.supportsHierarchy && rule.depth !== undefined) {
            filterState[`${rule.filterKey}Depth`] = rule.depth;
          }
          break;

        case "range":
          filterState[rule.filterKey] = rule.value || {};
          break;

        case "checkbox":
          filterState[rule.filterKey] = rule.value === true;
          break;

        case "select":
          filterState[rule.filterKey] = rule.value || "";
          if (def.modifierOptions && rule.modifier) {
            filterState[`${rule.filterKey}Modifier`] = rule.modifier;
          }
          break;

        case "text":
          filterState[rule.filterKey] = rule.value || "";
          break;

        case "date-range":
          filterState[rule.filterKey] = rule.value || {};
          break;
      }
    });

    return filterState;
  }, [rules]);

  /**
   * Add a new rule
   */
  const addRule = () => {
    const usedKeys = new Set(rules.map((r) => r.filterKey));
    const availableFilter = CAROUSEL_FILTER_DEFINITIONS.find((f) => !usedKeys.has(f.key));

    if (!availableFilter) {
      return; // All filters already used
    }

    const newRule = {
      id: generateRuleId(),
      filterKey: availableFilter.key,
      value: availableFilter.type === "checkbox" ? true : availableFilter.multi ? [] : "",
      modifier: availableFilter.defaultModifier,
    };

    setRules([...rules, newRule]);
    setPreviewValid(false);
    setPreviewScenes(null);
  };

  /**
   * Update a rule
   */
  const updateRule = (ruleId, updates) => {
    setRules(rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r)));
    setPreviewValid(false);
    setPreviewScenes(null);
  };

  /**
   * Remove a rule
   */
  const removeRule = (ruleId) => {
    setRules(rules.filter((r) => r.id !== ruleId));
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
      const filterState = convertRulesToFilterState();
      const apiRules = buildSceneFilter(filterState);

      const { scenes } = await libraryApi.previewCarousel({
        rules: apiRules,
        sort,
        direction,
      });

      setPreviewScenes(scenes);
      setPreviewValid(true);
      setPreviewError(null);
    } catch (err) {
      setPreviewError(err.message || "Failed to preview carousel");
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
      const filterState = convertRulesToFilterState();
      const apiRules = buildSceneFilter(filterState);

      const carouselData = {
        title: title.trim(),
        icon,
        rules: apiRules,
        sort,
        direction,
      };

      if (isEditing) {
        await libraryApi.updateCarousel(id, carouselData);
      } else {
        await libraryApi.createCarousel(carouselData);
      }

      navigate("/settings?section=user&tab=customization");
    } catch (err) {
      setError(err.message || "Failed to save carousel");
    } finally {
      setSaving(false);
    }
  };

  const IconComponent = LucideIcons[icon] || LucideIcons.Film;
  const canSave = title.trim() && rules.length > 0 && previewValid;
  const usedFilterKeys = new Set(rules.map((r) => r.filterKey));
  const hasMoreFilters = CAROUSEL_FILTER_DEFINITIONS.some((f) => !usedFilterKeys.has(f.key));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--bg-primary)" }}>
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
            <Button variant="secondary" onClick={() => navigate("/settings?section=user&tab=customization")} icon={<ArrowLeft className="w-4 h-4" />}>
              Back
            </Button>
            <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {isEditing ? "Edit Carousel" : "Create Carousel"}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={handlePreview}
              disabled={previewing || rules.length === 0}
              icon={previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            >
              Preview
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={!canSave || saving}
              icon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Carousel Details
          </h2>

          <div className="flex items-start gap-4">
            {/* Icon */}
            <div
              className="flex-shrink-0 w-14 h-14 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "var(--bg-secondary)" }}
            >
              <IconComponent className="w-7 h-7" style={{ color: "var(--accent-primary)" }} />
            </div>

            {/* Title Input */}
            <div className="flex-1 space-y-2">
              <label className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
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
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
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
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Sort Order
          </h2>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
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
              <label className="block text-xs" style={{ color: "var(--text-muted)" }}>
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
          onPreview={handlePreview}
        />

        {/* Save Hint */}
        {!previewValid && rules.length > 0 && (
          <p className="text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Preview your carousel to enable saving
          </p>
        )}
      </div>
    </div>
  );
};

export default CarouselBuilder;
