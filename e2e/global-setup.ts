/**
 * Playwright global setup: runs once, in the runner process, before any test.
 * It picks the run admin that auth.setup.ts signs in as, and passes it to the
 * workers in E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD (workers inherit the
 * environment global setup leaves).
 *
 * Hermetic mode (the default): the server Playwright started runs on a fresh
 * database. Setup creates the first admin (HERMETIC_ADMIN) and a Stash
 * instance, which completes the setup wizard.
 *
 * Dev-stack mode (E2E_BASE_URL): the bootstrap admin from .env.e2e creates a
 * throwaway admin for this run, which global-teardown.ts deletes. No test runs
 * as the bootstrap admin: on the owner's dev stack that account syncs to the
 * production Stash, so a test playing, rating or pressing O as it would write
 * there. The run admin has Sync to Stash off, as every new user does.
 */
import { type APIRequestContext, request } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mustOk } from "./support/api";
import { deleteGroups, deleteUsers } from "./support/cleanup";
import { HERMETIC_ADMIN, baseURL, dbFile, devStack } from "./support/env";

interface SetupStatus {
  setupComplete: boolean;
  hasUsers: boolean;
  hasStashInstance: boolean;
}

/** Hermetic mode's Stash: nothing listens there (port 9 is discard) */
const PLACEHOLDER_STASH_URL = "http://127.0.0.1:9/graphql";

/**
 * The setup wizard's status. A Peek that is down behind the Vite proxy
 * answers 500 with an empty body: that is an error, not "setup complete".
 */
export async function readSetupStatus(
  api: APIRequestContext
): Promise<SetupStatus> {
  const response = await api.get("/api/setup/status");
  const body = await response.text();
  if (!response.ok()) {
    throw new Error(
      `GET /api/setup/status answered ${response.status()} ${body || "(empty body)"}: is Peek running at ${baseURL}?`
    );
  }
  try {
    return JSON.parse(body) as SetupStatus;
  } catch {
    throw new Error(
      `GET /api/setup/status answered ${response.status()} with a body that is not JSON: is Peek running at ${baseURL}? ${body.slice(0, 200)}`
    );
  }
}

/** Signs `api` in; the session cookie stays in its cookie jar */
export async function logIn(
  api: APIRequestContext,
  username: string,
  password: string
): Promise<void> {
  await mustOk(
    await api.post("/api/auth/login", { data: { username, password } }),
    `Logging in as ${username}`
  );
}

/** The dev stack's bootstrap admin, from .env.e2e or the shell */
export function bootstrapAdmin(): { username: string; password: string } {
  const username = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  if (!username || !password) {
    throw new Error(
      `E2E_BASE_URL is set (dev-stack mode), which needs E2E_USERNAME and E2E_PASSWORD: an admin of the stack at ${baseURL}, in .env.e2e or the shell. It only creates and deletes this run's admin.`
    );
  }
  return { username, password };
}

async function createStashInstance(
  api: APIRequestContext,
  name: string,
  url: string,
  apiKey: string
): Promise<void> {
  await mustOk(
    await api.post("/api/setup/create-stash-instance", {
      data: { name, url, apiKey },
    }),
    `Creating the Stash instance ${name} (${url})`
  );
}

/** Hermetic mode: the first admin and a Stash instance on a fresh database */
async function setUpHermetic(
  api: APIRequestContext
): Promise<{ username: string; password: string }> {
  const status = await readSetupStatus(api);
  if (status.hasUsers) {
    throw new Error(
      `Peek at ${baseURL} already has users, but hermetic E2E expected a fresh database (${dbFile})`
    );
  }

  // Its session cookie stays in `api` for the instance step
  await mustOk(
    await api.post("/api/setup/create-admin", { data: HERMETIC_ADMIN }),
    `Creating the admin ${HERMETIC_ADMIN.username}`
  );
  await createStashInstance(
    api,
    "E2E placeholder Stash",
    PLACEHOLDER_STASH_URL,
    "e2e-dummy-key"
  );
  return HERMETIC_ADMIN;
}

/**
 * Dev-stack mode: a throwaway ADMIN for this run, created by the bootstrap
 * admin. A fresh stack (the production image in image-smoke.yml) gets the
 * bootstrap admin and an instance first.
 */
async function setUpDevStack(
  api: APIRequestContext,
  runId: string
): Promise<{ username: string; password: string }> {
  const bootstrap = bootstrapAdmin();
  const status = await readSetupStatus(api);

  const stashUrl = process.env.E2E_STASH_URL;
  const stashApiKey = process.env.E2E_STASH_API_KEY;
  if (!status.hasStashInstance && (!stashUrl || !stashApiKey)) {
    throw new Error(
      `Peek at ${baseURL} has no Stash instance yet: set E2E_STASH_URL and E2E_STASH_API_KEY for global setup to add one`
    );
  }

  if (!status.hasUsers) {
    await mustOk(
      await api.post("/api/setup/create-admin", { data: bootstrap }),
      `Creating the bootstrap admin ${bootstrap.username}`
    );
  }
  await logIn(api, bootstrap.username, bootstrap.password);

  if (!status.hasStashInstance && stashUrl && stashApiKey) {
    await createStashInstance(api, "E2E Stash", stashUrl, stashApiKey);
  }

  // Leftovers of runs that were killed before their teardown
  await deleteUsers(api, "e2e-", bootstrap.username);
  await deleteGroups(api, "e2e-");

  const runAdmin = {
    username: `e2e-${runId}-admin`,
    password: randomBytes(18).toString("base64url"),
  };
  await mustOk(
    await api.post("/api/user/create", {
      data: { ...runAdmin, role: "ADMIN" },
    }),
    `Creating the run admin ${runAdmin.username}`
  );
  return runAdmin;
}

async function globalSetup() {
  const runId = Date.now().toString(36);
  const api = await request.newContext({ baseURL });
  try {
    const admin = devStack
      ? await setUpDevStack(api, runId)
      : await setUpHermetic(api);

    process.env.E2E_RUN_ID = runId;
    process.env.E2E_ADMIN_USERNAME = admin.username;
    process.env.E2E_ADMIN_PASSWORD = admin.password;
    console.log(
      `E2E run ${runId} (${devStack ? "dev stack" : "hermetic"}) at ${baseURL}, signed in as ${admin.username}`
    );
  } finally {
    await api.dispose();
  }
}

export default globalSetup;
