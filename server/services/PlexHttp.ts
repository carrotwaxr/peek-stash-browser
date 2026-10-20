import { AppError } from "../middleware/errorHandler.js";
import { readPlexSettings } from "./PlexSettings.js";

export function plexConfig() {
  const settings = readPlexSettings();
  if (!settings.enabled) return null;
  return {
    clientId: settings.clientId,
    product: process.env.PLEX_PRODUCT?.trim() ?? "Peek Stash Browser",
  };
}

function config() {
  const value = plexConfig();
  if (!value) throw new AppError("Plex sign-in is disabled", 404);
  return value;
}

// Fixed upstream only. Never expose upstream bodies, tokens or fetch errors.
export async function plexRequest(
  path: string,
  options: { method?: string; body?: URLSearchParams; token?: string } = {}
) {
  const { clientId, product } = config();
  try {
    const response = await fetch(`https://plex.tv/api/v2/${path}`, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        "X-Plex-Client-Identifier": clientId,
        "X-Plex-Product": product,
        ...(options.body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(options.token ? { "X-Plex-Token": options.token } : {}),
      },
      ...(options.body ? { body: options.body } : {}),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("upstream refused");
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new AppError("Plex verification failed. Please start again.", 502);
  }
}
