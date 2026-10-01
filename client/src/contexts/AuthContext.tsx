import React, { useEffect, useState } from "react";
import type { AuthCheckResponse, LoginResponse } from "@peek/shared-types";
import {
  ApiError,
  getErrorMessage,
  readRetryAfterSeconds,
} from "../api/client";
import { queryClient } from "../api/queryClient";
import { AuthContext } from "./AuthContextProvider";
import type { AuthUser } from "./AuthContextProvider";

/** POST /api/auth/login refused: an error message */
interface LoginErrorResponse {
  error?: string;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/check", {
        credentials: "include",
      });

      if (response.ok) {
        const userData = (await response.json()) as AuthCheckResponse;
        setIsAuthenticated(true);
        setUser(userData.user);
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
    } catch {
      setIsAuthenticated(false);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: { username: string; password: string }) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(credentials),
    });

    const data: unknown = await response.json();

    if (response.ok) {
      const { user, landingPagePreference } = data as LoginResponse;
      setIsAuthenticated(true);
      setUser(user);
      return { success: true, user, landingPagePreference };
    } else {
      const body = data as LoginErrorResponse & Record<string, unknown>;
      // A lockout (423) or rate limit (429) says how long to wait
      const refusal = new ApiError(
        body.error || "Login failed",
        response.status,
        body,
        readRetryAfterSeconds(response, body)
      );
      return { success: false, error: getErrorMessage(refusal) };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Error logging out - the session is dropped locally regardless
    } finally {
      // The auth state stays as it is: flipping it would make the route guard
      // navigate in-app to /login and race the full load below. The load
      // resets it, so a sign-out navigates once.
      // The next person to sign in on this browser gets neither this user's
      // page nor cached data. Nothing in the tab's session storage outlives a
      // sign-out. A full load also drops what components and contexts hold
      // in memory.
      sessionStorage.clear();
      queryClient.clear();
      window.location.assign("/login");
    }
  };

  /**
   * Update user state with partial data (for local preference updates)
   * This allows updating specific user fields without a full auth refresh
   */
  const updateUser = (partialUser: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...partialUser } : null));
  };

  useEffect(() => {
    void checkAuth();
  }, []);

  const value = {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
