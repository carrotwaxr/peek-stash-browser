// shared/types/filters/panel/clip.ts
/**
 * The Clips panel's rows, in the panel's order (fields of `CLIP_FIELDS`).
 * The keys are the old GET's parameter names, which links and presets keep.
 */
import type { CLIP_FIELDS } from "../fields.js";
import { HAS_MODIFIERS, HAS_ONE_MODIFIERS, type PanelField } from "./types.js";

export const CLIP_PANEL = [
  {
    key: "tagIds",
    field: "tags",
    label: "Clip Tags",
    group: "common",
    editor: "ref",
    multi: true,
    placeholder: "Filter by clip tags...",
    modifiers: HAS_MODIFIERS,
    modifierKey: "tagIdsModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
    hierarchyKey: "tagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    pinnedByDefault: true,
    excludeKey: "tagIdsExclude",
  },
  {
    key: "sceneTagIds",
    field: "scene_tags",
    label: "Scene Tags",
    group: "common",
    editor: "ref",
    multi: true,
    placeholder: "Filter by scene tags...",
    modifiers: HAS_MODIFIERS,
    modifierKey: "sceneTagIdsModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
    hierarchyKey: "sceneTagIdsDepth",
    hierarchyLabel: "Include sub-tags",
    excludeKey: "sceneTagIdsExclude",
  },
  {
    key: "performerIds",
    field: "performers",
    label: "Performers",
    group: "common",
    editor: "ref",
    multi: true,
    placeholder: "Filter by performers...",
    modifiers: HAS_MODIFIERS,
    modifierKey: "performerIdsModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
    excludeKey: "performerIdsExclude",
  },
  {
    key: "studioId",
    field: "studios",
    label: "Studio",
    group: "common",
    editor: "ref",
    multi: true,
    placeholder: "Filter by studio...",
    modifiers: HAS_ONE_MODIFIERS,
    modifierKey: "studioIdModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
    hierarchyKey: "studioIdDepth",
    hierarchyLabel: "Include sub-studios",
    excludeKey: "studioIdExclude",
  },
  {
    // The scene picker (the scene `/minimal` endpoint); a clip has one
    // scene, so there is no "all of these"
    key: "sceneIds",
    field: "scenes",
    label: "Scenes",
    group: "common",
    editor: "ref",
    multi: true,
    placeholder: "Filter by scenes...",
    modifiers: HAS_ONE_MODIFIERS,
    modifierKey: "sceneIdsModifier",
    defaultModifier: "INCLUDES",
    modifierLabels: "has",
  },
  {
    // "all" sends nothing, so every clip lists; not "", which the panel
    // stores as no choice
    key: "isGenerated",
    field: "is_generated",
    label: "Has Preview",
    group: "common",
    editor: "choice",
    placeholder: "Filter by preview status",
    choices: [
      { value: "true", label: "With preview only", sends: true },
      { value: "false", label: "Without preview only", sends: false },
      { value: "all", label: "All clips", sends: undefined },
    ],
    defaultValue: "true",
  },
  {
    // Seconds: a clip lasts seconds, so the panel does not convert
    key: "duration",
    field: "duration",
    label: "Duration (seconds)",
    group: "common",
    editor: "number",
    bounds: { min: 1, max: 3600 },
    unit: "seconds",
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
] as const satisfies readonly PanelField<
  Extract<keyof typeof CLIP_FIELDS, string>
>[];
