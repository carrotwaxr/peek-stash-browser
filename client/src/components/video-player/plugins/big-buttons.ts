import videojs from "video.js";

const BigPlayButton = videojs.getComponent("BigPlayButton");

class BigPlayPauseButton extends BigPlayButton {
  handleClick(event: any) {
    if (this.player().paused()) {
      super.handleClick(event);
    } else {
      this.player().pause();
    }
  }

  buildCSSClass() {
    return "vjs-control vjs-button vjs-big-play-pause-button";
  }
}

class BigButtonGroup extends videojs.getComponent("Component") {
  constructor(player: any) {
    super(player);

    this.addChild("seekButton", {
      direction: "back",
      seconds: 10,
    });

    this.addChild("BigPlayPauseButton");

    this.addChild("seekButton", {
      direction: "forward",
      seconds: 10,
    });
  }

  createEl() {
    return super.createEl("div", {
      className: "vjs-big-button-group",
    });
  }
}

class BigButtonsPlugin extends videojs.getPlugin("plugin") {
  constructor(player: any) {
    super(player);

    player.ready(() => {
      player.addChild("BigButtonGroup");
    });
  }
}

// Register the plugin with video.js.
videojs.registerComponent("BigButtonGroup", BigButtonGroup);
videojs.registerComponent("BigPlayPauseButton", BigPlayPauseButton);
videojs.registerPlugin("bigButtons", BigButtonsPlugin);

export default BigButtonsPlugin;
