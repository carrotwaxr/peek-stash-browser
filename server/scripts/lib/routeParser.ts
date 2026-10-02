// server/scripts/lib/routeParser.ts
import * as fs from "fs";
import * as path from "path";

const DEFAULT_SERVER_DIR = path.resolve(import.meta.dirname, "..", "..");

/**
 * Who may call a route, from the middleware in front of it:
 * - None: anyone
 * - Session: a signed-in Peek user
 * - Admin: a signed-in admin
 * - Session or signed link: a session, or the personal signed link the
 *   external player gets (the direct stream)
 * - None until setup starts, then Admin: open while Peek has no user and no
 *   Stash server (the setup wizard), admin only after
 */
export type RouteAuth =
  | "None"
  | "Session"
  | "Admin"
  | "Session or signed link"
  | "None until setup starts, then Admin";

export interface RouteDefinition {
  method: string;
  path: string;
  fullPath: string;
  /** Server-relative file declaring the route */
  file: string;
  /** 1-based line of the `router.<method>(` call */
  line: number;
  auth: RouteAuth;
  /** The comment above the route (or trailing it), "" when there is none */
  description: string;
  /** The named handler, null when the handler is written inline */
  handlerName: string | null;
  /** Server-relative file defining the named handler, "" when unknown */
  handlerFile: string;
  /** The inline handler's source, for its parameter types */
  inlineHandler: string | null;
}

/** Middleware a `use` call puts in front of every route under `prefix` */
export interface PrefixMiddleware {
  /** Full path the middleware covers; "" covers every route */
  prefix: string;
  middleware: string[];
}

export interface RouteFileOptions {
  serverDir?: string;
  /** Middleware the mount (`app.use(base, ...middleware, router)`) adds */
  middleware?: string[];
  /** `use` middleware declared in front of the mount */
  prefixMiddleware?: PrefixMiddleware[];
}

/** A router file mounted by `app.use(basePath, ...middleware, router)` */
export interface Mount {
  /** Absolute path of the route file */
  file: string;
  basePath: string;
  middleware: string[];
  prefixMiddleware: PrefixMiddleware[];
}

export interface ApiFile {
  /** Routes declared on `app` itself */
  routes: RouteDefinition[];
  /** Router mounts, in declaration order */
  mounts: Mount[];
}

const ROUTE_METHODS = "get|post|put|delete|patch";
const WRAPPERS = ["authenticated", "libraryHandler"];

/**
 * Index just past the comment, string or regex literal starting at `i`, or
 * `i` itself when none starts there
 */
