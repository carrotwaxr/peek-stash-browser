import videojs from "video.js";
import localForage from "localforage";

const levelKey = "volume-level";
const mutedKey = "volume-muted";

// Storage can be unavailable (a private window, blocked IndexedDB): the
// volume then just isn't remembered
const logStorageError = (err: unknown) => {
  console.warn("[Persist Volume] Volume storage failed:", err);
};

class PersistVolumePlugin extends videojs.getPlugin("plugin") {
  enabled: boolean;
  declare player: any;

  constructor(player: any, options: any) {
    super(player, options);

    this.enabled = options?.enabled ?? true;

    player.on("volumechange", () => {
      if (this.enabled) {
        localForage.setItem(levelKey, player.volume()).catch(logStorageError);
        localForage.setItem(mutedKey, player.muted()).catch(logStorageError);
      }
    });

    player.ready(() => {
      this.ready();
    });
  }

  ready() {
    localForage
      .getItem(levelKey)
      .then((value: any) => {
        if (value !== null) {
          this.player.volume(value);
        }
      })
      .catch(logStorageError);

    localForage
      .getItem(mutedKey)
      .then((value: any) => {
        if (value !== null) {
          this.player.muted(value);
        }
      })
      .catch(logStorageError);
  }
}

// Register the plugin with video.js.
videojs.registerPlugin("persistVolume", PersistVolumePlugin);

export default PersistVolumePlugin;
