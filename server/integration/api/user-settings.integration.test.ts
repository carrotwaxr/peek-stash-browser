import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  adminClient,
  findTestInstanceId,
  readInstanceSelection,
  restoreInstanceSelection,
  setInstanceSelection,
} from "../helpers/testClient.js";

interface UserSettings {
  settings: {
    unitPreference: string;
    preferredPreviewQuality: string;
    wallPlayback: string;
    carouselPreferences: unknown[];
    navPreferences: unknown[];
    tableColumnDefaults: Record<string, unknown>;
    /** The API answers null when nothing is stored */
    cardDisplaySettings: Record<string, CardDisplayEntitySettings> | null;
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
  /** The shared admin's card settings before this file, put back after it */
  let savedCardDisplaySettings:
    | UserSettings["settings"]["cardDisplaySettings"]
    | null = null;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    const current = await adminClient.get<UserSettings>("/api/user/settings");
    expect(current.ok).toBe(true);
    savedCardDisplaySettings = current.data.settings.cardDisplaySettings;
  });

  afterAll(async () => {
    const restored = await adminClient.put("/api/user/settings", {
      cardDisplaySettings: savedCardDisplaySettings,
    });
    expect(restored.ok).toBe(true);
  });

  describe("GET /api/user/settings", () => {
    it("should return cardDisplaySettings in response", async () => {
      const response =
        await adminClient.get<UserSettings>("/api/user/settings");

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
      expect(response.data.settings.cardDisplaySettings?.scene).toEqual(
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
      expect(response.data.settings.cardDisplaySettings?.scene).toEqual(
        newSettings.cardDisplaySettings.scene
      );
      expect(response.data.settings.cardDisplaySettings?.performer).toEqual(
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
      await adminClient.put<UserSettings>(
        "/api/user/settings",
        initialSettings
      );

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
      expect(response.data.settings.cardDisplaySettings?.scene).toEqual(
        updatedSettings.cardDisplaySettings.scene
      );
      // Performer settings should be updated
      expect(response.data.settings.cardDisplaySettings?.performer).toEqual(
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
      await adminClient.put<UserSettings>(
        "/api/user/settings",
        initialSettings
      );

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
            Object.keys(response.data.settings.cardDisplaySettings).length ===
              0)
      ).toBe(true);
    });
  });
});

describe("User Settings API - tableColumnDefaults", () => {
  /** The shared admin's table columns before this file, put back after it */
  let savedTableColumns:
    | UserSettings["settings"]["tableColumnDefaults"]
    | null = null;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    const current = await adminClient.get<UserSettings>("/api/user/settings");
    expect(current.ok).toBe(true);
    savedTableColumns = current.data.settings.tableColumnDefaults;
  });

  afterAll(async () => {
    const restored = await adminClient.put("/api/user/settings", {
      tableColumnDefaults: savedTableColumns,
    });
    expect(restored.ok).toBe(true);
  });

  it("a clip table columns save round-trips and keeps the scene entry", async () => {
    const scene = { visible: ["title", "date"], order: ["date", "title"] };
    const clip = { visible: ["title", "scene"], order: ["scene", "title"] };

    const saved = await adminClient.put<UserSettings>("/api/user/settings", {
      tableColumnDefaults: { scene, clip },
    });

    expect(saved.status).toBe(200);
    const read = await adminClient.get<UserSettings>("/api/user/settings");
    expect(read.data.settings.tableColumnDefaults).toEqual({ scene, clip });
  });
});

describe("User Settings API - PUT /api/user/stash-instances", () => {
  let instanceId: string;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    instanceId = await findTestInstanceId();
    await setInstanceSelection([instanceId]);
  });

  afterAll(restoreInstanceSelection);

  it("a duplicated id saves each id once and answers 200", async () => {
    const response = await adminClient.put<{
      success: boolean;
      selectedInstanceIds: string[];
    }>("/api/user/stash-instances", { instanceIds: [instanceId, instanceId] });

    expect(response.status).toBe(200);
    expect(response.data.selectedInstanceIds).toEqual([instanceId]);
    expect(await readInstanceSelection()).toEqual([instanceId]);
  });

  it("a non-string id answers 400 naming instanceIds and keeps the selection", async () => {
    const response = await adminClient.put<{
      error: string;
      issues?: Array<{ path: string; message: string }>;
    }>("/api/user/stash-instances", { instanceIds: [instanceId, 7] });

    expect(response.status).toBe(400);
    expect(response.data.issues?.[0]?.path).toMatch(/^instanceIds/);
    expect(await readInstanceSelection()).toEqual([instanceId]);
  });
});
