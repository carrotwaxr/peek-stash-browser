// server/scripts/lib/routeParser.ts
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

export interface RouteDefinition {
  method: string;
  path: string;
  fullPath: string;
  controllerName: string;
  controllerFile: string;
  requiresAuth: boolean;
}

export interface RouteGroup {
  name: string;
  basePath: string;
  routes: RouteDefinition[];
}

/**
 * Parse Express route files to extract route definitions
 */
export function parseRouteFile(filePath: string, basePath: string): RouteDefinition[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const routes: RouteDefinition[] = [];

  // Check for router.use(authenticate) at file level
  const hasFileAuth = /router\.use\(authenticate\)/.test(content);

  // Match router.METHOD("path", ..., handler) patterns
  const routeRegex = /router\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]\s*,\s*(?:[^,]+,\s*)*(authenticated\()?(\w+)\)?/g;

  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const [, method, routePath, hasAuthenticated, controllerName] = match;

    routes.push({
      method: method.toUpperCase(),
      path: routePath,
      fullPath: basePath + routePath,
      controllerName,
      controllerFile: extractControllerFile(content, controllerName),
      requiresAuth: hasFileAuth || !!hasAuthenticated,
    });
  }

  return routes;
}

/**
 * Extract controller file path from import statements
 */
function extractControllerFile(content: string, controllerName: string): string {
  // Match: import { controllerName, ... } from "path"
  const importRegex = new RegExp(
    `import\\s*{[^}]*\\b${controllerName}\\b[^}]*}\\s*from\\s*["'\`]([^"'\`]+)["'\`]`,
    "m"
  );
  const match = content.match(importRegex);
  return match ? match[1].replace(/\.js$/, ".ts") : "unknown";
}

/**
 * Parse api.ts to get route mount points
 */
export function parseApiMounts(apiFilePath: string): Map<string, string> {
  const content = fs.readFileSync(apiFilePath, "utf-8");
  const mounts = new Map<string, string>();

  // Match: app.use("/api/path", routesImport)
  const mountRegex = /app\.use\(\s*["'`]([^"'`]+)["'`]\s*,\s*(\w+)\s*\)/g;

  let match;
  while ((match = mountRegex.exec(content)) !== null) {
    const [, path, routeVar] = match;
    mounts.set(routeVar, path);
  }

  return mounts;
}
