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
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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

  it("redirectToLogin without a message stores no login notice", async () => {
    const { redirectToLogin, LOGIN_MESSAGE_STORAGE_KEY } =
      await import("@/api/client");

    redirectToLogin();

    expect(location.href).toBe("/login");
    expect(sessionStorage.getItem(LOGIN_MESSAGE_STORAGE_KEY)).toBeNull();
  });

  it("a second redirectToLogin while one is under way changes nothing", async () => {
    const { redirectToLogin, LOGIN_MESSAGE_STORAGE_KEY, REDIRECT_STORAGE_KEY } =
      await import("@/api/client");

    redirectToLogin("first");
    location.pathname = "/other";
    location.href = "";
    redirectToLogin("second");

    expect(location.href).toBe("");
    expect(sessionStorage.getItem(LOGIN_MESSAGE_STORAGE_KEY)).toBe("first");
    expect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe(
      "/scene/5?instance=inst-a"
    );
  });

  it("a 401 after a redirect has started throws instead of redirecting again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Session expired" }),
      })
    );
    const { apiFetch, redirectToLogin, ApiError } =
      await import("@/api/client");
    redirectToLogin();
    location.href = "";

    const err = await apiFetch("/library/scenes").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).status).toBe(401);
    expect((err as Error).message).toBe("Session expired");
    expect(location.href).toBe("");
  });

  it("a 403 redirects to login like a 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "Forbidden" }),
      })
    );
    const { apiFetch, REDIRECT_STORAGE_KEY } = await import("@/api/client");

    void apiFetch("/library/scenes");
    await vi.waitFor(() => expect(location.href).toBe("/login"));
    expect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe(
      "/scene/5?instance=inst-a"
    );
  });

  it.each([
    "/watch-history/save-activity",
    "/watch-history/increment-play-count",
    "/image-view-history/increment-o",
    "/image-view-history/view",
  ])(
    "a 401 on the background endpoint %s throws and leaves the page alone",
    async (endpoint) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({ error: "Session expired" }),
        })
      );
      const { apiFetch, ApiError } = await import("@/api/client");

      const err = await apiFetch(endpoint).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiError);
      expect((err as Error).message).toBe("Session expired");
      expect(location.href).toBe("");
      expect(sessionStorage.length).toBe(0);
    }
  );

  it("a 403 on a background endpoint with no error body names the endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({}),
      })
    );
    const { apiFetch } = await import("@/api/client");

    await expect(apiFetch("/image-view-history/view")).rejects.toThrow(
      "Auth failure on /image-view-history/view"
    );
    expect(location.href).toBe("");
  });

  it.each(["/login", "/setup"])(
    "a 401 while on %s throws instead of reloading the page",
    async (pathname) => {
      location.pathname = pathname;
      location.search = "";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          json: async () => ({}),
        })
      );
      const { apiFetch, ApiError, REDIRECT_STORAGE_KEY } =
        await import("@/api/client");

      const err = await apiFetch("/setup/status").catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiError);
      expect((err as Error).message).toBe("Auth failure on /setup/status");
      expect(location.href).toBe("");
      expect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBeNull();
    }
  );
});

describe("apiFetch errors and results", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    stubLocation("/scenes");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed body and sends cookies and JSON headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ scenes: [1, 2] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { apiPost } = await import("@/api/client");

    await expect(apiPost("/library/scenes", { page: 2 })).resolves.toEqual({
      scenes: [1, 2],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/library/scenes",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ page: 2 }),
        headers: { "Content-Type": "application/json" },
      })
    );
  });

  it("uses the server's error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Bad filter" }),
      })
    );
    const { apiFetch, ApiError } = await import("@/api/client");

    const err = await apiFetch("/library/scenes").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).status).toBe(400);
    expect((err as Error).message).toBe("Bad filter");
    expect((err as InstanceType<typeof ApiError>).data).toEqual({
      error: "Bad filter",
    });
  });

  it("falls back to the body's message field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: "Already exists" }),
      })
    );
    const { apiFetch } = await import("@/api/client");

    await expect(apiFetch("/playlists")).rejects.toThrow("Already exists");
  });

  it("names the status when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      })
    );
    const { apiFetch, ApiError } = await import("@/api/client");

    const err = await apiFetch("/library/scenes").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as Error).message).toBe("HTTP error! status: 502");
    expect((err as InstanceType<typeof ApiError>).isInitializing).toBe(false);
  });

  it("marks a 503 with ready false as still initializing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ ready: false, message: "Cache warming" }),
      })
    );
    const { apiFetch, ApiError } = await import("@/api/client");

    const err = await apiFetch("/library/scenes").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).isInitializing).toBe(true);
    expect((err as Error).message).toBe("Cache warming");
  });
});
