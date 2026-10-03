import videojs from "video.js";
import { type PlayerSource, isDirectSource } from "../playerSources";
import { togglePlaybackRateControl } from "../videoPlayerUtils";

class SourceMenuItem extends videojs.getComponent("MenuItem") {
  source: PlayerSource;
  isSelected: boolean;

  constructor(parent: any, source: PlayerSource) {
    const options: any = {};
    options.selectable = true;
    options.multiSelectable = false;
    options.label = source.label || source.type;

    super(parent.player(), options);

    this.source = source;
    this.isSelected = false;

    this.addClass("vjs-source-menu-item");
  }

  selected(selected: any) {
    super.selected(selected);
    this.isSelected = selected;
  }

  handleClick() {
    if (this.isSelected) return;

    this.trigger("selected");
  }
}

class SourceMenuButton extends videojs.getComponent("MenuButton") {
  items: SourceMenuItem[];
  selectedSource: PlayerSource | null;

  constructor(player: any) {
    super(player);

    this.items = [];
    this.selectedSource = null;

    player.on("loadstart", () => {
      this.update();
    });
  }

  setSources(sources: PlayerSource[]) {
    this.selectedSource = null;

    this.items = sources.map((source, i) => {
      if (i === 0) {
        this.selectedSource = source;
      }

      const item = new SourceMenuItem(this, source);

      item.on("selected", () => {
        this.selectedSource = item.source;

        this.trigger("sourceselected", item.source);
      });

      return item;
    });
  }

  /** The same sources at new addresses: the selection stays where it is */
  refreshSources(sources: PlayerSource[]) {
    const index = this.items.findIndex((i) => i.source === this.selectedSource);
    this.items.forEach((item, i) => {
      item.source = sources[i] ?? item.source;
    });
    this.selectedSource = this.items[index]?.source ?? this.selectedSource;
  }

  createEl() {
    return videojs.dom.createEl("div", {
      className:
        "vjs-source-selector vjs-menu-button vjs-menu-button-popup vjs-control vjs-button",
    });
  }

  createItems() {
    if (this.items === undefined) return [];

    for (const item of this.items) {
      item.selected(item.source === this.selectedSource);
    }

    return this.items;
  }

  setSelectedSource(source: any) {
    this.selectedSource = source;
    if (this.items === undefined) return;

    for (const item of this.items) {
      item.selected(item.source === this.selectedSource);
    }
  }

  markSourceErrored(source: any) {
    const item = this.items.find(
      (i: SourceMenuItem) => i.source.src === source.src
    );
    if (item === undefined) return;

    item.addClass("vjs-source-menu-item-error");
  }
}

const MEDIA_ERR_NETWORK = 2;
const MEDIA_ERR_DECODE = 3;
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** A dropped stream is tried again after these waits, then the next source */
export const NETWORK_RETRY_DELAYS_MS = [1000, 3000];

/** What the fallback calls on the player (video.js's player has all of it) */
export interface SourceFallbackPlayer {
  on(event: string, handler: () => void): void;
  one(event: string, handler: () => void): void;
  error(error?: { code: number }): { code: number } | null;
  currentSrc(): string;
  currentTime(seconds?: number): number;
  src(source: PlayerSource): void;
  load(): void;
  play(): Promise<void> | undefined;
  paused(): boolean;
  videoWidth(): number;
  videoHeight(): number;
  isDisposed(): boolean;
}

/** The source menu, which shows the source playing and the failed ones */
export interface SourceFallbackMenu {
  setSelectedSource(source: PlayerSource): void;
  markSourceErrored(source: PlayerSource): void;
}

export interface SourceSelectorOptions {
  /**
   * Asked before a retry or a fallback; true stops it (the hook's session
   * check, which has already sent a lost session to login)
   */
  beforeFallback?: () => Promise<boolean> | boolean;
}

/**
 * The player's one fallback path. The sources come in the order to try
 * them (`buildPlayerSources`). A codec error (or a file with no picture)
 * loads the next source once; a network error retries the same source at
 * the same time after 1 s and 3 s, then moves on. After a source the user
 * chose fails, nothing else loads. The rate menu shows only on Direct and
 * MKV, which play at any rate.
 */
export class SourceFallback {
  private sources: PlayerSource[] = [];
  private selectedIndex = -1;
  /** Don't move on by itself after a source the user picked */
  private manuallySelected = false;
  /** Network retries spent on the current source */
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** The time to start the next load at, kept until something plays */
  private resumeAt: number | null = null;
  /** Counts loads, so an answer for a load since replaced changes nothing */
  private loadCount = 0;

  constructor(
    private readonly player: SourceFallbackPlayer,
    private readonly menu: SourceFallbackMenu,
    private readonly options: SourceSelectorOptions = {}
  ) {
    player.on("error", () => {
      void this.handleError();
    });

    player.on("loadstart", () => {
      togglePlaybackRateControl(player, isDirectSource(player.currentSrc()));
    });

    player.on("playing", () => {
      this.retries = 0;
      this.resumeAt = null;
    });

    player.on("loadedmetadata", () => {
      if (player.videoWidth() || player.videoHeight()) return;
      // Occurs during preload when videos with supported audio/unsupported
      // video are preloaded. Treat this as a decoding error and try the next
      // source without playing. Safari reports a media event when an m3u8 or
      // mpd loads, which is not one.
      if (player.error() !== null) return;
      const currentSrc = player.currentSrc();
      if (!currentSrc) return;
      if (currentSrc.includes(".m3u8") || currentSrc.includes(".mpd")) {
        void player.play()?.catch(() => {});
      } else {
        player.error({ code: MEDIA_ERR_SRC_NOT_SUPPORTED });
      }
    });
  }

