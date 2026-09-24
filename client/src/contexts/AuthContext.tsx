import React, { useEffect, useState } from "react";
import { AuthContext } from "./AuthContextProvider";
import type { AuthUser } from "./AuthContextProvider";

/** GET /api/auth/check when signed in */
interface AuthCheckResponse {
  user: AuthUser;
}

/** POST /api/auth/login: the user on success, an error message otherwise */
interface LoginSuccessResponse {
  user: AuthUser;
}
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
      const { user } = data as LoginSuccessResponse;
      setIsAuthenticated(true);
      setUser(user);
      return { success: true, user };
    } else {
      const { error } = data as LoginErrorResponse;
      return { success: false, error: error || "Login failed" };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Error logging out - clear auth state regardless
    } finally {
      setIsAuthenticated(false);
      setUser(null);
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
