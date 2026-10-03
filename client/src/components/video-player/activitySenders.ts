/**
 * The watch-history senders, shared by the local tracker (the trackActivity
 * plugin) and the cast tracker (`cast/castActivity.ts`).
 *
 * One viewing per scene load: both trackers send through it, so a play counts
 * once whichever reaches the threshold (the server dedupes by token only).
 * Both endpoints are on `AUTH_SILENT_ENDPOINTS`, so a lost session never
 * interrupts playback with a login redirect.
 */
import { apiFetch, apiPost } from "../../api";
import { newClientToken } from "../../utils/clientToken";
import type { SendOptions } from "./plugins/track-activity";

export interface Viewing {
  /** The same on every retry of the play count: the server counts it once */
  readonly playToken: string;
  /** Set once the play has been counted, by either tracker */
  counted: boolean;
  // Function properties, not methods: the trackers call them unbound
  save: (
    resumeTime: number,
    playDuration: number,
    options?: SendOptions
  ) => Promise<void>;
  countPlay: (options?: SendOptions) => Promise<void>;
}

/**
 * Sends `body` to `endpoint`, retried up to three times with back-off; with
 * `keepalive` (the tab hidden or the page closing) once, in a request that
 * outlives the page, since a retry timer would not.
 */
async function send(endpoint: string, body: object, options?: SendOptions) {
  for (let attempt = 1; ; attempt++) {
    try {
      await (options?.keepalive
        ? apiFetch(endpoint, {
            method: "POST",
            body: JSON.stringify(body),
            keepalive: true,
          })
        : apiPost(endpoint, body));
      return;
    } catch (error) {
      if (options?.keepalive || attempt === 3) {
        console.error(`Failed to send ${endpoint}:`, error);
        return;
      }
      console.warn(`[RETRY] ${endpoint} attempt ${attempt} failed`, error);
      await new Promise((resolve) =>
        setTimeout(resolve, 1000 * 2 ** (attempt - 1))
      );
    }
  }
}

/** One viewing of the scene `sceneId` on `instanceId` */
export function createViewing(sceneId: string, instanceId: string): Viewing {
  const viewing: Viewing = {
    playToken: newClientToken(),
    counted: false,
    save: (resumeTime, playDuration, options) =>
      send(
        "/watch-history/save-activity",
        { sceneId, instanceId, resumeTime, playDuration },
        options
      ),
    countPlay: async (options) => {
      if (viewing.counted) return;
      viewing.counted = true;
      await send(
        "/watch-history/increment-play-count",
        { sceneId, instanceId, playToken: viewing.playToken },
        options
      );
    },
  };
  return viewing;
}
