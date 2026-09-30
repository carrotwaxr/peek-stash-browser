/**
 * CustomThemeManager: a theme the user creates is applied at once. The
 * manager refreshes the list and selects the new key in the same tick, so
 * the provider must accept a key it has only just loaded.
 */
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createAuthValue } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CustomThemeManager from "@/components/settings/CustomThemeManager";
import {
  AuthContext,
  type AuthContextValue,
} from "@/contexts/AuthContextProvider";
import { ThemeProvider } from "@/themes/ThemeProvider";

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn<(...args: unknown[]) => unknown>(),
  mockPost: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockGet(...args),
  apiPost: (...args: unknown[]) => mockPost(...args),
  apiPut: vi.fn(),
  apiDelete: vi.fn(),
}));

vi.mock("@/utils/toast", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

const config = {
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
};

// The editor's form is not under test: a Save button hands the manager a theme
vi.mock("@/components/settings/CustomThemeEditor", () => ({
  default: ({
    onSave,
  }: {
    onSave: (data: { name: string; config: typeof config }) => void;
  }) => (
    <button onClick={() => onSave({ name: "Night Owl", config })}>
      Save theme
    </button>
  ),
}));

const wrapper = (auth: AuthContextValue) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthContext.Provider value={auth}>
        <ThemeProvider>{children}</ThemeProvider>
      </AuthContext.Provider>
    );
  };

describe("CustomThemeManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("style");
    mockGet.mockResolvedValue({ themes: [] });
  });

  it("creating a theme applies it: the root style gets its properties and localStorage app-theme is custom-<id>", async () => {
    mockPost.mockResolvedValue({ theme: { id: 7, name: "Night Owl", config } });
    const Wrapper = wrapper(
      createAuthValue({ isAuthenticated: true, isLoading: false })
    );
    render(<CustomThemeManager />, { wrapper: Wrapper });
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledTimes(1);
    });

    // The refresh after the create answers with the new theme
    mockGet.mockResolvedValue({
      themes: [{ id: 7, name: "Night Owl", config }],
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /Create Your First Theme/ })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save theme" }));

    await waitFor(() => {
      expect(localStorage.getItem("app-theme")).toBe("custom-7");
    });
    await waitFor(() => {
      expect(
        document.documentElement.style.getPropertyValue("--bg-primary")
      ).toBe("#101010");
    });
  });
});
