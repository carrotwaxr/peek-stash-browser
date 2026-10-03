/**
 * VR scene projections. The names are the ones `@blaineam/videojs-vr` takes
 * for the projections Peek offers. The server decides a scene's projection
 * (`detectVrProjection`) and the player's menu lets a user pick another.
 */
export const VR_PROJECTIONS = [
  "180_LR",
  "180_MONO",
  "360",
  "360_LR",
  "360_TB",
  "FISHEYE_180_LR",
  "FISHEYE_200_LR",
  "FISHEYE_220_LR",
  "EAC_LR",
  "SBS_MONO",
] as const;

export type VrProjection = (typeof VR_PROJECTIONS)[number];

/** Where a scene's projection came from, strongest first. */
export type VrSource = "tag" | "filename" | "shape" | "default";

export interface SceneVr {
  projection: VrProjection;
  source: VrSource;
}
