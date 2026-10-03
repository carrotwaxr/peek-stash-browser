/**
 * apiFetch's login redirect and error plumbing (sweep items 2 and 39).
 *
 * isRedirectingToLogin is module state that never resets (the page does a
 * full navigation), so every test resets the module registry and imports
 * the client afresh.
 */
import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ApiClient from "@/api/client";
import type { queryKeys as QueryKeys } from "@/api/queryKeys";
import { must } from "../testUtils";

type FakeLocation = {
  pathname: string;
  search: string;
  href: string;
  /** How many times the page navigated (href assigned) */
  navigations: number;
};

function stubLocation(pathname: string, search = ""): FakeLocation {
  let href = "";
  const fake = {
    pathname,
    search,
    navigations: 0,
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
      fake.navigations += 1;
    },
  };
  Object.defineProperty(window, "location", {
    value: fake,
    writable: true,
    configurable: true,
  });
  return fake;
}

/** A real Response, as the browser's fetch resolves; one per call. */
function respond(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function stubFetch(
  status: number,
  body?: unknown,
  headers?: Record<string, string>
) {
  const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
    Promise.resolve(respond(status, body, headers))
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** A redirect leaves the promise pending forever; race it with a tick. */
function settleOrPending(promise: Promise<unknown>): Promise<string> {
  return Promise.race([
    promise.then(
      () => "resolved",
      () => "rejected"
    ),
    new Promise<string>((resolve) => setTimeout(() => resolve("pending"), 20)),
  ]);
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
    stubFetch(401, { error: "Access denied. No token provided." });
    const { apiFetch, LOGIN_MESSAGE_STORAGE_KEY, REDIRECT_STORAGE_KEY } =
      await import("@/api/client");

    expect(await settleOrPending(apiFetch("/library/scenes"))).toBe("pending");
    expect(location.href).toBe("/login");
    expect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe(
      "/scene/5?instance=inst-a"
    );
    expect(sessionStorage.getItem(LOGIN_MESSAGE_STORAGE_KEY)).toBeNull();
  });

  it("a 401 redirects once and remembers the page", async () => {
    stubFetch(401, { error: "Session expired. Please log in again." });
    const { apiFetch, REDIRECT_STORAGE_KEY } = await import("@/api/client");

    const first = settleOrPending(apiFetch("/library/scenes"));
    const second = apiFetch("/library/performers").catch((e: unknown) => e);

    expect(await first).toBe("pending");
    await second;
    expect(location.navigations).toBe(1);
    expect(location.href).toBe("/login");
    expect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe(
      "/scene/5?instance=inst-a"
    );
  });

  it("apiFetch 401 on an /auth/ endpoint throws instead of redirecting", async () => {
    stubFetch(401, { error: "Access denied. No token provided." });
    const { apiFetch, ApiError } = await import("@/api/client");

    await expect(apiFetch("/auth/check")).rejects.toBeInstanceOf(ApiError);
    expect(location.navigations).toBe(0);
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
    redirectToLogin("second");

    expect(location.navigations).toBe(1);
    expect(sessionStorage.getItem(LOGIN_MESSAGE_STORAGE_KEY)).toBe("first");
    expect(sessionStorage.getItem(REDIRECT_STORAGE_KEY)).toBe(
      "/scene/5?instance=inst-a"
    );
  });

  it("a 401 after a redirect has started throws instead of redirecting again", async () => {
    stubFetch(401, { error: "Session expired" });
    const { apiFetch, redirectToLogin, ApiError } =
      await import("@/api/client");
    redirectToLogin();

    const err = await apiFetch("/library/scenes").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).status).toBe(401);
    expect((err as Error).message).toBe("Session expired");
    expect(location.navigations).toBe(1);
  });

  it("a 403 throws ApiError and does not redirect", async () => {
    stubFetch(403, {
      error: "You don't have permission to download files",
      errorType: "FORBIDDEN",
    });
    const { apiFetch, ApiError } = await import("@/api/client");

    const request = apiFetch("/downloads/scene/5");
    expect(await settleOrPending(request)).toBe("rejected");
    const err = await request.catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).status).toBe(403);
    expect((err as Error).message).toBe(
      "You don't have permission to download files"
    );
    expect(location.navigations).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it.each([400, 404, 409, 423, 429])(
    "a %i throws ApiError and does not redirect",
    async (status) => {
      stubFetch(status, { error: "Refused" });
      const { apiFetch, ApiError } = await import("@/api/client");

      const err = await apiFetch("/playlists/7/shares").catch(
        (e: unknown) => e
      );

      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBe(status);
      expect(location.navigations).toBe(0);
    }
  );

  it.each([
    "/watch-history/save-activity",
    "/watch-history/increment-play-count",
    "/image-view-history/increment-o",
    "/image-view-history/view",
  ])(
    "a 401 on the background endpoint %s throws and leaves the page alone",
    async (endpoint) => {
      stubFetch(401, { error: "Session expired" });
      const { apiFetch, ApiError } = await import("@/api/client");

      const err = await apiFetch(endpoint).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiError);
      expect((err as Error).message).toBe("Session expired");
      expect(location.navigations).toBe(0);
      expect(sessionStorage.length).toBe(0);
    }
  );

  it.each(["/login", "/setup", "/forgot-password"])(
    "a 401 on %s does not redirect",
    async (pathname) => {
      location.pathname = pathname;
      location.search = "";
      stubFetch(401, {});
      const { apiFetch, ApiError, REDIRECT_STORAGE_KEY } =
        await import("@/api/client");

      const request = apiFetch("/setup/status");
      expect(await settleOrPending(request)).toBe("rejected");
      const err = await request.catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).status).toBe(401);
      expect(location.navigations).toBe(0);
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
    const fetchMock = stubFetch(200, { scenes: [1, 2] });
    const { apiPost } = await import("@/api/client");

    await expect(apiPost("/library/scenes", { page: 2 })).resolves.toEqual({
      scenes: [1, 2],
    });
    const [url, init] = must(fetchMock.mock.calls[0], "the fetch call");
    expect(url).toBe("/api/library/scenes");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(init?.body).toBe(JSON.stringify({ page: 2 }));
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json"
    );
  });

  it("every request sends X-Peek-Time-Zone with the browser's zone", async () => {
    const fetchMock = stubFetch(200, {});
    const resolved = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({
        timeZone: "America/Los_Angeles",
      } as Intl.ResolvedDateTimeFormatOptions);
    const { apiFetch } = await import("@/api/client");

    await apiFetch("/library/scenes");
    await apiFetch("/playlists", { method: "POST", body: "{}" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("X-Peek-Time-Zone")).toBe(
        "America/Los_Angeles"
      );
    }
    resolved.mockRestore();
  });

  it("sends no X-Peek-Time-Zone when the browser names no zone", async () => {
    const fetchMock = stubFetch(200, {});
    const resolved = vi
      .spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions")
      .mockReturnValue({} as Intl.ResolvedDateTimeFormatOptions);
    const { apiFetch } = await import("@/api/client");

    await apiFetch("/library/scenes");

    const [, init] = must(fetchMock.mock.calls[0], "the fetch call");
    expect(new Headers(init?.headers).has("X-Peek-Time-Zone")).toBe(false);
    resolved.mockRestore();
  });

  it("a caller's headers keep Content-Type", async () => {
    const fetchMock = stubFetch(200, {});
    const { apiFetch } = await import("@/api/client");

    await apiFetch("/playlists", {
      method: "POST",
      body: "{}",
      headers: { "X-Peek-Test": "1" },
    });

    const [, init] = must(fetchMock.mock.calls[0], "the fetch call");
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Peek-Test")).toBe("1");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
  });

  it("a caller's Content-Type replaces the default", async () => {
    const fetchMock = stubFetch(200, {});
    const { apiFetch } = await import("@/api/client");

    await apiFetch("/import", {
      method: "POST",
      body: "x",
      headers: new Headers({ "content-type": "text/plain" }),
    });

    const [, init] = must(fetchMock.mock.calls[0], "the fetch call");
    expect(new Headers(init?.headers).get("Content-Type")).toBe("text/plain");
  });

  it("a 204 resolves undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 })))
    );
    const { apiDelete } = await import("@/api/client");

    await expect(apiDelete("/playlists/7")).resolves.toBeUndefined();
  });

  it("uses the server's error message", async () => {
    stubFetch(400, { error: "Bad filter" });
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
    stubFetch(409, { message: "Already exists" });
    const { apiFetch } = await import("@/api/client");

    await expect(apiFetch("/playlists")).rejects.toThrow("Already exists");
  });

  it("names the status when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response("<html>Bad Gateway</html>", { status: 502 })
        )
      )
    );
    const { apiFetch, ApiError } = await import("@/api/client");

    const err = await apiFetch("/library/scenes").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as Error).message).toBe("HTTP error! status: 502");
    expect((err as InstanceType<typeof ApiError>).isInitializing).toBe(false);
  });

  it("marks a 503 with ready false as still initializing", async () => {
    stubFetch(503, { ready: false, message: "Cache warming" });
    const { apiFetch, ApiError } = await import("@/api/client");

    const err = await apiFetch("/library/scenes").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).isInitializing).toBe(true);
    expect((err as Error).message).toBe("Cache warming");
  });

  it("reads Retry-After into retryAfterSeconds", async () => {
    stubFetch(
      429,
      { error: "Too many authentication attempts, please try again later" },
      { "Retry-After": "840" }
    );
    const { apiFetch, ApiError } = await import("@/api/client");

    const err = await apiFetch("/auth/forgot-password/init").catch(
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(ApiError);
    expect((err as InstanceType<typeof ApiError>).retryAfterSeconds).toBe(840);
  });

  it("takes the body's retryAfterSeconds when there is no header", async () => {
    stubFetch(423, {
      error: "Account temporarily locked due to too many failed attempts",
      retryAfterSeconds: 30,
    });
    const { apiFetch, ApiError } = await import("@/api/client");

    const err = await apiFetch("/auth/login").catch((e: unknown) => e);

    expect((err as InstanceType<typeof ApiError>).retryAfterSeconds).toBe(30);
  });

  it("has no retryAfterSeconds without a header or body field", async () => {
    stubFetch(400, { error: "Bad filter" });
    const { apiFetch, ApiError } = await import("@/api/client");

    const err = await apiFetch("/library/scenes").catch((e: unknown) => e);

    expect(
      (err as InstanceType<typeof ApiError>).retryAfterSeconds
    ).toBeUndefined();
  });
});

