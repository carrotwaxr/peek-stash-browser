// shared/types/filters/panel/studio.ts
/** The Studios panel's rows, in the panel's order */
import type { STUDIO_FIELDS } from "../fields.js";
import { HAS_MODIFIERS, type PanelField } from "./types.js";

export const STUDIO_PANEL = [
  // Common
  {
    key: "name",
    field: "name",
    label: "Name Search",
    group: "common",
    editor: "text",
    placeholder: "Search name...",
  },
  {
    key: "details",
    field: "details",
    label: "Details Search",
    group: "common",
    editor: "text",
    placeholder: "Search details...",
  },
  {
    key: "tagIds",
    field: "tags",
    label: "Tags",
    group: "common",
    editor: "ref",
    multi: true,
    placeholder: "Select tags...",
    modifiers: HAS_MODIFIERS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES_ALL",
    modifierLabels: "has",
    hierarchyKey: "tagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    countContext: "studios",
    pinnedByDefault: true,
    excludeKey: "tagIdsExclude",
  },
  {
    key: "rating",
    field: "rating100",
    label: "Rating (0-100)",
    group: "common",
    editor: "number",
    modifierKey: "ratingModifier",
    presenceLabels: { isNull: "Not rated", notNull: "Rated" },
    bounds: { min: 0, max: 100 },
    pinnedByDefault: true,
  },
  {
    key: "sceneCount",
    field: "scene_count",
    label: "Scene Count",
    group: "common",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "oCounter",
    field: "o_counter",
    label: "O Count",
    group: "common",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "playCount",
    field: "play_count",
    label: "Play Count",
    group: "common",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "favorite",
    field: "favorite",
    label: "Favorite Studios",
    group: "common",
    editor: "toggle",
    placeholder: "Favorites Only",
  },

  // Dates
  {
    key: "createdAt",
    field: "created_at",
    label: "Created Date",
    group: "dates",
    editor: "date",
  },
  {
    key: "updatedAt",
    field: "updated_at",
    label: "Updated Date",
    group: "dates",
    editor: "date",
  },
] as const satisfies readonly PanelField<
  Extract<keyof typeof STUDIO_FIELDS, string>
>[];
