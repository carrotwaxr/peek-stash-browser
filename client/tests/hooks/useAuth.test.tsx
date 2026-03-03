import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { AuthContext, type AuthContextValue } from "@/contexts/AuthContextProvider";
import { useAuth } from "@/hooks/useAuth";

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
      isLoading: false,
      updateUser: () => {},
    } as unknown as AuthContextValue;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current).toBe(mockValue);
    expect(result.current.user!.username).toBe("testuser");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("returns updated context on re-render", () => {
    const initialValue = {
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: () => {},
      logout: () => {},
      updateUser: () => {},
    } as unknown as AuthContextValue;
    const updatedValue = {
      user: { id: 1, username: "testuser" },
      isAuthenticated: true,
      isLoading: false,
      login: () => {},
      logout: () => {},
      updateUser: () => {},
    } as unknown as AuthContextValue;

    let providerValue: AuthContextValue = initialValue;

    const wrapper = ({ children }: { children: React.ReactNode }) => (
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
