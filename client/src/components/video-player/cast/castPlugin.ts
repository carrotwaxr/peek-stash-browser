/**
 * The Cast button in the control bar and the "Casting to ..." line over the
 * player. They hold no cast logic: `CastSessionController` tells them what to
 * show and handles the click.
 */
import videojs from "video.js";
import { type ControlBarPlayer, addOrderedControl } from "../controlBarOrder";

/** The control's name in `CONTROL_BAR_ORDER` */
const BUTTON_NAME = "peekCastButton";
const STATUS_NAME = "PeekCastStatus";

/** Cast's `CastState` values the button reads */
const NO_DEVICES_AVAILABLE = "NO_DEVICES_AVAILABLE";
const CONNECTED = "CONNECTED";

/** A video.js component as this module uses it */
interface Control {
  el(): HTMLElement;
  show(): void;
  hide(): void;
  addClass(name: string): void;
  removeClass(name: string): void;
  dispose(): void;
}

/** The part of a video.js player this module uses (video.js types it `any`) */
export interface CastControlsPlayer extends ControlBarPlayer {
  addChild(name: string): Control;
  getChild(name: string): Control | undefined;
  removeChild(child: Control): void;
}

/** The control bar can also take a child out */
type RemovableBar = ControlBarPlayer["controlBar"] & {
  removeChild(child: Control): void;
};

/** video.js's Button: the part this class extends */
interface ButtonBase {
  controlText(text: string): void;
  buildCSSClass(): string;
  handleClick(): void;
}

const Button = videojs.getComponent("Button") as new (
  player: CastControlsPlayer,
  options?: object
) => ButtonBase;

class CastButton extends Button {
  /** Set by `addCastButton`, so a reused button calls the latest handler */
  onPress: (() => void) | undefined;

  constructor(player: CastControlsPlayer, options?: object) {
    super(player, options);
    this.controlText("Cast");
  }

  override buildCSSClass() {
    return `vjs-cast-button ${super.buildCSSClass()}`;
  }

  override handleClick() {
    this.onPress?.();
  }
}

/** video.js's Component: the part the status line extends */
interface ComponentBase {
  createEl(tag: string, props?: object, attributes?: object): HTMLElement;
}

const Component = videojs.getComponent("Component") as new (
  player: CastControlsPlayer,
  options?: object
) => ComponentBase;

class CastStatus extends Component {
  override createEl() {
    // A live region from the start, so a screen reader announces the change
    return super.createEl(
      "div",
      { className: "vjs-cast-status" },
      { role: "status", "aria-live": "polite" }
    );
  }
}

videojs.registerComponent("PeekCastButton", CastButton);
videojs.registerComponent(STATUS_NAME, CastStatus);

export interface CastButtonControl {
  /**
   * Hidden while no Cast device is in range; named for what a press does.
   * `attached` false: the session plays another scene, and a press casts
   * this one into it.
   */
  setCastState(
    castState: string,
    deviceName: string | null,
    attached?: boolean
  ): void;
  remove(): void;
}

/**
 * Adds the Cast button in the control bar's order (C9) through
 * `addOrderedControl`, hidden until the first cast state. A second add returns
 * the button already there.
 */
export function addCastButton(
  player: CastControlsPlayer,
  onPress: () => void
): CastButtonControl {
  const button = addOrderedControl(
    player,
    BUTTON_NAME,
    "PeekCastButton"
  ) as unknown as CastButton & Control;
  button.onPress = onPress;
  button.hide();

  return {
    setCastState(castState, deviceName, attached = true) {
      if (castState === NO_DEVICES_AVAILABLE) button.hide();
      else button.show();

      if (castState === CONNECTED) {
        button.addClass("vjs-cast-connected");
        const action = attached ? "Stop casting" : "Cast this scene";
        button.controlText(deviceName ? `${action} (${deviceName})` : action);
      } else {
        button.removeClass("vjs-cast-connected");
        button.controlText("Cast");
      }
    },
    remove() {
      const bar = player.controlBar as RemovableBar;
      if (bar.getChild(BUTTON_NAME) !== button) return;
      bar.removeChild(button);
      button.dispose();
    },
  };
}

export interface CastStatusControl {
  /**
   * "Casting to <device>" while attached, "Casting on <device>" when another
   * tab loaded the media (this one only mirrors it); null empties the line
   */
  show(deviceName: string | null, loadedHere?: boolean): void;
  remove(): void;
}

/** Adds the status line over the player; a second add reuses it */
export function addCastStatus(player: CastControlsPlayer): CastStatusControl {
  const status = player.getChild(STATUS_NAME) ?? player.addChild(STATUS_NAME);

  return {
    show(deviceName, loadedHere = true) {
      const preposition = loadedHere ? "to" : "on";
      status.el().textContent = deviceName
        ? `Casting ${preposition} ${deviceName}`
        : "";
      if (deviceName) status.addClass("vjs-cast-status-active");
      else status.removeClass("vjs-cast-status-active");
    },
    remove() {
      if (player.getChild(STATUS_NAME) !== status) return;
      player.removeChild(status);
      status.dispose();
    },
  };
}
