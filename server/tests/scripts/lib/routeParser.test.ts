import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, expect, it } from "vitest";
import {
  parseApiFile,
  parseRouteFile,
  routeCallLines,
} from "../../../scripts/lib/routeParser.js";
import { must } from "../../helpers/must.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "../../..");
const ROUTES_DIR = path.join(SERVER_DIR, "routes");
const API_FILE = path.join(SERVER_DIR, "initializers", "api.ts");

const ROUTE_CALL = /router\.(get|post|put|delete|patch)\(/g;
const APP_ROUTE_CALL = /app\.(get|post|put|delete|patch)\(/g;

function routeFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? routeFiles(path.join(dir, entry.name))
        : entry.name.endsWith(".ts")
          ? [path.join(dir, entry.name)]
          : []
    );
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "route-parser-"));
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** A route file holding `source`, in a server-like tree under a temp dir */
function fixture(name: string, source: string): string {
  const file = path.join(tmpDir, "routes", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
}

function route(
  routes: ReturnType<typeof parseRouteFile>,
  method: string,
  fullPath: string
) {
  return must(
    routes.find((r) => r.method === method && r.fullPath === fullPath),
    `${method} ${fullPath}`
  );
}

describe("parseRouteFile", () => {
  it("documents every route in server/routes", () => {
    const declared: Record<string, number> = {};
    const documented: Record<string, number> = {};
    for (const file of routeFiles(ROUTES_DIR)) {
      const name = path.relative(ROUTES_DIR, file);
      declared[name] =
        fs.readFileSync(file, "utf-8").match(ROUTE_CALL)?.length ?? 0;
      documented[name] = parseRouteFile(file, "/api/test").length;
    }
    expect(documented).toEqual(declared);
  });

  it("an inline handler keeps its JSDoc", () => {
    const file = fixture(
      "inline.ts",
      `const router = express.Router();
router.use(authenticate);

/**
 * POST /api/things/rebuild
 * Rebuild every thing (admin only).
 *
 * Body: { force?: boolean }
 */
router.post(
  "/rebuild",
  requireAdmin,
  authenticated(async (req, res) => {
    res.json({ ok: "(not a paren)" });
  })
);
`
    );

    const rebuild = must(parseRouteFile(file, "/api/things")[0], "route");

    expect(rebuild.description).toBe(
      "Rebuild every thing (admin only).\n\nBody: { force?: boolean }"
    );
    expect(rebuild.handlerName).toBeNull();
    expect(rebuild.inlineHandler).toContain("res.json");
  });

  it("router.use(requireAdmin) marks every route Admin", () => {
    const routes = parseRouteFile(
      path.join(ROUTES_DIR, "mergeReconciliation.ts"),
      "/api/admin"
    );

    expect(routes.length).toBeGreaterThan(0);
    expect(new Set(routes.map((r) => r.auth))).toEqual(new Set(["Admin"]));
  });

  it("libraryHandler(findScenes) names findScenes", () => {
    const routes = parseRouteFile(
      path.join(ROUTES_DIR, "library", "scenes.ts"),
      "/api/library"
    );

    const scenes = route(routes, "POST", "/api/library/scenes");
    expect(scenes.handlerName).toBe("findScenes");
    expect(scenes.handlerFile).toBe("controllers/library/scenes.ts");
    expect(scenes.auth).toBe("Session");
  });

  it("reads a bare handler, a per-route requireAdmin and the setup guard", () => {
    const routes = parseRouteFile(
      path.join(ROUTES_DIR, "setup.ts"),
      "/api/setup"
    );

    const status = route(routes, "GET", "/api/setup/status");
    expect(status.handlerName).toBe("getSetupStatus");
    expect(status.handlerFile).toBe("controllers/setup.ts");
    expect(status.auth).toBe("None");
    expect(route(routes, "GET", "/api/setup/stash-instances").auth).toBe(
      "Admin"
    );
    expect(route(routes, "POST", "/api/setup/test-stash-connection").auth).toBe(
      "None until setup starts, then Admin"
    );
  });

  it("the stream routes take a session or a signed link", () => {
    const routes = parseRouteFile(path.join(ROUTES_DIR, "video.ts"), "/api");

    expect(
      route(routes, "GET", "/api/scene/:sceneId/proxy-stream/:streamPath").auth
    ).toBe("Session or signed link");
    expect(route(routes, "GET", "/api/scene/:sceneId/caption").auth).toBe(
      "Session"
    );
  });

  it("a handler defined in the route file points at the route file", () => {
    const routes = parseRouteFile(
      path.join(ROUTES_DIR, "library", "ready.ts"),
      "/api/library"
    );

    const ready = route(routes, "GET", "/api/library/ready");
    expect(ready.handlerName).toBe("getLibraryReady");
    expect(ready.handlerFile).toBe("routes/library/ready.ts");
  });

  it("takes the description from line comments, a trailing comment, or none", () => {
    const file = fixture(
      "comments.ts",
      `import { a, b, c } from "../controllers/things.js";
const router = express.Router();
// A section header, apart from the route

router.get("/a", authenticated(a));
// Gets b,
// in two lines
router.get("/b", authenticated(b));

router.delete(
  "/c",
  authenticated(c)
); // Deletes c
`
    );

    const routes = parseRouteFile(file, "/api/things", { serverDir: tmpDir });

    expect(routes.map((r) => r.description)).toEqual([
      "",
      "Gets b, in two lines",
      "Deletes c",
    ]);
    expect(routes.map((r) => r.handlerFile)).toEqual([
      "controllers/things.ts",
      "controllers/things.ts",
      "controllers/things.ts",
    ]);
    expect(routes.map((r) => r.line)).toEqual([5, 8, 10]);
  });

  it("a line comment heading a run of routes describes none of them", () => {
    const file = fixture(
      "sections.ts",
      `const router = express.Router();
// Admin routes
router.get("/", requireAdmin, authenticated(list));
router.post(
  "/",
  requireAdmin,
  authenticated(create)
);

// Own permissions
router.get("/mine", authenticated(mine));
`
    );

    const routes = parseRouteFile(file, "/api/s", { serverDir: tmpDir });

    expect(routes.map((r) => r.description)).toEqual([
      "",
      "",
      "Own permissions",
    ]);
  });

  it("router.use applies only to the routes after it", () => {
    const file = fixture(
      "order.ts",
      `import { open, closed } from "../controllers/things.js";
const router = express.Router();
router.get("/open", open);
router.use(authenticate);
router.get("/closed", authenticated(closed));
`
    );

    const routes = parseRouteFile(file, "/api/things", { serverDir: tmpDir });

    expect(routes.map((r) => r.auth)).toEqual(["None", "Session"]);
  });

  it("a mount's middleware and a covering prefix's apply to its routes", () => {
    const file = fixture(
      "mounted.ts",
      `const router = express.Router();
router.get("/one", one);
router.get("/two/x", two);
`
    );

    const routes = parseRouteFile(file, "/api/m", {
      serverDir: tmpDir,
      middleware: ["authenticate"],
      prefixMiddleware: [
        { prefix: "/api/m/two", middleware: ["requireAdmin"] },
      ],
    });

    expect(routes.map((r) => r.auth)).toEqual(["Session", "Admin"]);
    expect(routes.map((r) => r.handlerFile)).toEqual(["", ""]);
  });

  it("leaves out a route it cannot read, which routeCallLines still finds", () => {
    const source = `const router = express.Router();
const PATH = "/dynamic";
router.get(PATH, handler);
router.post("/wrapped", someNewWrapper(handler));
router.put("/fine", handler);
`;
    const file = fixture("unreadable.ts", source);

    const routes = parseRouteFile(file, "/api/u", { serverDir: tmpDir });

    expect(routes.map((r) => r.line)).toEqual([5]);
    expect(routeCallLines(source)).toEqual([3, 4, 5]);
  });
});

describe("parseApiFile", () => {
  const api = () => parseApiFile(API_FILE);

  it("documents every app.<method> route in initializers/api.ts", () => {
    const declared =
      fs.readFileSync(API_FILE, "utf-8").match(APP_ROUTE_CALL)?.length ?? 0;

    expect(api().routes).toHaveLength(declared);
    expect(route(api().routes, "GET", "/api/health").auth).toBe("None");
    expect(route(api().routes, "GET", "/api/stats").auth).toBe("Admin");
    expect(route(api().routes, "GET", "/api/stats").handlerName).toBe(
      "getStats"
    );
    expect(route(api().routes, "GET", "/api/stats").handlerFile).toBe(
      "controllers/stats.ts"
    );
    expect(route(api().routes, "GET", "/api/proxy/stash").auth).toBe("Session");
    expect(route(api().routes, "GET", "/api/scenes/:id/clips").auth).toBe(
      "Session"
    );
    expect(route(api().routes, "GET", "/api/health").inlineHandler).toContain(
      "res.json"
    );
  });

  it("mounts every file under server/routes", () => {
    const mounted = new Set(api().mounts.map((m) => m.file));

    expect(mounted).toEqual(new Set(routeFiles(ROUTES_DIR)));
  });

  it("gives each mount its base path, in declaration order", () => {
    const admin = api().mounts.filter((m) => m.basePath === "/api/admin");

    expect(admin.map((m) => path.basename(m.file))).toEqual([
      "mergeReconciliation.ts",
      "databaseBackup.ts",
    ]);
    expect(
      api().mounts.find((m) => m.file.endsWith("video.ts"))?.basePath
    ).toBe("/api");
  });

  it("passes the prefix middleware declared before a mount", () => {
    const file = path.join(tmpDir, "initializers", "api.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      `import early from "../routes/early.js";
import late from "../routes/late.js";
app.use("/api/early", early);
app.use("/api", authenticate);
app.use("/api/late", requireAdmin, late);
`
    );

    const parsed = parseApiFile(file, tmpDir);

    expect(
      parsed.mounts.map((m) => ({
        basePath: m.basePath,
        middleware: m.middleware,
        prefixes: m.prefixMiddleware.map((p) => p.prefix),
      }))
    ).toEqual([
      { basePath: "/api/early", middleware: [], prefixes: [] },
      {
        basePath: "/api/late",
        middleware: ["requireAdmin"],
        prefixes: ["/api"],
      },
    ]);
  });
});
