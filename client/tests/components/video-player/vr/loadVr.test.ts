/**
 * loadVr is the one way into the VR code: one dynamic import, shared by every
 * caller, so the `vr` chunk is fetched once. prefetchVr starts the same import
 * early and never a second one.
 */
import videojs from "video.js";
import { describe, expect, it, vi } from "vitest";
import {
  createVrLoader,
  loadVr,
  prefetchVr,
} from "@/components/video-player/vr/loadVr";

vi.mock("@blaineam/videojs-vr", () => ({ default: {} }));

describe("loadVr", () => {
  it("loads the VR plugin, which registers peekVr, once across calls", async () => {
    const first = loadVr();

    expect(loadVr()).toBe(first);
    await first;
    expect(videojs.getPlugin("peekVr")).toBeTypeOf("function");
  });

  it("prefetchVr shares the import loadVr makes", async () => {
    prefetchVr();

    await expect(loadVr()).resolves.toBeUndefined();
  });
});

describe("createVrLoader", () => {
  it("imports once across calls", async () => {
    const importer = vi.fn(() => Promise.resolve({}));
    const { load } = createVrLoader(importer);

    await Promise.all([load(), load()]);
    await load();

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("prefetch never runs the import twice", async () => {
    const importer = vi.fn(() => Promise.resolve({}));
    const { load, prefetch } = createVrLoader(importer);

    prefetch();
    prefetch();
    await load();

    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("a failed import rejects, and the next call tries again", async () => {
    const importer = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({});
    const { load } = createVrLoader(importer);

    await expect(load()).rejects.toThrow("offline");
    await expect(load()).resolves.toBeUndefined();
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("a failed prefetch rejects nothing, and the click's load tries again", async () => {
    const importer = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({});
    const { load, prefetch } = createVrLoader(importer);

    prefetch();
    // Let the rejection settle: an unhandled one would fail the run
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(load()).resolves.toBeUndefined();
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
