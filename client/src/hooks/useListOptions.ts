/**
 * What a list's `useListUrlState` is built from, shared by `SearchControls`
 * and the detail tabs' `SearchableGrid`: the panel's options in the user's
 * units, the fields the page fixes, and the entity defaults with the user's
 * card display settings folded in.
 */
import { useMemo } from "react";
import { useCardDisplaySettings } from "../contexts/CardDisplaySettingsContext";
import { useUnitPreference } from "../contexts/UnitPreferenceContext";
import {
  CLIP_FILTER_OPTIONS,
  type FilterOption,
  GALLERY_FILTER_OPTIONS,
  GROUP_FILTER_OPTIONS,
  IMAGE_FILTER_OPTIONS,
  PERFORMER_FILTER_OPTIONS,
  SCENE_FILTER_OPTIONS,
  STUDIO_FILTER_OPTIONS,
  TAG_FILTER_OPTIONS,
} from "../utils/filterConfig";
import { lockedFieldsOf } from "../utils/listQuery";
import type { ListEntity } from "../utils/urlParams";
import type { ListDefaults } from "./useListUrlState";

const NO_LOCKS: readonly string[] = [];

/** A card display setting's value, or the fallback when it has none */
const settingOr = (value: unknown, fallback: string) =>
  typeof value === "string" && value !== "" ? value : fallback;

/** The panel's options for an entity, the body-measure ranges in the user's units */
export function useFilterOptions(artifactType: string): FilterOption[] {
  const { unitPreference } = useUnitPreference();
  return useMemo(() => {
    const transformForUnits = (options: FilterOption[]) => {
      if (unitPreference !== "imperial") return options;
      return options.map((opt) => {
        if (opt.key === "height") {
          return {
            ...opt,
            label: "Height (ft/in)",
            type: "imperial-height-range",
            // Separate keys that buildPerformerFilter converts
          };
        }
        if (opt.key === "weight") {
          return { ...opt, label: "Weight (lbs)", min: 50, max: 500 };
        }
        if (opt.key === "penisLength") {
          return { ...opt, label: "Penis Length (inches)", min: 1, max: 15 };
        }
        return opt;
      });
    };

    switch (artifactType) {
      case "performer":
        return transformForUnits([...PERFORMER_FILTER_OPTIONS]);
      case "studio":
        return [...STUDIO_FILTER_OPTIONS];
      case "tag":
        return [...TAG_FILTER_OPTIONS];
      case "group":
        return [...GROUP_FILTER_OPTIONS];
      case "gallery":
        return [...GALLERY_FILTER_OPTIONS];
      case "image":
        return [...IMAGE_FILTER_OPTIONS];
      case "clip":
        return [...CLIP_FILTER_OPTIONS];
      case "scene":
      default:
        return [...SCENE_FILTER_OPTIONS];
    }
  }, [artifactType, unitPreference]);
}

/**
 * The contract fields the page fixes, from its permanent filters (a detail
 * tab's locked filters name them inside the entity's own filter): the panel
 * does not offer them and the URL's and presets' filters on them are dropped.
 * Equal sets are one array.
 */
export function useLockedFields(
  artifactType: string,
  permanentFilters: Record<string, unknown>
): readonly string[] {
  const key = lockedFieldsOf(artifactType as ListEntity, permanentFilters).join(
    ","
  );
  return useMemo(() => (key === "" ? NO_LOCKS : key.split(",")), [key]);
}

/** Entity defaults, the user's card display settings folded in */
export function useListDefaults(
  artifactType: string,
  initialSort: string
): ListDefaults {
  const { getSettings } = useCardDisplaySettings();
  const entitySettings = getSettings(artifactType);
  const defaultViewMode = settingOr(entitySettings.defaultViewMode, "grid");
  const defaultGridDensity = settingOr(
    entitySettings.defaultGridDensity,
    "medium"
  );
  const defaultZoomLevel = settingOr(entitySettings.defaultWallZoom, "medium");
  return useMemo<ListDefaults>(
    () => ({
      sort: initialSort,
      direction: "DESC",
      perPage: 24,
      viewMode: defaultViewMode,
      zoomLevel: defaultZoomLevel,
      gridDensity: defaultGridDensity,
    }),
    [initialSort, defaultViewMode, defaultZoomLevel, defaultGridDensity]
  );
}
