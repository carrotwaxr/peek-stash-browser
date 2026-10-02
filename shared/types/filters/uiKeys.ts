// shared/types/filters/uiKeys.ts
/**
 * The filter panel's keys: what each list's panel offers, as saved in filter
 * presets and the URL, and the contract field each fills. A key's modifier
 * and depth ride in companion keys (`tagIdsModifier`, `tagIdsDepth`). The
 * server cleans stored presets against this list.
 *
 * Projected from the panel table (`panel/`): a new key is a row there.
 */
import type { ListKind } from "./fields.js";
import {
  CLIP_PANEL,
  GALLERY_PANEL,
  GROUP_PANEL,
  IMAGE_PANEL,
  PERFORMER_PANEL,
  type PanelField,
  SCENE_PANEL,
  STUDIO_PANEL,
  TAG_PANEL,
} from "./panel/index.js";

export interface UiKey<F extends string = string> {
  /** The panel's key */
  readonly key: string;
  /** The contract field it fills */
  readonly field: F;
  /** The companion key holding its modifier */
  readonly modifierKey?: string;
  /** The companion key holding its depth (include sub-tags, sub-studios) */
  readonly hierarchyKey?: string;
}

/** A panel's keys and companions, each with its field's literal type */
function uiKeysOf<const P extends readonly PanelField[]>(
  panel: P
): readonly UiKey<P[number]["field"]>[] {
  return panel.map(
    (field): UiKey<P[number]["field"]> => ({
      key: field.key,
      field: field.field,
      ...(field.modifierKey === undefined
        ? {}
        : { modifierKey: field.modifierKey }),
      ...(field.hierarchyKey === undefined
        ? {}
        : { hierarchyKey: field.hierarchyKey }),
    })
  );
}

export const SCENE_UI_KEYS = uiKeysOf(SCENE_PANEL);
export const PERFORMER_UI_KEYS = uiKeysOf(PERFORMER_PANEL);
export const STUDIO_UI_KEYS = uiKeysOf(STUDIO_PANEL);
export const TAG_UI_KEYS = uiKeysOf(TAG_PANEL);
export const GROUP_UI_KEYS = uiKeysOf(GROUP_PANEL);
export const GALLERY_UI_KEYS = uiKeysOf(GALLERY_PANEL);
export const IMAGE_UI_KEYS = uiKeysOf(IMAGE_PANEL);
export const CLIP_UI_KEYS = uiKeysOf(CLIP_PANEL);

export const UI_KEYS = {
  scene: SCENE_UI_KEYS,
  performer: PERFORMER_UI_KEYS,
  studio: STUDIO_UI_KEYS,
  tag: TAG_UI_KEYS,
  group: GROUP_UI_KEYS,
  gallery: GALLERY_UI_KEYS,
  image: IMAGE_UI_KEYS,
  clip: CLIP_UI_KEYS,
} as const satisfies Record<ListKind, readonly UiKey[]>;
