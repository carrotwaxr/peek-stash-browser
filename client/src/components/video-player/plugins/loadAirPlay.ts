/**
 * Safari's AirPlay button, as it loads with the Scene page: only the check
 * for Safari's AirPlay API. The button and its logic (`airplay.ts`) are their
 * own chunk, requested only where that API exists, so no other browser
 * fetches them.
 */
import type { AirPlayPlayer } from "./airplay";

/** The AirPlay chunk. An object, so a test can watch the request. */
export const airPlayChunk = {
  load: () => import("./airplay"),
};

/**
 * Adds the AirPlay button to the player in Safari (`setupAirPlay`); elsewhere
 * it does nothing. Returns the teardown, which also stops a button whose
 * chunk is still on its way.
 */
export function startAirPlay(player: AirPlayPlayer): () => void {
  // Safari's media elements, alone, can open the AirPlay picker
  if (!("webkitShowPlaybackTargetPicker" in HTMLVideoElement.prototype)) {
    return () => {};
  }

  let stopped = false;
  let teardown: (() => void) | undefined;
  airPlayChunk.load().then(
    ({ setupAirPlay }) => {
      if (!stopped) teardown = setupAirPlay(player);
    },
    (error: unknown) => {
      // No AirPlay button on this player; the next one tries again
      console.error("[AirPlay] could not load the AirPlay button", error);
    }
  );

  return () => {
    stopped = true;
    teardown?.();
  };
}
