import {
  DEFAULT_RECOMMENDATION_PREFERENCES,
  type GetUserSettingsResponse,
} from "@peek/shared-types";

type UserSettings = GetUserSettingsResponse["settings"];

/** GET /api/user/settings as the server answers it, with the server's defaults. */
export const userSettingsResponse = (
  overrides: Partial<UserSettings> = {}
): GetUserSettingsResponse => ({
  settings: {
    preferredPreviewQuality: null,
    theme: null,
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
    recommendationPreferences: DEFAULT_RECOMMENDATION_PREFERENCES,
    ...overrides,
  },
});
