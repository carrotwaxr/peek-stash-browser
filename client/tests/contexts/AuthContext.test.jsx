import { waitFor, act } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { AuthProvider } from "../../src/contexts/AuthContext.jsx";
import { useAuth } from "../../src/hooks/useAuth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUser = { id: "1", username: "testuser", role: "USER" };

/**
 * Renders the useAuth hook inside an AuthProvider so every test can
 * interact with the context through `result.current`.
 */
function renderWithAuth() {
  return renderHook(() => useAuth(), {
    wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
  });
}

/**
 * Creates a resolved Response-like object for mocking fetch.
 */
function okResponse(body) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

/**
 * Creates a non-ok Response-like object for mocking fetch.
 */
function errorResponse(status = 401, body = {}) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  // Default: auth check succeeds with mockUser
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ user: mockUser }),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuthProvider", () => {
  // 1. Initial auth check on mount
  it("calls /api/auth/check on mount and sets user on success", async () => {
    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/check", {
      credentials: "include",
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
  });

  // 2. Auth check failure (non-ok response)
  it("sets isAuthenticated=false and user=null when auth check returns non-ok", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => errorResponse(401));

    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  // 3. Auth check network error
  it("sets isAuthenticated=false and user=null when auth check throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  // 4. Loading state
  it("starts with isLoading=true and transitions to false after auth check", async () => {
    // Use a deferred promise so we can observe the loading state
    let resolveAuth;
    globalThis.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuth = resolve;
        }),
    );

    const { result } = renderWithAuth();

    // While the auth check is in-flight, isLoading should be true
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);

    // Resolve the auth check
    await act(async () => {
      resolveAuth({
        ok: true,
        json: () => Promise.resolve({ user: mockUser }),
      });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});

describe("login()", () => {
  // 5. Successful login
  it("calls /api/auth/login, sets user and isAuthenticated, returns success", async () => {
    const credentials = { username: "testuser", password: "secret" };
    const loginUser = { id: "1", username: "testuser", role: "USER" };

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/auth/check") {
        return errorResponse(401);
      }
      if (url === "/api/auth/login") {
        return okResponse({ user: loginUser });
      }
      return errorResponse(404);
    });

    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Initially not authenticated (auth check failed)
    expect(result.current.isAuthenticated).toBe(false);

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login(credentials);
    });

    expect(loginResult).toEqual({ success: true, user: loginUser });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(loginUser);

    // Verify fetch was called with correct arguments
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(credentials),
    });
  });

  // 6. Failed login
  it("returns {success: false, error} on non-ok login response", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/auth/check") {
        return errorResponse(401);
      }
      if (url === "/api/auth/login") {
        return errorResponse(401, { error: "Invalid credentials" });
      }
      return errorResponse(404);
    });

    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login({
        username: "bad",
        password: "wrong",
      });
    });

    expect(loginResult).toEqual({
      success: false,
      error: "Invalid credentials",
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  // 7. Login with default error message
  it('returns "Login failed" when server provides no error message', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/auth/check") {
        return errorResponse(401);
      }
      if (url === "/api/auth/login") {
        // Response body has no `error` field
        return errorResponse(401, { message: "something" });
      }
      return errorResponse(404);
    });

    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let loginResult;
    await act(async () => {
      loginResult = await result.current.login({
        username: "x",
        password: "y",
      });
    });

    expect(loginResult).toEqual({ success: false, error: "Login failed" });
  });
});

describe("logout()", () => {
  // 8. Successful logout
  it("calls /api/auth/logout and clears user and isAuthenticated", async () => {
    // Start authenticated
    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);

    // Mock the logout call
    globalThis.fetch = vi.fn().mockImplementation(() => okResponse({}));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  });

  // 9. Logout with network error clears state regardless
  it("clears auth state even when logout fetch throws", async () => {
    // Start authenticated
    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);

    // Mock the logout call to throw
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

describe("updateUser()", () => {
  // 10. Partial update merges into existing user
  it("merges partial data into existing user", async () => {
    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);

    act(() => {
      result.current.updateUser({ displayName: "New Name" });
    });

    expect(result.current.user).toEqual({
      ...mockUser,
      displayName: "New Name",
    });
  });

  // 11. Update when user is null returns null
  it("returns null when user is null (does not crash)", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => errorResponse(401));

    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();

    act(() => {
      result.current.updateUser({ displayName: "New Name" });
    });

    expect(result.current.user).toBeNull();
  });
});

describe("useAuth hook", () => {
  // 12. Throws outside provider
  it('throws "useAuth must be used within an AuthProvider" outside provider', () => {
    // Suppress React error boundary console output
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");

    consoleSpy.mockRestore();
  });

  // 13. Returns context inside provider
  it("returns context with all expected properties inside provider", async () => {
    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current).toHaveProperty("isAuthenticated");
    expect(result.current).toHaveProperty("isLoading");
    expect(result.current).toHaveProperty("user");
    expect(result.current).toHaveProperty("login");
    expect(result.current).toHaveProperty("logout");
    expect(result.current).toHaveProperty("updateUser");
  });
});

describe("Context shape", () => {
  // 14. Provides all expected values with correct types
  it("provides isAuthenticated, isLoading, user, login, logout, updateUser", async () => {
    const { result } = renderWithAuth();

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.isAuthenticated).toBe("boolean");
    expect(typeof result.current.isLoading).toBe("boolean");
    expect(typeof result.current.login).toBe("function");
    expect(typeof result.current.logout).toBe("function");
    expect(typeof result.current.updateUser).toBe("function");
    // user is an object when authenticated
    expect(result.current.user).toBeTypeOf("object");
    expect(result.current.user).not.toBeNull();
  });
});
