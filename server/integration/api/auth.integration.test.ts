import { describe, it, expect, beforeAll } from "vitest";
import { TestClient, adminClient } from "../helpers/testClient.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";

describe("Authentication API Integration Tests", () => {
  beforeAll(async () => {
    // Ensure admin client is logged in for tests that need it
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
  });

  describe("POST /api/auth/login", () => {
    it("should login with valid credentials", async () => {
      const client = new TestClient();
      const response = await client.post<{
        success: boolean;
        user: { id: number; username: string; role: string };
      }>("/api/auth/login", {
        username: TEST_ADMIN.username,
        password: TEST_ADMIN.password,
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.user).toBeDefined();
      expect(response.data.user.username).toBe(TEST_ADMIN.username);
      expect(response.data.user.role).toBe("ADMIN");
    });

    it("should reject invalid password", async () => {
      const client = new TestClient();
      const response = await client.post<{ error: string }>("/api/auth/login", {
        username: TEST_ADMIN.username,
        password: "wrong_password",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
      expect(response.data.error).toBe("Invalid credentials");
    });

    it("should reject non-existent user", async () => {
      const client = new TestClient();
      const response = await client.post<{ error: string }>("/api/auth/login", {
        username: "non_existent_user",
        password: "some_password",
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
      expect(response.data.error).toBe("Invalid credentials");
    });

    it("should require username and password", async () => {
      const client = new TestClient();

      // Missing both
      const response1 = await client.post<{ error: string }>("/api/auth/login", {});
      expect(response1.status).toBe(400);
      expect(response1.data.error).toBe("Username and password are required");

      // Missing password
      const response2 = await client.post<{ error: string }>("/api/auth/login", {
        username: TEST_ADMIN.username,
      });
      expect(response2.status).toBe(400);
      expect(response2.data.error).toBe("Username and password are required");

      // Missing username
      const response3 = await client.post<{ error: string }>("/api/auth/login", {
        password: TEST_ADMIN.password,
      });
      expect(response3.status).toBe(400);
      expect(response3.data.error).toBe("Username and password are required");
    });
  });

  describe("GET /api/auth/check", () => {
    it("should confirm authentication for logged-in user", async () => {
      const response = await adminClient.get<{
        authenticated: boolean;
        user: { id: number; username: string; role: string };
      }>("/api/auth/check");

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.authenticated).toBe(true);
      expect(response.data.user).toBeDefined();
      expect(response.data.user.username).toBe(TEST_ADMIN.username);
    });

    it("should reject unauthenticated requests", async () => {
      const client = new TestClient();
      const response = await client.get<{ error: string }>("/api/auth/check");

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return current user info", async () => {
      const response = await adminClient.get<{
        user: { id: number; username: string; role: string };
      }>("/api/auth/me");

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.user).toBeDefined();
      expect(response.data.user.username).toBe(TEST_ADMIN.username);
      expect(response.data.user.role).toBe("ADMIN");
    });

    it("should reject unauthenticated requests", async () => {
      const client = new TestClient();
      const response = await client.get<{ error: string }>("/api/auth/me");

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should logout successfully", async () => {
      // Create a fresh client and login
      const client = new TestClient();
      await client.login(TEST_ADMIN.username, TEST_ADMIN.password);

      // Verify we're logged in
      const checkBefore = await client.get<{ authenticated: boolean }>("/api/auth/check");
      expect(checkBefore.ok).toBe(true);

      // Logout
      const response = await client.post<{ success: boolean; message: string }>(
        "/api/auth/logout"
      );

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.message).toBe("Logged out successfully");

      // Clear the client token to simulate cookie being cleared
      client.clearToken();

      // Verify we're logged out
      const checkAfter = await client.get<{ error: string }>("/api/auth/check");
      expect(checkAfter.ok).toBe(false);
      expect(checkAfter.status).toBe(401);
    });

    it("should succeed even for unauthenticated requests", async () => {
      const client = new TestClient();
      const response = await client.post<{ success: boolean; message: string }>(
        "/api/auth/logout"
      );

      // Logout doesn't require auth - it just clears the cookie
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
    });
  });

  describe("POST /api/auth/first-time-password", () => {
    it("should reject when setup is complete", async () => {
      // Setup is already complete in our test environment
      const response = await adminClient.post<{ error: string }>(
        "/api/auth/first-time-password",
        {
          username: "admin",
          newPassword: "new_password",
        }
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBe(403);
      expect(response.data.error).toContain("Setup is complete");
    });
  });

  describe("Protected routes require authentication", () => {
    it("should reject unauthenticated access to library scenes", async () => {
      const client = new TestClient();
      const response = await client.post("/api/library/scenes", {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated access to library performers", async () => {
      const client = new TestClient();
      const response = await client.post("/api/library/performers", {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated access to library studios", async () => {
      const client = new TestClient();
      const response = await client.post("/api/library/studios", {});

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it("should allow authenticated access to library scenes", async () => {
      const response = await adminClient.post("/api/library/scenes", {});

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
    });
  });
});
