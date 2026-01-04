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

  // Step 1: Find the controller's function signature (up to the opening brace)
  // This prevents matching across multiple function definitions
  const signatureStartRegex = new RegExp(
    `export\\s+const\\s+${controllerName}\\s*=\\s*async\\s*\\(`,
    "m"
  );

  const startMatch = signatureStartRegex.exec(content);
  if (!startMatch) {
    return {};
  }

  // Find the end of the parameter list (closing paren before arrow or opening brace)
  const startIndex = startMatch.index + startMatch[0].length;
  let parenDepth = 1;
  let endIndex = startIndex;

  while (endIndex < content.length && parenDepth > 0) {
    const char = content[endIndex];
    if (char === "(") parenDepth++;
    else if (char === ")") parenDepth--;
    endIndex++;
  }

  // Extract just the parameter list for this specific controller
  const parameterList = content.slice(startIndex, endIndex - 1);

  // Step 2: Check if this controller uses TypedRequest or TypedAuthRequest with generics
  // Only match if there's an actual <...> with type parameters
  const reqMatch = parameterList.match(/req:\s*(?:TypedAuthRequest|TypedRequest)<([^>]+)>/);

  if (reqMatch) {
    const reqTypes = reqMatch[1];
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
  // If req uses plain Request or AuthenticatedRequest (no generics), don't populate request types

  // Step 3: Extract response type
  const resMatch = parameterList.match(/res:\s*TypedResponse<([^>]+)>/);

  if (resMatch) {
    const resType = resMatch[1];
    const cleanType = resType.replace(/\s*\|\s*ApiErrorResponse/, "").trim();
    result.response = { name: cleanType, definition: "", sourceFile: "" };
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

    // Find: export interface TypeName
    const interfaceStart = new RegExp(
      `export\\s+interface\\s+${typeName}\\s*(?:extends[^{]+)?{`,
      "m"
    );

    const match = interfaceStart.exec(content);
    if (match) {
      const startIndex = match.index + match[0].length - 1; // Position of opening {
      const body = extractBracedContent(content, startIndex);
      if (body) {
        return {
          name: typeName,
          definition: `interface ${typeName} ${body}`,
          sourceFile: `types/api/${file}`,
        };
      }
    }
  }

  return null;
}

/**
 * Extract content between matching braces using depth counting
 */
function extractBracedContent(content: string, startIndex: number): string | null {
  if (content[startIndex] !== "{") return null;

  let depth = 0;
  let i = startIndex;

  while (i < content.length) {
    const char = content[i];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        return content.slice(startIndex, i + 1);
      }
    }
    i++;
  }

  return null; // Unbalanced braces
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
