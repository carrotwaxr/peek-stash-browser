import videojs from "video.js";
import CryptoJS from "crypto-js";

interface MarkerSet {
  dot?: HTMLElement;
}

interface Marker {
  seconds: number;
  title: string;
  primaryTag?: { name: string } | null;
  /** The clip has no generated preview yet: its dot is hollow */
  ungenerated?: boolean;
}

/** A clip as the timeline reads it (`GET /scenes/:id/clips`) */
export interface ClipMarkerInput {
  seconds: number;
  title?: string | null;
  primaryTag?: { name: string } | null;
  isGenerated?: boolean;
}

/** The two calls the timeline placement makes on the (untyped) player */
interface TimelinePlayer {
  duration(): number;
  on(events: string[], handler: () => void): void;
}

const UNGENERATED_CLASS = "vjs-marker-ungenerated";

class MarkersPlugin extends videojs.getPlugin("plugin") {
  markers: Marker[];
  markerDivs: MarkerSet[];
  markerTooltip: HTMLElement | null;
  defaultTooltip: HTMLElement | null;
  layerHeight: number;
  tagColors: Record<string, string>;
  declare player: any;

  constructor(player: any) {
    super(player);

    this.markers = [];
    this.markerDivs = [];
    this.markerTooltip = null;
    this.defaultTooltip = null;
    this.layerHeight = 9;
    this.tagColors = {};

    player.ready(() => {
      const tooltip = videojs.dom.createEl("div");
      tooltip.className = "vjs-marker-tooltip";
      tooltip.style.visibility = "hidden";

      const parent = player
        .el()
        .querySelector(".vjs-progress-holder .vjs-mouse-display");
      if (parent) parent.appendChild(tooltip);
      this.markerTooltip = tooltip;

      this.defaultTooltip = player
        .el()
        .querySelector(".vjs-progress-holder .vjs-mouse-display .vjs-time-tooltip");
    });

    // The duration is unknown until the source's metadata loads, and a source
    // swap changes it: place every dot again whenever it does
    (player as TimelinePlayer).on(["durationchange", "loadedmetadata"], () => {
      this.positionDots();
    });
  }

  /** Put every dot where its second falls on the timeline, once the duration is known */
  positionDots() {
    const duration = (this.player as TimelinePlayer).duration();
    if (!Number.isFinite(duration) || duration <= 0) return;
    this.markers.forEach((marker, i) => {
      const dot = this.markerDivs[i]?.dot;
      if (!dot) return;
      // marker is 6px wide - adjust by 3px to align to center not left side
      dot.style.left = `calc(${(marker.seconds / duration) * 100}% - 3px)`;
      dot.style.visibility = "visible";
    });
  }

  showMarkerTooltip(title: string, layer = 0) {
    if (!this.markerTooltip) return;
    this.markerTooltip.innerText = title;
    this.markerTooltip.style.right = `${-this.markerTooltip.clientWidth / 2}px`;
    this.markerTooltip.style.top = `-${this.layerHeight * layer + 50}px`;
    this.markerTooltip.style.visibility = "visible";
    if (this.defaultTooltip) this.defaultTooltip.style.visibility = "hidden";
  }

  hideMarkerTooltip() {
    if (this.markerTooltip) this.markerTooltip.style.visibility = "hidden";
    if (this.defaultTooltip) this.defaultTooltip.style.visibility = "visible";
  }

  addDotMarker(marker: Marker) {
    const seekBar = this.player.el().querySelector(".vjs-progress-holder");

    const dot: HTMLElement = videojs.dom.createEl("div");
    dot.className = marker.ungenerated
      ? `vjs-marker ${UNGENERATED_CLASS}`
      : "vjs-marker";

    // Add event listeners to dot
    dot.addEventListener("click", () =>
      this.player.currentTime(marker.seconds)
    );
    dot.toggleAttribute("marker-tooltip-shown", true);

    // Set background color based on tag (if available)
    const dotColor = marker.primaryTag?.name
      ? this.tagColors[marker.primaryTag.name]
      : undefined;
    if (dotColor) {
      // A hollow dot keeps its tag color on the outline
      if (marker.ungenerated) dot.style.borderColor = dotColor;
      else dot.style.backgroundColor = dotColor;
    }
    dot.addEventListener("mouseenter", () => {
      this.showMarkerTooltip(marker.title);
      dot.toggleAttribute("marker-tooltip-shown", true);
    });

    dot.addEventListener("mouseout", () => {
      this.hideMarkerTooltip();
      dot.toggleAttribute("marker-tooltip-shown", false);
    });

    const markerSet: MarkerSet = { dot };
    if (seekBar) {
      seekBar.appendChild(dot);
    }
    this.markers.push(marker);
    this.markerDivs.push(markerSet);
    this.positionDots();
  }

