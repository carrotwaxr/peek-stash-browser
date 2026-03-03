import { describe, it, expect } from "vitest";
import { ENTITY_DISPLAY_CONFIG, getViewModes } from "../../src/config/entityDisplayConfig";

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
});
