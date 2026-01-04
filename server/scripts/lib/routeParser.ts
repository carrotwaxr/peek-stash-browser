// server/scripts/lib/routeParser.ts
import * as fs from "fs";

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
  let content: string;
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error(`Failed to read route file: ${filePath}`, error);
    return [];
  }

  const routes: RouteDefinition[] = [];

  // Check for router.use(authenticate) at file level
  const hasFileAuth = /router\.use\(authenticate\)/.test(content);

  // Match multiline route definitions - capture method and path first
  const routePattern = /router\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;

  let match;
  while ((match = routePattern.exec(content)) !== null) {
    const [fullMatch, method, routePath] = match;
    const startIndex = match.index + fullMatch.length;

    // Find the matching closing parenthesis using bracket counting
    let depth = 1;
    let endIndex = startIndex;
    while (depth > 0 && endIndex < content.length) {
      if (content[endIndex] === "(") depth++;
      if (content[endIndex] === ")") depth--;
      endIndex++;
    }

    const routeBody = content.slice(startIndex, endIndex - 1);

    // Check for authenticated wrapper
    const hasAuthenticated = /authenticated\(/.test(routeBody);

    // Extract controller name - check for authenticated() wrapper first, then standalone
    const authenticatedMatch = routeBody.match(/authenticated\(\s*(\w+)\s*\)/);
    const standaloneMatch = routeBody.match(/,\s*(\w+)\s*$/);
    const controllerMatch = authenticatedMatch || standaloneMatch;
    const controllerName = controllerMatch ? controllerMatch[1] : null;

    // Skip inline arrow functions or invalid matches
    if (
      !controllerName ||
      controllerName === "async" ||
      controllerName === "function" ||
      controllerName === "req" ||
      controllerName === "res"
    ) {
      continue;
    }

    routes.push({
      method: method.toUpperCase(),
      path: routePath,
      fullPath: basePath + routePath,
      controllerName,
      controllerFile: extractControllerFile(content, controllerName),
      requiresAuth: hasFileAuth || hasAuthenticated,
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
  let content: string;
  try {
    content = fs.readFileSync(apiFilePath, "utf-8");
  } catch (error) {
    console.error(`Failed to read API file: ${apiFilePath}`, error);
    return new Map<string, string>();
  }

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
