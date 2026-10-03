import videojs from "video.js";
import { isTVModeOn } from "../../../utils/keyTargets";
import { type ControlBarPlayer, addOrderedControl } from "../controlBarOrder";

/** The control's name in `CONTROL_BAR_ORDER` */
const BUTTON_NAME = "peekAirPlayButton";

/** Safari's AirPlay API on a media element (no other browser has it) */
interface AirPlayElement extends HTMLElement {
  webkitShowPlaybackTargetPicker?: () => void;
}

interface AirPlayAvailabilityEvent extends Event {
  availability?: string;
}

/** The part of a video.js player this module uses (video.js types it `any`) */
export interface AirPlayPlayer extends ControlBarPlayer {
  tech(options: { IWillNotUseThisInPlugins: boolean }): { el(): HTMLElement };
  ready(callback: () => void): void;
  one(event: string, callback: () => void): void;
  isDisposed(): boolean;
}

/** What `addOrderedControl` hands back for this button */
interface ShowHide {
  show(): void;
  hide(): void;
}

/** video.js's Button: the part this class extends */
interface ButtonBase {
  player(): AirPlayPlayer;
  controlText(text: string): void;
  buildCSSClass(): string;
  handleClick(): void;
}

const Button = videojs.getComponent("button") as new (
  player: AirPlayPlayer,
  options?: object
) => ButtonBase;

const techElement = (player: AirPlayPlayer) =>
  player.tech({ IWillNotUseThisInPlugins: true }).el() as AirPlayElement;

class AirPlayButton extends Button {
  constructor(player: AirPlayPlayer, options?: object) {
    super(player, options);
    this.controlText("AirPlay");
  }

  override buildCSSClass() {
    return `vjs-airplay-button ${super.buildCSSClass()}`;
  }

  override handleClick() {
    techElement(this.player()).webkitShowPlaybackTargetPicker?.();
  }
}

videojs.registerComponent("PeekAirPlayButton", AirPlayButton);

/**
 * Adds the AirPlay button to the player's control bar in Safari, shown while
 * an AirPlay target is in range and TV mode is off. Elsewhere it does
 * nothing. Returns the teardown.
 *
 * The attribute and the availability listener belong on the tech's <video>,
 * not on the <video-js> wrapper, so they are set once the tech exists.
 */
export function setupAirPlay(player: AirPlayPlayer): () => void {
  let teardown: (() => void) | undefined;
  let stopped = false;

  player.ready(() => {
    if (stopped || player.isDisposed()) return;
    const video = techElement(player);
    if (typeof video.webkitShowPlaybackTargetPicker !== "function") return;

    video.setAttribute("x-webkit-airplay", "allow");
    const button = addOrderedControl(
      player,
      BUTTON_NAME,
      "PeekAirPlayButton"
    ) as unknown as ShowHide;

    let available = false;
    const refresh = () => {
      if (available && !isTVModeOn()) button.show();
      else button.hide();
    };
    const onAvailability = (event: Event) => {
      available = (event as AirPlayAvailabilityEvent).availability === "available";
      refresh();
    };
    video.addEventListener(
      "webkitplaybacktargetavailabilitychanged",
      onAvailability
    );
    // TV mode is the class on <html>; it can change while the player lives
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    refresh();

    teardown = () => {
      video.removeEventListener(
        "webkitplaybacktargetavailabilitychanged",
        onAvailability
      );
      observer.disconnect();
    };
    // A disposed player's button is gone: stop watching <html> for it
    player.one("dispose", teardown);
  });

  return () => {
    stopped = true;
    teardown?.();
  };
}
