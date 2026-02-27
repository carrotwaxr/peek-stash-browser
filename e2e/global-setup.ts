/**
 * Playwright global setup — runs once before all tests.
 *
 * In CI (fresh database, no Stash instance), the server starts in "setup wizard"
 * mode. This setup creates the admin user and a dummy Stash instance via the API
 * so that the app considers setup complete and auth.setup.ts can log in normally.
 *
 * Locally (docker-compose with persistent DB), setup is already complete
 * and this is a no-op.
 */
import { request } from "@playwright/test";

async function globalSetup() {
  const baseURL =
    process.env.E2E_BASE_URL ||
    (process.env.CI ? "http://localhost:5173" : "http://localhost:6969");

  const api = await request.newContext({ baseURL });

  try {
    const status = await api.get("/api/setup/status");
    const data = await status.json();

    if (data.setupComplete) {
      return;
    }

    // Create admin user if none exist
    if (!data.hasUsers) {
      const username = process.env.E2E_USERNAME || "admin";
      const password = process.env.E2E_PASSWORD || "admin123";

      const res = await api.post("/api/setup/create-admin", {
        data: { username, password },
      });

      if (!res.ok()) {
        throw new Error(
          `Failed to create admin: ${res.status()} ${await res.text()}`
        );
      }
    }

    // Create a dummy Stash instance so setup is "complete".
    // In CI there's no real Stash server — sync will fail silently
    // but auth/navigation/UI tests still work with empty libraries.
    if (!data.hasStashInstance) {
      const res = await api.post("/api/setup/create-stash-instance", {
        data: {
          name: "E2E Test Instance",
          url: "http://localhost:9999/graphql",
          apiKey: "e2e-dummy-key",
        },
      });

      if (!res.ok()) {
        throw new Error(
          `Failed to create dummy Stash instance: ${res.status()} ${await res.text()}`
        );
      }
    }
  } finally {
    await api.dispose();
  }
}

export default globalSetup;
