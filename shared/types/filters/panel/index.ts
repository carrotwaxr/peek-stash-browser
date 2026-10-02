// shared/types/filters/panel/index.ts
/**
 * Every list's filter panel rows, declared once: the panel's options, its
 * URL keys and presets (`UI_KEYS`), chips and carousel rules read them. A
 * new panel filter is a row here, on a field of the list's contract table.
 */
import type { ListKind } from "../fields.js";
import { CLIP_PANEL } from "./clip.js";
import { GALLERY_PANEL } from "./gallery.js";
import { GROUP_PANEL } from "./group.js";
import { IMAGE_PANEL } from "./image.js";
import { PERFORMER_PANEL } from "./performer.js";
import { SCENE_PANEL } from "./scene.js";
import { STUDIO_PANEL } from "./studio.js";
import { TAG_PANEL } from "./tag.js";
import type { PanelField } from "./types.js";

export {
  CLIP_PANEL,
  GALLERY_PANEL,
  GROUP_PANEL,
  IMAGE_PANEL,
  PERFORMER_PANEL,
  SCENE_PANEL,
  STUDIO_PANEL,
  TAG_PANEL,
};
export {
  EDITOR_KINDS,
  HAS_MODIFIERS,
  HAS_ONE_MODIFIERS,
  INCLUDES_ONLY,
  PANEL_GROUPS,
  PANEL_GROUP_LABELS,
} from "./types.js";
export type {
  Choice,
  ChoiceField,
  CountContext,
  DateField,
  EditorKind,
  EnumField,
  NumberField,
  PanelField,
  PanelGroup,
  RefField,
  SendingChoice,
  TextField,
  ToggleField,
} from "./types.js";

export const PANEL_FIELDS = {
  scene: SCENE_PANEL,
  performer: PERFORMER_PANEL,
  studio: STUDIO_PANEL,
  tag: TAG_PANEL,
  group: GROUP_PANEL,
  gallery: GALLERY_PANEL,
  image: IMAGE_PANEL,
  clip: CLIP_PANEL,
} as const satisfies Record<ListKind, readonly PanelField[]>;
