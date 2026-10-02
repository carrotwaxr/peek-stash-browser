// server/scripts/lib/markdownGenerator.ts
import type { RouteDefinition } from "./routeParser.js";
import type { ControllerTypes, TypeInfo } from "./typeExtractor.js";

export interface DocumentedRoute extends RouteDefinition {
  types: ControllerTypes;
}

export interface DocumentedGroup {
  name: string;
  description: string;
  routes: DocumentedRoute[];
}

function typeBlock(lines: string[], label: string, info?: TypeInfo) {
  if (info?.definition) {
    lines.push(
      `**${label}:**`,
      "",
      "```typescript",
      info.definition,
      "```",
      ""
    );
  } else if (info?.name) {
    lines.push(`**${label}:** \`${info.name}\``, "");
  }
}

function handlerLine(route: DocumentedRoute): string {
  if (route.handlerName === null) {
    return `**Handler:** inline in \`server/${route.handlerFile}\``;
  }
  const where = route.handlerFile ? ` in \`server/${route.handlerFile}\`` : "";
  return `**Handler:** \`${route.handlerName}\`${where}`;
}

/**
 * Generate markdown documentation from route groups
 */
export function generateMarkdown(groups: DocumentedGroup[]): string {
  const lines: string[] = [];

  lines.push("# API Reference");
  lines.push("");
  lines.push(
    "> Generated from the server's source by `cd server && npm run generate-api-docs`; do not edit it by hand."
  );
  lines.push(`> Last updated: ${new Date().toISOString().split("T")[0]}`);
  lines.push("");
  lines.push(
    "**Authentication** names who may call a route: **None** (anyone), **Session** (a signed-in Peek user), **Admin** (a signed-in admin), **Session or signed link** (a session, or the personal link the external player gets), or **None until setup starts, then Admin** (open to the setup wizard while Peek has no user and no Stash server)."
  );
  lines.push("");

  lines.push("## Contents");
  lines.push("");
  for (const group of groups) {
    const anchor = group.name.toLowerCase().replace(/\s+/g, "-");
    lines.push(`- [${group.name}](#${anchor})`);
  }
  lines.push("");

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
      if (route.description) {
        lines.push(route.description);
        lines.push("");
      }
      lines.push(`**Authentication:** ${route.auth}`);
      lines.push("");

      typeBlock(lines, "Request Body", route.types.requestBody);
      typeBlock(lines, "URL Parameters", route.types.requestParams);
      typeBlock(lines, "Query Parameters", route.types.requestQuery);
      typeBlock(lines, "Response", route.types.response);

      lines.push(handlerLine(route));
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n");
}
