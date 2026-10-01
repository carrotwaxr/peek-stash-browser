import { beforeEach, describe, expect, it } from "vitest";
import {
  PREVIEW_PROBE_LIMIT,
  clearPreviewProbeCache,
  getPreviewProbe,
  setPreviewProbe,
} from "@/utils/previewProbeCache";

describe("previewProbeCache", () => {
  beforeEach(() => {
    clearPreviewProbeCache();
  });

  it("remembers a result per type, scene and instance", () => {
    setPreviewProbe("mp4", "1", "a", "ok");
    setPreviewProbe("webp", "1", "a", "missing");

    expect(getPreviewProbe("mp4", "1", "a")).toBe("ok");
    expect(getPreviewProbe("webp", "1", "a")).toBe("missing");
    expect(getPreviewProbe("mp4", "1", "b")).toBeUndefined();
    expect(getPreviewProbe("mp4", "2", "a")).toBeUndefined();
  });

  it("evicts the oldest entry at 501", () => {
    for (let i = 0; i < PREVIEW_PROBE_LIMIT; i++) {
      setPreviewProbe("mp4", String(i), "a", "ok");
    }
    expect(getPreviewProbe("mp4", "0", "a")).toBe("ok");

    setPreviewProbe("mp4", String(PREVIEW_PROBE_LIMIT), "a", "ok");

    expect(PREVIEW_PROBE_LIMIT).toBe(500);
    expect(getPreviewProbe("mp4", "0", "a")).toBeUndefined();
    expect(getPreviewProbe("mp4", "1", "a")).toBe("ok");
    expect(getPreviewProbe("mp4", String(PREVIEW_PROBE_LIMIT), "a")).toBe("ok");
  });

  it("each type keeps its own 500 entries", () => {
    for (let i = 0; i < PREVIEW_PROBE_LIMIT; i++) {
      setPreviewProbe("mp4", String(i), "a", "ok");
    }
    setPreviewProbe("webp", "0", "a", "ok");

    expect(getPreviewProbe("mp4", "0", "a")).toBe("ok");
  });

  it("a rewritten entry counts as the newest", () => {
    for (let i = 0; i < PREVIEW_PROBE_LIMIT; i++) {
      setPreviewProbe("mp4", String(i), "a", "ok");
    }
    setPreviewProbe("mp4", "0", "a", "missing");
    setPreviewProbe("mp4", "new", "a", "ok");

    expect(getPreviewProbe("mp4", "0", "a")).toBe("missing");
    expect(getPreviewProbe("mp4", "1", "a")).toBeUndefined();
  });
});