describe("getErrorMessage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("is the server's message for an ApiError", async () => {
    const { ApiError, getErrorMessage } = await import("@/api/client");

    expect(
      getErrorMessage(
        new ApiError("Current password is incorrect", 400),
        "Failed to change password"
      )
    ).toBe("Current password is incorrect");
  });

  it("adds the retry time to a 429", async () => {
    const { ApiError, getErrorMessage } = await import("@/api/client");

    expect(
      getErrorMessage(
        new ApiError(
          "Too many authentication attempts, please try again later",
          429,
          {},
          840
        )
      )
    ).toBe(
      "Too many authentication attempts, please try again later. Try again in 14 minutes."
    );
  });

  it("adds the retry time to a 423, in seconds under a minute", async () => {
    const { ApiError, getErrorMessage } = await import("@/api/client");

    expect(
      getErrorMessage(
        new ApiError(
          "Account temporarily locked due to too many failed attempts",
          423,
          {},
          30
        )
      )
    ).toBe(
      "Account temporarily locked due to too many failed attempts. Try again in 30 seconds."
    );
    expect(getErrorMessage(new ApiError("Locked.", 423, {}, 61))).toBe(
      "Locked. Try again in 2 minutes."
    );
    expect(getErrorMessage(new ApiError("Locked", 423, {}, 1))).toBe(
      "Locked. Try again in 1 second."
    );
  });

  it("adds no retry time to other statuses", async () => {
    const { ApiError, getErrorMessage } = await import("@/api/client");

    expect(
      getErrorMessage(
        new ApiError("The database is busy, try again", 503, {}, 1)
      )
    ).toBe("The database is busy, try again");
  });

  it("is an Error's message, else the fallback", async () => {
    const { getErrorMessage } = await import("@/api/client");

    expect(getErrorMessage(new Error("Failed to fetch"), "Fallback")).toBe(
      "Failed to fetch"
    );
    expect(getErrorMessage(new Error(""), "Fallback")).toBe("Fallback");
    expect(getErrorMessage("nope", "Fallback")).toBe("Fallback");
    expect(getErrorMessage(undefined)).toBe(
      "Something went wrong. Please try again."
    );
  });
});

