// shared/types/filters/panel/group.ts
/** The Collections panel's rows, in the panel's order */
import type { GROUP_FIELDS } from "../fields.js";
import { HAS_MODIFIERS, INCLUDES_ONLY, type PanelField } from "./types.js";

/** Has ALL, ANY or NONE of these, or has none or any at all */
const HAS_OR_PRESENCE = [...HAS_MODIFIERS, "IS_NULL", "NOT_NULL"] as const;

/** A text box's condition select: contains or not, or has none or any */
const TEXT_OR_PRESENCE = [
  "INCLUDES",
  "EXCLUDES",
  "IS_NULL",
  "NOT_NULL",
] as const;

/** Yes, No or Any: Any sends nothing */
const YES_NO_ANY = [
  { value: "any", label: "Any", sends: undefined },
  { value: "true", label: "Yes", sends: true },
  { value: "false", label: "No", sends: false },
] as const;

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
    excludeKey: "performerIdsExclude",
  },
  {
    key: "studioId",
    field: "studios",
    label: "Studio",
    group: "common",
    editor: "ref",
    multi: false,
    placeholder: "Select studio...",
    modifiers: ["INCLUDES", "EXCLUDES", "IS_NULL", "NOT_NULL"],
    modifierKey: "studioIdModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
    hierarchyKey: "studioIdDepth",
    hierarchyLabel: "Include sub-studios",
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
    modifiers: HAS_OR_PRESENCE,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES_ALL",
    modifierLabels: "has",
    hierarchyKey: "tagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    countContext: "groups",
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
    modifiers: HAS_MODIFIERS,
    modifierKey: "groupIdsModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "in",
    hierarchyKey: "groupIdsDepth",
    hierarchyLabel: "Include sub-collections",
  },
  {
    // The collections holding these as a sub-collection, or further up
    key: "subGroupIds",
    field: "sub_groups",
    label: "Sub-collections",
    group: "entities",
    editor: "ref",
    multi: true,
    placeholder: "Select collections...",
    modifiers: HAS_MODIFIERS,
    modifierKey: "subGroupIdsModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
    hierarchyKey: "subGroupIdsDepth",
    hierarchyLabel: "Include all parent collections",
  },

  // Other
  {
    key: "subGroupCount",
    field: "sub_group_count",
    label: "Sub-collection Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 100 },
  },
  {
    key: "containingGroupCount",
    field: "containing_group_count",
    label: "Parent Collection Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 100 },
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
    key: "oCounter",
    field: "o_counter",
    label: "O Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "playCount",
    field: "play_count",
    label: "Play Count",
    group: "other",
    editor: "number",
    bounds: { min: 0, max: 1000 },
  },
  {
    key: "performerFavorite",
    field: "performer_favorite",
    label: "Has a Favorite Performer",
    group: "other",
    editor: "choice",
    choices: YES_NO_ANY,
    defaultValue: "any",
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
    placeholder: "Search URLs...",
    modifierKey: "urlModifier",
    modifiers: TEXT_OR_PRESENCE,
  },
] as const satisfies readonly PanelField<
  Extract<keyof typeof GROUP_FIELDS, string>
>[];
