import { must } from "@tests/testUtils";
import { describe, expect, it } from "vitest";
import { LIST_VIEW_MODES } from "../../src/components/list/listViewModes";
import {
  ENTITY_DISPLAY_CONFIG,
  getAvailableSettings,
  getDefaultSettings,
  getEntityTypes,
  getViewModes,
} from "../../src/config/entityDisplayConfig";

interface ViewMode {
  id: string;
  label: string;
}

describe("entityDisplayConfig", () => {
  describe("timeline view mode", () => {
    it("scene entity includes timeline view mode", () => {
      const sceneModes = getViewModes("scene") as ViewMode[];
      const timelineMode = sceneModes.find(
        (m: ViewMode) => m.id === "timeline"
      );

      expect(timelineMode).toBeDefined();
      expect(must(timelineMode).label).toBe("Timeline");
    });

    it("gallery entity includes timeline view mode", () => {
      const galleryModes = getViewModes("gallery") as ViewMode[];
      const timelineMode = galleryModes.find(
        (m: ViewMode) => m.id === "timeline"
      );

      expect(timelineMode).toBeDefined();
      expect(must(timelineMode).label).toBe("Timeline");
    });

    it("image entity includes timeline view mode", () => {
      const imageModes = getViewModes("image") as ViewMode[];
      const timelineMode = imageModes.find(
        (m: ViewMode) => m.id === "timeline"
      );

      expect(timelineMode).toBeDefined();
      expect(must(timelineMode).label).toBe("Timeline");
    });

    it("performer entity does NOT include timeline view mode", () => {
      const performerModes = getViewModes("performer") as ViewMode[];
      const timelineMode = performerModes.find(
        (m: ViewMode) => m.id === "timeline"
      );

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

    it("the clip modes are the ones the clip page renders", () => {
      const modes = getViewModes("clip") as ViewMode[];
      expect(modes.map((m) => m.id)).toEqual(["grid", "wall", "table"]);
    });
  });

  describe("the default view offers only the views each page renders", () => {
    it("the performer settings offer Grid and Table only", () => {
      const modes = getViewModes("performer") as ViewMode[];
      expect(modes).toEqual([
        { id: "grid", label: "Grid" },
        { id: "table", label: "Table" },
      ]);
    });

    it.each(["studio", "group"])(
      "the %s settings offer Grid and Table only",
      (entity) => {
        const modes = getViewModes(entity) as ViewMode[];
        expect(modes.map((m) => m.id)).toEqual(["grid", "table"]);
      }
    );

    it("the tag settings offer Grid, Table and Hierarchy", () => {
      const modes = getViewModes("tag") as ViewMode[];
      expect(modes.map((m) => m.id)).toEqual(["grid", "table", "hierarchy"]);
    });

    it("each type's modes are its list page's", () => {
      for (const entity of Object.keys(LIST_VIEW_MODES)) {
        const modes = getViewModes(entity) as ViewMode[];
        expect(modes.map((m) => m.id)).toEqual(
          LIST_VIEW_MODES[entity as keyof typeof LIST_VIEW_MODES]
        );
      }
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

    it("every type that TagCard-style cards wire with rating controls offers showRating and showFavorite", () => {
      for (const type of ["performer", "studio", "tag", "group"]) {
        expect(getAvailableSettings(type)).toEqual(
          expect.arrayContaining(["showRating", "showFavorite", "showOCounter"])
        );
        expect(getDefaultSettings(type)).toMatchObject({
          showRating: true,
          showFavorite: true,
          showOCounter: true,
        });
      }
    });
  });

  describe("ENTITY_DISPLAY_CONFIG structure", () => {
    it("all entity types have required properties", () => {
      const entityTypes = Object.keys(ENTITY_DISPLAY_CONFIG);
      entityTypes.forEach((type) => {
        const config =
          ENTITY_DISPLAY_CONFIG[type as keyof typeof ENTITY_DISPLAY_CONFIG];
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
        const config =
          ENTITY_DISPLAY_CONFIG[type as keyof typeof ENTITY_DISPLAY_CONFIG];
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
