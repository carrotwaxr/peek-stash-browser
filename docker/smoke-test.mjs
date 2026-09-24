#!/usr/bin/env node
/**
 * Boots a production image against an empty data volume and checks what a
 * fresh install depends on (item 80, TCI-10). image-smoke.yml runs it for CI
 * and before docker-build.yml publishes; run it locally the same way:
 *
 *   node docker/smoke-test.mjs <image> [port]
 *
 * EXPECT_BUILD_DATE, when set, must equal the image's BUILD_DATE build arg.
 * EXPECT_VERSION, when set, replaces server/package.json's version (only for
 * checking an older published image by hand).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const [image, port = "8080"] = process.argv.slice(2);
if (!image) {
  console.error("usage: node docker/smoke-test.mjs <image> [port]");
  process.exit(2);
}

const repo = new URL("../", import.meta.url);
const version =
  process.env.EXPECT_VERSION ??
  JSON.parse(readFileSync(new URL("server/package.json", repo), "utf8"))
    .version;
const migrations = readdirSync(new URL("server/prisma/migrations/", repo), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const name = `peek-smoke-${process.pid}`;
const volume = `${name}-data`;
const base = `http://127.0.0.1:${port}`;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();
const sql = (query) =>
  docker("exec", name, "sqlite3", "/app/data/peek-stash-browser.db", query);

let failures = 0;
async function check(what, fn) {
  try {
    await fn();
    console.log(`ok   ${what}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${what}: ${error.message}`);
  }
}
function expectEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

async function waitHealthy() {
  for (let i = 0; i < 90; i++) {
    const [health, running] = docker(
      "inspect",
      "-f",
      "{{.State.Health.Status}} {{.State.Running}}",
      name
    ).split(" ");
    if (health === "healthy") return;
    if (health === "unhealthy" || running !== "true") {
      throw new Error(`health ${health}, running ${running}`);
    }
    await sleep(2000);
  }
  throw new Error("not healthy after 180 s");
}

async function get(path) {
  const response = await fetch(`${base}${path}`);
  expectEqual(response.status, 200, `GET ${path} status`);
  return response;
}

const SECURITY_HEADERS = {
  "x-frame-options": "SAMEORIGIN",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};

try {
  docker("volume", "create", volume);
  docker(
    "run",
    "-d",
    "--name",
    name,
    "-p",
    `127.0.0.1:${port}:80`,
    "-v",
    `${volume}:/app/data`,
    image
  );

  await check("turns healthy on an empty data volume", waitHealthy);
  if (failures) throw new Error("the container never became healthy");

  await check("/api/health reports the package version", async () => {
    const response = await get("/api/health");
    const body = await response.json();
    expectEqual(body.status, "healthy", "status");
    expectEqual(body.version, version, "version");
    expectEqual(response.headers.get("x-powered-by"), null, "X-Powered-By");
  });

  await check("/api/version reports the version and build date", async () => {
    const body = await (await get("/api/version")).json();
    expectEqual(body.server, version, "server");
    if (process.env.EXPECT_BUILD_DATE) {
      expectEqual(body.buildDate, process.env.EXPECT_BUILD_DATE, "buildDate");
    }
  });

  await check("the server reads the new database through nginx", async () => {
    const body = await (await get("/api/setup/status")).json();
    expectEqual(body.setupComplete, false, "setupComplete");
    expectEqual(body.hasUsers, false, "hasUsers");
  });

  for (const path of ["/", "/scenes"]) {
    await check(
      `${path} serves the SPA shell with the security headers`,
      async () => {
        const response = await get(path);
        const html = await response.text();
        if (!html.includes('<div id="root">'))
          throw new Error("no #root in the page");
        const csp = response.headers.get("content-security-policy") ?? "";
        for (const directive of [
          "default-src 'self'",
          "frame-ancestors 'self'",
        ]) {
          if (!csp.includes(directive))
            throw new Error(`CSP lacks ${directive}`);
        }
        for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
          expectEqual(response.headers.get(header), value, header);
        }
        if (!response.headers.get("permissions-policy"))
          throw new Error("no Permissions-Policy");
        expectEqual(
          response.headers.get("cache-control"),
          "no-cache",
          "Cache-Control"
        );
      }
    );
  }

  await check(
    "the shell's script bundle is served; a missing asset is a 404",
    async () => {
      const html = await (await get("/")).text();
      const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
      if (!script) throw new Error("no /assets/*.js script in the shell");
      const bundle = await get(script);
      if (!bundle.headers.get("content-type")?.includes("javascript")) {
        throw new Error(
          `bundle content-type ${bundle.headers.get("content-type")}`
        );
      }
      expectEqual(
        (await fetch(`${base}/assets/missing.js`)).status,
        404,
        "missing asset status"
      );
    }
  );

  await check(
    "the server and nginx workers run as 99, the database belongs to 99:100",
    () => {
      const processes = docker("top", name, "-eo", "pid,uid,args")
        .split("\n")
        .slice(1)
        .map((line) => line.trim().split(/\s+/))
        .map(([, uid, ...args]) => ({ uid, args: args.join(" ") }));
      const server = processes.filter((p) =>
        p.args.startsWith("node backend/index.js")
      );
      const workers = processes.filter((p) =>
        p.args.startsWith("nginx: worker process")
      );
      expectEqual(server.length, 1, "server processes");
      expectEqual(server[0].uid, "99", "server uid");
      if (workers.length === 0) throw new Error("no nginx workers");
      for (const worker of workers)
        expectEqual(worker.uid, "99", "nginx worker uid");
      expectEqual(
        docker(
          "exec",
          name,
          "stat",
          "-c",
          "%u:%g",
          "/app/data/peek-stash-browser.db"
        ),
        "99:100",
        "database owner"
      );
    }
  );

  await check(`start.sh applied all ${migrations.length} migrations`, () => {
    const applied = sql(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1"
    ).split("\n");
    const missing = migrations.filter((m) => !applied.includes(m));
    const unexpected = applied.filter((m) => !migrations.includes(m));
    if (missing.length || unexpected.length) {
      throw new Error(`missing [${missing}], not in the repo [${unexpected}]`);
    }
    expectEqual(
      sql(
        "SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL"
      ),
      "0",
      "unfinished or rolled-back migrations"
    );
  });

  await check(
    "@peek/shared-types is a package directory in /app/node_modules",
    () => {
      docker(
        "exec",
        name,
        "sh",
        "-c",
        "test -d /app/node_modules/@peek/shared-types && test ! -L /app/node_modules/@peek/shared-types && test -f /app/node_modules/@peek/shared-types/dist/instanceAwareId.js && test ! -e /shared"
      );
    }
  );

  await check("@peek/shared-types resolves from the backend", () => {
    docker(
      "exec",
      "-u",
      "99:100",
      "-w",
      "/app/backend",
      name,
      "node",
      "-e",
      'import("@peek/shared-types/instanceAwareId.js").then((m) => { if (typeof m.parseEntityRef !== "function") process.exit(1); })'
    );
  });

  await check(
    "a restart applies no migration and turns healthy again",
    async () => {
      docker("restart", "-t", "3", name);
      const since = docker("inspect", "-f", "{{.State.StartedAt}}", name);
      await waitHealthy();
      const log = execFileSync("docker", ["logs", "--since", since, name], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (!log.includes("No pending migrations to apply")) {
        throw new Error(
          "no 'No pending migrations to apply' after the restart"
        );
      }
    }
  );
} finally {
  if (failures) {
    console.log("--- container log (last 80 lines) ---");
    execFileSync("docker", ["logs", "--tail", "80", name], {
      stdio: "inherit",
    });
  }
  execFileSync("docker", ["rm", "-f", name], { stdio: "ignore" });
  execFileSync("docker", ["volume", "rm", volume], { stdio: "ignore" });
}

console.log(failures ? `${failures} check(s) failed` : "all checks passed");
process.exit(failures ? 1 : 0);
