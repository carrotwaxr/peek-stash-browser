/**
 * Which middleware guards each route (item 77; a characterisation of the
 * stacks the handlers trust). Walks the app `setupAPI()` builds: its own
 * routes, and every router from `routes/*.ts` and `routes/library/*.ts` at
 * the path it is mounted on, with the `use()` layers that apply to each route
 * (router-level ones registered before it, and the app's that match its path).
 *
 * - Every route ending in an `authenticated()` handler runs `authenticate`
 *   (or, on the direct stream, `authenticateStreamRequest`) before it.
 * - Every route without either is on PUBLIC_ROUTES.
 * - The routes behind `requireAdmin` are exactly ADMIN_ROUTES, each after a
 *   session check.
 * - Every route ending in a `libraryHandler()` handler runs requireCacheReady,
 *   requirePickerReady or withAllowedInstances before it, so the handler has
 *   the viewer's instances on the request.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  authenticate,
  requireAdmin,
  requireCacheReady,
  requirePickerReady,
  withAllowedInstances,
} from "../../middleware/auth.js";
import { requireAdminOnceSetupStarted } from "../../middleware/setupGuards.js";
import { authenticateStreamRequest } from "../../middleware/streamAuth.js";
import { LIBRARY_HANDLER } from "../../utils/routeHelpers.js";
import type * as routeHelpersModule from "../../utils/routeHelpers.js";
import { ADMIN_ROUTES } from "../helpers/adminRoutes.js";

/** A handler `libraryHandler()` returned: it checks the user as `authenticated()` does */
function isLibraryHandler(handler: unknown): boolean {
  return (
    typeof handler === "function" &&
    (handler as unknown as Record<symbol, unknown>)[LIBRARY_HANDLER] === true
  );
}

/** Every handler `authenticated()` returned while the routers were built. */
const { wrapped } = vi.hoisted(() => ({ wrapped: new WeakSet() }));

vi.mock("../../utils/routeHelpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof routeHelpersModule>();
  const authenticated: typeof actual.authenticated = (handler) => {
    const routeHandler = actual.authenticated(handler);
    wrapped.add(routeHandler);
    return routeHandler;
  };
  return { ...actual, authenticated };
});

/** Routes anyone may call without a session. */
const PUBLIC_ROUTES = [
  "GET /api/health",
  "GET /api/version",
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "POST /api/auth/forgot-password/init",
  "POST /api/auth/forgot-password/reset",
  "GET /api/setup/status",
  "POST /api/setup/create-admin",
  // Public only until setup starts, then the admin's (requireAdminOnceSetupStarted)
  "POST /api/setup/test-stash-connection",
  "POST /api/setup/create-stash-instance",
];

/** The routes whose handler reads `req.allowedInstanceIds` (`libraryHandler`). */
const LIBRARY_ROUTES = [
  "POST /api/library/scenes",
  "GET /api/library/scenes/:id/similar",
  "GET /api/library/scenes/recommended",
  "POST /api/library/performers",
  "POST /api/library/performers/minimal",
  "GET /api/library/performers/:id/counts",
  "POST /api/library/studios",
  "POST /api/library/studios/minimal",
  "GET /api/library/studios/:id/counts",
  "POST /api/library/tags",
  "POST /api/library/tags/minimal",
  "POST /api/library/tags/tree",
  "GET /api/library/tags/:id/counts",
  "POST /api/library/groups",
  "POST /api/library/groups/minimal",
  "GET /api/library/groups/:id/counts",
  "POST /api/library/galleries",
  "POST /api/library/galleries/minimal",
  "GET /api/library/galleries/:id/counts",
  "POST /api/library/images",
  "GET /api/clips",
  "GET /api/clips/:id",
  "GET /api/scenes/:id/clips",
  "POST /api/carousels/preview",
  "GET /api/carousels/:id/execute",
  "GET /api/playlists",
  "GET /api/playlists/shared",
  "GET /api/playlists/:id",
  "GET /api/playlists/:id/queue",
  "POST /api/playlists/:id/duplicate",
  "PUT /api/playlists/:id",
  "POST /api/playlists/:id/items",
  "POST /api/playlists/:id/items/bulk",
  "POST /api/playlists/:id/items/remove-unavailable",
  "POST /api/playlists/:id/sort",
  "GET /api/user-stats",
  "GET /api/timeline/:entityType/distribution",
];

