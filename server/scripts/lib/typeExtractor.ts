// server/scripts/lib/typeExtractor.ts
import * as fs from "fs";
import * as path from "path";

export interface TypeInfo {
  name: string;
  definition: string;
  sourceFile: string;
}

export interface ControllerTypes {
  requestBody?: TypeInfo | undefined;
  requestParams?: TypeInfo | undefined;
  requestQuery?: TypeInfo | undefined;
  response?: TypeInfo | undefined;
}

const OPENERS = "<{([";
const CLOSERS = ">})]";

/**
 * Index of the bracket closing the one at `open`, counting every bracket
 * kind and skipping the `>` of `=>`; -1 when it never closes
 */
function closingIndex(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i] ?? "";
    if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch) && !(ch === ">" && src[i - 1] === "=")) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split at `separator` outside any brackets, each part trimmed to one line */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? "";
    if (OPENERS.includes(ch)) depth++;
    else if (CLOSERS.includes(ch) && !(ch === ">" && text[i - 1] === "=")) {
      depth--;
    } else if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/** The text inside the `<...>` that follows `pattern` in `src`, or null */
function genericArgs(src: string, pattern: RegExp): string | null {
  const match = pattern.exec(src);
  if (!match) return null;
  const open = match.index + match[0].length - 1;
  const close = closingIndex(src, open);
  return close === -1 ? null : src.slice(open + 1, close);
}

const typeName = (name: string): TypeInfo => ({
  name,
  definition: "",
  sourceFile: "",
});

/** Request and response types from a handler's parameter list */
function typesFromParams(params: string): ControllerTypes {
  const result: ControllerTypes = {};

  const request = genericArgs(
    params,
    /\b_?req\s*:\s*(?:TypedAuthRequest|TypedRequest|TypedLibraryRequest)\s*</
  );
  if (request !== null) {
    const [body, requestParams, query] = splitTopLevel(request, ",");
    if (body && body !== "unknown") result.requestBody = typeName(body);
    if (requestParams) result.requestParams = typeName(requestParams);
    if (query) result.requestQuery = typeName(query);
  }

  const response = genericArgs(params, /\b_?res\s*:\s*TypedResponse\s*</);
  if (response !== null) {
    const members = splitTopLevel(response, "|").filter(
      (member) => member !== "ApiErrorResponse"
    );
    if (members.length > 0) result.response = typeName(members.join(" | "));
  }

  return result;
}

/** The parameter list of the function whose `(` is at `open` */
function parameterList(src: string, open: number): string {
  const close = closingIndex(src, open);
  return close === -1 ? "" : src.slice(open + 1, close);
}

/**
 * Types from a named handler's signature, in `handlerFile` (server-relative)
 */
export function extractControllerTypes(
  handlerFile: string,
  handlerName: string,
  serverDir: string
): ControllerTypes {
  if (!handlerFile || !/^\w+$/.test(handlerName)) return {};
  const fullPath = path.resolve(serverDir, handlerFile);
  if (!fs.existsSync(fullPath)) return {};

  const content = fs.readFileSync(fullPath, "utf-8");
  const start = new RegExp(
    `(?:const\\s+${handlerName}\\s*=\\s*(?:async\\s*)?\\(|function\\s+${handlerName}\\s*\\()`
  ).exec(content);
  if (!start) return {};

  return typesFromParams(
    parameterList(content, start.index + start[0].length - 1)
  );
}

/**
 * Types from an inline handler's source, such as
 * `authenticated(async (req: TypedAuthRequest<Body>, res) => ...)`
 */
export function extractHandlerTypes(source: string): ControllerTypes {
  const start = /^(?:\w+\(\s*)?(?:async\s*)?(?:function\b\s*\w*\s*)?\(/.exec(
    source
  );
  if (!start) return {};
  return typesFromParams(parameterList(source, start[0].length - 1));
}

/** The declaration starting at `start` (after `export `), through its end */
function declarationAt(content: string, start: number, isType: boolean) {
  if (isType) {
    // A type alias ends at the first `;` outside brackets
    let depth = 0;
    for (let i = start; i < content.length; i++) {
      const ch = content[i] ?? "";
      if (OPENERS.includes(ch)) depth++;
      else if (
        CLOSERS.includes(ch) &&
        !(ch === ">" && content[i - 1] === "=")
      ) {
        depth--;
      } else if (ch === ";" && depth === 0) return content.slice(start, i + 1);
    }
    return null;
  }
  const brace = content.indexOf("{", start);
  if (brace === -1) return null;
  const close = closingIndex(content, brace);
  return close === -1 ? null : content.slice(start, close + 1);
}

/**
 * Resolve a type name to its declaration in `server/types/api/` or
 * `shared/types/api/`: an interface, or a type alias
 */
export function resolveTypeDefinition(
  name: string,
  serverDir: string
): TypeInfo | null {
  if (!/^\w+$/.test(name)) return null;

  const dirs = [
    { dir: path.join(serverDir, "types", "api"), label: "server/types/api" },
    {
      dir: path.join(serverDir, "..", "shared", "types", "api"),
      label: "shared/types/api",
    },
  ];
  const declaration = new RegExp(
    `export\\s+(?:(interface)\\s+${name}\\b|(type)\\s+${name}\\b[^=;]*=)`
  );

  for (const { dir, label } of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts")
      .sort();

    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const match = declaration.exec(content);
      if (!match) continue;
      const start = match.index + match[0].indexOf(match[1] ?? match[2] ?? "");
      const definition = declarationAt(content, start, Boolean(match[2]));
      if (definition) {
        return { name, definition, sourceFile: `${label}/${file}` };
      }
    }
  }

  return null;
}

/**
 * Enrich ControllerTypes with resolved definitions; an inline object type is
 * its own definition
 */
export function enrichTypes(
  types: ControllerTypes,
  serverDir: string
): ControllerTypes {
  const enrich = (info?: TypeInfo): TypeInfo | undefined => {
    if (!info) return undefined;
    if (info.name.startsWith("{")) return { ...info, definition: info.name };
    return resolveTypeDefinition(info.name, serverDir) ?? info;
  };

  return {
    requestBody: enrich(types.requestBody),
    requestParams: enrich(types.requestParams),
    requestQuery: enrich(types.requestQuery),
    response: enrich(types.response),
  };
}
