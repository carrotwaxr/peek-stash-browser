/**
 * Each tab names itself to the Cast session with its own sender id, sent as
 * `customData.sender`: only the tab whose id the playing media carries
 * records its progress. The id lives in sessionStorage, so a reload of the
 * tab keeps it and another tab has its own.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

/** The module as a fresh page load of the tab sees it */
async function freshModule() {
  vi.resetModules();
  return import("@/components/video-player/cast/castSenderId");
}

afterEach(() => {
  sessionStorage.clear();
});

describe("castSenderId", () => {
  it("the id is stable across calls and survives a reload of the tab (sessionStorage)", async () => {
    const { castSenderId } = await freshModule();
    const id = castSenderId();
    expect(id).toMatch(/\S{16,}/);
    expect(castSenderId()).toBe(id);

    // A reload: the module starts again, the tab's sessionStorage stays
    const reloaded = await freshModule();
    expect(reloaded.castSenderId()).toBe(id);
  });

  it("two tabs get different ids", async () => {
    const first = (await freshModule()).castSenderId();

    // Another tab: its own sessionStorage, its own module
    sessionStorage.clear();
    const second = (await freshModule()).castSenderId();

    expect(second).not.toBe(first);
  });

  describe("when sessionStorage is blocked", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    /** Cookies and site data blocked: every access to the storage throws */
    function blockStorage() {
      const blocked = () => {
        throw new DOMException("denied", "SecurityError");
      };
      vi.stubGlobal("sessionStorage", {
        getItem: blocked,
        setItem: blocked,
      });
    }

    it("the tab still has one stable id for the page's life", async () => {
      blockStorage();
      const { castSenderId } = await freshModule();

      const id = castSenderId();

      expect(id).toMatch(/\S{16,}/);
      expect(castSenderId()).toBe(id);
    });

    it("a reloaded page names itself afresh, and never as another tab", async () => {
      blockStorage();
      const first = (await freshModule()).castSenderId();
      const second = (await freshModule()).castSenderId();

      expect(second).not.toBe(first);
    });

    it("a tab whose storage can be read but not written keeps one id for the page", async () => {
      vi.stubGlobal("sessionStorage", {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("full", "QuotaExceededError");
        },
      });
      const { castSenderId } = await freshModule();

      const id = castSenderId();

      expect(castSenderId()).toBe(id);
    });
  });
});