  addDotMarkers(markers: Marker[]) {
    markers.forEach((marker) => {
      this.addDotMarker(marker);
    });
  }

  /**
   * Add clip markers to the timeline
   * Clips are converted to marker format with generated colors based on tag names
   * @param clips - Clip objects with seconds, title, primaryTag and isGenerated
   */
  addClipMarkers(clips: ClipMarkerInput[]) {
    if (clips.length === 0) return;

    // Extract unique tag names and generate colors
    const tagNames = [
      ...new Set(
        clips.flatMap((clip) => (clip.primaryTag?.name ? [clip.primaryTag.name] : []))
      ),
    ];

    if (tagNames.length > 0) {
      this.findColors(tagNames);
    }

    // Convert clips to marker format and add them
    const markers: Marker[] = clips.map((clip) => ({
      seconds: clip.seconds,
      title: clip.title || "Untitled",
      primaryTag: clip.primaryTag ?? null,
      ungenerated: clip.isGenerated === false,
    }));

    this.addDotMarkers(markers);
  }

  removeMarker(marker: Marker) {
    const i = this.markers.indexOf(marker);
    if (i === -1) return;

    this.markers.splice(i, 1);
    const markerSet = this.markerDivs.splice(i, 1)[0];
    if (!markerSet) return;

    if (markerSet.dot && markerSet.dot.hasAttribute("marker-tooltip-shown")) {
      this.hideMarkerTooltip();
    }

    if (markerSet.dot) markerSet.dot.remove();
  }

  removeMarkers(markers: Marker[]) {
    markers.forEach((marker) => {
      this.removeMarker(marker);
    });
  }

  clearMarkers() {
    for (const markerSet of this.markerDivs) {
      if (markerSet.dot && markerSet.dot.hasAttribute("marker-tooltip-shown")) {
        this.hideMarkerTooltip();
      }

      if (markerSet.dot) markerSet.dot.remove();
      }
    this.markers = [];
    this.markerDivs = [];
  }

  // Implementing the findColors method
  findColors(tagNames: string[]) {
    // Compute base hues for each tag
    const baseHues: Record<string, number> = {};
    for (const tag of tagNames) {
      baseHues[tag] = this.computeBaseHue(tag);
    }

    // Adjust hues to avoid similar colors
    const adjustedHues = this.adjustHues(baseHues);

    // Convert adjusted hues to colors and store in tagColors dictionary
    for (const tag of tagNames) {
      const hue = adjustedHues[tag];
      if (hue !== undefined) this.tagColors[tag] = this.hueToColor(hue);
    }
  }

  // Helper methods translated from Python

  // Compute base hue from tag name
  computeBaseHue(tag: string) {
    const hash = CryptoJS.SHA256(tag);
    const hashHex = hash.toString(CryptoJS.enc.Hex);
    const hashInt = BigInt(`0x${hashHex}`);
    const baseHue = Number(hashInt % BigInt(360)); // Map to [0, 360)
    return baseHue;
  }

  // Calculate minimum acceptable hue difference based on number of tags
  calculateDeltaMin(N: number) {
    const maxDeltaNeeded = 35;
    let scalingFactor;

    if (N <= 4) {
      scalingFactor = 0.8;
    } else if (N <= 10) {
      scalingFactor = 0.6;
    } else {
      scalingFactor = 0.4;
    }

    const deltaMin = Math.min((360 / N) * scalingFactor, maxDeltaNeeded);
    return deltaMin;
  }

