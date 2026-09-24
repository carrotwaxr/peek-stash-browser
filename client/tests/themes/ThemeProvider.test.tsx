import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createAuthValue } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthContext,
  type AuthContextValue,
} from "@/contexts/AuthContextProvider";
import { ThemeProvider } from "@/themes/ThemeProvider";
import { themes as builtInThemes } from "@/themes/themes";
import { useTheme } from "@/themes/useTheme";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockGet(...args),
}));

const customTheme = {
  id: 7,
  name: "Night Owl",
  config: {
    mode: "dark",
    fonts: {
      brand: "Inter",
      heading: "Inter",
      body: "Inter",
      mono: "monospace",
    },
    colors: {
      background: "#101010",
      backgroundSecondary: "#181818",
      backgroundCard: "#202020",
      text: "#f0f0f0",
      border: "#303030",
    },
    accents: { primary: "#3b82f6", secondary: "#8b5cf6" },
    status: {
      success: "#22c55e",
      error: "#ef4444",
      info: "#3b82f6",
      warning: "#f59e0b",
    },
  },
};

/** Renders useTheme under a ThemeProvider whose auth state can change. */
function renderTheme(initialAuth: AuthContextValue) {
  let auth = initialAuth;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthContext.Provider value={auth}>
      <ThemeProvider>{children}</ThemeProvider>
    </AuthContext.Provider>
  );
  const view = renderHook(() => useTheme(), { wrapper });
  return {
    ...view,
    setAuth: (next: AuthContextValue) => {
      auth = next;
      view.rerender();
    },
  };
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockGet.mockResolvedValue({ themes: [customTheme] });
  });

  it("does not ask for custom themes while signed out", async () => {
    const { result } = renderTheme(
      createAuthValue({ isAuthenticated: false, isLoading: false })
    );

    // Let any request the mount started settle before checking.
    await act(async () => {});
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.customThemes).toEqual([]);
    expect(result.current.availableThemes).toHaveLength(
      Object.keys(builtInThemes).length
    );
  });

  it("loads custom themes once the user signs in", async () => {
    const { result, setAuth } = renderTheme(
      createAuthValue({ isAuthenticated: false, isLoading: false })
    );

    setAuth(createAuthValue({ isAuthenticated: true, isLoading: false }));

    await waitFor(() => {
      expect(result.current.customThemes).toEqual([customTheme]);
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/themes/custom");
    expect(result.current.availableThemes).toContainEqual({
      key: "custom-7",
      name: "Night Owl",
      isCustom: true,
    });
  });
});
