import { describe, it, expect, beforeAll } from "vitest";
import { adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

interface UserSettings {
  settings: {
    unitPreference: string;
    preferredPreviewQuality: string;
    wallPlayback: string;
    carouselPreferences: unknown[];
    navPreferences: unknown[];
    tableColumnDefaults: Record<string, unknown>;
    cardDisplaySettings: Record<string, CardDisplayEntitySettings>;
  };
}

interface CardDisplayEntitySettings {
  showCodeOnCard?: boolean;
  showDescriptionOnCard: boolean;
  showDescriptionOnDetail: boolean;
  showRating: boolean;
  showFavorite: boolean;
  showOCounter: boolean;
}

describe("User Settings API - cardDisplaySettings", () => {
  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("GET /api/user/settings", () => {
    it("should return cardDisplaySettings in response", async () => {
      const response = await adminClient.get<UserSettings>("/api/user/settings");

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.settings).toBeDefined();
      // cardDisplaySettings may be null/undefined for new users or an object
      expect(response.data.settings).toHaveProperty("cardDisplaySettings");
    });
  });

  describe("PUT /api/user/settings - cardDisplaySettings", () => {
    it("should update cardDisplaySettings for scene entity type", async () => {
      const newSettings = {
        cardDisplaySettings: {
          scene: {
            showCodeOnCard: false,
            showDescriptionOnCard: true,
            showDescriptionOnDetail: true,
            showRating: true,
            showFavorite: false,
            showOCounter: true,
          },
        },
      };

      const response = await adminClient.put<UserSettings>(
        "/api/user/settings",
        newSettings
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.settings.cardDisplaySettings).toBeDefined();
      expect(response.data.settings.cardDisplaySettings.scene).toEqual(
        newSettings.cardDisplaySettings.scene
      );
    });

    it("should update cardDisplaySettings for multiple entity types", async () => {
      const newSettings = {
        cardDisplaySettings: {
          scene: {
            showCodeOnCard: true,
            showDescriptionOnCard: false,
            showDescriptionOnDetail: true,
            showRating: true,
            showFavorite: true,
            showOCounter: false,
          },
          performer: {
            showDescriptionOnCard: true,
            showDescriptionOnDetail: false,
            showRating: false,
            showFavorite: true,
            showOCounter: true,
          },
        },
      };

      const response = await adminClient.put<UserSettings>(
        "/api/user/settings",
        newSettings
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.settings.cardDisplaySettings.scene).toEqual(
        newSettings.cardDisplaySettings.scene
      );
      expect(response.data.settings.cardDisplaySettings.performer).toEqual(
        newSettings.cardDisplaySettings.performer
      );
    });

    it("should replace entire cardDisplaySettings (client handles merging)", async () => {
      // The API does a full replace of cardDisplaySettings.
      // The client-side code is responsible for reading current settings,
      // merging new values, and sending the complete merged object.

      // First, set both scene and performer settings
      const initialSettings = {
        cardDisplaySettings: {
          scene: {
            showCodeOnCard: true,
            showDescriptionOnCard: true,
            showDescriptionOnDetail: true,
            showRating: true,
            showFavorite: true,
            showOCounter: true,
          },
          performer: {
            showDescriptionOnCard: true,
            showDescriptionOnDetail: true,
            showRating: true,
            showFavorite: true,
            showOCounter: true,
          },
        },
      };
      await adminClient.put<UserSettings>("/api/user/settings", initialSettings);

      // Simulating client behavior: send complete merged settings
      // (as the client would after updating only performer)
      const updatedSettings = {
        cardDisplaySettings: {
          scene: {
            showCodeOnCard: true,
            showDescriptionOnCard: true,
            showDescriptionOnDetail: true,
            showRating: true,
            showFavorite: true,
            showOCounter: true,
          },
          performer: {
            showDescriptionOnCard: false,
            showDescriptionOnDetail: false,
            showRating: false,
            showFavorite: false,
            showOCounter: false,
          },
        },
      };
      const response = await adminClient.put<UserSettings>(
        "/api/user/settings",
        updatedSettings
      );

      expect(response.ok).toBe(true);
      // Scene settings should be preserved (sent by client)
      expect(response.data.settings.cardDisplaySettings.scene).toEqual(
        updatedSettings.cardDisplaySettings.scene
      );
      // Performer settings should be updated
      expect(response.data.settings.cardDisplaySettings.performer).toEqual(
        updatedSettings.cardDisplaySettings.performer
      );
    });

    it("should reject invalid cardDisplaySettings structure", async () => {
      const invalidSettings = {
        cardDisplaySettings: "not an object",
      };

      const response = await adminClient.put<{ error: string }>(
        "/api/user/settings",
        invalidSettings
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      // Error message describes the issue
      expect(response.data.error).toContain("Card display settings");
    });

    it("should allow clearing cardDisplaySettings by setting to null", async () => {
      // First, set some settings
      const initialSettings = {
        cardDisplaySettings: {
          scene: {
            showCodeOnCard: false,
            showDescriptionOnCard: true,
            showDescriptionOnDetail: true,
            showRating: true,
            showFavorite: true,
            showOCounter: true,
          },
        },
      };
      await adminClient.put<UserSettings>("/api/user/settings", initialSettings);

      // Clear settings by setting to null
      const clearSettings = {
        cardDisplaySettings: null,
      };
      const response = await adminClient.put<UserSettings>(
        "/api/user/settings",
        clearSettings
      );

      expect(response.ok).toBe(true);
      // cardDisplaySettings should be null/cleared
      expect(response.data.settings.cardDisplaySettings).toBeNull();
    });

    it("should allow empty object as cardDisplaySettings (user accepts defaults)", async () => {
      // Set cardDisplaySettings to empty object
      // This means user has no custom overrides and uses all defaults
      const emptySettings = {
        cardDisplaySettings: {},
      };
      const response = await adminClient.put<UserSettings>(
        "/api/user/settings",
        emptySettings
      );

      expect(response.ok).toBe(true);
      // Should return empty object or null (API normalizes to null when empty is stored)
      // Either is acceptable - defaults are applied client-side
      expect(
        response.data.settings.cardDisplaySettings === null ||
        (typeof response.data.settings.cardDisplaySettings === "object" &&
          Object.keys(response.data.settings.cardDisplaySettings).length === 0)
      ).toBe(true);
    });
  });
});