function skipLiteral(src: string, i: number): number {
  const ch = src[i];
  const next = src[i + 1];
  if (ch === "/" && next === "/") {
    const end = src.indexOf("\n", i);
    return end === -1 ? src.length : end;
  }
  if (ch === "/" && next === "*") {
    const end = src.indexOf("*/", i + 2);
    return end === -1 ? src.length : end + 2;
  }
  if (ch === '"' || ch === "'" || ch === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== ch) {
      if (src[j] === "\\") j++;
      j++;
    }
    return j + 1;
  }
  if (ch === "/" && /[(,=:[!&|?{};]\s*$|^\s*$/.test(src.slice(0, i))) {
    // A regex literal: a slash where no value precedes it
    let j = i + 1;
    let inClass = false;
    while (j < src.length && (src[j] !== "/" || inClass)) {
      if (src[j] === "\\") j++;
      else if (src[j] === "[") inClass = true;
      else if (src[j] === "]") inClass = false;
      j++;
    }
    return j + 1;
  }
  return i;
}

/** The source without its comments */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const end = skipLiteral(src, i);
    if (end === i) {
      out += src[i] ?? "";
      i++;
    } else {
      const isComment = src[i] === "/" && /[/*]/.test(src[i + 1] ?? "");
      if (!isComment) out += src.slice(i, end);
      i = end;
    }
  }
  return out;
}

/**
 * The top-level arguments of the call whose `(` is at `open`, comments
 * removed, and the index of its `)`; null when the call never closes
 */
function scanCall(
  src: string,
  open: number
): { args: string[]; end: number } | null {
  const args: string[] = [];
  let depth = 0;
  let argStart = open + 1;
  let i = open;
  while (i < src.length) {
    const skipped = skipLiteral(src, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const ch = src[i] ?? "";
    if ("([{".includes(ch)) {
      depth++;
    } else if (")]}".includes(ch)) {
      depth--;
      if (depth === 0) {
        args.push(src.slice(argStart, i));
        return {
          args: args.map((a) => stripComments(a).trim()).filter(Boolean),
          end: i,
        };
      }
    } else if (ch === "," && depth === 1) {
      args.push(src.slice(argStart, i));
      argStart = i + 1;
    }
    i++;
  }
  return null;
}

/** The string a literal argument holds, or null for any other argument */
function stringLiteral(arg: string): string | null {
  const match = /^(["'])(.*)\1$|^`([^`$]*)`$/s.exec(arg);
  if (!match) return null;
  return match[2] ?? match[3] ?? "";
}

/** A middleware argument's name: `requireAdmin`, `rateLimit` for `rateLimit({...})` */
function middlewareName(arg: string): string | null {
  const match = /^([\w$.]+)\s*(?:\(|$)/.exec(arg);
  if (!match) return null;
  return (match[1] ?? "").split(".").pop() ?? null;
}

function lineOf(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (src[i] === "\n") line++;
  return line;
}

/** Comment lines joined into paragraphs, a route's method-and-path line dropped */
function toDescription(lines: string[]): string {
  const kept: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("@")) break;
    if (new RegExp(`^(${ROUTE_METHODS})\\s+/\\S*$`, "i").test(line)) continue;
    kept.push(line);
  }
  return kept
    .join("\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split("\n").join(" ").trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * The JSDoc block or `//` lines right above `index`, or a comment trailing
 * `end`. `//` lines above a route the next line continues with another
 * route head a section, and describe none of them.
 */
function describe(
  src: string,
  object: string,
  index: number,
  end: number
): string {
  const [rest = "", next = ""] = src.slice(end + 1).split("\n");
  const trailing = /^\s*;?\s*\/\/\s*(.*)$/.exec(rest);
  if (trailing) return toDescription([trailing[1] ?? ""]);
  const headsSection = next.trim().startsWith(`${object}.`);

  const before = src.slice(0, index).split("\n");
  if ((before.pop() ?? "").trim() !== "") return "";
  const comment: string[] = [];
  const last = (before[before.length - 1] ?? "").trim();
  if (last.endsWith("*/")) {
    while (before.length > 0) {
      const line = (before.pop() ?? "").trim();
      const opens = line.startsWith("/*");
      comment.unshift(
        line
          .replace(/\*\/$/, "")
          .replace(/^\/\*+/, "")
          .replace(/^\*(?!\/)/, "")
      );
      if (opens) break;
    }
  } else if (!headsSection) {
    while ((before[before.length - 1] ?? "").trim().startsWith("//")) {
      comment.unshift((before.pop() ?? "").trim().replace(/^\/\/+/, ""));
    }
  }
  return toDescription(comment);
}

function toServerPath(absolute: string, serverDir: string): string {
  return path.relative(serverDir, absolute).split(path.sep).join("/");
}

/** Where a handler named in `src` is defined, as a server-relative path */
function handlerFileOf(
  src: string,
  file: string,
  name: string,
  serverDir: string
): string {
  const [first, second] = name.split(".");
  const spec = second
    ? new RegExp(
        `import\\s+\\*\\s+as\\s+${first}\\s+from\\s*["']([^"']+)["']`
      ).exec(src)
    : new RegExp(
        `import\\s*(?:type\\s+)?{[^}]*\\b${first}\\b[^}]*}\\s*from\\s*["']([^"']+)["']`
      ).exec(src);
  if (spec) {
    const target = spec[1] ?? "";
    if (!target.startsWith(".")) return "";
    const resolved = path
      .resolve(path.dirname(file), target)
      .replace(/\.js$/, ".ts");
    return toServerPath(resolved, serverDir);
  }
  const local = new RegExp(`(?:const|let|function)\\s+${first}\\b`).test(src);
  return local ? toServerPath(file, serverDir) : "";
}

type Handler =
  | { kind: "named"; name: string }
  | { kind: "inline"; source: string };

/** The handler a route's last argument holds, or null when it is unreadable */
function readHandler(arg: string): Handler | null {
  const wrapped = new RegExp(
    `^(?:${WRAPPERS.join("|")})\\(\\s*([\\w$.]+)\\s*\\)$`
  ).exec(arg);
  if (wrapped) return { kind: "named", name: wrapped[1] ?? "" };
  if (new RegExp(`^(?:${WRAPPERS.join("|")})\\(`).test(arg)) {
    return { kind: "inline", source: arg };
  }
  if (/^[\w$.]+$/.test(arg)) return { kind: "named", name: arg };
  if (/^(?:async\b|function\b|\(|[\w$]+\s*=>)/.test(arg)) {
    return { kind: "inline", source: arg };
  }
  return null;
}

function authFor(middleware: string[]): RouteAuth {
  const has = (name: string) => middleware.includes(name);
  if (has("requireAdmin")) return "Admin";
  if (has("requireAdminOnceSetupStarted")) {
    return "None until setup starts, then Admin";
  }
  if (has("authenticateStreamRequest")) return "Session or signed link";
  if (has("authenticate")) return "Session";
  return "None";
}

function covers(prefix: string, fullPath: string): boolean {
  return (
    prefix === "" ||
    fullPath === prefix ||
    fullPath.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  );
}

function joinPath(basePath: string, routePath: string): string {
  if (routePath === "/" || routePath === "") return basePath || "/";
  return basePath + routePath;
}

interface ParsedSource {
  routes: RouteDefinition[];
  mounts: Mount[];
}

/**
 * Every route `object` (`router` or `app`) declares in `src`, with the
 * middleware its `use` calls put in front of it, and (for `app`) the routers
 * it mounts from `routeImports`
 */
function parseSource(
  src: string,
  file: string,
  object: "router" | "app",
  basePath: string,
  options: RouteFileOptions,
  routeImports: Map<string, string> = new Map()
): ParsedSource {
  const serverDir = options.serverDir ?? DEFAULT_SERVER_DIR;
  const prefixes: PrefixMiddleware[] = [...(options.prefixMiddleware ?? [])];
  const routes: RouteDefinition[] = [];
  const mounts: Mount[] = [];
  const pattern = new RegExp(`\\b${object}\\.(use|${ROUTE_METHODS})\\(`, "g");

  let match;
  while ((match = pattern.exec(src)) !== null) {
    const verb = match[1] ?? "";
    const call = scanCall(src, match.index + match[0].length - 1);
    if (!call) continue;
    const [first = "", ...rest] = call.args;
    const literal = stringLiteral(first);

    if (verb === "use") {
      const prefix = literal === null ? basePath : joinPath(basePath, literal);
      const args = literal === null ? call.args : rest;
      const last = args[args.length - 1] ?? "";
      const mounted = routeImports.get(last);
      const names = (mounted ? args.slice(0, -1) : args)
        .map(middlewareName)
        .filter((name): name is string => name !== null);
      if (mounted) {
        mounts.push({
          file: mounted,
          basePath: prefix,
          middleware: names,
          prefixMiddleware: [...prefixes],
        });
      } else {
        prefixes.push({ prefix, middleware: names });
      }
      continue;
    }

    const handler = readHandler(rest[rest.length - 1] ?? "");
    if (literal === null || rest.length === 0 || !handler) continue;

    const fullPath = joinPath(basePath, literal);
    const middleware = [
      ...(options.middleware ?? []),
      ...prefixes
        .filter((p) => covers(p.prefix, fullPath))
        .flatMap((p) => p.middleware),
      ...rest
        .slice(0, -1)
        .map(middlewareName)
        .filter((name): name is string => name !== null),
    ];
    const name =
      handler.kind === "named"
        ? (handler.name.split(".").pop() ?? handler.name)
        : null;

    routes.push({
      method: verb.toUpperCase(),
      path: literal,
      fullPath,
      file: toServerPath(file, serverDir),
      line: lineOf(src, match.index),
      auth: authFor(middleware),
      description: describe(src, object, match.index, call.end),
      handlerName: name,
      handlerFile:
        handler.kind === "named"
          ? handlerFileOf(src, file, handler.name, serverDir)
          : toServerPath(file, serverDir),
      inlineHandler: handler.kind === "inline" ? handler.source : null,
    });
  }

  return { routes, mounts };
}

function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error(`Failed to read ${filePath}`, error);
    return null;
  }
}

/**
 * The lines of every `router.<method>(` or `app.<method>(` call in `src`:
 * what the parser must turn into entries
 */
export function routeCallLines(src: string): number[] {
  const pattern = new RegExp(
    `\\b(?:router|app)\\.(?:${ROUTE_METHODS})\\(`,
    "g"
  );
  const lines: number[] = [];
  let match;
  while ((match = pattern.exec(src)) !== null) {
    lines.push(lineOf(src, match.index));
  }
  return lines;
}

/**
 * Parse an Express route file: one entry per `router.<method>(path, ...)`
 * whose path is a string literal and whose handler is a name, a name in
 * `authenticated()` or `libraryHandler()`, or written inline
 */
export function parseRouteFile(
  filePath: string,
  basePath: string,
  options: RouteFileOptions = {}
): RouteDefinition[] {
  const src = readFile(filePath);
  if (src === null) return [];
  return parseSource(src, filePath, "router", basePath, options).routes;
}

/**
 * Parse `initializers/api.ts`: the routes declared on `app` and the route
 * files it mounts, each with the middleware in front of it
 */
export function parseApiFile(
  apiFilePath: string,
  serverDir: string = DEFAULT_SERVER_DIR
): ApiFile {
  const src = readFile(apiFilePath);
  if (src === null) return { routes: [], mounts: [] };

  const routeImports = new Map<string, string>();
  const importPattern =
    /import\s+(\w+)\s+from\s+["'](\.{1,2}\/routes\/[^"']+)["']/g;
  let match;
  while ((match = importPattern.exec(src)) !== null) {
    routeImports.set(
      match[1] ?? "",
      path
        .resolve(path.dirname(apiFilePath), match[2] ?? "")
        .replace(/\.js$/, ".ts")
    );
  }

  return parseSource(src, apiFilePath, "app", "", { serverDir }, routeImports);
}
