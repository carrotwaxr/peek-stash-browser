import { beforeEach, describe, expect, it } from "vitest";
import { removeLegacyPickerCaches } from "../../src/utils/removeLegacyPickerCaches";

describe("removeLegacyPickerCaches", () => {
  beforeEach(() => localStorage.clear());

  it("removes the old picker caches and keeps every other key", () => {
    localStorage.setItem("peek-performers-cache", "{}");
    localStorage.setItem("peek-tags_scenes-cache", "{}");
    localStorage.setItem("peek-galleries-cache", "{}");
    localStorage.setItem("peek-theme", "dark");
    localStorage.setItem("peek-performers-cache-note", "keep");

    removeLegacyPickerCaches();

    expect(localStorage.length).toBe(2);
    expect(localStorage.getItem("peek-theme")).toBe("dark");
    expect(localStorage.getItem("peek-performers-cache-note")).toBe("keep");
  });
});
