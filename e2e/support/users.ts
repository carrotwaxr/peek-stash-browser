import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  request,
} from "@playwright/test";
import { randomBytes } from "node:crypto";
import { mustOk } from "./api";
import { uniqueName } from "./names";

/**
 * Throwaway users, for a test that needs an account of its own: another
 * role, a first sign-in, or per-user state kept apart from the run admin
 * that every other test shares. The test deletes its users with deleteUser;
 * dev-stack teardown deletes any left, by the run prefix.
 */

export interface TestUser {
  id: number;
  username: string;
  password: string;
}

/**
 * Creates a user named `e2e-<runId>-<purpose>-<worker>-<n>`. `api` needs an
 * admin session: a test's `request` or `page.request` fixture has the run
 * admin's, from the storage state.
 */
export async function createUser(
  api: APIRequestContext,
  purpose: string,
  role: "USER" | "ADMIN" = "USER"
): Promise<TestUser> {
  const username = uniqueName(purpose);
  // A letter and a digit, as password changes require
  const password = `E2e-${randomBytes(9).toString("base64url")}-1`;
  const response = await mustOk(
    await api.post("/api/user/create", {
      data: { username, password, role },
    }),
    `Creating the user ${username}`
  );
  const { user } = (await response.json()) as { user: { id: number } };
  return { id: user.id, username, password };
}

/**
 * A fresh browser context signed in as `user`. It logs in through the API and
 * injects the cookie, as auth.setup.ts does. First sign-in setup is left to
 * the caller: completeSetup, or the setup modal the test is about.
 */
export async function signIn(
  browser: Browser,
  baseURL: string | undefined,
  user: TestUser
): Promise<BrowserContext> {
  if (!baseURL) {
    throw new Error("signIn needs the baseURL that playwright.config.ts sets");
  }
  const api = await request.newContext({ baseURL });
  let token: string | undefined;
  try {
    const response = await mustOk(
      await api.post("/api/auth/login", {
        data: { username: user.username, password: user.password },
      }),
      `Signing in as ${user.username}`
    );
    token = /token=([^;]+)/.exec(response.headers()["set-cookie"] ?? "")?.[1];
  } finally {
    await api.dispose();
  }
  if (!token) {
    throw new Error(`Signing in as ${user.username} set no token cookie`);
  }

  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    {
      name: "token",
      value: token,
      domain: new URL(baseURL).hostname,
      path: "/",
    },
  ]);
  return context;
}

/**
 * Finishes first sign-in setup through the API, selecting every instance, so
 * the setup modal stays away
 */
export async function completeSetup(context: BrowserContext): Promise<void> {
  const status = await mustOk(
    await context.request.get("/api/user/setup-status"),
    "GET /api/user/setup-status"
  );
  const { instances } = (await status.json()) as {
    instances: { id: string }[];
  };
  await mustOk(
    await context.request.post("/api/user/complete-setup", {
      data: { selectedInstanceIds: instances.map((i) => i.id) },
    }),
    "POST /api/user/complete-setup"
  );
}

/** Deletes a user; `api` needs an admin session, as for createUser */
export async function deleteUser(
  api: APIRequestContext,
  id: number
): Promise<void> {
  await mustOk(await api.delete(`/api/user/${id}`), `Deleting the user ${id}`);
}
