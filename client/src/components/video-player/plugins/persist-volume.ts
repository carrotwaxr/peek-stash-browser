import videojs from "video.js";

const levelKey = "volume-level";
const mutedKey = "volume-muted";

// Storage can be unavailable (a private window, blocked site data): the
// volume then just isn't remembered
const logStorageError = (err: unknown) => {
  console.warn("[Persist Volume] Volume storage failed:", err);
};

function store(key: string, value: number | boolean) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    logStorageError(err);
  }
}

function load(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch (err) {
    logStorageError(err);
    return null;
  }
}

class PersistVolumePlugin extends videojs.getPlugin("plugin") {
  enabled: boolean;
  declare player: any;

  constructor(player: any, options: any) {
    super(player, options);

    this.enabled = options?.enabled ?? true;

    player.on("volumechange", () => {
      if (this.enabled) {
        store(levelKey, player.volume() as number);
        store(mutedKey, player.muted() as boolean);
      }
    });

    player.ready(() => {
      this.ready();
    });
  }

  ready() {
    const level = load(levelKey);
    if (typeof level === "number") {
      this.player.volume(level);
    }

    const muted = load(mutedKey);
    if (typeof muted === "boolean") {
      this.player.muted(muted);
    }
  }
}

// Register the plugin with video.js.
videojs.registerPlugin("persistVolume", PersistVolumePlugin);

export default PersistVolumePlugin;
