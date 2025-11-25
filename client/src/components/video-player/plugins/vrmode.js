import videojs from "video.js";
import "videojs-vr";

const VRType = {
  LR180: "180 LR",
  TB360: "360 TB",
  Mono360: "360 Mono",
  Off: "Off",
};

const vrTypeProjection = {
  [VRType.LR180]: "180_LR",
  [VRType.TB360]: "360_TB",
  [VRType.Mono360]: "360",
  [VRType.Off]: "NONE",
};

function isVrDevice() {
  return navigator.userAgent.match(/oculusbrowser|\svr\s/i);
}

class VRMenuItem extends videojs.getComponent("MenuItem") {
  constructor(parent, type) {
    const options = {};
    options.selectable = true;
    options.multiSelectable = false;
    options.label = type;

    super(parent.player(), options);

    this.type = type;
    this.isSelected = false;

    this.addClass("vjs-source-menu-item");
  }

  selected(selected) {
    super.selected(selected);
    this.isSelected = selected;
  }

  handleClick() {
    if (this.isSelected) return;

    this.trigger("selected");
  }
}

class VRMenuButton extends videojs.getComponent("MenuButton") {
  constructor(player) {
    super(player);

    this.items = [];
    this.selectedType = VRType.Off;

    this.setTypes();
  }

  onSelected(item) {
    this.selectedType = item.type;

    this.items.forEach((i) => {
      i.selected(i.type === this.selectedType);
    });

    this.trigger("typeselected", item.type);
  }

  setTypes() {
    this.items = Object.values(VRType).map((type) => {
      const item = new VRMenuItem(this, type);

      item.on("selected", () => {
        this.onSelected(item);
      });

      return item;
    });
    this.update();
  }

  createEl() {
    return videojs.dom.createEl("div", {
      className:
        "vjs-vr-selector vjs-menu-button vjs-menu-button-popup vjs-control vjs-button",
    });
  }

  createItems() {
    if (this.items === undefined) return [];

    for (const item of this.items) {
      item.selected(item.type === this.selectedType);
    }

    return this.items;
  }
}

class VRMenuPlugin extends videojs.getPlugin("plugin") {
  constructor(player, options) {
    super(player);

    this.menu = new VRMenuButton(player);
    this.showButton = options?.showButton ?? false;
    this.vr = undefined;

    if (isVrDevice()) return;

    this.vr = this.player.vr();

    this.menu.on("typeselected", (_, type) => {
      this.loadVR(type);
    });

    player.on("ready", () => {
      if (this.showButton) {
        this.addButton();
      }
    });
  }

  loadVR(type) {
    const projection = vrTypeProjection[type];
    if (this.vr) {
      this.vr.setProjection(projection);
      this.vr.init();
    }
  }

  addButton() {
    const { controlBar } = this.player;
    const fullscreenToggle = controlBar.getChild("fullscreenToggle").el();
    controlBar.addChild(this.menu);
    controlBar.el().insertBefore(this.menu.el(), fullscreenToggle);
  }

  removeButton() {
    const { controlBar } = this.player;
    controlBar.removeChild(this.menu);
  }

  setShowButton(showButton) {
    if (isVrDevice()) return;

    if (showButton === this.showButton) return;

    this.showButton = showButton;
    if (showButton) {
      this.addButton();
    } else {
      this.removeButton();
      this.loadVR(VRType.Off);
    }
  }
}

// Register the plugin with video.js.
videojs.registerComponent("VRMenuButton", VRMenuButton);
videojs.registerPlugin("vrMenu", VRMenuPlugin);

export default VRMenuPlugin;
