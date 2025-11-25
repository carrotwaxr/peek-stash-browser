import videojs from "video.js";

class SourceMenuItem extends videojs.getComponent("MenuItem") {
  constructor(parent, source) {
    const options = {};
    options.selectable = true;
    options.multiSelectable = false;
    options.label = source.label || source.type;

    super(parent.player(), options);

    this.source = source;
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

class SourceMenuButton extends videojs.getComponent("MenuButton") {
  constructor(player) {
    super(player);

    this.items = [];
    this.selectedSource = null;

    player.on("loadstart", () => {
      this.update();
    });
  }

  setSources(sources) {
    this.selectedSource = null;

    this.items = sources.map((source, i) => {
      if (i === 0) {
        this.selectedSource = source;
      }

      const item = new SourceMenuItem(this, source);

      item.on("selected", () => {
        this.selectedSource = source;

        this.trigger("sourceselected", source);
      });

      return item;
    });
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

  setSelectedSource(source) {
    this.selectedSource = source;
    if (this.items === undefined) return;

    for (const item of this.items) {
      item.selected(item.source === this.selectedSource);
    }
  }

  markSourceErrored(source) {
    const item = this.items.find((i) => i.source.src === source.src);
    if (item === undefined) return;

    item.addClass("vjs-source-menu-item-error");
  }
}

class SourceSelectorPlugin extends videojs.getPlugin("plugin") {
  constructor(player) {
    super(player);

    this.menu = new SourceMenuButton(player);
    this.sources = [];
    this.selectedIndex = -1;
    this.cleanupTextTracks = [];
    this.manualTextTracks = [];

    // don't auto play next source if user manually selected a source
    this.manuallySelected = false;

    this.menu.on("sourceselected", (_, source) => {
      this.selectedIndex = this.sources.findIndex((src) => src === source);
      if (this.selectedIndex === -1) return;

      this.manuallySelected = true;

      const loadSrc = this.sources[this.selectedIndex];

      const currentTime = player.currentTime();
      const paused = player.paused();

      player.src(loadSrc);
      player.one("canplay", () => {
        if (paused) {
          player.pause();
        }
        player.currentTime(currentTime);
      });
      player.play();
    });

    player.on("ready", () => {
      const { controlBar } = player;
      const fullscreenToggle = controlBar.getChild("fullscreenToggle").el();
      controlBar.addChild(this.menu);
      controlBar.el().insertBefore(this.menu.el(), fullscreenToggle);
    });

    player.on("loadedmetadata", () => {
      if (!player.videoWidth() && !player.videoHeight()) {
        // Occurs during preload when videos with supported audio/unsupported video are preloaded.
        // Treat this as a decoding error and try the next source without playing.
        // However on Safari we get an media event when m3u8 or mpd is loaded which needs to be ignored.
        if (player.error() !== null) return;

        const currentSrc = player.currentSrc();
        if (currentSrc === null) return;

        if (currentSrc.includes(".m3u8") || currentSrc.includes(".mpd")) {
          player.play();
        } else {
          player.error({ code: MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED });
          return;
        }
      }
    });

    player.on("error", () => {
      const error = player.error();
      if (!error) return;

      // Only try next source if media was unsupported
      if (
        error.code !== MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED &&
        error.code !== MediaError.MEDIA_ERR_DECODE
      )
        return;

      const currentSource = player.currentSource();
      console.log(`Source '${currentSource.label}' is unsupported`);

      // mark current source as errored
      currentSource.errored = true;
      this.menu.markSourceErrored(currentSource);

      // don't auto play next source if user manually selected a source
      if (this.manuallySelected) {
        return;
      }

      // TODO - make auto play next source configurable
      // try the next source in the list
      if (
        this.selectedIndex !== -1 &&
        this.selectedIndex + 1 < this.sources.length
      ) {
        this.selectedIndex += 1;
        const newSource = this.sources[this.selectedIndex];
        console.log(`Trying next source in playlist: '${newSource.label}'`);
        this.menu.setSelectedSource(newSource);

        const currentTime = player.currentTime();
        player.src(newSource);
        player.load();
        player.one("canplay", () => {
          player.currentTime(currentTime);
        });
        player.play();
      } else {
        console.log("No more sources in playlist");
      }
    });
  }

  setSources(sources) {
    const cleanupTracks = this.cleanupTextTracks.splice(0);
    for (const track of cleanupTracks) {
      this.player.removeRemoteTextTrack(track);
    }

    this.menu.setSources(sources);
    if (sources.length !== 0) {
      this.selectedIndex = 0;
    } else {
      this.selectedIndex = -1;
    }

    this.sources = sources;
    this.player.src(sources[0]);
  }

  get textTracks() {
    return [...this.cleanupTextTracks, ...this.manualTextTracks];
  }

  addTextTrack(options, manualCleanup) {
    const track = this.player.addRemoteTextTrack(options, true);
    if (manualCleanup) {
      this.manualTextTracks.push(track);
    } else {
      this.cleanupTextTracks.push(track);
    }
    return track;
  }

  removeTextTrack(track) {
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
