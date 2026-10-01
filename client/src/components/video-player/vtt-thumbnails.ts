import videojs from "video.js";
import { type SpriteCue, fetchSpriteVtt } from "../../utils/spriteSheet";

/**
 * VTT Thumbnails Plugin for Video.js
 *
 * Based on Stash's implementation - shows sprite sheet thumbnails when hovering over seek bar.
 * Parses VTT files with sprite coordinates (`parseSpriteVtt`, the cards'
 * parser) and displays thumbnails using CSS background positioning. A new
 * `src`, `detach` or the player's dispose aborts the load in flight, and an
 * answer for an earlier `src` is dropped, so a player shows one scene's
 * thumbnails in one holder.
 */

interface VttThumbnailStyle {
  background: string;
  width: string;
  height: string;
}

interface VttDataItem {
  start: number;
  end: number;
  style: VttThumbnailStyle | null;
}

/** The parts of the player the plugin reads after it is built */
interface ThumbnailPlayer {
  $(selector: string): HTMLElement | null;
  duration(): number;
}

class VTTThumbnailsPlugin extends videojs.getPlugin("plugin") {
  source: string | null;
  spriteUrl: string | null;
  showTimestamp: boolean;
  progressBar: HTMLElement | null;
  thumbnailHolder: HTMLElement | null;
  showing: boolean;
  vttData: VttDataItem[] | null;
  lastStyle: VttThumbnailStyle | null;
  isTouching: boolean;
  /** The load in flight; replaced by each `src`, aborted on reset */
  loadController: AbortController | null;
  declare player: ThumbnailPlayer;

  constructor(player: any, options: any) {
    super(player, options);
    this.source = options.src || null;
    this.spriteUrl = options.spriteUrl || null;
    this.showTimestamp =
      options.showTimestamp !== undefined ? options.showTimestamp : false;

    this.progressBar = null;
    this.thumbnailHolder = null;
    this.showing = false;
    this.vttData = null;
    this.lastStyle = null;
    this.isTouching = false;
    this.loadController = null;

    player.ready(() => {
      player.addClass("vjs-vtt-thumbnails");
      // A `src` called before ready has started its own load
      if (!this.loadController && !this.vttData) this.initializeThumbnails();
    });
  }

  src(source: string, spriteUrl?: string) {
    this.resetPlugin();
    this.source = source;
    if (spriteUrl !== undefined) {
      this.spriteUrl = spriteUrl;
    }
    this.initializeThumbnails();
  }

  detach() {
    this.resetPlugin();
  }

  dispose() {
    this.resetPlugin();
    super.dispose();
  }

  resetPlugin() {
    this.loadController?.abort();
    this.loadController = null;
    this.removeThumbnailElement();
    this.vttData = null;
    this.lastStyle = null;
  }

  /** Removes the holder and every listener `setupThumbnailElement` added */
  removeThumbnailElement() {
    this.showing = false;

    if (this.thumbnailHolder) {
      this.thumbnailHolder.remove();
      this.thumbnailHolder = null;
    }

    if (this.progressBar) {
      this.progressBar.removeEventListener(
        "pointerover",
        this.onBarPointerEnter
      );
      this.progressBar.removeEventListener(
        "pointermove",
        this.onBarPointerMove
      );
      this.progressBar.removeEventListener(
        "pointerout",
        this.onBarPointerLeave
      );
      this.progressBar.removeEventListener("touchstart", this.onTouchStart);
      this.progressBar.removeEventListener("touchmove", this.onTouchMove);
      this.progressBar.removeEventListener("touchend", this.onTouchEnd);
      this.progressBar = null;
    }
  }

  initializeThumbnails() {
    this.loadController?.abort();
    this.loadController = null;
    if (!this.source) {
      return;
    }

    const baseUrl = this.getBaseUrl();
    const url = this.getFullyQualifiedUrl(this.source, baseUrl);
    const controller = new AbortController();
    this.loadController = controller;

    fetchSpriteVtt(url, controller.signal)
      .then((cues) => {
        // An answer for an earlier src, or one after a reset, is not shown
        if (this.loadController !== controller) return;
        this.loadController = null;
        this.vttData = cues.map((cue) => this.toVttDataItem(cue));
        this.setupThumbnailElement();
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (this.loadController === controller) this.loadController = null;
        console.error("[VTT Thumbnails] Failed to load VTT file:", err);
      });
  }

  getBaseUrl() {
    return (
      [
        window.location.protocol,
        "//",
        window.location.hostname,
        window.location.port ? ":" + window.location.port : "",
        window.location.pathname,
      ]
        .join("")
        .split(/([^/]*)$/gi)[0] ?? ""
    ); // split() always returns a first part
  }

  setupThumbnailElement() {
    // One holder per player: drop any earlier one with its listeners
    this.removeThumbnailElement();
    const progressBar = this.player.$(".vjs-progress-control");
    if (!progressBar) return;
    this.progressBar = progressBar;

    const thumbHolder = document.createElement("div");
    thumbHolder.setAttribute("class", "vjs-vtt-thumbnail-display");
    progressBar.appendChild(thumbHolder);
    this.thumbnailHolder = thumbHolder;

    if (!this.showTimestamp) {
      const mouseDisplay = this.player.$(".vjs-mouse-display");
      if (mouseDisplay) {
        mouseDisplay.classList.add("vjs-hidden");
      }
    }

    progressBar.addEventListener("pointerover", this.onBarPointerEnter);
    progressBar.addEventListener("pointerout", this.onBarPointerLeave);

    // Touch support - show thumbnails while dragging on touch devices
    progressBar.addEventListener("touchstart", this.onTouchStart);
    progressBar.addEventListener("touchmove", this.onTouchMove);
    progressBar.addEventListener("touchend", this.onTouchEnd);
  }

