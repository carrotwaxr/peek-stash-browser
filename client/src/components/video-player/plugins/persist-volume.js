import videojs from "video.js";
import localForage from "localforage";

const levelKey = "volume-level";
const mutedKey = "volume-muted";

class PersistVolumePlugin extends videojs.getPlugin("plugin") {
  constructor(player, options) {
    super(player, options);

    this.enabled = options?.enabled ?? true;

    player.on("volumechange", () => {
      if (this.enabled) {
        localForage.setItem(levelKey, player.volume());
        localForage.setItem(mutedKey, player.muted());
      }
    });

    player.ready(() => {
      this.ready();
    });
  }

  ready() {
    localForage.getItem(levelKey).then((value) => {
      if (value !== null) {
        this.player.volume(value);
      }
    });

    localForage.getItem(mutedKey).then((value) => {
      if (value !== null) {
        this.player.muted(value);
      }
    });
  }
}

// Register the plugin with video.js.
videojs.registerPlugin("persistVolume", PersistVolumePlugin);

export default PersistVolumePlugin;
