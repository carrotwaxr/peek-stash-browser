/**
 * A VR scene's projection (PR 11, V1).
 *
 * Stash records no projection, so it is read from what the community writes
 * down, strongest first: tag names and aliases (the names stash-vr reads),
 * tokens of the file's base name (HereSphere and DeoVR's suffixes), the
 * frame's shape, then 180 degrees side by side, which most VR scenes are.
 * `source` says which one decided, so the player can tell a guess from a
 * label. The player's menu lets a user pick another projection.
 */
import type { SceneVr, VrProjection } from "@peek/shared-types/vr.js";

interface VrHints {
  tagNames: readonly string[];
  filePath: string | null | undefined;
  width: number | null | undefined;
  height: number | null | undefined;
}

type Fov = "180" | "360";
type Stereo = "LR" | "TB" | "MONO" | "ANY";

/** What a set of upper-case words says about the projection. */
interface Reading {
  eac: boolean;
  fisheye: "180" | "200" | "220" | null;
  fov: Fov | null;
  stereo: Stereo | null;
}

const EAC_WORDS = new Set(["EAC", "EAC360", "360EAC", "CUBEMAP"]);
// There is no 190 degree fisheye in the player; 200 is the nearest.
const FISHEYE_200_WORDS = new Set([
  "MKX200",
  "RF52",
  "FISHEYE190",
  "FISHEYE200",
]);
const FISHEYE_220_WORDS = new Set(["MKX22", "MKX220", "VRCA220", "FISHEYE220"]);
const FISHEYE_180_WORDS = new Set(["FISHEYE", "FISHEYE180", "F180", "180F"]);
const FOV_180_WORDS = new Set(["180", "DOME"]);
const FOV_360_WORDS = new Set(["360", "SPHERE"]);
const STEREO_WORDS = new Map<string, Stereo>([
  ["LR", "LR"],
  ["RL", "LR"],
  ["SBS", "LR"],
  ["3DH", "LR"],
  ["TB", "TB"],
  ["BT", "TB"],
  ["OU", "TB"],
  ["3DV", "TB"],
  ["2D", "MONO"],
  ["MONO", "MONO"],
  ["3D", "ANY"],
]);

function read(words: Iterable<string>): Reading {
  const reading: Reading = {
    eac: false,
    fisheye: null,
    fov: null,
    stereo: null,
  };
  for (const word of words) {
    if (EAC_WORDS.has(word)) reading.eac = true;
    else if (FISHEYE_200_WORDS.has(word)) reading.fisheye = "200";
    else if (FISHEYE_220_WORDS.has(word)) reading.fisheye = "220";
    else if (FISHEYE_180_WORDS.has(word)) reading.fisheye ??= "180";
    else if (FOV_180_WORDS.has(word)) reading.fov = "180";
    else if (FOV_360_WORDS.has(word)) reading.fov = "360";
    else {
      const stereo = STEREO_WORDS.get(word);
      // A definite layout beats the generic "3D".
      if (stereo && (reading.stereo === null || reading.stereo === "ANY")) {
        reading.stereo = stereo;
      }
    }
  }
  return reading;
}

/** A square frame is stacked top-bottom; a 2:1 or wider one is side by side. */
function frameShape(
  width: number | null | undefined,
  height: number | null | undefined
): "square" | "wide" | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const ratio = width / height;
  if (ratio >= 0.9 && ratio <= 1.1) return "square";
  if (ratio >= 1.7) return "wide";
  return null;
}

function projectionOf(
  reading: Reading,
  shape: "square" | "wide" | null
): VrProjection | null {
  if (reading.eac) return "EAC_LR";
  if (reading.fisheye === "200") return "FISHEYE_200_LR";
  if (reading.fisheye === "220") return "FISHEYE_220_LR";
  if (reading.fisheye === "180") return "FISHEYE_180_LR";
  const { fov, stereo } = reading;
  if (fov === "360") {
    if (stereo === "TB") return "360_TB";
    if (stereo === "LR") return "360_LR";
    if (stereo === "MONO") return "360";
    if (stereo === "ANY") return "360_TB";
    return shape === "square" ? "360_TB" : "360";
  }
  if (fov === "180") {
    return stereo === "MONO" ? "180_MONO" : "180_LR";
  }
  // A layout alone: the player has no 180 top-bottom, so only side by side
  // names a projection.
  if (stereo === "LR") return "180_LR";
  return null;
}

/** The base name's words, split on `_`, `-`, space and `.`, upper-case. */
function filenameWords(filePath: string): string[] {
  const base = filePath.split(/[\\/]/).pop() ?? "";
  return base
    .toUpperCase()
    .split(/[_\-\s.]+/)
    .filter(Boolean);
}

export function detectVrProjection(hints: VrHints): SceneVr {
  const shape = frameShape(hints.width, hints.height);

  const fromTags = projectionOf(
    read(hints.tagNames.map((name) => name.trim().toUpperCase())),
    shape
  );
  if (fromTags) return { projection: fromTags, source: "tag" };

  if (hints.filePath) {
    const fromName = projectionOf(read(filenameWords(hints.filePath)), shape);
    if (fromName) return { projection: fromName, source: "filename" };
  }

  if (shape === "square") return { projection: "360_TB", source: "shape" };
  if (shape === "wide") return { projection: "180_LR", source: "shape" };
  return { projection: "180_LR", source: "default" };
}
