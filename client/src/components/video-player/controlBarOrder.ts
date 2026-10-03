/**
 * One order for the control-bar buttons that appear at different times
 * (AirPlay at player init, VR when the scene says so, Cast when the SDK
 * resolves). `addOrderedControl` places each by this order, whichever is added
 * first. It has no feature logic.
 */
export const CONTROL_BAR_ORDER = [
  "peekVrButton",
  "peekAirPlayButton",
  "peekCastButton",
  "fullscreenToggle",
] as const;

export type OrderedControlName = (typeof CONTROL_BAR_ORDER)[number];

/** A video.js control: what the bar holds. */
export interface BarControl {
  el(): Element;
}

/** The part of a video.js player this module uses (video.js types it `any`). */
export interface ControlBarPlayer {
  controlBar: {
    children(): BarControl[];
    getChild(name: string): BarControl | undefined;
    addChild(
      child: string | BarControl,
      options?: Record<string, unknown>,
      index?: number
    ): BarControl;
  };
}

/**
 * Adds the control `name` to the player's control bar before the first control
 * already present that comes later in `CONTROL_BAR_ORDER`, else at the end. A
 * second add of the same name returns the existing control.
 */
export function addOrderedControl(
  player: ControlBarPlayer,
  name: string,
  component: string | BarControl,
  options?: Record<string, unknown>
): BarControl {
  const position = (CONTROL_BAR_ORDER as readonly string[]).indexOf(name);
  if (position === -1) {
    throw new Error(`addOrderedControl: "${name}" is not in CONTROL_BAR_ORDER`);
  }
  const controlBar = player.controlBar;
  const existing = controlBar.getChild(name);
  if (existing) return existing;

  const children = controlBar.children();
  let index = children.length;
  for (const later of CONTROL_BAR_ORDER.slice(position + 1)) {
    const control = controlBar.getChild(later);
    if (control) {
      index = children.indexOf(control);
      break;
    }
  }
  return controlBar.addChild(component, options, index);
}
