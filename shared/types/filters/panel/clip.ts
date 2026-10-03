// shared/types/filters/panel/clip.ts
/**
 * The Clips panel's rows, in the panel's order (fields of `CLIP_FIELDS`).
 * The keys are the old GET's parameter names, which links and presets keep.
 */
import type { CLIP_FIELDS } from "../fields.js";
import { HAS_MODIFIERS, INCLUDES_ONLY, type PanelField } from "./types.js";

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
    pinnedByDefault: true,
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
  },
  {
    key: "studioId",
    field: "studios",
    label: "Studio",
    group: "common",
    editor: "ref",
    multi: false,
    placeholder: "Filter by studio...",
    modifiers: INCLUDES_ONLY,
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
] as const satisfies readonly PanelField<
  Extract<keyof typeof CLIP_FIELDS, string>
>[];
