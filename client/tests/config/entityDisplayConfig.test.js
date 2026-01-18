import { describe, it, expect } from "vitest";
import { ENTITY_DISPLAY_CONFIG, getViewModes } from "../../src/config/entityDisplayConfig.js";

describe("entityDisplayConfig", () => {
  describe("timeline view mode", () => {
    it("scene entity includes timeline view mode", () => {
      const sceneModes = getViewModes("scene");
      const timelineMode = sceneModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode.label).toBe("Timeline");
    });

    it("gallery entity includes timeline view mode", () => {
      const galleryModes = getViewModes("gallery");
      const timelineMode = galleryModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode.label).toBe("Timeline");
    });

    it("image entity includes timeline view mode", () => {
      const imageModes = getViewModes("image");
      const timelineMode = imageModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeDefined();
      expect(timelineMode.label).toBe("Timeline");
    });

    it("performer entity does NOT include timeline view mode", () => {
      const performerModes = getViewModes("performer");
      const timelineMode = performerModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeUndefined();
    });

    it("tag entity does NOT include timeline view mode", () => {
      const tagModes = getViewModes("tag");
      const timelineMode = tagModes.find((m) => m.id === "timeline");

      expect(timelineMode).toBeUndefined();
    });
  });
});
