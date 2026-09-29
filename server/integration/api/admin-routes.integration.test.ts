/**
 * The guards the handlers trust (item 77), over HTTP.
 *
 * Every admin route answers a regular user 403 before its handler runs, so
 * the handlers check no role of their own; each admin GET answers the admin
 * with something other than 403. No request here reaches a handler that
 * writes: a USER's write is refused by requireAdmin, and the admin sends only
 * GETs. Without a session every admin route, and a route of each kind whose
 * handler reads `req.user`, answers 401.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_ROUTES } from "../../tests/helpers/adminRoutes.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import { createApiUser } from "../helpers/accessFixture.js";
import type { TestClient } from "../helpers/testClient.js";
import { adminClient, guestClient } from "../helpers/testClient.js";

type Method = "GET" | "POST" | "PUT" | "DELETE";

function send(client: TestClient, method: Method, path: string) {
  switch (method) {
    case "GET":
      return client.get<{ error?: string }>(path);
    case "POST":
      return client.post<{ error?: string }>(path, {});
    case "PUT":
      return client.put<{ error?: string }>(path, {});
    case "DELETE":
      return client.delete<{ error?: string }>(path);
  }
}

function parseRoute(route: string): { method: Method; pattern: string } {
  const [method, pattern] = route.split(" ");
  if (
    (method !== "GET" &&
      method !== "POST" &&
      method !== "PUT" &&
      method !== "DELETE") ||
    pattern === undefined
  ) {
    throw new Error(`Cannot send ${route}`);
  }
  return { method, pattern };
}

/**
 * Routes whose handlers read `req.user`, one per changed controller, plus
 * each way a route runs the session check: a router-wide `use`, a route's own
 * `authenticate`, the app's `use` on /api/proxy, and the stream's
 * `authenticateStreamRequest` without a signed link.
 */
const SESSION_ROUTES: readonly string[] = [
  "GET /api/carousels",
  "GET /api/themes/custom",
  "GET /api/downloads",
  "GET /api/groups/user/mine",
  "GET /api/image-view-history/1",
  "POST /api/library/scenes",
  "GET /api/library/scenes/recommended",
  "GET /api/playlists",
  "PUT /api/ratings/scene/1",
  "GET /api/user-stats",
  "GET /api/user/settings",
  "GET /api/user/permissions",
  "GET /api/watch-history",
  "GET /api/library/ready",
  "GET /api/auth/me",
  "GET /api/proxy/stash?path=/scene/1/screenshot",
  "GET /api/scene/1/proxy-stream/stream",
];

describe("admin routes and session checks (integration)", () => {
  let regular: { id: number; client: TestClient } | undefined;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    regular = await createApiUser("admin_routes_it_user", "admin_routes_pw_1");
  }, 60000);

  afterAll(async () => {
    if (regular) await adminClient.delete(`/api/user/${regular.id}`);
  }, 60000);

  /** The route's path with every param filled: the regular user for `:userId`. */
  function pathFor(pattern: string): string {
    const userId = String(regular?.id ?? 0);
    return pattern
      .replace(":userId", userId)
      .replace(":id", "999999")
      .replace(":ref", "999999%3Anone")
      .replace(":filename", "none.db");
  }

  it("a regular user gets 403 from every admin route", async () => {
    const client = regular?.client;
    if (!client) throw new Error("the regular user was not created");
    const answers: string[] = [];
    for (const route of ADMIN_ROUTES) {
      const { method, pattern } = parseRoute(route);
      const res = await send(client, method, pathFor(pattern));
      answers.push(`${route} ${res.status} ${res.data.error ?? ""}`);
    }
    expect(answers).toEqual(
      ADMIN_ROUTES.map((route) => `${route} 403 Admin access required.`)
    );
  });

  it("the admin does not get 403 from any admin GET", async () => {
    const gets = ADMIN_ROUTES.map(parseRoute).filter(
      ({ method }) => method === "GET"
    );
    expect(gets.length).toBeGreaterThan(10);
    for (const { pattern } of gets) {
      const res = await adminClient.get(pathFor(pattern));
      expect(res.status, `GET ${pattern}`).not.toBe(403);
      expect(res.status, `GET ${pattern}`).not.toBe(401);
    }
  });

  it("without a session every admin route answers 401", async () => {
    for (const route of ADMIN_ROUTES) {
      const { method, pattern } = parseRoute(route);
      const res = await send(guestClient, method, pathFor(pattern));
      expect(res.status, route).toBe(401);
    }
  });

  it("without a session a route of each kind answers 401", async () => {
    for (const route of SESSION_ROUTES) {
      const { method, pattern } = parseRoute(route);
      const res = await send(guestClient, method, pattern);
      expect(res.status, route).toBe(401);
    }
  });
});
