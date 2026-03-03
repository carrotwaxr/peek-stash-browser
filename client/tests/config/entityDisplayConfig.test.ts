import { describe, it, expect } from "vitest";
import { ENTITY_DISPLAY_CONFIG, getViewModes, getEntityTypes, getDefaultSettings, getAvailableSettings } from "../../src/config/entityDisplayConfig";

interface ViewMode {
  id: string;
  label: string;
}

describe("entityDisplayConfig", () => {
  describe("timeline view mode", () => {
    it("scene entity includes timeline view mode", () => {
      const sceneModes = getViewModes("scene") as ViewMode[];
      const timelineMode = sceneModes.find((m: ViewMode) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode!.label).toBe("Timeline");
    });

    it("gallery entity includes timeline view mode", () => {
      const galleryModes = getViewModes("gallery") as ViewMode[];
      const timelineMode = galleryModes.find((m: ViewMode) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode!.label).toBe("Timeline");
    });

    it("image entity includes timeline view mode", () => {
      const imageModes = getViewModes("image") as ViewMode[];
      const timelineMode = imageModes.find((m: ViewMode) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode!.label).toBe("Timeline");
    });

    it("performer entity does NOT include timeline view mode", () => {
      const performerModes = getViewModes("performer") as ViewMode[];
      const timelineMode = performerModes.find((m: ViewMode) => m.id === "timeline");

      expect(timelineMode).toBeUndefined();
    });

    it("tag entity does NOT include timeline view mode", () => {
      const tagModes = getViewModes("tag") as ViewMode[];
      const timelineMode = tagModes.find((m: ViewMode) => m.id === "timeline");

      expect(timelineMode).toBeUndefined();
    });
  });

  describe("getViewModes fallback", () => {
    it("returns default grid mode for unknown entity type", () => {
      const modes = getViewModes("nonexistent") as ViewMode[];
      expect(modes).toEqual([{ id: "grid", label: "Grid" }]);
    });

    it("returns clip view modes (grid only)", () => {
      const modes = getViewModes("clip") as ViewMode[];
      expect(modes).toHaveLength(1);
      expect(modes[0].id).toBe("grid");
    });

    it("returns group view modes", () => {
      const modes = getViewModes("group") as ViewMode[];
      expect(modes.length).toBeGreaterThanOrEqual(2);
      expect(modes.find((m: ViewMode) => m.id === "grid")).toBeDefined();
      expect(modes.find((m: ViewMode) => m.id === "wall")).toBeDefined();
    });

    it("returns studio view modes", () => {
      const modes = getViewModes("studio") as ViewMode[];
      expect(modes.find((m: ViewMode) => m.id === "grid")).toBeDefined();
      expect(modes.find((m: ViewMode) => m.id === "table")).toBeDefined();
    });
  });

  describe("getEntityTypes", () => {
    it("returns all entity types", () => {
      const types = getEntityTypes();
      expect(types).toContain("scene");
      expect(types).toContain("gallery");
      expect(types).toContain("image");
      expect(types).toContain("performer");
      expect(types).toContain("studio");
      expect(types).toContain("tag");
      expect(types).toContain("group");
      expect(types).toContain("clip");
    });
  });

  describe("getDefaultSettings", () => {
    it("returns default settings for scene", () => {
      const settings = getDefaultSettings("scene");
      expect(settings).toHaveProperty("defaultViewMode", "grid");
      expect(settings).toHaveProperty("defaultGridDensity", "medium");
    });

    it("returns empty object for unknown entity type", () => {
      const settings = getDefaultSettings("nonexistent");
      expect(settings).toEqual({});
    });

    it("returns clip-specific defaults", () => {
      const settings = getDefaultSettings("clip");
      expect(settings).toHaveProperty("defaultViewMode", "grid");
      expect(settings).toHaveProperty("showMenu", false);
    });
  });

  describe("getAvailableSettings", () => {
    it("returns available settings for scene", () => {
      const settings = getAvailableSettings("scene");
      expect(settings).toContain("defaultViewMode");
      expect(settings).toContain("showRating");
    });

    it("returns empty array for unknown entity type", () => {
      const settings = getAvailableSettings("nonexistent");
      expect(settings).toEqual([]);
    });

    it("tag entity does not have showRating setting", () => {
      const settings = getAvailableSettings("tag");
      expect(settings).not.toContain("showRating");
    });
  });

  describe("ENTITY_DISPLAY_CONFIG structure", () => {
    it("all entity types have required properties", () => {
      const entityTypes = Object.keys(ENTITY_DISPLAY_CONFIG);
      entityTypes.forEach((type) => {
        const config = (ENTITY_DISPLAY_CONFIG as Record<string, any>)[type];
        expect(config).toHaveProperty("label");
        expect(config).toHaveProperty("viewModes");
        expect(config).toHaveProperty("defaultSettings");
        expect(config).toHaveProperty("availableSettings");
        expect(Array.isArray(config.viewModes)).toBe(true);
        expect(Array.isArray(config.availableSettings)).toBe(true);
      });
    });

    it("all view modes have id and label", () => {
      const entityTypes = Object.keys(ENTITY_DISPLAY_CONFIG);
      entityTypes.forEach((type) => {
        const config = (ENTITY_DISPLAY_CONFIG as Record<string, any>)[type];
        config.viewModes.forEach((mode: ViewMode) => {
          expect(mode).toHaveProperty("id");
          expect(mode).toHaveProperty("label");
          expect(typeof mode.id).toBe("string");
          expect(typeof mode.label).toBe("string");
        });
      });
    });
  });
});
