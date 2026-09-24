/**
 * The Stash replay server (sweep item 83): answers Peek's Stash GraphQL
 * queries and media requests from a synthetic library, so the integration
 * suite and E2E run without a real Stash.
 *
 * One HTTP server per library, each with its own API key (the ApiKey header
 * or an apikey query parameter), sharing one record of what could not be
 * answered:
 * - Mutations are refused and recorded in `mutations`: tests must never
 *   write to Stash.
 * - A request the replay cannot answer gets GraphQL `errors` (or a 404 for an
 *   unknown media path), one line on stderr, and an entry in `unsupported`,
 *   which the integration audit turns into a failed test file.
 *
 * GET /healthz and GET /__replay/stats need no key. Stats add `counts`, the
 * entity counts of the library on that port, which E2E waits for.
 */
import {
  Kind,
  type OperationDefinitionNode,
  OperationTypeNode,
  parse,
  valueFromASTUntyped,
} from "graphql";
import http from "http";
import {
  ENTITY_TYPES,
  type ReplayLibrary,
  ReplayUnsupported,
  STASH_ORIGIN,
  isRecord,
  queryRoot,
} from "./library.js";
import { type MediaResponse, answerMedia, pathShape } from "./media.js";
import { project, selectedField } from "./project.js";

export interface ReplayLibraryOptions {
  name: string;
  library: ReplayLibrary;
  apiKey: string;
  port?: number;
  host?: string;
}

export interface ReplayServer {
  /** url is http://<host>:<port>/graphql */
  libraries: Array<{ name: string; url: string; apiKey: string }>;
  statsUrl: string;
  stats(): { mutations: string[]; unsupported: string[] };
  close(): Promise<void>;
}

interface SharedStats {
  mutations: string[];
  unsupported: string[];
}

interface GraphQLAnswer {
  status: number;
  body: {
    data: Record<string, unknown> | null;
    errors?: Array<{ message: string }>;
  };
}

const ORIGIN_TOKEN = new RegExp(
  STASH_ORIGIN.replace(/[{}]/g, (brace) => `\\${brace}`),
  "g"
);

function send(res: http.ServerResponse, answer: MediaResponse): void {
  const body = answer.body;
  res.writeHead(answer.status, {
    ...answer.headers,
    "Content-Length": String(Buffer.byteLength(body)),
  });
  res.end(body);
}

function sendText(
  res: http.ServerResponse,
  status: number,
  contentType: string,
  body: string
): void {
  send(res, { status, headers: { "Content-Type": contentType }, body });
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

function refusal(message: string): GraphQLAnswer {
  return { status: 200, body: { data: null, errors: [{ message }] } };
}

/** The operation a request names, or its only one. */
function pickOperation(
  query: string,
  operationName: unknown
): OperationDefinitionNode | string {
  let document;
  try {
    document = parse(query);
  } catch (error) {
    return `the query does not parse: ${error instanceof Error ? error.message : String(error)}`;
  }
  const operations = document.definitions.filter(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION
  );
  if (typeof operationName === "string" && operationName !== "") {
    return (
      operations.find((operation) => operation.name?.value === operationName) ??
      `the query has no operation ${operationName}`
    );
  }
  const [only, ...others] = operations;
  return only !== undefined && others.length === 0
    ? only
    : "the query needs exactly one operation, or an operationName";
}

function answerGraphql(
  lib: ReplayLibrary,
  rawBody: string,
  stats: SharedStats
): GraphQLAnswer {
  const request: unknown = (() => {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      return undefined;
    }
  })();
  if (!isRecord(request) || typeof request.query !== "string") {
    throw new ReplayUnsupported(
      "stash-replay cannot answer POST /graphql: the body is not a GraphQL JSON request."
    );
  }
  const variables = isRecord(request.variables) ? request.variables : {};
  const operation = pickOperation(request.query, request.operationName);
  if (typeof operation === "string") {
    throw new ReplayUnsupported(
      `stash-replay cannot answer POST /graphql: ${operation}.`
    );
  }
  const name = operation.name?.value ?? "(anonymous operation)";

  if (operation.operation === OperationTypeNode.MUTATION) {
    const fields = operation.selectionSet.selections.map((selection) =>
      selection.kind === Kind.FIELD ? selection.name.value : "(fragment)"
    );
    stats.mutations.push(...fields);
    const message = `stash-replay refuses the mutation ${fields.join(", ")} (operation ${name}): the replay is read-only.`;
    process.stderr.write(`${message}\n`);
    return refusal(message);
  }
  if (operation.operation !== OperationTypeNode.QUERY) {
    throw ReplayUnsupported.notEvaluated(
      name,
      `a ${operation.operation}`,
      "server.ts"
    );
  }

  const data: Record<string, unknown> = {};
  for (const selection of operation.selectionSet.selections) {
    const field = selectedField(selection, name, "");
    const root = field.name.value;
    const args = Object.fromEntries(
      (field.arguments ?? []).map((argument) => [
        argument.name.value,
        valueFromASTUntyped(argument.value, variables),
      ])
    );
    const value = queryRoot(lib, name, root, args);
    data[root] = field.selectionSet
      ? project(value, field.selectionSet, name, root)
      : value;
  }
  return { status: 200, body: { data } };
}

