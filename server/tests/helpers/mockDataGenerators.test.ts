import { describe, expect, it } from "vitest";
import {
  createMockGallery,
  createMockGroup,
  createMockPerformer,
  createMockScene,
  createMockStudio,
  createMockTag,
} from "./mockDataGenerators.js";

describe("mock data generators", () => {
  it("createMockScene({ instanceId: '', rating100: 0 }) keeps both", () => {
    const scene = createMockScene({ instanceId: "", rating100: 0 });
    expect(scene.instanceId).toBe("");
    expect(scene.rating100).toBe(0);
  });

  it("every factory defaults the instance and keeps an empty one", () => {
    for (const make of [
      createMockPerformer,
      createMockStudio,
      createMockTag,
      createMockGroup,
      createMockGallery,
      createMockScene,
    ]) {
      expect(make().instanceId).toBe("default");
      expect(make({ instanceId: "" }).instanceId).toBe("");
    }
  });
});
