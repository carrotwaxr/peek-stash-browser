# API Documentation Generator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a script that generates `docs/development/api-reference.md` from TypeScript source files.

**Architecture:** Use TypeScript Compiler API to parse route files and extract controller type signatures. Match routes to their request/response types and render to markdown. Run via `npm run generate-api-docs`.

**Tech Stack:** TypeScript, ts.createProgram(), Node.js fs

---

### Task 1: Add tsx dependency and npm script

**Files:**
- Modify: `server/package.json`

**Step 1: Add tsx as dev dependency**

Run:
```bash
cd server && npm install --save-dev tsx
```

**Step 2: Add generate-api-docs script to package.json**

Add to scripts section:
```json
"generate-api-docs": "npx tsx scripts/generate-api-docs.ts"
```

**Step 3: Verify installation**

Run:
```bash
cd server && npm run generate-api-docs
```

Expected: Error "Cannot find module" (script doesn't exist yet)

**Step 4: Commit**

```bash
git add server/package.json server/package-lock.json
git commit -m "chore: add tsx and generate-api-docs script"
```

---

### Task 2: Create route parser module

**Files:**
- Create: `server/scripts/generate-api-docs.ts`
- Create: `server/scripts/lib/routeParser.ts`

**Step 1: Create routeParser.ts with route extraction**

```typescript
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
```

**Step 2: Create main script skeleton**

```typescript
// server/scripts/generate-api-docs.ts
import * as fs from "fs";
import * as path from "path";
import { parseRouteFile, parseApiMounts, type RouteGroup } from "./lib/routeParser.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const ROUTES_DIR = path.join(SERVER_DIR, "routes");
const API_FILE = path.join(SERVER_DIR, "initializers", "api.ts");
const OUTPUT_FILE = path.resolve(SERVER_DIR, "..", "docs", "development", "api-reference.md");

async function main() {
  console.log("Generating API documentation...");

  // Parse mount points from api.ts
  const mounts = parseApiMounts(API_FILE);
  console.log(`Found ${mounts.size} route mounts`);

  // For now, just output mount info
  for (const [routeVar, basePath] of mounts) {
    console.log(`  ${routeVar} -> ${basePath}`);
  }

  console.log("Done (skeleton only)");
}

main().catch(console.error);
```

**Step 3: Run to verify parsing works**

Run:
```bash
cd server && npm run generate-api-docs
```

Expected: Output showing route mounts like "carouselRoutes -> /api/carousels"

**Step 4: Commit**

```bash
git add server/scripts/
git commit -m "feat(api-docs): add route parser module"
```

---

### Task 3: Add controller type extraction

**Files:**
- Create: `server/scripts/lib/typeExtractor.ts`
- Modify: `server/scripts/lib/routeParser.ts`

**Step 1: Create typeExtractor.ts**

```typescript
// server/scripts/lib/typeExtractor.ts
import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";

export interface TypeInfo {
  name: string;
  definition: string;
  sourceFile: string;
}

export interface ControllerTypes {
  requestBody?: TypeInfo;
  requestParams?: TypeInfo;
  requestQuery?: TypeInfo;
  response?: TypeInfo;
}

/**
 * Extract type parameters from a controller function signature
 */
export function extractControllerTypes(
  controllerFile: string,
  controllerName: string,
  serverDir: string
): ControllerTypes {
  const fullPath = path.resolve(serverDir, "controllers", controllerFile.replace(/^\.\.\/controllers\//, ""));

  if (!fs.existsSync(fullPath)) {
    return {};
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const result: ControllerTypes = {};

  // Match: export const controllerName = async (req: TypedAuthRequest<Body, Params, Query>, res: TypedResponse<Response>)
  const signatureRegex = new RegExp(
    `export\\s+const\\s+${controllerName}\\s*=\\s*async\\s*\\(\\s*req:\\s*(?:TypedAuthRequest|TypedRequest)(?:<([^>]+)>)?\\s*,\\s*res:\\s*TypedResponse<([^>]+)>`,
    "m"
  );

  const match = content.match(signatureRegex);
  if (match) {
    const [, reqTypes, resType] = match;

    // Parse request type parameters (Body, Params, Query)
    if (reqTypes) {
      const parts = splitTypeParams(reqTypes);
      if (parts[0] && parts[0] !== "unknown") {
        result.requestBody = { name: parts[0], definition: "", sourceFile: "" };
      }
      if (parts[1]) {
        result.requestParams = { name: parts[1], definition: "", sourceFile: "" };
      }
      if (parts[2]) {
        result.requestQuery = { name: parts[2], definition: "", sourceFile: "" };
      }
    }

    // Parse response type (strip | ApiErrorResponse)
    if (resType) {
      const cleanType = resType.replace(/\s*\|\s*ApiErrorResponse/, "").trim();
      result.response = { name: cleanType, definition: "", sourceFile: "" };
    }
  }

  return result;
}

/**
 * Split generic type parameters, handling nested generics
 */
function splitTypeParams(typeStr: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of typeStr) {
    if (char === "<") depth++;
    else if (char === ">") depth--;
    else if (char === "," && depth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}
```

**Step 2: Run to verify extraction**

Run:
```bash
cd server && npm run generate-api-docs
```

Expected: No errors, script runs

**Step 3: Commit**

```bash
git add server/scripts/lib/typeExtractor.ts
git commit -m "feat(api-docs): add controller type extraction"
```

---

### Task 4: Add type definition resolver

**Files:**
- Modify: `server/scripts/lib/typeExtractor.ts`

**Step 1: Add resolveTypeDefinition function**

Add to typeExtractor.ts:

```typescript
/**
 * Resolve a type name to its full definition from types/api/*.ts files
 */
export function resolveTypeDefinition(
  typeName: string,
  serverDir: string
): TypeInfo | null {
  const apiTypesDir = path.join(serverDir, "types", "api");

  if (!fs.existsSync(apiTypesDir)) {
    return null;
  }

  const files = fs.readdirSync(apiTypesDir).filter(f => f.endsWith(".ts") && f !== "index.ts");

  for (const file of files) {
    const filePath = path.join(apiTypesDir, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // Match: export interface TypeName { ... }
    const interfaceRegex = new RegExp(
      `export\\s+interface\\s+${typeName}\\s*(?:extends[^{]+)?{([^}]+(?:{[^}]*}[^}]*)*)}`,
      "m"
    );

    const match = content.match(interfaceRegex);
    if (match) {
      return {
        name: typeName,
        definition: `interface ${typeName} {${match[1]}}`,
        sourceFile: `types/api/${file}`,
      };
    }
  }

  return null;
}

/**
 * Enrich ControllerTypes with resolved definitions
 */
export function enrichTypes(types: ControllerTypes, serverDir: string): ControllerTypes {
  const enrich = (info?: TypeInfo): TypeInfo | undefined => {
    if (!info) return undefined;
    const resolved = resolveTypeDefinition(info.name, serverDir);
    return resolved || info;
  };

  return {
    requestBody: enrich(types.requestBody),
    requestParams: enrich(types.requestParams),
    requestQuery: enrich(types.requestQuery),
    response: enrich(types.response),
  };
}
```

