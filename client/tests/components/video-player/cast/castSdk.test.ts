import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SCRIPT_URL =
  "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

const CHROME_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const HEADLESS_UA = CHROME_UA.replace("Chrome/", "HeadlessChrome/");
const EDGE_UA = `${CHROME_UA} Edg/130.0.0.0`;
const CRIOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1";
const FIREFOX_UA =
  "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";

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

function setEnvironment(secure: boolean, userAgent: string) {
  vi.stubGlobal("isSecureContext", secure);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
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
    setEnvironment(true, CHROME_UA);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves null on an insecure context without adding a script, and a later call in a secure context still loads", async () => {
    const loadCastSdk = await freshLoader();
    vi.stubGlobal("isSecureContext", false);

    await expect(loadCastSdk()).resolves.toBeNull();
    expect(castScripts).toHaveLength(0);

    vi.stubGlobal("isSecureContext", true);
    installFramework();
    const loading = loadCastSdk();
    expect(castScripts).toHaveLength(1);
    expect(castScripts[0]?.src).toBe(SCRIPT_URL);
    castWindow.__onGCastApiAvailable?.(true);
    await expect(loading).resolves.not.toBeNull();
  });

  it("resolves null in a non-Chromium browser", async () => {
    setEnvironment(true, FIREFOX_UA);
    const loadCastSdk = await freshLoader();

    await expect(loadCastSdk()).resolves.toBeNull();
    expect(castScripts).toHaveLength(0);
  });

  it("a HeadlessChrome UA loads", async () => {
    setEnvironment(true, HEADLESS_UA);
    const loadCastSdk = await freshLoader();

    void loadCastSdk();
    expect(castScripts).toHaveLength(1);
  });

  it("a CriOS UA resolves null without a script", async () => {
    setEnvironment(true, CRIOS_UA);
    const loadCastSdk = await freshLoader();

    await expect(loadCastSdk()).resolves.toBeNull();
    expect(castScripts).toHaveLength(0);
  });

  it("an Edg UA loads", async () => {
    setEnvironment(true, EDGE_UA);
    const loadCastSdk = await freshLoader();

    void loadCastSdk();
    expect(castScripts).toHaveLength(1);
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
