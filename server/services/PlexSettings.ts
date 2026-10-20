import { randomUUID } from "crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "fs";
import path from "path";
import { getConfigDir } from "../utils/configDir.js";

interface PlexSettings {
  enabled: boolean;
  clientId: string;
}

// Kept beside the database so configuration survives container replacement.
export function readPlexSettings(): PlexSettings {
  const file = path.join(getConfigDir(), "plex-settings.json");
  if (existsSync(file)) {
    const value = JSON.parse(readFileSync(file, "utf8")) as PlexSettings;
    if (
      typeof value.enabled !== "boolean" ||
      typeof value.clientId !== "string" ||
      !value.clientId.trim()
    )
      throw new Error("Invalid plex-settings.json; restore it from backup");
    return value;
  }
  const value = {
    enabled: process.env.PLEX_AUTH_ENABLED === "true",
    clientId: process.env.PLEX_CLIENT_IDENTIFIER?.trim()
      ? process.env.PLEX_CLIENT_IDENTIFIER.trim()
      : randomUUID(),
  };
  mkdirSync(getConfigDir(), { recursive: true });
  writeFileSync(file, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  return value;
}

export function setPlexEnabled(enabled: boolean): void {
  const value = { ...readPlexSettings(), enabled };
  const file = path.join(getConfigDir(), "plex-settings.json");
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
  renameSync(temporary, file);
}