function counts(lib: ReplayLibrary): Record<string, number> {
  return Object.fromEntries(
    ENTITY_TYPES.map((type) => [type, lib.entities[type].length])
  );
}

function recordUnsupported(
  stats: SharedStats,
  entry: string,
  line: string
): void {
  stats.unsupported.push(entry);
  process.stderr.write(`${line}\n`);
}

async function handle(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: ReplayLibraryOptions,
  stats: SharedStats,
  fallbackHost: string
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://stash-replay.invalid");
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/healthz") {
    sendText(res, 200, "text/plain", "ok");
    return;
  }
  if (method === "GET" && url.pathname === "/__replay/stats") {
    sendText(
      res,
      200,
      "application/json",
      JSON.stringify({
        mutations: stats.mutations,
        unsupported: stats.unsupported,
        counts: counts(options.library),
      })
    );
    return;
  }

  const header = req.headers.apikey;
  const key =
    typeof header === "string" ? header : url.searchParams.get("apikey");
  if (key !== options.apiKey) {
    sendText(res, 401, "text/plain", "unauthorized");
    return;
  }

  if (method === "POST" && url.pathname === "/graphql") {
    const rawBody = await readBody(req);
    let answer: GraphQLAnswer;
    try {
      answer = answerGraphql(options.library, rawBody, stats);
    } catch (error) {
      const message =
        error instanceof ReplayUnsupported
          ? error.message
          : `stash-replay failed on POST /graphql: ${error instanceof Error ? error.message : String(error)}`;
      recordUnsupported(stats, message, message);
      answer = refusal(message);
    }
    // Stash builds media URLs from the Host the client used
    const origin = `http://${req.headers.host ?? fallbackHost}`;
    const body = JSON.stringify(answer.body).replace(ORIGIN_TOKEN, origin);
    sendText(res, answer.status, "application/json", body);
    return;
  }

  if (method === "GET") {
    const media = answerMedia(
      options.library,
      url.pathname,
      url.searchParams,
      req.headers.range
    );
    if (media !== undefined) {
      send(res, media);
      return;
    }
  }

  const shape = pathShape(url.pathname);
  recordUnsupported(
    stats,
    shape,
    `stash-replay cannot answer ${method} ${shape}: the replay serves no such route; teach server/integration/stash-replay/media.ts.`
  );
  sendText(res, 404, "text/plain", "not found");
}

function listen(
  server: http.Server,
  port: number,
  host: string
): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        resolve(address.port);
      } else {
        reject(new Error(`stash-replay: no port for ${host}`));
      }
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    // Keep-alive connections would hold close() open
    server.closeAllConnections();
  });
}

/** A URL host for a bind address: a wildcard bind is reached on loopback. */
function urlHost(host: string): string {
  if (host === "0.0.0.0" || host === "::") return "127.0.0.1";
  return host.includes(":") ? `[${host}]` : host;
}

/** Starts one server per library; stats are shared across them. */
export async function startStashReplay(
  libs: ReplayLibraryOptions[]
): Promise<ReplayServer> {
  const stats: SharedStats = { mutations: [], unsupported: [] };
  const servers: http.Server[] = [];
  const libraries: ReplayServer["libraries"] = [];
  try {
    for (const options of libs) {
      const host = options.host ?? "127.0.0.1";
      let fallbackHost = host;
      const server = http.createServer((req, res) => {
        handle(req, res, options, stats, fallbackHost).catch(
          (error: unknown) => {
            process.stderr.write(
              `stash-replay failed on ${req.method ?? "?"} ${req.url ?? "?"}: ${String(error)}\n`
            );
            if (!res.headersSent) {
              sendText(res, 500, "text/plain", "stash-replay error");
            } else {
              res.destroy();
            }
          }
        );
      });
      servers.push(server);
      const port = await listen(server, options.port ?? 0, host);
      fallbackHost = `${urlHost(host)}:${port}`;
      libraries.push({
        name: options.name,
        url: `http://${fallbackHost}/graphql`,
        apiKey: options.apiKey,
      });
    }
  } catch (error) {
    await Promise.allSettled(
      servers.filter((server) => server.listening).map(closeServer)
    );
    throw error;
  }
  const [first] = libraries;
  if (first === undefined) {
    throw new Error("startStashReplay needs at least one library");
  }

  return {
    libraries,
    statsUrl: first.url.replace(/\/graphql$/, "/__replay/stats"),
    stats: () => ({
      mutations: [...stats.mutations],
      unsupported: [...stats.unsupported],
    }),
    close: async () => {
      await Promise.all(servers.map(closeServer));
    },
  };
}
