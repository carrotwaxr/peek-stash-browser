// server/scripts/generate-api-docs.ts
import * as fs from "fs";
import * as path from "path";
import { parseApiMounts, parseRouteFile, RouteDefinition } from "./lib/routeParser.js";
import { extractControllerTypes, enrichTypes } from "./lib/typeExtractor.js";
import {
  generateMarkdown,
  DocumentedRoute,
  DocumentedGroup,
} from "./lib/markdownGenerator.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const API_FILE = path.join(SERVER_DIR, "initializers", "api.ts");
const ROUTES_DIR = path.join(SERVER_DIR, "routes");
const DOCS_OUTPUT = path.join(SERVER_DIR, "..", "docs", "development", "api-reference.md");

// Routes to skip (complex handlers, streaming, etc.)
const SKIP_ROUTES = ["video.ts"];

// Group configuration for ordering and descriptions
const GROUP_CONFIG: Record<string, { order: number; description: string }> = {
  "/api/auth": {
    order: 1,
    description: "Authentication endpoints for login, logout, and session management.",
  },
  "/api/setup": {
    order: 2,
    description: "Setup wizard endpoints for initial configuration.",
  },
  "/api/sync": {
    order: 3,
    description: "Cache synchronization endpoints for refreshing Stash data.",
  },
  "/api/exclusions": {
    order: 4,
    description: "Content exclusion management endpoints.",
  },
  "/api/user": {
    order: 5,
    description: "User settings and preference endpoints.",
  },
  "/api/playlists": {
    order: 6,
    description: "Playlist management endpoints for creating and organizing scene collections.",
  },
  "/api/carousels": {
    order: 7,
    description: "Custom carousel configuration endpoints.",
  },
  "/api/watch-history": {
    order: 8,
    description: "Watch history tracking endpoints.",
  },
  "/api/image-view-history": {
    order: 9,
    description: "Image view history tracking endpoints.",
  },
  "/api/ratings": {
    order: 10,
    description: "Rating and favorite management endpoints.",
  },
  "/api/themes/custom": {
    order: 11,
    description: "Custom theme management endpoints.",
  },
  "/api/library": {
    order: 12,
    description: "Library browsing endpoints for scenes, performers, studios, tags, groups, galleries, and images.",
  },
};

/**
 * Recursively find all route files in a directory
 */
function findRouteFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      // Skip configured routes
      if (!SKIP_ROUTES.includes(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Find base path for a route file based on API mounts
 */
function findBasePath(
  routeFile: string,
  mounts: Map<string, string>,
  apiContent: string
): string | null {
  const relativePath = path.relative(ROUTES_DIR, routeFile);
  const routeFileName = path.basename(routeFile, ".ts");

  // Try to match import statement to find the variable name
  // Match patterns like: import xxxRoutes from "../routes/xxx.js"
  const importPattern = new RegExp(
    `import\\s+(\\w+)\\s+from\\s+["']\\.\\./routes/${relativePath.replace(/\\/g, "/").replace(/\.ts$/, ".js")}["']`,
    "m"
  );

  const match = apiContent.match(importPattern);
  if (match) {
    const varName = match[1];
    return mounts.get(varName) || null;
  }

  // Fallback: try matching by route file name
  for (const [varName, basePath] of mounts) {
    // Check if variable name matches file name pattern
    const expectedVarName = routeFileName.replace(/([A-Z])/g, (m) => m.toLowerCase()) + "Routes";
    if (varName.toLowerCase() === expectedVarName.toLowerCase()) {
      return basePath;
    }
  }

  return null;
}

/**
 * Format base path to a readable group name
 */
function formatGroupName(basePath: string): string {
  // /api/watch-history -> Watch History
  // /api/library -> Library
  // /api/themes/custom -> Custom Themes
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
    .reverse() // Put "custom" before "themes"
    .join(" ");
}

async function main() {
  console.log("Generating API documentation...");

  // Read API file content for import matching
  const apiContent = fs.readFileSync(API_FILE, "utf-8");

  // Parse mount points from api.ts
  const mounts = parseApiMounts(API_FILE);
  console.log(`Found ${mounts.size} route mounts`);

  // Find all route files
  const routeFiles = findRouteFiles(ROUTES_DIR);
  console.log(`Found ${routeFiles.length} route files (excluding skipped)`);

  // Group routes by base path
  const groupedRoutes = new Map<string, DocumentedRoute[]>();

  for (const routeFile of routeFiles) {
    const basePath = findBasePath(routeFile, mounts, apiContent);

    if (!basePath) {
      console.warn(`  Warning: No mount found for ${path.relative(ROUTES_DIR, routeFile)}`);
      continue;
    }

    console.log(`  Processing ${path.relative(ROUTES_DIR, routeFile)} -> ${basePath}`);

    // Parse routes from file
    const routes = parseRouteFile(routeFile, basePath);

    // Enrich each route with type information
    const documentedRoutes: DocumentedRoute[] = routes.map((route: RouteDefinition) => {
      const rawTypes = extractControllerTypes(route.controllerFile, route.controllerName, SERVER_DIR);
      const types = enrichTypes(rawTypes, SERVER_DIR);

      return {
        ...route,
        types,
      };
    });

    // Add to group
    const existing = groupedRoutes.get(basePath) || [];
    groupedRoutes.set(basePath, [...existing, ...documentedRoutes]);
  }

  // Convert to DocumentedGroup array and sort
  const groups: DocumentedGroup[] = Array.from(groupedRoutes.entries())
    .map(([basePath, routes]) => ({
      name: formatGroupName(basePath),
      description: GROUP_CONFIG[basePath]?.description || "",
      routes,
      _order: GROUP_CONFIG[basePath]?.order || 999,
    }))
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...group }) => group);

  // Generate markdown
  const markdown = generateMarkdown(groups);

  // Ensure output directory exists
  const outputDir = path.dirname(DOCS_OUTPUT);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(DOCS_OUTPUT, markdown);

  // Summary
  const totalRoutes = groups.reduce((sum, g) => sum + g.routes.length, 0);
  console.log(`\nGenerated documentation:`);
  console.log(`  Groups: ${groups.length}`);
  console.log(`  Routes: ${totalRoutes}`);
  console.log(`  Output: ${DOCS_OUTPUT}`);
}

main().catch(console.error);
