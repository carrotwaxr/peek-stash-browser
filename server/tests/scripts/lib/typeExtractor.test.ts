import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterAll, describe, expect, it } from "vitest";
import {
  enrichTypes,
  extractControllerTypes,
  extractHandlerTypes,
  resolveTypeDefinition,
} from "../../../scripts/lib/typeExtractor.js";
import { must } from "../../helpers/must.js";

const SERVER_DIR = path.resolve(import.meta.dirname, "../../..");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "type-extractor-"));
afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("resolveTypeDefinition", () => {
  it("finds a type declared in shared/types/api", () => {
    const resolved = must(
      resolveTypeDefinition("OrphanedScenesResponse", SERVER_DIR),
      "OrphanedScenesResponse"
    );

    expect(resolved.sourceFile).toBe("shared/types/api/mergeRecovery.ts");
    expect(resolved.definition).toContain("totalCount: number");
  });

  it("still finds a type declared in server/types/api", () => {
    const resolved = must(
      resolveTypeDefinition("GetCustomThemeResponse", SERVER_DIR),
      "GetCustomThemeResponse"
    );

    expect(resolved.sourceFile).toBe("server/types/api/customTheme.ts");
  });

  it("resolves a type alias", () => {
    const resolved = must(
      resolveTypeDefinition("FindScenesRequest", SERVER_DIR),
      "FindScenesRequest"
    );

    expect(resolved.definition).toBe(
      'type FindScenesRequest = ListRequestInput<"scene">;'
    );
  });

  it("answers null for a name it cannot find or that is not a name", () => {
    expect(resolveTypeDefinition("NoSuchTypeAnywhere", SERVER_DIR)).toBeNull();
    expect(resolveTypeDefinition("{ id: string }", SERVER_DIR)).toBeNull();
  });
});

describe("extractControllerTypes", () => {
  it("reads a TypedLibraryRequest in an exported async function", () => {
    const file = path.join(tmpDir, "controllers", "things.ts");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      `export const other = async (req: TypedAuthRequest<Wrong>) => {};

export async function listThings(
  req: TypedLibraryRequest<
    Partial<ThingsRequest>,
    { id: string },
    Record<string, string>
  >,
  res: TypedResponse<ThingsResponse | ApiErrorResponse>
) {
  res.json({});
}
`
    );

    const types = extractControllerTypes(
      "controllers/things.ts",
      "listThings",
      tmpDir
    );

    expect(types.requestBody?.name).toBe("Partial<ThingsRequest>");
    expect(types.requestParams?.name).toBe("{ id: string }");
    expect(types.requestQuery?.name).toBe("Record<string, string>");
    expect(types.response?.name).toBe("ThingsResponse");
  });

  it("answers no types for a missing file or handler", () => {
    expect(
      extractControllerTypes("controllers/missing.ts", "x", tmpDir)
    ).toEqual({});
    expect(
      extractControllerTypes("controllers/things.ts", "missing", tmpDir)
    ).toEqual({});
  });
});

describe("extractHandlerTypes", () => {
  it("reads an inline handler's response type", () => {
    const types = extractHandlerTypes(
      `authenticated(
    async (_req, res: TypedResponse<SyncStatusResponse | ApiErrorResponse>) => {
      res.json(await stashSyncService.getSyncStatus());
    }
  )`
    );

    expect(types).toEqual({
      response: { name: "SyncStatusResponse", definition: "", sourceFile: "" },
    });
  });

  it("leaves out a response that is only ApiErrorResponse, and plain requests", () => {
    expect(
      extractHandlerTypes(
        "async (req: Request, res: TypedResponse<ApiErrorResponse>) => {}"
      )
    ).toEqual({});
  });
});

describe("enrichTypes", () => {
  it("resolves names and keeps an inline object type as its own definition", () => {
    const types = enrichTypes(
      {
        requestParams: {
          name: "{ id: string }",
          definition: "",
          sourceFile: "",
        },
        response: {
          name: "OrphanedScenesResponse",
          definition: "",
          sourceFile: "",
        },
        requestBody: { name: "NoSuchType", definition: "", sourceFile: "" },
      },
      SERVER_DIR
    );

    expect(types.requestParams?.definition).toBe("{ id: string }");
    expect(types.response?.definition).toContain("totalCount: number");
    expect(types.requestBody).toEqual({
      name: "NoSuchType",
      definition: "",
      sourceFile: "",
    });
    expect(types.requestQuery).toBeUndefined();
  });
});
