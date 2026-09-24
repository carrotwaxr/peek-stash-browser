/**
 * redirectToLogin and the 401 branch of apiFetch (sweep item 2).
 *
 * isRedirectingToLogin is module state that never resets (the page does a
 * full navigation), so every test resets the module registry and imports
 * the client afresh.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeLocation = { pathname: string; search: string; href: string };

function stubLocation(pathname: string, search = ""): FakeLocation {
  const fake: FakeLocation = { pathname, search, href: "" };
  Object.defineProperty(window, "location", {
    value: fake,
    writable: true,
    configurable: true,
  });
  return fake;
}

describe("api client login redirect", () => {
  let location: FakeLocation;

  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    location = stubLocation("/scene/5", "?instance=inst-a");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirectToLogin stores the return path and the message, then navigates to /login", async () => {
    const { redirectToLogin, LOGIN_MESSAGE_STORAGE_KEY, REDIRECT_STORAGE_KEY } =
      await import("@/api/client");

    redirectToLogin("Your session expired while the video was paused.");

    expect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe(
      "/scene/5?instance=inst-a"
    );
    expect(sessionStorage.getItem(LOGIN_MESSAGE_STORAGE_KEY)).toBe(
      "Your session expired while the video was paused."
    );
    expect(location.href).toBe("/login");
    expect(LOGIN_MESSAGE_STORAGE_KEY).toBe("peek_login_message");
  });

  it("apiFetch 401 still redirects without a message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Access denied. No token provided." }),
      })
    );
    const { apiFetch, LOGIN_MESSAGE_STORAGE_KEY, REDIRECT_STORAGE_KEY } =
      await import("@/api/client");

    // The promise never settles after a redirect; race it with a tick
    const outcome = await Promise.race([
      apiFetch("/library/scenes").then(
        () => "resolved",
        () => "rejected"
      ),
      new Promise<string>((resolve) =>
        setTimeout(() => resolve("pending"), 20)
      ),
    ]);

    expect(outcome).toBe("pending");
    expect(location.href).toBe("/login");
    expect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe(
      "/scene/5?instance=inst-a"
    );
    expect(sessionStorage.getItem(LOGIN_MESSAGE_STORAGE_KEY)).toBeNull();
  });

  it("apiFetch 401 on an /auth/ endpoint throws instead of redirecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Access denied. No token provided." }),
      })
    );
    const { apiFetch, ApiError } = await import("@/api/client");

    await expect(apiFetch("/auth/check")).rejects.toBeInstanceOf(ApiError);
    expect(location.href).toBe("");
  });
});
