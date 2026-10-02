// server/scripts/generate-api-docs.ts
//
// Writes docs/reference/api-reference.md: one entry for every route the
// server declares. Fails, writing nothing, when a route file has a
// `router.<method>(` call the parser cannot read (a new handler wrapper, a
// path that is not a string literal) or is not mounted in initializers/api.ts.
import * as fs from "fs";
import * as path from "path";
import type {
  DocumentedGroup,
  DocumentedRoute,
} from "./lib/markdownGenerator.js";
import { generateMarkdown } from "./lib/markdownGenerator.js";
import type { RouteDefinition } from "./lib/routeParser.js";
import {
  parseApiFile,
  parseRouteFile,
  routeCallLines,
} from "./lib/routeParser.js";
import {
  enrichTypes,
  extractControllerTypes,
  extractHandlerTypes,
} from "./lib/typeExtractor.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const API_FILE = path.join(SERVER_DIR, "initializers", "api.ts");
const ROUTES_DIR = path.join(SERVER_DIR, "routes");
const DOCS_DIR = path.join(SERVER_DIR, "..", "docs");
const DOCS_OUTPUT = path.join(DOCS_DIR, "reference", "api-reference.md");
// Where older versions wrote the page; mkdocs.yml redirects it to DOCS_OUTPUT
const OLD_DOCS_OUTPUT = path.join(DOCS_DIR, "development", "api-reference.md");

/**
 * Groups in page order. A route goes into the first group with a prefix
 * covering its path; one no group covers gets a group of its own.
 */
const GROUPS: { name: string; prefixes: string[]; description: string }[] = [
  {
    name: "Server",
    prefixes: ["/api/health", "/api/version", "/api/stats"],
    description: "Health check, version, and server statistics.",
  },
  {
    name: "Auth",
    prefixes: ["/api/auth"],
    description:
      "Sign in and out, the signed-in user, and password recovery with a recovery key.",
  },
  {
    name: "Setup",
    prefixes: ["/api/setup"],
    description:
      "The setup wizard, and the admin's management of Stash servers.",
  },
  {
    name: "User",
    prefixes: ["/api/user"],
    description:
      "The signed-in user's settings, filter presets, hidden items, Stash server selection and permissions; user management for admins.",
  },
  {
    name: "User Groups",
    prefixes: ["/api/groups"],
    description: "User groups and their members (admin only, except your own).",
  },
  {
    name: "Library",
    prefixes: ["/api/library"],
    description:
      "Browsing scenes, performers, studios, tags, collections, galleries and images, with the user's restrictions and hidden items applied.",
  },
  {
    name: "Clips",
    prefixes: ["/api/clips", "/api/scenes"],
    description: "Clips (scene markers from Stash).",
  },
  {
    name: "Timeline",
    prefixes: ["/api/timeline"],
    description: "Date distribution for the timeline view.",
  },
  {
    name: "Playback",
    prefixes: ["/api/scene"],
    description:
      "The stream and caption proxy, and the external player's personal signed link.",
  },
  {
    name: "Media Proxy",
    prefixes: ["/api/proxy"],
    description:
      "Images and previews from Stash, served through Peek so no user gets Stash's address or API key.",
  },
  {
    name: "Playlists",
    prefixes: ["/api/playlists"],
    description: "Playlists, their items, play queue and sharing.",
  },
  {
    name: "Downloads",
    prefixes: ["/api/downloads"],
    description: "Scene, image and playlist downloads.",
  },
  {
    name: "Ratings",
    prefixes: ["/api/ratings"],
    description: "The user's ratings and favorites.",
  },
  {
    name: "Watch History",
    prefixes: ["/api/watch-history"],
    description: "Plays, resume points and O counts of scenes.",
  },
  {
    name: "Image View History",
    prefixes: ["/api/image-view-history"],
    description: "Image views and O counts.",
  },
  {
    name: "User Stats",
    prefixes: ["/api/user-stats"],
    description: "The user's own statistics.",
  },
  {
    name: "Carousels",
    prefixes: ["/api/carousels"],
    description: "Custom home page carousels.",
  },
  {
    name: "Custom Themes",
    prefixes: ["/api/themes/custom"],
    description: "Custom themes.",
  },
  {
    name: "Sync",
    prefixes: ["/api/sync"],
    description: "Syncing the library cache from Stash (admin only).",
  },
  {
    name: "Exclusions",
    prefixes: ["/api/exclusions"],
    description: "Recomputing the content-restriction exclusions (admin only).",
  },
  {
    name: "Admin",
    prefixes: ["/api/admin"],
    description: "Merge reconciliation and database backups (admin only).",
  },
];