/** Where `initializers/api.ts` mounts each router (checked below). */
const MOUNTS: Record<string, string> = {
  "auth.ts": "/api/auth",
  "carousel.ts": "/api/carousels",
  "clips.ts": "/api/clips",
  "customTheme.ts": "/api/themes/custom",
  "databaseBackup.ts": "/api/admin",
  "download.ts": "/api/downloads",
  "exclusions.ts": "/api/exclusions",
  "groups.ts": "/api/groups",
  "imageViewHistory.ts": "/api/image-view-history",
  "library/galleries.ts": "/api/library",
  "library/groups.ts": "/api/library",
  "library/images.ts": "/api/library",
  "library/performers.ts": "/api/library",
  "library/ready.ts": "/api/library",
  "library/scenes.ts": "/api/library",
  "library/studios.ts": "/api/library",
  "library/tags.ts": "/api/library",
  "mergeReconciliation.ts": "/api/admin",
  "playlist.ts": "/api/playlists",
  "ratings.ts": "/api/ratings",
  "setup.ts": "/api/setup",
  "sync.ts": "/api/sync",
  "timeline.ts": "/api/timeline",
  "user.ts": "/api/user",
  "userStats.ts": "/api/user-stats",
  "video.ts": "/api",
  "watchHistory.ts": "/api/watch-history",
};

/**
 * A layer as router 2 (Express 5) builds it. `@types/express` still
 * declares router 1's, which has no `match` and no `slash`.
 */
interface RouterLayer {
  route?: { path: string; stack: { method: string; handle: unknown }[] };
  handle: unknown;
  /** The part of the path the last `match()` call matched. */
  path?: string;
  match(path: string): boolean;
}

interface StackOwner {
  stack: RouterLayer[];
}

function isStackOwner(value: unknown): value is StackOwner {
  return (
    typeof value === "function" &&
    "stack" in value &&
    Array.isArray(value.stack)
  );
}

function stackOf(router: unknown): RouterLayer[] {
  if (!isStackOwner(router)) throw new Error("Not an Express router");
  return router.stack;
}

interface WalkedRoute {
  /** "METHOD /api/path", with the route's Express params. */
  key: string;
  /** The route file it comes from ("user.ts"), or "app" for the app's own. */
  source: string;
  /** What runs before the handler, in order: `use()` layers, then the route's own. */
  before: unknown[];
  handler: unknown;
}

/**
 * The routes in `stack`, mounted at `prefix`. `inherited` is what runs
 * before the stack is entered. A `use()` layer applies to a route after it
 * when it matches the route's path (router-level `use(fn)` matches every
 * path).
 */
function walk(
  stack: RouterLayer[],
  prefix: string,
  inherited: unknown[],
  routers: Map<unknown, string>,
  source = "app"
): WalkedRoute[] {
  const routes: WalkedRoute[] = [];
  const uses: RouterLayer[] = [];
  const applying = (routePath: string) =>
    uses.filter((use) => use.match(routePath)).map((use) => use.handle);

  for (const layer of stack) {
    if (layer.route) {
      const { path: routePath, stack: routeStack } = layer.route;
      for (const method of new Set(routeStack.map((l) => l.method))) {
        const handles = routeStack
          .filter((l) => l.method === method)
          .map((l) => l.handle);
        const fullPath = prefix + (routePath === "/" ? "" : routePath);
        routes.push({
          key: `${method.toUpperCase()} ${fullPath}`,
          source,
          before: [
            ...inherited,
            ...applying(routePath),
            ...handles.slice(0, -1),
          ],
          handler: handles[handles.length - 1],
        });
      }
    } else if (isStackOwner(layer.handle)) {
      const file = routers.get(layer.handle);
      if (file === undefined) {
        throw new Error("The app mounts a router outside routes/");
      }
      const mount = MOUNTS[file];
      if (mount === undefined) throw new Error(`No mount for routes/${file}`);
      routes.push(
        ...walk(
          layer.handle.stack,
          mount,
          [...inherited, ...applying(mount)],
          routers,
          file
        )
      );
    } else {
      uses.push(layer);
    }
  }
  return routes;
}

const routesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../routes"
);

