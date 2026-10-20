import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plexConfig } from "../../services/PlexHttp.js";
import {
  readPlexSettings,
  setPlexEnabled,
} from "../../services/PlexSettings.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "peek-plex-settings-"));
  vi.stubEnv("CONFIG_DIR", dir);
  vi.stubEnv("PLEX_AUTH_ENABLED", "");
  vi.stubEnv("PLEX_CLIENT_IDENTIFIER", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});
describe("persisted Plex settings", () => {
  it("starts disabled, generates a stable identifier and needs no public URL", () => {
    expect(plexConfig()).toBeNull();
    const initial = readPlexSettings();
    expect(initial.clientId).toMatch(/^[a-f0-9-]{36}$/);
    setPlexEnabled(true);
    expect(plexConfig()?.clientId).toBe(initial.clientId);
    expect(
      JSON.parse(readFileSync(path.join(dir, "plex-settings.json"), "utf8"))
    ).toEqual({ ...initial, enabled: true });
    setPlexEnabled(false);
    expect(plexConfig()).toBeNull();
  });
  it("imports legacy environment values once without overriding later UI changes", () => {
    vi.stubEnv("PLEX_AUTH_ENABLED", "true");
    vi.stubEnv("PLEX_CLIENT_IDENTIFIER", "existing-installation");
    expect(plexConfig()?.clientId).toBe("existing-installation");
    setPlexEnabled(false);
    expect(plexConfig()).toBeNull();
    vi.stubEnv("PLEX_CLIENT_IDENTIFIER", "replacement");
    setPlexEnabled(true);
    expect(plexConfig()?.clientId).toBe("existing-installation");
  });
  it("fails closed on invalid saved settings rather than silently replacing identity", () => {
    writeFileSync(path.join(dir, "plex-settings.json"), '{"enabled":true}');
    expect(readPlexSettings).toThrow("Invalid plex-settings.json");
  });
});