  onBarPointerEnter = () => {
    this.showThumbnailHolder();
    if (this.progressBar) {
      this.progressBar.addEventListener("pointermove", this.onBarPointerMove);
    }
  };

  onBarPointerMove = (e: any) => {
    const { progressBar } = this;
    if (!progressBar) return;

    this.showThumbnailHolder();
    this.updateThumbnailStyle(
      videojs.dom.getPointerPosition(progressBar, e).x,
      progressBar.offsetWidth
    );
  };

  onBarPointerLeave = () => {
    this.hideThumbnailHolder();
    if (this.progressBar) {
      this.progressBar.removeEventListener(
        "pointermove",
        this.onBarPointerMove
      );
    }
  };

  onTouchStart = (e: TouchEvent) => {
    this.isTouching = true;
    this.showThumbnailHolder();
    this.onTouchMove(e);
  };

  onTouchMove = (e: TouchEvent) => {
    const { progressBar } = this;
    if (!progressBar || !this.isTouching) return;

    const touch = e.touches[0];
    if (!touch) return;
    const rect = progressBar.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const percent = x / rect.width;

    this.showThumbnailHolder();
    this.updateThumbnailStyle(percent, progressBar.offsetWidth);
  };

  onTouchEnd = () => {
    this.isTouching = false;
    // Delay hiding to allow user to see final position
    setTimeout(() => {
      if (!this.isTouching) {
        this.hideThumbnailHolder();
      }
    }, 500);
  };

  getStyleForTime(time: number) {
    if (!this.vttData) return null;

    for (const item of this.vttData) {
      if (time >= item.start && time < item.end) {
        return item.style;
      }
    }

    return null;
  }

  showThumbnailHolder() {
    if (this.thumbnailHolder && !this.showing) {
      this.showing = true;
      this.thumbnailHolder.style.opacity = "1";
    }
  }

  hideThumbnailHolder() {
    if (this.thumbnailHolder && this.showing) {
      this.showing = false;
      this.thumbnailHolder.style.opacity = "0";
    }
  }

  updateThumbnailStyle(percent: number, width: number) {
    if (!this.thumbnailHolder) return;

    const duration = this.player.duration();
    const time = percent * duration;
    const currentStyle = this.getStyleForTime(time);

    if (!currentStyle) {
      this.hideThumbnailHolder();
      return;
    }

    const xPos = percent * width;
    const thumbnailWidth = parseInt(currentStyle.width, 10);
    const halfThumbnailWidth = thumbnailWidth >> 1;
    const marginRight = width - (xPos + halfThumbnailWidth);
    const marginLeft = xPos - halfThumbnailWidth;

    if (marginLeft > 0 && marginRight > 0) {
      this.thumbnailHolder.style.transform = `translateX(${xPos - halfThumbnailWidth}px)`;
    } else if (marginLeft <= 0) {
      this.thumbnailHolder.style.transform = "translateX(0px)";
    } else if (marginRight <= 0) {
      this.thumbnailHolder.style.transform = `translateX(${width - thumbnailWidth}px)`;
    }

    if (this.lastStyle && this.lastStyle === currentStyle) {
      return;
    }

    this.lastStyle = currentStyle;

    Object.assign(this.thumbnailHolder.style, currentStyle);
  }

  toVttDataItem(cue: SpriteCue): VttDataItem {
    return {
      start: cue.startTime,
      end: cue.endTime,
      style: this.getVttStyle(cue),
    };
  }

  getFullyQualifiedUrl(path: string, base: string) {
    // If path contains "//" it's a full URL, or if it starts with "/" it's an absolute path
    if (path.indexOf("//") >= 0 || path.charAt(0) === "/") {
      return path;
    }

    if (base.indexOf("//") === 0) {
      return [base.replace(/\/$/gi, ""), this.trim(path, "/")].join("/");
    }

    if (base.indexOf("//") > 0) {
      return [this.trim(base, "/"), this.trim(path, "/")].join("/");
    }

    return path;
  }

  getVttStyle(cue: SpriteCue): VttThumbnailStyle {
    // Use the sprite URL provided by scene.paths.sprite (already properly proxied)
    // instead of parsing from VTT file which has Stash's internal paths
    const spriteUrl = this.spriteUrl || cue.image;

    return {
      background: `url("${spriteUrl}") no-repeat -${cue.x}px -${cue.y}px`,
      width: `${cue.width}px`,
      height: `${cue.height}px`,
    };
  }

  trim(str: string, charlist?: string) {
    let whitespace = [
      " ",
      "\n",
      "\r",
      "\t",
      "\f",
      "\x0b",
      "\xa0",
      "\u2000",
      "\u2001",
      "\u2002",
      "\u2003",
      "\u2004",
      "\u2005",
      "\u2006",
      "\u2007",
      "\u2008",
      "\u2009",
      "\u200a",
      "\u200b",
      "\u2028",
      "\u2029",
      "\u3000",
    ].join("");
    let l = 0;

    if (charlist) {
      whitespace = charlist.replace(/([[\]().?/*{}+$^:])/g, "$1");
    }

    l = str.length;
    for (let i = 0; i < l; i++) {
      if (whitespace.indexOf(str.charAt(i)) === -1) {
        str = str.substring(i);
        break;
      }
    }

    l = str.length;
    for (let i = l - 1; i >= 0; i--) {
      if (whitespace.indexOf(str.charAt(i)) === -1) {
        str = str.substring(0, i + 1);
        break;
      }
    }
    return whitespace.indexOf(str.charAt(0)) === -1 ? str : "";
  }
}

// Register the plugin with video.js
videojs.registerPlugin("vttThumbnails", VTTThumbnailsPlugin);

export default VTTThumbnailsPlugin;
