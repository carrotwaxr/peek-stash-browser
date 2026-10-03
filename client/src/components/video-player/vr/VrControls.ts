/**
 * The VR button: a video.js menu button with a "VR view" toggle, one radio
 * item per projection, and, on an insecure origin, a line saying headset mode
 * needs HTTPS. It holds no VR logic: `useVrMode` gives it the state to show
 * and the callbacks to call. A video.js component, so it cannot be a React
 * one; the icon is CSS (`VideoPlayer.css`).
 *
 * The menu follows ARIA: the toggle is a `menuitemcheckbox` and each
 * projection a `menuitemradio`, both with `aria-checked` (video.js's
 * `MenuItem` sets role and state). The note is a menu title (`li`,
 * `role="presentation"`, no tabindex): video.js's arrow keys skip it.
 *
 * Nothing here imports the fork or `vrPlugin` (lint): this file loads with
 * the Scene page.
 */
import { VR_PROJECTIONS, type VrProjection } from "@peek/shared-types";
import videojs from "video.js";

/** What this file uses of a video.js component (the package types it `any`). */
interface ComponentLike {
  el(): HTMLElement;
  dispose(): void;
  trigger(event: string): void;
  name(): string;
  player(): unknown;
  options_: unknown;
}
interface MenuItemLike extends ComponentLike {
  selected(selected: boolean): void;
}
interface MenuButtonLike extends ComponentLike {
  controlText(text: string): void;
}
type ComponentClass<T> = new (player: unknown, options: object) => T;

const ComponentBase = videojs.getComponent(
  "Component"
) as unknown as ComponentClass<ComponentLike>;
const MenuItemBase = videojs.getComponent(
  "MenuItem"
) as unknown as ComponentClass<MenuItemLike>;
const MenuButtonBase = videojs.getComponent(
  "MenuButton"
) as unknown as ComponentClass<MenuButtonLike>;

/** The name `addOrderedControl` and `controlBar.getChild` know it by. */
export const VR_BUTTON_NAME = "peekVrButton";

export const HTTPS_NOTE = "Headset mode needs HTTPS";

/** What the menu shows, read each time it is built or refreshed. */
export interface VrMenuModel {
  enabled: boolean;
  projection: VrProjection;
  /** `window.isSecureContext`: false hides nothing, it adds the note. */
  secure: boolean;
}

export interface VrMenuOptions {
  state: () => VrMenuModel;
  onToggle: () => void;
  onProjection: (projection: VrProjection) => void;
}

const PROJECTION_LABELS: Record<VrProjection, string> = {
  "180_LR": "180° stereo",
  "180_MONO": "180° mono",
  "360": "360° mono",
  "360_LR": "360° stereo, side by side",
  "360_TB": "360° stereo, top and bottom",
  FISHEYE_180_LR: "Fisheye 180° stereo",
  FISHEYE_200_LR: "Fisheye 200° stereo",
  FISHEYE_220_LR: "Fisheye 220° stereo",
  EAC_LR: "Equi-angular cube stereo",
  SBS_MONO: "Flat, side by side",
};

class VrMenuItem extends MenuItemBase {
  onSelect: () => void;

  constructor(
    player: unknown,
    options: {
      label: string;
      selectable: true;
      multiSelectable: boolean;
      selected: boolean;
      onSelect: () => void;
    }
  ) {
    super(player, options);
    this.onSelect = options.onSelect;
  }

  // The state follows `refresh()`, not the click: video.js's own handler
  // would tick the item before the plugin has loaded
  handleClick() {
    this.onSelect();
  }
}

export class VrMenuButton extends MenuButtonBase {
  // `declare`: a field with no initialiser would reset what `createItems`
  // sets while the base class constructor builds the first menu
  declare vrToggle: VrMenuItem | undefined;
  declare vrRadios: Array<[VrProjection, VrMenuItem]> | undefined;

  constructor(player: unknown, options: VrMenuOptions) {
    super(player, { ...options, name: VR_BUTTON_NAME });
    this.controlText("VR");
  }

  createEl() {
    const el = document.createElement("div");
    el.className =
      "vjs-vr-button vjs-menu-button vjs-menu-button-popup vjs-control vjs-button";
    return el;
  }

  createItems(): ComponentLike[] {
    const { state, onToggle, onProjection } = this.options_ as VrMenuOptions;
    const model = state();
    const player = this.player();
    const items: ComponentLike[] = [];

    if (!model.secure) {
      const note = document.createElement("li");
      note.className = "vjs-menu-title vjs-vr-note";
      note.setAttribute("role", "presentation");
      note.textContent = HTTPS_NOTE;
      items.push(new ComponentBase(player, { el: note }));
    }

    this.vrToggle = new VrMenuItem(player, {
      label: "VR view",
      selectable: true,
      multiSelectable: true,
      selected: model.enabled,
      onSelect: onToggle,
    });
    items.push(this.vrToggle);

    this.vrRadios = VR_PROJECTIONS.map((projection) => {
      const item = new VrMenuItem(player, {
        label: PROJECTION_LABELS[projection],
        selectable: true,
        multiSelectable: false,
        selected: projection === model.projection,
        onSelect: () => onProjection(projection),
      });
      items.push(item);
      return [projection, item];
    });
    return items;
  }

  /** Brings the checked states in line with the model, without a rebuild. */
  refresh() {
    const model = (this.options_ as VrMenuOptions).state();
    this.vrToggle?.selected(model.enabled);
    for (const [projection, item] of this.vrRadios ?? []) {
      item.selected(projection === model.projection);
    }
  }
}
