import { useMediaQuery } from "./useMediaQuery";

/** The shared media-query store, under the name its importers use */
export const useSharedMediaQuery = useMediaQuery;

/** Whether the device has a pointer that can hover (a mouse, a trackpad) */
export const useHoverCapable = (): boolean =>
  useSharedMediaQuery("(hover: hover)");

/**
 * Whether the main pointer is coarse (a finger). Small buttons draw a larger
 * hit area on it; the pointer is read in JS, since Tailwind 3.4 has no
 * `pointer-coarse:` variant.
 */
export const useCoarsePointer = (): boolean =>
  useSharedMediaQuery("(pointer: coarse)");