describe("apiPatch", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("apiPatch sends PATCH with a JSON body", async () => {
    const fetchMock = stubFetch(200, { success: true });
    const { apiPatch } = await import("@/api/client");

    const answer = await apiPatch("/user/filter-presets/scene/p1", {
      name: "Renamed",
    });

    expect(answer).toEqual({ success: true });
    const [url, init] = must(fetchMock.mock.calls[0]);
    expect(url).toBe("/api/user/filter-presets/scene/p1");
    expect(init?.method).toBe("PATCH");
    expect(init?.body).toBe(JSON.stringify({ name: "Renamed" }));
  });
});

describe("the library stamp (X-Peek-Library)", () => {
  type Modules = {
    client: typeof ApiClient;
    queryClient: QueryClient;
    queryKeys: typeof QueryKeys;
  };

  /** Fresh modules and a query client holding one entry per kind. */
  async function setup(): Promise<Modules> {
    const client = await import("@/api/client");
    const { createQueryClient } = await import("@/api/queryClient");
    const { queryKeys } = await import("@/api/queryKeys");
    const queryClient = createQueryClient();
    return { client, queryClient, queryKeys };
  }

  /** Keys the stamp reaches, and one it does not (the user's settings). */
  function seed({ queryClient, queryKeys }: Modules) {
    const keys = {
      list: queryKeys.scenes.list(undefined, { page: 1 }),
      stats: queryKeys.user.stats(),
      playlists: queryKeys.playlists.all(),
      hidden: queryKeys.user.hiddenEntities(),
      settings: queryKeys.user.settings(),
    };
    for (const key of Object.values(keys)) queryClient.setQueryData(key, {});
    return keys;
  }

  function invalidated(
    queryClient: Modules["queryClient"],
    key: readonly unknown[]
  ): boolean {
    return must(queryClient.getQueryState(key), "the query").isInvalidated;
  }

  /** Each GET answers with `stamp` on the header, if given. */
  function answerWith(stamp: string | undefined, status = 200) {
    stubFetch(
      status,
      status === 200 ? {} : { error: "nope" },
      stamp === undefined ? {} : { "X-Peek-Library": stamp }
    );
  }

  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
    stubLocation("/scenes");
  });

  afterEach(async () => {
    const { resetLibraryStamp } = await import("@/api/client");
    resetLibraryStamp();
    vi.unstubAllGlobals();
  });

  it("the first stamp seen invalidates nothing", async () => {
    const modules = await setup();
    const keys = seed(modules);
    const spy = vi.spyOn(modules.queryClient, "invalidateQueries");

    answerWith("boot.0.0");
    await modules.client.apiGet("/library/scenes");

    expect(spy).not.toHaveBeenCalled();
    for (const key of Object.values(keys)) {
      expect(invalidated(modules.queryClient, key)).toBe(false);
    }
  });

  it("a changed stamp on any answer invalidates the library, stats, playlists and Hidden Items once", async () => {
    const modules = await setup();
    const keys = seed(modules);
    answerWith("boot.0.0");
    await modules.client.apiGet("/library/scenes");
    const spy = vi.spyOn(modules.queryClient, "invalidateQueries");

    // An error answer carries the stamp too
    answerWith("boot.1.0", 404);
    await expect(modules.client.apiGet("/library/scenes/9")).rejects.toThrow(
      "nope"
    );

    expect(spy).toHaveBeenCalledTimes(4);
    expect(invalidated(modules.queryClient, keys.list)).toBe(true);
    expect(invalidated(modules.queryClient, keys.stats)).toBe(true);
    expect(invalidated(modules.queryClient, keys.playlists)).toBe(true);
    expect(invalidated(modules.queryClient, keys.hidden)).toBe(true);
    expect(invalidated(modules.queryClient, keys.settings)).toBe(false);
  });

  it("a late answer with an older stamp invalidates nothing, and the newer one again nothing", async () => {
    const modules = await setup();
    seed(modules);
    answerWith("boot.0.0");
    await modules.client.apiGet("/library/scenes");
    answerWith("boot.2.1");
    await modules.client.apiGet("/library/scenes");
    const spy = vi.spyOn(modules.queryClient, "invalidateQueries");

    // Asked before the bumps, answered after them
    answerWith("boot.1.1");
    await modules.client.apiGet("/library/scenes");
    answerWith("boot.2.0");
    await modules.client.apiGet("/library/scenes");
    answerWith("boot.2.1");
    await modules.client.apiGet("/library/scenes");

    expect(spy).not.toHaveBeenCalled();
  });

  it("a newer library or user counter, or another boot, invalidates", async () => {
    const modules = await setup();
    seed(modules);
    answerWith("boot.3.0");
    await modules.client.apiGet("/library/scenes");
    const spy = vi.spyOn(modules.queryClient, "invalidateQueries");

    answerWith("boot.3.1");
    await modules.client.apiGet("/library/scenes");
    expect(spy).toHaveBeenCalledTimes(4);
    answerWith("boot.4.1");
    await modules.client.apiGet("/library/scenes");
    expect(spy).toHaveBeenCalledTimes(8);
    // A restart starts its counters again
    answerWith("reboot.0.0");
    await modules.client.apiGet("/library/scenes");
    expect(spy).toHaveBeenCalledTimes(12);
  });

  it("the same stamp again invalidates nothing", async () => {
    const modules = await setup();
    seed(modules);
    answerWith("boot.0.0");
    await modules.client.apiGet("/library/scenes");
    answerWith("boot.1.0");
    await modules.client.apiGet("/library/scenes");
    const spy = vi.spyOn(modules.queryClient, "invalidateQueries");

    answerWith("boot.1.0");
    await modules.client.apiGet("/library/scenes");
    // An answer without the header (a public endpoint) changes nothing
    answerWith(undefined);
    await modules.client.apiGet("/setup/status");

    expect(spy).not.toHaveBeenCalled();
  });
});