function covers(prefix: string, fullPath: string): boolean {
  return fullPath === prefix || fullPath.startsWith(`${prefix}/`);
}

/**
 * Format a base path to a readable group name:
 * /api/watch-history -> Watch History, /api/themes/custom -> Custom Themes
 */
function formatGroupName(basePath: string): string {
  const segments = basePath
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean);

  if (segments.length === 0) {
    return "API";
  }

  return segments
    .map((segment) =>
      segment
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    )
    .reverse()
    .join(" ");
}

function groupNameOf(fullPath: string): string {
  const group = GROUPS.find((g) => g.prefixes.some((p) => covers(p, fullPath)));
  return (
    group?.name ?? formatGroupName(fullPath.split("/").slice(0, 3).join("/"))
  );
}

function findRouteFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findRouteFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

/** Lines of `file` with a route call `routes` holds no entry for */
function unreadLines(file: string, routes: RouteDefinition[]): string[] {
  const read = new Set(routes.map((r) => r.line));
  return routeCallLines(fs.readFileSync(file, "utf-8"))
    .filter((line) => !read.has(line))
    .map((line) => `${path.relative(SERVER_DIR, file)}:${line}`);
}

function document(route: RouteDefinition): DocumentedRoute {
  const rawTypes =
    route.inlineHandler !== null
      ? extractHandlerTypes(route.inlineHandler)
      : extractControllerTypes(
          route.handlerFile,
          route.handlerName ?? "",
          SERVER_DIR
        );
  return { ...route, types: enrichTypes(rawTypes, SERVER_DIR) };
}

function main() {
  console.log("Generating API documentation...");

  const api = parseApiFile(API_FILE, SERVER_DIR);
  const problems: string[] = [];
  const routes: RouteDefinition[] = [...api.routes];
  problems.push(
    ...unreadLines(API_FILE, api.routes).map(
      (where) => `${where}: route the parser cannot read`
    )
  );

  const mounted = new Set<string>();
  for (const mount of api.mounts) {
    mounted.add(mount.file);
    const fileRoutes = parseRouteFile(mount.file, mount.basePath, {
      serverDir: SERVER_DIR,
      middleware: mount.middleware,
      prefixMiddleware: mount.prefixMiddleware,
    });
    console.log(
      `  ${path.relative(ROUTES_DIR, mount.file)} -> ${mount.basePath} (${fileRoutes.length} routes)`
    );
    problems.push(
      ...unreadLines(mount.file, fileRoutes).map(
        (where) => `${where}: route the parser cannot read`
      )
    );
    routes.push(...fileRoutes);
  }

  for (const file of findRouteFiles(ROUTES_DIR)) {
    if (!mounted.has(file)) {
      problems.push(
        `${path.relative(SERVER_DIR, file)}: not mounted in initializers/api.ts`
      );
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`  Error: ${problem}`);
    console.error(
      "\nAPI documentation not written: teach scripts/lib/routeParser.ts to read these routes."
    );
    process.exitCode = 1;
    return;
  }

  const grouped = new Map<string, DocumentedRoute[]>();
  for (const route of routes) {
    const name = groupNameOf(route.fullPath);
    grouped.set(name, [...(grouped.get(name) ?? []), document(route)]);
  }

  const order = (name: string) => {
    const index = GROUPS.findIndex((g) => g.name === name);
    return index === -1 ? GROUPS.length : index;
  };
  const groups: DocumentedGroup[] = Array.from(grouped.entries())
    .map(([name, groupRoutes]) => ({
      name,
      description: GROUPS.find((g) => g.name === name)?.description ?? "",
      routes: groupRoutes,
    }))
    .sort((a, b) => order(a.name) - order(b.name));

  fs.mkdirSync(path.dirname(DOCS_OUTPUT), { recursive: true });
  fs.writeFileSync(DOCS_OUTPUT, generateMarkdown(groups));
  fs.rmSync(OLD_DOCS_OUTPUT, { force: true });

  console.log(`\nGenerated documentation:`);
  console.log(`  Groups: ${groups.length}`);
  console.log(`  Routes: ${routes.length}`);
  console.log(
    `  Output: ${path.relative(path.dirname(SERVER_DIR), DOCS_OUTPUT)}`
  );
}

main();
