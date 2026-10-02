/**
 * What a list's `useListUrlState` is built from, shared by `SearchControls`
 * and the detail tabs' `SearchableGrid`: the panel's options in the user's
 * units, the fields the page fixes, and the entity defaults with the user's
 * card display settings folded in.
 */
import { useMemo } from "react";
import { LIST_KINDS, type ListKind } from "@peek/shared-types";
import { useCardDisplaySettings } from "../contexts/CardDisplaySettingsContext";
import { useUnitPreference } from "../contexts/UnitPreferenceContext";
import { type FilterOption, filterOptionsOf } from "../utils/filterFields";
import { lockedFieldsOf } from "../utils/listQuery";
import type { ListEntity } from "../utils/urlParams";
import type { ListDefaults } from "./useListUrlState";

const NO_LOCKS: readonly string[] = [];
const NO_FILTERS: Record<string, unknown> = {};

/**
 * Filters equal by content are one object, whatever object the page passed
 * (a page's inline lock is a new object on every render)
 */
export function useFiltersByContent(
  filters: Record<string, unknown> | undefined
): Record<string, unknown> {
  const key = filters ? JSON.stringify(filters) : "";
  return useMemo(
    () =>
      key === "" ? NO_FILTERS : (JSON.parse(key) as Record<string, unknown>),
    [key]
  );
}

const isListKind = (value: string): value is ListKind =>
  (LIST_KINDS as readonly string[]).includes(value);

/** A card display setting's value, or the fallback when it has none */
const settingOr = (value: unknown, fallback: string) =>
  typeof value === "string" && value !== "" ? value : fallback;

/** The panel's options for an entity, the body-measure ranges in the user's units */
export function useFilterOptions(artifactType: string): FilterOption[] {
  const { unitPreference } = useUnitPreference();
  return useMemo(
    () =>
      filterOptionsOf(
        isListKind(artifactType) ? artifactType : "scene",
        unitPreference
      ),
    [artifactType, unitPreference]
  );
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