  // Adjust hues to ensure minimum difference
  adjustHues(baseHues: Record<string, number>) {
    const adjustedHues: Record<string, number> = {};
    const tags = Object.keys(baseHues);
    const N = tags.length;
    const deltaMin = this.calculateDeltaMin(N);

    // Sort the tags by base hue
    const sortedEntries = Object.entries(baseHues).sort(
      ([, a], [, b]) => a - b
    );
    const sortedTags = sortedEntries.map(([tag]) => tag);
    // Get sorted base hues
    const baseHuesSorted = sortedEntries.map(([, hue]) => hue);

    // Unwrap hues to handle circular nature
    const unwrappedHues = [...baseHuesSorted];
    for (let i = 1; i < N; i++) {
      const hue = unwrappedHues[i];
      const previousHue = unwrappedHues[i - 1];
      if (hue === undefined || previousHue === undefined) continue;
      if (hue <= previousHue) {
        unwrappedHues[i] = hue + 360; // Unwrap by adding 360 degrees
      }
    }

    // Adjust hues to ensure minimum difference
    for (let i = 1; i < N; i++) {
      const hue = unwrappedHues[i];
      const previousHue = unwrappedHues[i - 1];
      if (hue === undefined || previousHue === undefined) continue;
      const requiredHue = previousHue + deltaMin;
      if (hue < requiredHue) {
        unwrappedHues[i] = requiredHue; // Adjust hue minimally
      }
    }

    // Handle wrap-around difference (needs at least two hues)
    const firstHue = unwrappedHues[0];
    const secondHue = unwrappedHues[1];
    const lastHue = unwrappedHues[N - 1];
    if (
      firstHue !== undefined &&
      secondHue !== undefined &&
      lastHue !== undefined
    ) {
      const endGap = firstHue + 360 - lastHue;
      if (endGap < deltaMin) {
        // Adjust first and last hues minimally to increase end gap
        const adjustmentNeeded = (deltaMin - endGap) / 2;
        // Adjust the first hue backward, ensure it doesn't go below other hues
        unwrappedHues[0] = Math.max(
          firstHue - adjustmentNeeded,
          secondHue - 360 + deltaMin
        );
        // Adjust the last hue forward
        unwrappedHues[N - 1] = lastHue + adjustmentNeeded;
      }
    }

    // Wrap adjusted hues back to [0, 360)
    const adjustedHuesList = unwrappedHues.map((hue) => hue % 360);

    // Map adjusted hues back to tags
    sortedTags.forEach((tag, i) => {
      const hue = adjustedHuesList[i];
      if (hue !== undefined) adjustedHues[tag] = hue;
    });

    return adjustedHues;
  }

  // Convert hue to RGB color in hex format
  hueToColor(hue: number) {
    // Convert hue from degrees to [0, 1)
    const hueNormalized = hue / 360.0;
    const saturation = 0.65;
    const value = 0.95;
    const rgb = this.hsvToRgb(hueNormalized, saturation, value);
    const alpha = 0.6; // Set the desired alpha value here
    const rgbColor = `#${this.toHex(rgb[0])}${this.toHex(rgb[1])}${this.toHex(
      rgb[2]
    )}${this.toHex(Math.round(alpha * 255))}`;
    return rgbColor;
  }

  // Convert HSV to RGB
  hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    let r, g, b;
    switch (i % 6) {
      case 0:
        r = v;
        g = t;
        b = p;
        break;
      case 1:
        r = q;
        g = v;
        b = p;
        break;
      case 2:
        r = p;
        g = v;
        b = t;
        break;
      case 3:
        r = p;
        g = q;
        b = v;
        break;
      case 4:
        r = t;
        g = p;
        b = v;
        break;
      case 5:
        r = v;
        g = p;
        b = q;
        break;
      default:
        r = v;
        g = t;
        b = p;
        break;
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  // Convert a number to two-digit hex string
  toHex(value: number) {
    return value.toString(16).padStart(2, "0");
  }
}

videojs.registerPlugin("markers", MarkersPlugin);

export default MarkersPlugin;
