import videojs from "video.js";

class SkipButtonPlugin extends videojs.getPlugin("plugin") {
  onNext: (() => void) | undefined;
  onPrevious: (() => void) | undefined;
  declare player: any;

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
  }

  setBackwardHandler(handler: (() => void) | undefined) {
    this.onPrevious = handler;
    if (handler !== undefined) this.player.addClass("vjs-skip-buttons-prev");
    else this.player.removeClass("vjs-skip-buttons-prev");
  }

  handleForward() {
    if (this.onNext) this.onNext();
  }

  handleBackward() {
    if (this.onPrevious) this.onPrevious();
  }

  ready() {
    this.player.addClass("vjs-skip-buttons");

    this.player.controlBar.addChild(
      "skipButton",
      {
        direction: "forward",
        parent: this,
      },
      1
    );

    this.player.controlBar.addChild(
      "skipButton",
      {
        direction: "back",
        parent: this,
      },
      0
    );
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
