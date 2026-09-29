import type { GetUserStashInstancesResponse } from "../../types/api/index.js";
import { TEST_CONFIG } from "./config.js";

interface RequestOptions {
  headers?: Record<string, string>;
}

interface ApiResponse<T> {
  status: number;
  data: T;
  ok: boolean;
}

export class TestClient {
  private token?: string;
  private baseUrl: string;

  constructor(baseUrl: string = TEST_CONFIG.baseUrl) {
    this.baseUrl = baseUrl;
  }

  async login(username: string, password: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(
        `Login failed: ${response.status} ${await response.text()}`
      );
    }

    // Extract token from Set-Cookie header
    this.captureToken(response);

    // Also check response body for token (some auth flows return it there)
    const data: unknown = await response.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "token" in data &&
      typeof data.token === "string" &&
      data.token
    ) {
      this.token = data.token;
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = undefined;
  }

  /**
   * Keep a `token=` cookie from any response, as a browser would: the server
   * refreshes the session cookie and issues a new one on password change.
   * Logout's clear-cookie has an empty value and does not match.
   */
  private captureToken(response: Response): void {
    const tokenMatch = response.headers
      .get("set-cookie")
      ?.match(/token=([^;]+)/);
    if (tokenMatch) {
      this.token = tokenMatch[1];
    }
  }

  private getHeaders(options?: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options?.headers,
    };

    if (this.token) {
      headers["Cookie"] = `token=${this.token}`;
    }

    return headers;
  }

  async get<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.getHeaders(options),
    });
    this.captureToken(response);

    const data: unknown = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async post<T = unknown>(
    path: string,
    body?: object,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.getHeaders(options),
      body: body ? JSON.stringify(body) : undefined,
    });
    this.captureToken(response);

    const data: unknown = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async put<T = unknown>(
    path: string,
    body?: object,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.getHeaders(options),
      body: body ? JSON.stringify(body) : undefined,
    });
    this.captureToken(response);

    const data: unknown = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async delete<T = unknown>(
    path: string,
    options?: RequestOptions
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.getHeaders(options),
    });
    this.captureToken(response);

    const data: unknown = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }
}

// Singleton instances for common use cases
export const adminClient = new TestClient();
export const guestClient = new TestClient();

// Cached test instance ID for multi-instance filtering
let cachedTestInstanceId: string | null = null;

/**
 * The primary test instance's id (highest priority / first configured),
 * leaving the admin's instance selection as it is. For a test that names the
 * instance in its refs (`id:instance`) whatever the selection.
 */
export async function findTestInstanceId(): Promise<string> {
  if (cachedTestInstanceId) return cachedTestInstanceId;

  // Get all instances
  const instancesResponse = await adminClient.get<{
    instances: Array<{ id: string; name: string; priority: number }>;
  }>("/api/setup/stash-instances");

  if (!instancesResponse.ok || !instancesResponse.data.instances?.length) {
    throw new Error("No Stash instances configured");
  }

  const testInstance = instancesResponse.data.instances.reduce((a, b) =>
    a.priority < b.priority ? a : b
  );

  cachedTestInstanceId = testInstance.id;
  return cachedTestInstanceId;
}

/** The shared admin's selection before this file first changed it */
let adminSelectionBefore: string[] | undefined;

/** The client's instance selection (an empty list: every enabled instance). */
export async function readInstanceSelection(
  client: TestClient = adminClient
): Promise<string[]> {
  const response = await client.get<GetUserStashInstancesResponse>(
    "/api/user/stash-instances"
  );
  if (!response.ok) {
    throw new Error(
      `GET /api/user/stash-instances answered ${response.status}: ${JSON.stringify(response.data)}`
    );
  }
  return response.data.selectedInstanceIds;
}

async function putInstanceSelection(
  client: TestClient,
  instanceIds: string[]
): Promise<void> {
  const response = await client.put("/api/user/stash-instances", {
    instanceIds,
  });
  if (!response.ok) {
    throw new Error(
      `PUT /api/user/stash-instances ${JSON.stringify(instanceIds)} answered ${response.status}: ${JSON.stringify(response.data)}`
    );
  }
}

/**
 * Sets the client's instance selection (an empty list: every enabled
 * instance). Every file runs as the one shared admin, so the admin's first
 * change in a file remembers the selection it found, and the file restores it
 * with `afterAll(restoreInstanceSelection)`: no file sees a selection another
 * file left. Users a file creates for itself need no restore.
 */
export async function setInstanceSelection(
  instanceIds: string[],
  client: TestClient = adminClient
): Promise<void> {
  if (client === adminClient && adminSelectionBefore === undefined) {
    adminSelectionBefore = await readInstanceSelection();
  }
  await putInstanceSelection(client, instanceIds);
}

/**
 * Puts back the admin's selection from before this file (or this describe)
 * first changed it; nothing when it did not change it. Pair every
 * `setInstanceSelection` or `select*` call on the admin with it in the same
 * describe's `afterAll`. `helpers/sharedStateAudit.ts` fails a file that
 * leaves the admin's selection changed.
 */
export async function restoreInstanceSelection(): Promise<void> {
  const before = adminSelectionBefore;
  if (before === undefined) return;
  adminSelectionBefore = undefined;
  await putInstanceSelection(adminClient, before);
}

/**
 * Select only the primary test instance for the admin, so a bare id matches
 * only the test instance's entity (the second library reuses the first's
 * ids). Restore with `afterAll(restoreInstanceSelection)`.
 */
export async function selectTestInstanceOnly(): Promise<string> {
  const instanceId = await findTestInstanceId();
  await setInstanceSelection([instanceId]);
  return instanceId;
}

/**
 * Select only the primary test instance for a user the file created.
 *
 * @param client - The TestClient to set instance selection for
 */
export async function selectTestInstanceForClient(
  client: TestClient
): Promise<string> {
  const instanceId = await findTestInstanceId();
  await setInstanceSelection([instanceId], client);
  return instanceId;
}

/**
 * Select every enabled instance for the admin. Restore with
 * `afterAll(restoreInstanceSelection)`.
 */
export async function selectAllInstances(): Promise<void> {
  await setInstanceSelection([]);
}

/**
 * Select every enabled instance for a user the file created.
 */
export async function selectAllInstancesForClient(
  client: TestClient
): Promise<void> {
  await setInstanceSelection([], client);
}