/** Every route file, as "user.ts" or "library/tags.ts". */
function routeFiles(): string[] {
  const inDir = (dir: string) =>
    fs
      .readdirSync(path.join(routesDir, dir))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => path.posix.join(dir, name));
  return [...inDir(""), ...inDir("library")].sort();
}

describe("route guards", () => {
  /** Each route file's router, to its file */
  const routers = new Map<unknown, string>();
  let appStack: RouterLayer[] = [];
  let routes: WalkedRoute[] = [];

  beforeAll(async () => {
    for (const file of routeFiles()) {
      const module: unknown = await import(
        path.join(routesDir, file.replace(/\.ts$/, ".js"))
      );
      if (
        typeof module !== "object" ||
        module === null ||
        !("default" in module)
      ) {
        throw new Error(`routes/${file} has no default export`);
      }
      routers.set(module.default, file);
    }
    const { setupAPI } = await import("../../initializers/api.js");
    appStack = stackOf(setupAPI().router);
    routes = walk(appStack, "", [], routers);
  }, 60000);

  it("mounts every router in routes/ where MOUNTS says, once", () => {
    expect(Object.keys(MOUNTS).sort()).toEqual(routeFiles());
    const mounted = appStack.filter((layer) => isStackOwner(layer.handle));
    expect(mounted.map((layer) => routers.get(layer.handle)).sort()).toEqual(
      routeFiles()
    );
    for (const layer of mounted) {
      const mount = MOUNTS[routers.get(layer.handle) ?? ""] ?? "";
      expect(layer.match(mount)).toBe(true);
      expect(layer.path).toBe(mount);
    }
    // The walk reached every router's routes
    expect([...new Set(routes.map((route) => route.source))].sort()).toEqual(
      ["app", ...routeFiles()].sort()
    );
  });

  it("runs authenticate or authenticateStreamRequest before every authenticated() handler", () => {
    const guarded = routes.filter(
      (route) =>
        route.before.includes(authenticate) ||
        route.before.includes(authenticateStreamRequest)
    );
    const unguarded = routes
      .filter((route) => typeof route.handler === "function")
      .filter(
        (route) =>
          wrapped.has(route.handler as object) ||
          isLibraryHandler(route.handler)
      )
      .filter((route) => !guarded.includes(route))
      .map((route) => route.key);
    expect(unguarded).toEqual([]);
  });

  it("leaves only PUBLIC_ROUTES without a session check", () => {
    const open = routes
      .filter(
        (route) =>
          !route.before.includes(authenticate) &&
          !route.before.includes(authenticateStreamRequest)
      )
      .map((route) => route.key);
    expect(open.sort()).toEqual([...PUBLIC_ROUTES].sort());
    for (const key of [
      "POST /api/setup/test-stash-connection",
      "POST /api/setup/create-stash-instance",
    ]) {
      const route = routes.find((r) => r.key === key);
      expect(route?.before).toContain(requireAdminOnceSetupStarted);
    }
  });

  it("puts requireAdmin, after a session check, on exactly ADMIN_ROUTES", () => {
    const admin = routes.filter((route) => route.before.includes(requireAdmin));
    expect(admin.map((route) => route.key).sort()).toEqual(
      [...ADMIN_ROUTES].sort()
    );
    for (const route of admin) {
      expect(route.before.indexOf(authenticate)).toBeGreaterThanOrEqual(0);
      expect(route.before.indexOf(authenticate)).toBeLessThan(
        route.before.lastIndexOf(requireAdmin)
      );
    }
  });

  it("runs requireCacheReady, requirePickerReady or withAllowedInstances before every libraryHandler() handler", () => {
    const library = routes.filter((route) => isLibraryHandler(route.handler));
    expect(library.map((route) => route.key).sort()).toEqual(
      [...LIBRARY_ROUTES].sort()
    );
    // The pickers take an admin's scope: requirePickerReady
    for (const route of library.filter((r) => r.key.endsWith("/minimal"))) {
      expect(route.before).toContain(requirePickerReady);
    }
    const unready = library
      .filter(
        (route) =>
          !route.before.includes(requireCacheReady) &&
          !route.before.includes(requirePickerReady) &&
          !route.before.includes(withAllowedInstances)
      )
      .map((route) => route.key);
    expect(unready).toEqual([]);
  });
});
