/**
 * Playwright global teardown: runs once, after every test.
 *
 * Dev-stack mode: the bootstrap admin deletes the users and groups named with
 * this run's prefix, the run admin among them, and fails the run if any
 * remain. Each user's playlists, history, ratings, carousels and presets go
 * with it (every per-user relation cascades).
 *
 * Hermetic mode: nothing to do, since the next run replaces the database.
 */
import { request } from "@playwright/test";
import { bootstrapAdmin, logIn } from "./global-setup";
import {
  deleteGroups,
  deleteUsers,
  listGroups,
  listUsers,
} from "./support/cleanup";
import { baseURL, devStack } from "./support/env";
import { runPrefix } from "./support/names";

async function globalTeardown() {
  // Global setup failed before it created anything for this run
  if (!devStack || !process.env.E2E_RUN_ID || !process.env.E2E_ADMIN_USERNAME) {
    return;
  }

  const bootstrap = bootstrapAdmin();
  const prefix = runPrefix();
  const api = await request.newContext({ baseURL });
  try {
    await logIn(api, bootstrap.username, bootstrap.password);

    await deleteUsers(api, prefix, bootstrap.username);
    await deleteGroups(api, prefix);

    const left = [
      ...(await listUsers(api))
        .filter((u) => u.username.startsWith(prefix))
        .map((u) => `user ${u.username}`),
      ...(await listGroups(api))
        .filter((g) => g.name.startsWith(prefix))
        .map((g) => `group ${g.name}`),
    ];
    if (left.length > 0) {
      throw new Error(
        `This run's users and groups outlived teardown: ${left.join(", ")}`
      );
    }
  } finally {
    await api.dispose();
  }
}

export default globalTeardown;
