/**
 * Playwright global teardown: runs once, after every test.
 *
 * Dev-stack mode: the bootstrap admin deletes this run's admin. Its
 * playlists, history, ratings, carousels and presets go with it (every
 * per-user relation cascades). Then it deletes the users and groups named
 * with this run's prefix, and fails the run if any remain.
 *
 * Hermetic mode: nothing to do, since the next run replaces the database.
 */
import { request } from "@playwright/test";
import {
  bootstrapAdmin,
  deleteByPrefix,
  listGroups,
  listUsers,
  logIn,
  mustOk,
} from "./global-setup";
import { baseURL, devStack } from "./support/env";

async function globalTeardown() {
  const runId = process.env.E2E_RUN_ID;
  const runAdmin = process.env.E2E_ADMIN_USERNAME;
  // Global setup failed before it created anything for this run
  if (!devStack || !runId || !runAdmin) return;

  const bootstrap = bootstrapAdmin();
  const prefix = `e2e-${runId}`;
  const api = await request.newContext({ baseURL });
  try {
    await logIn(api, bootstrap.username, bootstrap.password);

    const admin = (await listUsers(api)).find((u) => u.username === runAdmin);
    if (admin) {
      await mustOk(
        await api.delete(`/api/user/${admin.id}`),
        `Deleting the run admin ${runAdmin}`
      );
    }

    await deleteByPrefix(api, prefix, bootstrap.username);

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