  /** A scene's sources: the first loads */
  setSources(sources: PlayerSource[]): void {
    this.cancelRetry();
    this.sources = sources;
    this.selectedIndex = sources.length > 0 ? 0 : -1;
    this.manuallySelected = false;
    this.retries = 0;
    this.resumeAt = null;
    this.loadCount += 1;
    const first = sources[0];
    if (first) this.player.src(first);
  }

  /**
   * The same sources at new addresses (a renewed link): the selected one and
   * a pending retry stay, and the next load reads the new address
   */
  refreshSources(sources: PlayerSource[]): void {
    this.sources = sources;
  }

  /** The user picked `source` in the menu: it loads at the current time */
  select(source: PlayerSource): void {
    const index = this.sources.findIndex((s) => s.src === source.src);
    const chosen = this.sources[index];
    if (!chosen) return;
    this.cancelRetry();
    this.selectedIndex = index;
    this.manuallySelected = true;
    this.retries = 0;
    this.resumeAt = this.player.currentTime();
    this.menu.setSelectedSource(chosen);
    this.load(chosen, !this.player.paused());
  }

  private retryPending(): boolean {
    return this.retryTimer !== null;
  }

  private cancelRetry(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** Loads `source` at `resumeAt`, and plays it when `play` */
  private load(source: PlayerSource, play: boolean): void {
    this.loadCount += 1;
    const load = this.loadCount;
    const time = this.resumeAt;
    this.player.src(source);
    this.player.load();
    if (time) {
      this.player.one("canplay", () => {
        if (load === this.loadCount) this.player.currentTime(time);
      });
    }
    if (play) void this.player.play()?.catch(() => {});
  }

  private async handleError(): Promise<void> {
    // A retry is already waiting for this source
    if (this.retryPending()) return;
    const error = this.player.error();
    if (!error) return;
    const { code } = error;
    if (
      code !== MEDIA_ERR_NETWORK &&
      code !== MEDIA_ERR_DECODE &&
      code !== MEDIA_ERR_SRC_NOT_SUPPORTED
    ) {
      return;
    }
    const load = this.loadCount;
    const time = this.player.currentTime();
    const paused = this.player.paused();

    if (await this.options.beforeFallback?.()) return;
    // Another source (or scene) loaded while the check was out
    if (load !== this.loadCount || this.retryPending()) return;
    const current = this.sources[this.selectedIndex];
    if (!current) return;
    this.resumeAt ??= time;

    const delay = NETWORK_RETRY_DELAYS_MS[this.retries];
    if (code === MEDIA_ERR_NETWORK && delay !== undefined) {
      this.retries += 1;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (load === this.loadCount) this.load(current, !paused);
      }, delay);
      return;
    }

    this.menu.markSourceErrored(current);
    if (this.manuallySelected) return;

    const next = this.sources[this.selectedIndex + 1];
    if (!next) {
      console.log("No more sources in playlist");
      return;
    }
    this.selectedIndex += 1;
    this.retries = 0;
    console.log(`Trying next source in playlist: '${next.label ?? next.src}'`);
    this.menu.setSelectedSource(next);
    this.load(next, true);
  }
}

class SourceSelectorPlugin extends videojs.getPlugin("plugin") {
  menu: any;
  fallback: SourceFallback;
  cleanupTextTracks: any[];
  manualTextTracks: any[];
  declare player: any;

  constructor(player: any, options?: SourceSelectorOptions) {
    super(player);

    this.menu = new SourceMenuButton(player);
    this.fallback = new SourceFallback(
      player as SourceFallbackPlayer,
      this.menu as SourceFallbackMenu,
      options ?? {}
    );
    this.cleanupTextTracks = [];
    this.manualTextTracks = [];

    this.menu.on("sourceselected", (_: unknown, source: PlayerSource) => {
      this.fallback.select(source);
    });

    player.on("ready", () => {
      const { controlBar } = player;
      const fullscreenToggle = controlBar.getChild("fullscreenToggle").el();
      controlBar.addChild(this.menu);
      controlBar.el().insertBefore(this.menu.el(), fullscreenToggle);
    });
  }

  setSources(sources: PlayerSource[]) {
    const cleanupTracks = this.cleanupTextTracks.splice(0);
    for (const track of cleanupTracks) {
      this.player.removeRemoteTextTrack(track);
    }

    this.menu.setSources(sources);
    this.fallback.setSources(sources);
  }

  refreshSources(sources: PlayerSource[]) {
    (this.menu as SourceMenuButton).refreshSources(sources);
    this.fallback.refreshSources(sources);
  }

  get textTracks() {
    return [...this.cleanupTextTracks, ...this.manualTextTracks];
  }

  addTextTrack(options: any, manualCleanup: any) {
    const track = this.player.addRemoteTextTrack(options, true);
    if (manualCleanup) {
      this.manualTextTracks.push(track);
    } else {
      this.cleanupTextTracks.push(track);
    }
    return track;
  }

  removeTextTrack(track: any) {
    this.player.removeRemoteTextTrack(track);
    let index = this.manualTextTracks.indexOf(track);
    if (index != -1) {
      this.manualTextTracks.splice(index, 1);
    }
    index = this.cleanupTextTracks.indexOf(track);
    if (index != -1) {
      this.cleanupTextTracks.splice(index, 1);
    }
  }
}

// Register the plugin with video.js.
videojs.registerComponent("SourceMenuButton", SourceMenuButton);
videojs.registerPlugin("sourceSelector", SourceSelectorPlugin);

export default SourceSelectorPlugin;
