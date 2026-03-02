import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { AuthContext } from "@/contexts/AuthContextProvider.jsx";
import { useAuth } from "@/hooks/useAuth.js";

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider",
    );
  });

  it("returns context value when inside provider", () => {
    const mockValue = {
      user: { id: 1, username: "testuser", role: "USER" },
      login: () => {},
      logout: () => {},
      isAuthenticated: true,
    };

    const wrapper = ({ children }) => (
      <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBe(mockValue);
    expect(result.current.user.username).toBe("testuser");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns updated context on re-render", () => {
    const initialValue = { user: null, isAuthenticated: false };
    const updatedValue = {
      user: { id: 1, username: "testuser" },
      isAuthenticated: true,
    };

    let providerValue = initialValue;

    const wrapper = ({ children }) => (
      <AuthContext.Provider value={providerValue}>
        {children}
      </AuthContext.Provider>
    );

    const { result, rerender } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBe(initialValue);
    expect(result.current.isAuthenticated).toBe(false);

    providerValue = updatedValue;
    rerender();

    expect(result.current).toBe(updatedValue);
    expect(result.current.isAuthenticated).toBe(true);
  });
});
