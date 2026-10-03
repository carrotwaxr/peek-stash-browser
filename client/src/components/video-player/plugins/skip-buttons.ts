import videojs from "video.js";

/** A control bar button, as this plugin shows and hides it */
interface Shown {
  show(): void;
  hide(): void;
}

/**
 * The playlist's Previous and Next buttons. Each shows only while the queue
 * gives it a handler. Hidden, a button carries video.js's `vjs-hidden`, so
 * the control bar's container queries (VideoPlayer.css) count only the
 * buttons that show.
 */
class SkipButtonPlugin extends videojs.getPlugin("plugin") {
  onNext: (() => void) | undefined;
  onPrevious: (() => void) | undefined;
  declare player: any;
  private nextButton: Shown | undefined;
  private previousButton: Shown | undefined;

  constructor(player: any) {
    super(player);

    this.onNext = undefined;
    this.onPrevious = undefined;

    player.ready(() => {
      this.ready();
    });
  }

  setForwardHandler(handler: (() => void) | undefined) {
    this.onNext = handler;
    if (handler !== undefined) this.player.addClass("vjs-skip-buttons-next");
    else this.player.removeClass("vjs-skip-buttons-next");
    this.showButtons();
  }

  setBackwardHandler(handler: (() => void) | undefined) {
    this.onPrevious = handler;
    if (handler !== undefined) this.player.addClass("vjs-skip-buttons-prev");
    else this.player.removeClass("vjs-skip-buttons-prev");
    this.showButtons();
  }

  /** Each button shows while it has a handler (before ready, none exist) */
  private showButtons() {
    const toggle = (button: Shown | undefined, shown: boolean) => {
      if (shown) button?.show();
      else button?.hide();
    };
    toggle(this.nextButton, this.onNext !== undefined);
    toggle(this.previousButton, this.onPrevious !== undefined);
  }

  handleForward() {
    if (this.onNext) this.onNext();
  }

  handleBackward() {
    if (this.onPrevious) this.onPrevious();
  }

  ready() {
    this.player.addClass("vjs-skip-buttons");

    this.nextButton = this.player.controlBar.addChild(
      "skipButton",
      {
        direction: "forward",
        parent: this,
      },
      1
    ) as Shown;

    this.previousButton = this.player.controlBar.addChild(
      "skipButton",
      {
        direction: "back",
        parent: this,
      },
      0
    ) as Shown;
    this.showButtons();
  }
}

class SkipButton extends videojs.getComponent("button") {
  parentPlugin: any;
  direction: string;

  constructor(player: any, options: any) {
    super(player, options);

    this.parentPlugin = options.parent;
    this.direction = options.direction;

    if (options.direction === "forward") {
      this.controlText(this.localize("Skip to next video"));
      this.addClass("vjs-icon-next-item");
    } else if (options.direction === "back") {
      this.controlText(this.localize("Skip to previous video"));
      this.addClass("vjs-icon-previous-item");
    }
  }

  buildCSSClass() {
    return `vjs-skip-button ${super.buildCSSClass()}`;
  }

  handleClick() {
    if (this.direction === "forward") this.parentPlugin.handleForward();
    else this.parentPlugin.handleBackward();
  }
}

videojs.registerComponent("SkipButton", SkipButton);
videojs.registerPlugin("skipButtons", SkipButtonPlugin);

export default SkipButtonPlugin;
