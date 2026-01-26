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
      throw new Error(`Login failed: ${response.status} ${await response.text()}`);
    }

    // Extract token from Set-Cookie header
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const tokenMatch = setCookie.match(/token=([^;]+)/);
      if (tokenMatch) {
        this.token = tokenMatch[1];
      }
    }

    // Also check response body for token (some auth flows return it there)
    const data = await response.json();
    if (data.token) {
      this.token = data.token;
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = undefined;
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

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.getHeaders(options),
    });

    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async post<T = unknown>(path: string, body?: object, options?: RequestOptions): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.getHeaders(options),
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async put<T = unknown>(path: string, body?: object, options?: RequestOptions): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.getHeaders(options),
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    return {
      status: response.status,
      data: data as T,
      ok: response.ok,
    };
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.getHeaders(options),
    });

    const data = await response.json().catch(() => ({}));
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
 * Select only the primary test instance for the current user.
 * This ensures tests that query by ID only get results from the test instance,
 * not from other instances (e.g., production) that may have been added.
 *
 * Call this in beforeAll for tests that filter by specific entity IDs.
 */
export async function selectTestInstanceOnly(): Promise<string> {
  if (cachedTestInstanceId) {
    await adminClient.put("/api/user/stash-instances", {
      instanceIds: [cachedTestInstanceId],
    });
    return cachedTestInstanceId;
  }

  // Get all instances
  const instancesResponse = await adminClient.get<{
    instances: Array<{ id: string; name: string; priority: number }>;
  }>("/api/setup/stash-instances");

  if (!instancesResponse.ok || !instancesResponse.data.instances?.length) {
    throw new Error("No Stash instances configured");
  }

  // Find the test instance (highest priority / first configured)
  const testInstance = instancesResponse.data.instances.reduce((a, b) =>
    a.priority < b.priority ? a : b
  );

  cachedTestInstanceId = testInstance.id;

  // Set user's instance selection to only test instance
  await adminClient.put("/api/user/stash-instances", {
    instanceIds: [cachedTestInstanceId],
  });

  return cachedTestInstanceId;
}

/**
 * Reset user instance selection to all instances.
 * Call this in afterAll if you need to restore default behavior.
 */
export async function selectAllInstances(): Promise<void> {
  await adminClient.put("/api/user/stash-instances", {
    instanceIds: [],
  });
}
