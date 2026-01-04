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
