import { plexConfig } from "../services/PlexHttp.js";
import {
  PLEX_SYNC_INTERVAL_MS,
  plexConnectionStatus,
  stopPlexRequests,
  syncPlexUsers,
} from "../services/PlexServerService.js";
import { logger } from "../utils/logger.js";

let timer: ReturnType<typeof setInterval> | undefined;
let active: Promise<void> | undefined;
export function schedulePlexSync(): void {
  if (timer) return;
  const tick = () => {
    if (active) return;
    active = (async () => {
      if (!plexConfig()) return;
      const status = await plexConnectionStatus();
      if (timer && status.connected && status.serverId) await syncPlexUsers();
    })()
      .catch(() => {
        logger.warn(
          "Plex membership sync failed; see Plex connection settings"
        );
      })
      .finally(() => {
        active = undefined;
      });
  };
  timer = setInterval(tick, PLEX_SYNC_INTERVAL_MS);
  timer.unref();
  tick();
}
export async function stopPlexSync(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = undefined;
  await stopPlexRequests();
  await active;
}
