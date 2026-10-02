// shared/types/filters/panel/group.ts
/** The Collections panel's rows, in the panel's order */
import type { GROUP_FIELDS } from "../fields.js";
import { HAS_MODIFIERS, INCLUDES_ONLY, type PanelField } from "./types.js";

export const GROUP_PANEL = [
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
    key: "synopsis",
    field: "synopsis",
    label: "Synopsis Search",
    group: "common",
    editor: "text",
    placeholder: "Search synopsis...",
  },
  {
    key: "director",
    field: "director",
    label: "Director Search",
    group: "common",
    editor: "text",
    placeholder: "Search director...",
  },
  {
    key: "performerIds",
    field: "performers",
    label: "Performers",
    group: "common",
    editor: "ref",
    multi: true,
    placeholder: "Select performers...",
    modifiers: HAS_MODIFIERS,
    modifierKey: "performerIdsModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
    countContext: "groups",
  },
  {
    key: "studioId",
    field: "studios",
    label: "Studio",
    group: "common",
    editor: "ref",
    multi: false,
    placeholder: "Select studio...",
    modifiers: INCLUDES_ONLY,
    countContext: "groups",
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
    countContext: "groups",
    pinnedByDefault: true,
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
    key: "duration",
    field: "duration",
    label: "Duration (minutes)",
    group: "common",
    editor: "number",
    modifierKey: "durationModifier",
    bounds: { min: 1, max: 300 },
    scale: 60,
    unit: "minutes",
  },
  {
    key: "favorite",
    field: "favorite",
    label: "Favorite Collections",
    group: "common",
    editor: "toggle",
    placeholder: "Favorites Only",
  },

  // Dates
  {
    key: "date",
    field: "date",
    label: "Release Date",
    group: "dates",
    editor: "date",
  },
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

  // Entities
  {
    // The direct sub-collections of these; a collection card's
    // sub-collection count opens the list with it (?groupId=)
    key: "groupIds",
    field: "containing_groups",
    label: "Parent collection",
    group: "entities",
    editor: "ref",
    multi: true,
    placeholder: "Select collections...",
    modifiers: INCLUDES_ONLY,
  },
] as const satisfies readonly PanelField<
  Extract<keyof typeof GROUP_FIELDS, string>
>[];
