/**
 * Playwright global setup: runs once, in the runner process, before any test.
 * It picks the run admin that auth.setup.ts signs in as, and passes it to the
 * workers in E2E_ADMIN_USERNAME and E2E_ADMIN_PASSWORD (workers inherit the
 * environment global setup leaves).
 *
 * Hermetic mode (the default): the server Playwright started runs on a fresh
 * database. Setup creates the first admin (HERMETIC_ADMIN) and a Stash
 * instance on the replay server Playwright started (item 83), which completes
 * the setup wizard and starts a full sync. It then waits until the library
 * holds every scene and image the replay serves.
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
import {
  HERMETIC_ADMIN,
  REPLAY_API_KEY,
  baseURL,
  dbFile,
  devStack,
  replayStatsUrl,
  replayUrl,
} from "./support/env";

interface SetupStatus {
  setupComplete: boolean;
  hasUsers: boolean;
  hasStashInstance: boolean;
}

/**
 * GET /__replay/stats: the writes the replay refused, the requests it could
 * not answer, and the served library's entity counts
 */
export interface ReplayStats {
  mutations: string[];
  unsupported: string[];
  counts: Record<string, number>;
}

/** How long a full sync of the replay library may take */
const LIBRARY_TIMEOUT_MS = 120_000;

/** The Stash replay's stats, read without Peek's session cookie */
export async function readReplayStats(): Promise<ReplayStats> {
  const replay = await request.newContext();
  try {
    const response = await mustOk(
      await replay.get(replayStatsUrl),
      `GET ${replayStatsUrl}`
    );
    return (await response.json()) as ReplayStats;
  } finally {
    await replay.dispose();
  }
}

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

/** A library list's status and total, or null before it answers 200 */
async function libraryCount(
  api: APIRequestContext,
  type: "scenes" | "images"
): Promise<{ status: number; count: number | null }> {
  const response = await api.post(`/api/library/${type}`, {
    data: { filter: { per_page: 1 } },
  });
  if (!response.ok()) return { status: response.status(), count: null };
  const body = (await response.json()) as Record<
    string,
    { count?: number } | undefined
  >;
  const key = type === "scenes" ? "findScenes" : "findImages";
  return { status: response.status(), count: body[key]?.count ?? null };
}

/**
 * Waits, polling every second, until the sync that creating the instance
 * started is done and the library holds every scene and image the replay
 * serves. `api` carries the admin's session.
 */
async function waitForLibrary(api: APIRequestContext): Promise<void> {
  const { counts } = await readReplayStats();
  const want = { scenes: counts.scene, images: counts.image };
  const deadline = Date.now() + LIBRARY_TIMEOUT_MS;
  let last = "no answer yet";
  for (;;) {
    const sync = await api.get("/api/sync/status");
    const inProgress = sync.ok()
      ? ((await sync.json()) as { inProgress: boolean }).inProgress
      : null;
    const scenes = await libraryCount(api, "scenes");
    const images = await libraryCount(api, "images");
    if (
      inProgress === false &&
      scenes.count === want.scenes &&
      images.count === want.images
    ) {
      return;
    }
    last = `sync status ${sync.status()} inProgress=${String(inProgress)}, scenes ${scenes.status} count ${String(scenes.count)} of ${String(want.scenes)}, images ${images.status} count ${String(images.count)} of ${String(want.images)}`;
    if (Date.now() >= deadline) {
      throw new Error(
        `Peek did not sync the replay library within ${LIBRARY_TIMEOUT_MS / 1000} s: ${last}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

/**
 * Hermetic mode: the first admin and the replay's Stash instance on a fresh
 * database, then the synced library
 */
async function setUpHermetic(
  api: APIRequestContext
): Promise<{ username: string; password: string }> {
  const status = await readSetupStatus(api);
  if (status.hasUsers) {
    throw new Error(
      `Peek at ${baseURL} already has users, but hermetic E2E expected a fresh database (${dbFile})`
    );
  }

  // Its session cookie stays in `api` for the instance step and the wait
  await mustOk(
    await api.post("/api/setup/create-admin", { data: HERMETIC_ADMIN }),
    `Creating the admin ${HERMETIC_ADMIN.username}`
  );
  await createStashInstance(api, "E2E replay Stash", replayUrl, REPLAY_API_KEY);
  await waitForLibrary(api);
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
