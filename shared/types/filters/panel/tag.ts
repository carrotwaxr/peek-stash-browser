// shared/types/filters/panel/tag.ts
/** The Tags panel's rows, in the panel's order */
import type { TAG_FIELDS } from "../fields.js";
import { INCLUDES_ONLY, type PanelField } from "./types.js";

export const TAG_PANEL = [
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
    key: "description",
    field: "description",
    label: "Description Search",
    group: "common",
    editor: "text",
    placeholder: "Search description...",
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
    label: "Favorite Tags",
    group: "common",
    editor: "toggle",
    placeholder: "Favorites Only",
  },

  // Entities
  {
    key: "performerIds",
    field: "performers",
    label: "Performers",
    group: "entities",
    editor: "ref",
    multi: true,
    placeholder: "Select performers...",
    modifiers: INCLUDES_ONLY,
  },
  {
    key: "studioId",
    field: "studios",
    label: "Studio",
    group: "entities",
    editor: "ref",
    multi: false,
    placeholder: "Select studio...",
    modifiers: INCLUDES_ONLY,
  },
  {
    key: "groupIds",
    field: "groups",
    label: "Collections",
    group: "entities",
    editor: "ref",
    multi: true,
    placeholder: "Select collections...",
    modifiers: INCLUDES_ONLY,
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
  Extract<keyof typeof TAG_FIELDS, string>
>[];
