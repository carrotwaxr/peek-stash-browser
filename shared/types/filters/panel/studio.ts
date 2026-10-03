// shared/types/filters/panel/studio.ts
/** The Studios panel's rows, in the panel's order */
import type { STUDIO_FIELDS } from "../fields.js";
import { HAS_MODIFIERS, type PanelField, RATING_DISPLAY } from "./types.js";

/** Has ALL, ANY or NONE of these, or has none or any at all */
const HAS_OR_PRESENCE = [...HAS_MODIFIERS, "IS_NULL", "NOT_NULL"] as const;

/** A text box's condition select: contains or not, or has none or any */
const TEXT_OR_PRESENCE = [
  "INCLUDES",
  "EXCLUDES",
  "IS_NULL",
  "NOT_NULL",
] as const;

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
    modifiers: HAS_OR_PRESENCE,
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
    label: "Rating",
    group: "common",
    editor: "number",
    modifierKey: "ratingModifier",
    presenceLabels: { isNull: "Not rated", notNull: "Rated" },
    bounds: { min: 0, max: 100 },
    display: RATING_DISPLAY,
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

  // Entities
  {
    // The studios directly under these, or at any depth; Has none lists
    // the top-level studios
    key: "parentIds",
    field: "parents",
    label: "Parent Studio",
    group: "entities",
    editor: "ref",
    multi: true,
    placeholder: "Select studios...",
    modifiers: ["INCLUDES", "EXCLUDES", "IS_NULL", "NOT_NULL"],
    modifierKey: "parentIdsModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
    hierarchyKey: "parentIdsDepth",
    hierarchyLabel: "Include sub-studios",
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

  // Other
  {
    key: "childCount",
    field: "child_count",
    label: "Child Studio Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "tagCount",
    field: "tag_count",
    label: "Tag Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "imageCount",
    field: "image_count",
    label: "Image Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 10000 },
  },
  {
    key: "galleryCount",
    field: "gallery_count",
    label: "Gallery Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "performerCount",
    field: "performer_count",
    label: "Performer Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "groupCount",
    field: "group_count",
    label: "Collection Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "aliases",
    field: "aliases",
    label: "Aliases",
    group: "other",
    editor: "text",
    placeholder: "Search aliases...",
    modifierKey: "aliasesModifier",
    modifiers: TEXT_OR_PRESENCE,
  },
  {
    key: "url",
    field: "url",
    label: "URL",
    group: "other",
    editor: "text",
    placeholder: "Search URL...",
    modifierKey: "urlModifier",
    modifiers: TEXT_OR_PRESENCE,
  },
  {
    key: "stashId",
    field: "stash_id",
    label: "StashDB ID",
    group: "other",
    editor: "text",
    placeholder: "Search StashDB ID...",
    modifierKey: "stashIdModifier",
    modifiers: ["EQUALS", "IS_NULL", "NOT_NULL"],
  },
] as const satisfies readonly PanelField<
  Extract<keyof typeof STUDIO_FIELDS, string>
>[];
