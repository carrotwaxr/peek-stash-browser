import React, { useEffect, useState } from "react";
import { AuthContext } from "./AuthContextProvider.jsx";

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/check", {
        credentials: "include",
      });

      if (response.ok) {
        const userData = await response.json();
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

  const login = async (credentials) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(credentials),
    });

    const data = await response.json();

    if (response.ok) {
      setIsAuthenticated(true);
      setUser(data.user);
      return { success: true, user: data.user };
    } else {
      return { success: false, error: data.error || "Login failed" };
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
  const updateUser = (partialUser) => {
    setUser((prev) => (prev ? { ...prev, ...partialUser } : null));
  };

  useEffect(() => {
    checkAuth();
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
