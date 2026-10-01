import type { GetUserSettingsResponse } from "@peek/shared-types";

type UserSettings = GetUserSettingsResponse["settings"];

/** GET /api/user/settings as the server answers it, with the server's defaults. */
export const userSettingsResponse = (
  overrides: Partial<UserSettings> = {}
): GetUserSettingsResponse => ({
  settings: {
    preferredQuality: "auto",
    preferredPlaybackMode: "auto",
    preferredPreviewQuality: null,
    theme: "dark",
    carouselPreferences: [],
    navPreferences: null,
    minimumPlayPercent: 20,
    syncToStash: false,
    hideConfirmationDisabled: false,
    unitPreference: "metric",
    wallPlayback: "autoplay",
    tableColumnDefaults: null,
    cardDisplaySettings: null,
    landingPagePreference: { pages: ["home"], randomize: false },
    lightboxDoubleTapAction: "favorite",
    ...overrides,
  },
});
