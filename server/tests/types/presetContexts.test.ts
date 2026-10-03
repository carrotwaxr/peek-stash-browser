/**
 * The preset contexts live in shared/types: the Recommended page is one, and
 * its Views are the scene Views.
 */
import {
  PRESET_CONTEXTS,
  PRESET_CONTEXT_LABELS,
  isPresetContext,
  presetArtifactType,
} from "@peek/shared-types/presetContexts.js";
import { describe, expect, it } from "vitest";

describe("preset contexts", () => {
  it("`scene_recommended` is a preset context labelled 'Recommended page' whose Views are the scene Views", () => {
    expect(PRESET_CONTEXTS).toContain("scene_recommended");
    expect(isPresetContext("scene_recommended")).toBe(true);
    expect(PRESET_CONTEXT_LABELS.scene_recommended).toBe("Recommended page");
    expect(presetArtifactType("scene_recommended")).toBe("scene");
  });

  it("every context has a label", () => {
    expect(Object.keys(PRESET_CONTEXT_LABELS).sort()).toEqual(
      [...PRESET_CONTEXTS].sort()
    );
  });
});
