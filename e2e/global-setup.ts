/**
 * Playwright global setup — runs once before all tests.
 *
 * In CI (fresh database, no Stash instance), the server starts in "setup wizard"
 * mode. This setup creates the admin user and a dummy Stash instance via the API
 * so that the app considers setup complete and auth.setup.ts can log in normally.
 * Adding the instance needs the admin session once the admin exists: create-admin
 * leaves its cookie in the request context, and a resumed setup logs in first.
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

    // In dev environments, setup may already be complete and the endpoint
    // can return non-JSON (e.g., 500 with empty body). Treat parse failures
    // or non-OK responses as "setup already complete".
    let data: {
      setupComplete?: boolean;
      hasUsers?: boolean;
      hasStashInstance?: boolean;
    };
    try {
      data = await status.json();
    } catch {
      // JSON parse failed — likely setup is already complete (dev environment)
      return;
    }

    if (data.setupComplete) {
      return;
    }

    const username = process.env.E2E_USERNAME || "admin";
    const password = process.env.E2E_PASSWORD || "admin123";

    // Create admin user if none exist; its session cookie stays in `api`
    if (!data.hasUsers) {
      const res = await api.post("/api/setup/create-admin", {
        data: { username, password },
      });

      if (!res.ok()) {
        throw new Error(
          `Failed to create admin: ${res.status()} ${await res.text()}`
        );
      }
    } else if (!data.hasStashInstance) {
      // The admin exists from an earlier run: sign in to add the instance
      const res = await api.post("/api/auth/login", {
        data: { username, password },
      });

      if (!res.ok()) {
        throw new Error(
          `Failed to log in as the E2E admin: ${res.status()} ${await res.text()}`
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