**Step 2: Commit**

```bash
git add server/scripts/lib/typeExtractor.ts
git commit -m "feat(api-docs): add type definition resolver"
```

---

### Task 5: Generate markdown output

**Files:**
- Create: `server/scripts/lib/markdownGenerator.ts`
- Modify: `server/scripts/generate-api-docs.ts`

**Step 1: Create markdownGenerator.ts**

```typescript
// server/scripts/lib/markdownGenerator.ts
import type { RouteDefinition } from "./routeParser.js";
import type { ControllerTypes } from "./typeExtractor.js";

export interface DocumentedRoute extends RouteDefinition {
  types: ControllerTypes;
}

export interface DocumentedGroup {
  name: string;
  description: string;
  routes: DocumentedRoute[];
}

/**
 * Generate markdown documentation from route groups
 */
export function generateMarkdown(groups: DocumentedGroup[]): string {
  const lines: string[] = [];

  // Header
  lines.push("# API Reference");
  lines.push("");
  lines.push("> Auto-generated from TypeScript source files.");
  lines.push(`> Last updated: ${new Date().toISOString().split("T")[0]}`);
  lines.push("");

  // Table of contents
  lines.push("## Contents");
  lines.push("");
  for (const group of groups) {
    const anchor = group.name.toLowerCase().replace(/\s+/g, "-");
    lines.push(`- [${group.name}](#${anchor})`);
  }
  lines.push("");

  // Each group
  for (const group of groups) {
    lines.push(`## ${group.name}`);
    lines.push("");
    if (group.description) {
      lines.push(group.description);
      lines.push("");
    }

    for (const route of group.routes) {
      lines.push(`### ${route.method} ${route.fullPath}`);
      lines.push("");
      lines.push(`**Authentication:** ${route.requiresAuth ? "Required" : "None"}`);
      lines.push("");

      // Request body
      if (route.types.requestBody?.definition) {
        lines.push("**Request Body:**");
        lines.push("");
        lines.push("```typescript");
        lines.push(formatTypeDefinition(route.types.requestBody.definition));
        lines.push("```");
        lines.push("");
      }

      // Request params
      if (route.types.requestParams?.definition) {
        lines.push("**URL Parameters:**");
        lines.push("");
        lines.push("```typescript");
        lines.push(formatTypeDefinition(route.types.requestParams.definition));
        lines.push("```");
        lines.push("");
      }

      // Request query
      if (route.types.requestQuery?.definition) {
        lines.push("**Query Parameters:**");
        lines.push("");
        lines.push("```typescript");
        lines.push(formatTypeDefinition(route.types.requestQuery.definition));
        lines.push("```");
        lines.push("");
      }

      // Response
      if (route.types.response?.definition) {
        lines.push("**Response:**");
        lines.push("");
        lines.push("```typescript");
        lines.push(formatTypeDefinition(route.types.response.definition));
        lines.push("```");
        lines.push("");
      } else if (route.types.response?.name) {
        lines.push(`**Response:** \`${route.types.response.name}\``);
        lines.push("");
      }

      // Controller reference
      lines.push(`**Controller:** \`${route.controllerName}\` in \`${route.controllerFile}\``);
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Format type definition for readability
 */
function formatTypeDefinition(definition: string): string {
  // Basic formatting - add newlines after { and before }
  return definition
    .replace(/{\s*/g, "{\n  ")
    .replace(/;\s*/g, ";\n  ")
    .replace(/\s*}/g, "\n}")
    .replace(/\n\s*\n/g, "\n");
}
```

**Step 2: Update main script to generate output**

Replace `server/scripts/generate-api-docs.ts`:

```typescript
// server/scripts/generate-api-docs.ts
import * as fs from "fs";
import * as path from "path";
import { parseRouteFile, parseApiMounts } from "./lib/routeParser.js";
import { extractControllerTypes, enrichTypes } from "./lib/typeExtractor.js";
import { generateMarkdown, type DocumentedGroup, type DocumentedRoute } from "./lib/markdownGenerator.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "..");
const ROUTES_DIR = path.join(SERVER_DIR, "routes");
const API_FILE = path.join(SERVER_DIR, "initializers", "api.ts");
const OUTPUT_FILE = path.resolve(SERVER_DIR, "..", "docs", "development", "api-reference.md");

// Route files to skip (non-JSON APIs)
const SKIP_ROUTES = ["video.ts"];

// Group ordering and descriptions
const GROUP_CONFIG: Record<string, { order: number; description: string }> = {
  "/api/library": { order: 1, description: "Browse and search media library content." },
  "/api/auth": { order: 2, description: "Authentication and session management." },
  "/api/playlists": { order: 3, description: "User playlist management." },
  "/api/carousels": { order: 4, description: "Custom homepage carousel management." },
  "/api/ratings": { order: 5, description: "Rating and favorite management for all entity types." },
  "/api/watch-history": { order: 6, description: "Scene watch history and playback tracking." },
  "/api/image-view-history": { order: 7, description: "Image view history and O counter tracking." },
  "/api/themes/custom": { order: 8, description: "Custom theme management." },
  "/api/setup": { order: 9, description: "Initial setup wizard endpoints." },
  "/api/user": { order: 10, description: "User settings and preferences." },
  "/api/sync": { order: 11, description: "Cache synchronization with Stash." },
  "/api/exclusions": { order: 12, description: "Entity exclusion management." },
};

async function main() {
  console.log("Generating API documentation...");

  // Parse mount points from api.ts
  const mounts = parseApiMounts(API_FILE);
  console.log(`Found ${mounts.size} route mounts`);

  // Collect all routes by base path
  const routesByPath = new Map<string, DocumentedRoute[]>();

  // Find and parse all route files
  const routeFiles = findRouteFiles(ROUTES_DIR);

  for (const routeFile of routeFiles) {
    const fileName = path.basename(routeFile);
    if (SKIP_ROUTES.includes(fileName)) {
      console.log(`  Skipping ${fileName}`);
      continue;
    }

    // Find base path for this route file
    const basePath = findBasePath(routeFile, mounts, ROUTES_DIR);
    if (!basePath) {
      console.log(`  No mount found for ${routeFile}`);
      continue;
    }

    // Parse routes
    const routes = parseRouteFile(routeFile, basePath);
    console.log(`  ${fileName}: ${routes.length} routes at ${basePath}`);

    // Extract and enrich types for each route
    for (const route of routes) {
      const types = extractControllerTypes(route.controllerFile, route.controllerName, SERVER_DIR);
      const enrichedTypes = enrichTypes(types, SERVER_DIR);

      const documented: DocumentedRoute = { ...route, types: enrichedTypes };

      const existing = routesByPath.get(basePath) || [];
      existing.push(documented);
      routesByPath.set(basePath, existing);
    }
  }

  // Build groups
  const groups: DocumentedGroup[] = [];
  for (const [basePath, routes] of routesByPath) {
    const config = GROUP_CONFIG[basePath] || { order: 99, description: "" };
    groups.push({
      name: formatGroupName(basePath),
      description: config.description,
      routes: routes.sort((a, b) => a.fullPath.localeCompare(b.fullPath)),
    });
  }

  // Sort groups by configured order
  groups.sort((a, b) => {
    const pathA = Object.keys(GROUP_CONFIG).find(k => formatGroupName(k) === a.name) || "";
    const pathB = Object.keys(GROUP_CONFIG).find(k => formatGroupName(k) === b.name) || "";
    return (GROUP_CONFIG[pathA]?.order || 99) - (GROUP_CONFIG[pathB]?.order || 99);
  });

  // Generate markdown
  const markdown = generateMarkdown(groups);

  // Write output
  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, markdown);
  console.log(`\nWrote ${OUTPUT_FILE}`);

  // Summary
  const totalRoutes = groups.reduce((sum, g) => sum + g.routes.length, 0);
  console.log(`Total: ${groups.length} groups, ${totalRoutes} endpoints`);
}

function findRouteFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findRouteFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

function findBasePath(routeFile: string, mounts: Map<string, string>, routesDir: string): string | null {
  const relativePath = path.relative(routesDir, routeFile);
  const fileName = path.basename(routeFile, ".ts");

  // Check each mount to find matching import
  for (const [varName, basePath] of mounts) {
    // Convert varName like "libraryScenesRoutes" to match file "library/scenes.ts"
    const normalized = varName.replace(/Routes$/, "").toLowerCase();
    const fileNormalized = relativePath.replace(/\\/g, "/").replace(/\.ts$/, "").replace(/\//g, "").toLowerCase();

    if (normalized === fileNormalized || normalized === fileName.toLowerCase()) {
      return basePath;
    }
  }

  return null;
}

function formatGroupName(basePath: string): string {
  // /api/library -> Library
  // /api/watch-history -> Watch History
  return basePath
    .replace(/^\/api\//, "")
    .split(/[-/]/)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

main().catch(console.error);
```

**Step 3: Run to generate documentation**

Run:
```bash
cd server && npm run generate-api-docs
```

Expected: Creates `docs/development/api-reference.md` with endpoint documentation

**Step 4: Commit**

```bash
git add server/scripts/ docs/development/api-reference.md
git commit -m "feat(api-docs): generate markdown documentation"
```

---

### Task 6: Update mkdocs navigation

**Files:**
- Modify: `mkdocs.yml`

**Step 1: Add API Reference to nav**

In `mkdocs.yml`, update the Development section:

```yaml
  - Development:
      - Technical Overview: development/technical-overview.md
      - API Reference: development/api-reference.md
      - Regression Testing Guide: development/regression-testing.md
```

**Step 2: Verify mkdocs build locally (optional)**

Run:
```bash
mkdocs build --strict
```

Expected: No errors

**Step 3: Commit**

```bash
git add mkdocs.yml
git commit -m "docs: add API Reference to navigation"
```

---

### Task 7: Update CI workflow

**Files:**
- Modify: `.github/workflows/docs.yml`

**Step 1: Add Node.js setup and doc generation step**

Update `.github/workflows/docs.yml`:

```yaml
name: Deploy Documentation

on:
  push:
    branches:
      - master
      - main
    paths:
      - 'docs/**'
      - 'mkdocs.yml'
      - 'server/routes/**'
      - 'server/types/api/**'
      - 'server/controllers/**'
      - 'server/scripts/**'
      - '.github/workflows/docs.yml'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: server/package-lock.json

      - name: Install server dependencies
        run: cd server && npm ci

      - name: Generate API documentation
        run: cd server && npm run generate-api-docs

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.x'

      - name: Cache dependencies
        uses: actions/cache@v3
        with:
          path: ~/.cache/pip
          key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
          restore-keys: |
            ${{ runner.os }}-pip-

      - name: Install dependencies
        run: |
          pip install --upgrade pip
          pip install mkdocs-material
          pip install mkdocs-minify-plugin

      - name: Build documentation
        run: mkdocs build --strict

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./site
          publish_branch: gh-pages
          user_name: 'github-actions[bot]'
          user_email: 'github-actions[bot]@users.noreply.github.com'
          commit_message: 'docs: Deploy documentation from ${{ github.sha }}'
```

**Step 2: Commit**

```bash
git add .github/workflows/docs.yml
git commit -m "ci: add API docs generation to docs workflow"
```

---

### Task 8: Test and verify

**Files:**
- None (verification only)

**Step 1: Run full generation**

Run:
```bash
cd server && npm run generate-api-docs
```

Expected: No errors, markdown file updated

**Step 2: Check output quality**

Run:
```bash
head -100 docs/development/api-reference.md
```

Expected: Valid markdown with endpoint documentation

**Step 3: Run TypeScript check**

Run:
```bash
cd server && npx tsc --noEmit
```

Expected: No type errors

**Step 4: Run tests**

Run:
```bash
cd server && npm test
```

Expected: All tests pass

**Step 5: Commit generated docs**

```bash
git add docs/development/api-reference.md
git commit -m "docs: generate initial API reference"
```

---

### Task 9: Create PR

**Step 1: Push branch**

```bash
git push -u origin feature/api-docs-generator
```

**Step 2: Create PR**

```bash
gh pr create --title "feat: add API documentation generator" --body "## Summary

- Add \`npm run generate-api-docs\` script to extract API documentation from TypeScript
- Parse route files and controller signatures to extract endpoint info
- Resolve request/response types from \`types/api/*.ts\`
- Generate \`docs/development/api-reference.md\` for mkdocs

## Changes

- Add tsx dev dependency
- Create \`server/scripts/generate-api-docs.ts\` and supporting modules
- Update docs.yml workflow to generate docs before mkdocs build
- Add API Reference to mkdocs navigation

## Test plan

- [x] \`npm run generate-api-docs\` runs without errors
- [x] Generated markdown is valid
- [x] TypeScript compiles
- [x] All tests pass
"
```
