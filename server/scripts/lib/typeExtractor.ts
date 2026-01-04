// server/scripts/lib/typeExtractor.ts
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
  // Note: Uses [\s\S]*? instead of \s* to match across newlines (multiline signatures)
  const signatureRegex = new RegExp(
    `export\\s+const\\s+${controllerName}\\s*=\\s*async\\s*\\([\\s\\S]*?req:\\s*(?:TypedAuthRequest|TypedRequest)(?:<([^>]+)>)?[\\s\\S]*?res:\\s*TypedResponse<([^>]+)>`,
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
