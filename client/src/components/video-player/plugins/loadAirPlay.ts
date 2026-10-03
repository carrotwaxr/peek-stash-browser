/**
 * The AirPlay button, as it loads with the Scene page: only the check for
 * WebKit's AirPlay API (`canPlayToAirPlay`, which also picks the signed
 * sources). The button and its logic (`airplay.ts`) are their
 * own chunk, requested only where that API exists, so no other browser
 * fetches them.
 */
import { canPlayToAirPlay } from "../playbackTarget";
import type { AirPlayPlayer } from "./airplay";

/** The AirPlay chunk. An object, so a test can watch the request. */
export const airPlayChunk = {
  load: () => import("./airplay"),
};

/**
 * Adds the AirPlay button to the player in WebKit (`setupAirPlay`: Safari,
 * and every browser on iOS); elsewhere it does nothing. Returns the teardown, which also stops a button whose
 * chunk is still on its way.
 */
export function startAirPlay(player: AirPlayPlayer): () => void {
  // WebKit's media elements, alone, can open the AirPlay picker
  if (!canPlayToAirPlay()) return () => {};

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
