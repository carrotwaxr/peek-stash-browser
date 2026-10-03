/**
 * The loader adds Google's script once and resolves the framework it
 * installs, or null when it fails or never answers. Whether a tab may load it
 * at all is `canCast` (castSupport.test.ts), checked by `useCast` first.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SCRIPT_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

type CastWindow = Window & {
  __onGCastApiAvailable?: (available: boolean) => void;
  cast?: unknown;
  chrome?: unknown;
};

const setOptions = vi.fn();
const castWindow = window as CastWindow;

/** The scripts the loader added; jsdom would fail each at once, so none is attached. */
let castScripts: HTMLScriptElement[] = [];

/** The framework Google's script would install. */
function installFramework() {
  castWindow.cast = {
    framework: {
      CastContext: { getInstance: () => ({ setOptions }) },
    },
  };
  castWindow.chrome = {
    cast: {
      AutoJoinPolicy: { ORIGIN_SCOPED: "origin_scoped" },
      media: { DEFAULT_MEDIA_RECEIVER_APP_ID: "CC1AD845" },
    },
  };
}

async function freshLoader() {
  vi.resetModules();
  return (await import("../../../../src/components/video-player/cast/castSdk"))
    .loadCastSdk;
}

describe("loadCastSdk", () => {
  beforeEach(() => {
    setOptions.mockClear();
    castScripts = [];
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLScriptElement) castScripts.push(node);
      return node;
    });
    delete castWindow.__onGCastApiAvailable;
    delete castWindow.cast;
    delete castWindow.chrome;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("adds one script for two calls and resolves the framework when __onGCastApiAvailable(true)", async () => {
    installFramework();
    const loadCastSdk = await freshLoader();

    const first = loadCastSdk();
    const second = loadCastSdk();
    expect(castScripts).toHaveLength(1);
    expect(second).toBe(first);

    castWindow.__onGCastApiAvailable?.(true);
    const framework = await first;

    expect(framework).toBe(
      (castWindow.cast as { framework: unknown }).framework
    );
    expect(setOptions).toHaveBeenCalledTimes(1);
    expect(setOptions).toHaveBeenCalledWith({
      receiverApplicationId: "CC1AD845",
      autoJoinPolicy: "origin_scoped",
    });
  });

  it("resolves null when __onGCastApiAvailable(false)", async () => {
    installFramework();
    const loadCastSdk = await freshLoader();

    const loading = loadCastSdk();
    castWindow.__onGCastApiAvailable?.(false);

    await expect(loading).resolves.toBeNull();
    expect(setOptions).not.toHaveBeenCalled();
  });

  it("resolves null when the script fails to load", async () => {
    installFramework();
    const loadCastSdk = await freshLoader();

    const loading = loadCastSdk();
    castScripts[0]?.onerror?.(new Event("error"));

    await expect(loading).resolves.toBeNull();
  });

  it("resolves null after 10 s with no callback", async () => {
    vi.useFakeTimers();
    const loadCastSdk = await freshLoader();

    const loading = loadCastSdk();
    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void loading.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(loading).resolves.toBeNull();
  });
});
