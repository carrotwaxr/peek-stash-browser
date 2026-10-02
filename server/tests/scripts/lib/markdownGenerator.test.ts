import { describe, expect, it } from "vitest";
import type { DocumentedRoute } from "../../../scripts/lib/markdownGenerator.js";
import { generateMarkdown } from "../../../scripts/lib/markdownGenerator.js";

function documented(overrides: Partial<DocumentedRoute>): DocumentedRoute {
  return {
    method: "GET",
    path: "/things",
    fullPath: "/api/things",
    file: "routes/things.ts",
    line: 1,
    auth: "Session",
    description: "",
    handlerName: "getThings",
    handlerFile: "controllers/things.ts",
    inlineHandler: null,
    types: {},
    ...overrides,
  };
}

describe("generateMarkdown", () => {
  it("writes one heading per route, with its description, access and handler", () => {
    const markdown = generateMarkdown([
      {
        name: "Watch History",
        description: "Plays and resume points.",
        routes: [
          documented({ description: "Every thing.\n\nPaged." }),
          documented({
            method: "POST",
            fullPath: "/api/things/rebuild",
            auth: "Admin",
            handlerName: null,
            handlerFile: "routes/things.ts",
          }),
          documented({ fullPath: "/api/things/x", handlerFile: "" }),
        ],
      },
    ]);

    expect(markdown).toContain("- [Watch History](#watch-history)");
    expect(markdown).toContain("## Watch History\n\nPlays and resume points.");
    expect(markdown.match(/^### /gm)).toHaveLength(3);
    expect(markdown).toContain(
      "### GET /api/things\n\nEvery thing.\n\nPaged.\n\n**Authentication:** Session"
    );
    expect(markdown).toContain(
      "**Handler:** `getThings` in `server/controllers/things.ts`"
    );
    expect(markdown).toContain("**Authentication:** Admin");
    expect(markdown).toContain(
      "**Handler:** inline in `server/routes/things.ts`"
    );
    expect(markdown).toContain("**Handler:** `getThings`\n");
  });

  it("prints resolved types as code and unresolved ones by name", () => {
    const markdown = generateMarkdown([
      {
        name: "Things",
        description: "",
        routes: [
          documented({
            types: {
              requestBody: {
                name: "ThingBody",
                definition: "interface ThingBody {\n  a: string;\n}",
                sourceFile: "shared/types/api/things.ts",
              },
              requestParams: {
                name: "{ id: string }",
                definition: "{ id: string }",
                sourceFile: "",
              },
              requestQuery: {
                name: "ThingQuery",
                definition: "interface ThingQuery {}",
                sourceFile: "",
              },
              response: {
                name: "ThingResponse",
                definition: "",
                sourceFile: "",
              },
            },
          }),
        ],
      },
    ]);

    expect(markdown).toContain(
      "**Request Body:**\n\n```typescript\ninterface ThingBody {\n  a: string;\n}\n```"
    );
    expect(markdown).toContain(
      "**URL Parameters:**\n\n```typescript\n{ id: string }\n```"
    );
    expect(markdown).toContain("**Query Parameters:**");
    expect(markdown).toContain("**Response:** `ThingResponse`");
  });
});
