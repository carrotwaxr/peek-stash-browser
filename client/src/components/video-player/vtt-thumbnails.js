import videojs from "video.js";
import { WebVTT } from "videojs-vtt.js";

/**
 * VTT Thumbnails Plugin for Video.js
 *
 * Based on Stash's implementation - shows sprite sheet thumbnails when hovering over seek bar.
 * Parses VTT files with sprite coordinates and displays thumbnails using CSS background positioning.
 */

class VTTThumbnailsPlugin extends videojs.getPlugin("plugin") {
  constructor(player, options) {
    super(player, options);
    this.source = options.src || null;
    this.spriteUrl = options.spriteUrl || null;
    this.showTimestamp = options.showTimestamp !== undefined ? options.showTimestamp : false;

    this.progressBar = null;
    this.thumbnailHolder = null;
    this.showing = false;
    this.vttData = null;
    this.lastStyle = null;

    player.ready(() => {
      player.addClass("vjs-vtt-thumbnails");
      this.initializeThumbnails();
    });
  }

  src(source, spriteUrl) {
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

  resetPlugin() {
    this.showing = false;

    if (this.thumbnailHolder) {
      this.thumbnailHolder.remove();
      this.thumbnailHolder = null;
    }

    if (this.progressBar) {
      this.progressBar.removeEventListener("pointerenter", this.onBarPointerEnter);
      this.progressBar.removeEventListener("pointermove", this.onBarPointerMove);
      this.progressBar.removeEventListener("pointerleave", this.onBarPointerLeave);
      this.progressBar = null;
    }

    this.vttData = null;
    this.lastStyle = null;
  }

  initializeThumbnails() {
    if (!this.source) {
      return;
    }

    const baseUrl = this.getBaseUrl();
    const url = this.getFullyQualifiedUrl(this.source, baseUrl);

    this.getVttFile(url).then((data) => {
      this.vttData = this.processVtt(data);
      this.setupThumbnailElement();
    }).catch((err) => {
      console.error('[VTT Thumbnails] Failed to load VTT file:', err);
    });
  }

  getBaseUrl() {
    return [
      window.location.protocol,
      "//",
      window.location.hostname,
      window.location.port ? ":" + window.location.port : "",
      window.location.pathname,
    ]
      .join("")
      .split(/([^\/]*)$/gi)[0];
  }

  getVttFile(url) {
    return new Promise((resolve, reject) => {
      const req = new XMLHttpRequest();
      req.addEventListener("load", () => {
        resolve(req.responseText);
      });
      req.addEventListener("error", (e) => {
        reject(e);
      });
      req.open("GET", url);
      req.send();
    });
  }

  setupThumbnailElement() {
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
  }

  onBarPointerEnter = () => {
    this.showThumbnailHolder();
    if (this.progressBar) {
      this.progressBar.addEventListener("pointermove", this.onBarPointerMove);
    }
  };

  onBarPointerMove = (e) => {
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
      this.progressBar.removeEventListener("pointermove", this.onBarPointerMove);
    }
  };

  getStyleForTime(time) {
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

  updateThumbnailStyle(percent, width) {
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
      this.thumbnailHolder.style.transform = "translateX(" + (xPos - halfThumbnailWidth) + "px)";
    } else if (marginLeft <= 0) {
      this.thumbnailHolder.style.transform = "translateX(" + 0 + "px)";
    } else if (marginRight <= 0) {
      this.thumbnailHolder.style.transform = "translateX(" + (width - thumbnailWidth) + "px)";
    }

    if (this.lastStyle && this.lastStyle === currentStyle) {
      return;
    }

    this.lastStyle = currentStyle;

    Object.assign(this.thumbnailHolder.style, currentStyle);
  }

  processVtt(data) {
    const processedVtts = [];

    const parser = new WebVTT.Parser(window, WebVTT.StringDecoder());
    parser.oncue = (cue) => {
      processedVtts.push({
        start: cue.startTime,
        end: cue.endTime,
        style: this.getVttStyle(cue.text),
      });
    };
    parser.parse(data);
    parser.flush();

    return processedVtts;
  }

  getFullyQualifiedUrl(path, base) {
    if (path.indexOf("//") >= 0) {
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

  getPropsFromDef(def) {
    const match = def.match(/^([^#]*)#xywh=(\d+),(\d+),(\d+),(\d+)$/i);
    if (!match) return null;

    return {
      image: match[1],
      x: match[2],
      y: match[3],
      w: match[4],
      h: match[5],
    };
  }

  getVttStyle(vttImageDef) {
    // Parse the coordinates from the VTT definition
    const imageProps = this.getPropsFromDef(vttImageDef);
    if (!imageProps) return null;

    // Use the sprite URL provided by scene.paths.sprite (already properly proxied)
    // instead of parsing from VTT file which has Stash's internal paths
    const spriteUrl = this.spriteUrl || imageProps.image;

    return {
      background: 'url("' + spriteUrl + '") no-repeat -' + imageProps.x + "px -" + imageProps.y + "px",
      width: imageProps.w + "px",
      height: imageProps.h + "px",
    };
  }

  trim(str, charlist) {
    let whitespace = [
      " ", "\n", "\r", "\t", "\f", "\x0b", "\xa0", "\u2000", "\u2001", "\u2002",
      "\u2003", "\u2004", "\u2005", "\u2006", "\u2007", "\u2008", "\u2009",
      "\u200a", "\u200b", "\u2028", "\u2029", "\u3000",
    ].join("");
    let l = 0;

    str += "";
    if (charlist) {
      whitespace = (charlist + "").replace(/([[\]().?/*{}+$^:])/g, "$1");
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
