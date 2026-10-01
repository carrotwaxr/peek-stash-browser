import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { userSettingsResponse } from "@tests/helpers/userSettings";
import { actAsync, createAuthValue } from "@tests/testUtils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/api/queryKeys";
import {
  AuthContext,
  type AuthContextValue,
} from "@/contexts/AuthContextProvider";
import { ThemeProvider } from "@/themes/ThemeProvider";
import { applyCachedTheme } from "@/themes/themeCache";
import { themes as builtInThemes } from "@/themes/themes";
import { useTheme } from "@/themes/useTheme";
import { showError } from "@/utils/toast";

const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn<(...args: unknown[]) => unknown>(),
  mockPut: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock("@/api", () => ({
  apiGet: (...args: unknown[]) => mockGet(...args),
  apiPut: (...args: unknown[]) => mockPut(...args),
}));

vi.mock("@/utils/toast", () => ({ showError: vi.fn() }));

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

/** What the two endpoints answer; a test replaces either */
let settingsAnswer: () => unknown;
let customThemesAnswer: () => unknown;

const signedIn = () =>
  createAuthValue({ isAuthenticated: true, isLoading: false });
const signedOut = () =>
  createAuthValue({ isAuthenticated: false, isLoading: false });

/** The background the document root paints */
const rootBackground = () =>
  document.documentElement.style.getPropertyValue("--bg-primary");

/** A promise the test settles when it chooses */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Renders useTheme under a ThemeProvider whose auth state can change. */
function renderTheme(initialAuth: AuthContextValue) {
  let auth = initialAuth;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <ThemeProvider>{children}</ThemeProvider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  const view = renderHook(() => useTheme(), { wrapper });
  return {
    ...view,
    queryClient,
    setAuth: (next: AuthContextValue) => {
      auth = next;
      view.rerender();
    },
  };
}

const calls = (path: string) =>
  mockGet.mock.calls.filter(([called]) => called === path).length;

const themeSaves = () =>
  mockPut.mock.calls.filter(([path]) => path === "/user/settings");

describe("ThemeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("style");
    settingsAnswer = () => userSettingsResponse({ theme: null });
    customThemesAnswer = () => ({ themes: [customTheme] });
    mockGet.mockImplementation((path: unknown) =>
      Promise.resolve(
        path === "/user/settings" ? settingsAnswer() : customThemesAnswer()
      )
    );
    mockPut.mockResolvedValue({ success: true });
  });

  it("does not ask for custom themes or settings while signed out", async () => {
    const { result } = renderTheme(signedOut());

    // Let any request the mount started settle before checking.
    await act(async () => {});
    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.customThemes).toEqual([]);
    expect(result.current.availableThemes).toHaveLength(
      Object.keys(builtInThemes).length
    );
    expect(rootBackground()).toBe(
      builtInThemes.peek.properties["--bg-primary"]
    );
  });

  it("loads custom themes once the user signs in", async () => {
    const { result, setAuth } = renderTheme(signedOut());

    setAuth(signedIn());

    await waitFor(() => {
      expect(result.current.customThemes).toEqual([customTheme]);
    });
    expect(calls("/themes/custom")).toBe(1);
    expect(result.current.availableThemes).toContainEqual({
      key: "custom-7",
      name: "Night Owl",
      isCustom: true,
    });
  });

  it("the user's stored theme from /user/settings wins over a different localStorage key", async () => {
    localStorage.setItem("app-theme", "light");
    settingsAnswer = () => userSettingsResponse({ theme: "midnight" });

    const { result } = renderTheme(signedIn());

    await waitFor(() => {
      expect(result.current.currentTheme).toBe("midnight");
    });
    expect(rootBackground()).toBe(
      builtInThemes.midnight.properties["--bg-primary"]
    );
    expect(localStorage.getItem("app-theme")).toBe("midnight");
    expect(themeSaves()).toHaveLength(0);
  });

  it("with theme null in settings and a valid localStorage key, that key is applied and saved once to the server", async () => {
    localStorage.setItem("app-theme", "deepPurple");

    const { rerender } = renderTheme(signedIn());

    await waitFor(() => {
      expect(themeSaves()).toHaveLength(1);
    });
    expect(themeSaves()[0]).toEqual([
      "/user/settings",
      { theme: "deepPurple" },
    ]);
    expect(rootBackground()).toBe(
      builtInThemes.deepPurple.properties["--bg-primary"]
    );

    rerender();
    await actAsync(() => {});
    expect(themeSaves()).toHaveLength(1);
  });

  it("a stored key naming another user's custom theme is not saved, and the default applies", async () => {
    localStorage.setItem("app-theme", "custom-42");

    const { result } = renderTheme(signedIn());

    await waitFor(() => {
      expect(result.current.customThemes).toEqual([customTheme]);
    });
    await waitFor(() => {
      expect(result.current.currentTheme).toBe("peek");
    });
    expect(rootBackground()).toBe(
      builtInThemes.peek.properties["--bg-primary"]
    );
    expect(themeSaves()).toHaveLength(0);
  });

  it("an unknown key falls back to peek once the custom themes have loaded, never to no variables", async () => {
    // The browser last painted Light under a key that names no theme now
    localStorage.setItem("app-theme", "custom-99");
    localStorage.setItem(
      "app-theme-vars",
      JSON.stringify(builtInThemes.light.properties)
    );
    applyCachedTheme();
    const lightBackground = builtInThemes.light.properties["--bg-primary"];
    expect(rootBackground()).toBe(lightBackground);

    const themesLoad = deferred<unknown>();
    customThemesAnswer = () => themesLoad.promise;
    renderTheme(signedIn());

    // The custom themes are still loading: what is painted stays
    await waitFor(() => {
      expect(calls("/user/settings")).toBe(1);
    });
    await actAsync(() => {});
    expect(rootBackground()).toBe(lightBackground);

    await act(async () => {
      themesLoad.resolve({ themes: [customTheme] });
      await themesLoad.promise;
    });
    await waitFor(() => {
      expect(rootBackground()).toBe(
        builtInThemes.peek.properties["--bg-primary"]
      );
    });
  });

  it("a key that is no theme at all paints peek at once", () => {
    localStorage.setItem("app-theme", "dark");

    const { result } = renderTheme(signedOut());

    expect(result.current.currentTheme).toBe("peek");
    expect(rootBackground()).toBe(
      builtInThemes.peek.properties["--bg-primary"]
    );
  });

  it("a custom key keeps the cached variables while /themes/custom is pending", async () => {
    // This browser last painted Light; the account has since chosen custom-7
    localStorage.setItem("app-theme", "light");
    localStorage.setItem(
      "app-theme-vars",
      JSON.stringify(builtInThemes.light.properties)
    );
    applyCachedTheme();
    settingsAnswer = () => userSettingsResponse({ theme: "custom-7" });
    const themesLoad = deferred<unknown>();
    customThemesAnswer = () => themesLoad.promise;

    const { result } = renderTheme(signedIn());

    await waitFor(() => {
      expect(result.current.currentTheme).toBe("custom-7");
    });
    expect(rootBackground()).toBe(
      builtInThemes.light.properties["--bg-primary"]
    );

    await act(async () => {
      themesLoad.resolve({ themes: [customTheme] });
      await themesLoad.promise;
    });
    await waitFor(() => {
      expect(rootBackground()).toBe("#101010");
    });
    // The cache keeps peek's variables for a custom theme, never its colours
    expect(localStorage.getItem("app-theme")).toBe("custom-7");
    expect(localStorage.getItem("app-theme-vars")).toBe(
      JSON.stringify(builtInThemes.peek.properties)
    );
  });

  it("changeTheme applies at once, writes localStorage and the cache, and PUTs { theme } through useUpdateUserSettings", async () => {
    settingsAnswer = () => userSettingsResponse({ theme: "peek" });
    const { result, queryClient } = renderTheme(signedIn());
    // The stored settings are in (a save before they load reads them again)
    await waitFor(() => {
      expect(queryClient.getQueryData(queryKeys.user.settings())).toBeDefined();
    });
    expect(calls("/user/settings")).toBe(1);

    act(() => {
      result.current.changeTheme("light");
    });

    // The settings cache takes the key as the save starts
    await waitFor(() => {
      expect(result.current.currentTheme).toBe("light");
    });
    expect(rootBackground()).toBe(
      builtInThemes.light.properties["--bg-primary"]
    );
    expect(localStorage.getItem("app-theme")).toBe("light");
    expect(localStorage.getItem("app-theme-vars")).toBe(
      JSON.stringify(builtInThemes.light.properties)
    );
    expect(themeSaves()).toEqual([["/user/settings", { theme: "light" }]]);
  });

  it("a refused save shows an error and the stored theme applies again", async () => {
    settingsAnswer = () => userSettingsResponse({ theme: "peek" });
    const { result } = renderTheme(signedIn());
    await waitFor(() => {
      expect(calls("/user/settings")).toBe(1);
    });
    mockPut.mockRejectedValue("refused");

    act(() => {
      result.current.changeTheme("light");
    });

    await waitFor(() => {
      expect(showError).toHaveBeenCalledWith("Couldn't save the theme");
    });
    await waitFor(() => {
      expect(result.current.currentTheme).toBe("peek");
    });
    expect(rootBackground()).toBe(
      builtInThemes.peek.properties["--bg-primary"]
    );
  });

  it("after sign-out the last variables stay (no unstyled login page)", async () => {
    settingsAnswer = () => userSettingsResponse({ theme: "light" });
    const { result, setAuth } = renderTheme(signedIn());
    const lightBackground = builtInThemes.light.properties["--bg-primary"];
    await waitFor(() => {
      expect(rootBackground()).toBe(lightBackground);
    });

    setAuth(signedOut());
    await actAsync(() => {});

    expect(result.current.currentTheme).toBe("light");
    expect(rootBackground()).toBe(lightBackground);
  });

  it("changeTheme right after refreshCustomThemes accepts the new key", async () => {
    customThemesAnswer = () => ({ themes: [] });
    const { result } = renderTheme(signedIn());
    await waitFor(() => {
      expect(calls("/themes/custom")).toBe(1);
    });

    // The server now has the theme; the same tick that refreshes it selects it
    customThemesAnswer = () => ({ themes: [customTheme] });
    await act(async () => {
      await result.current.refreshCustomThemes();
      result.current.changeTheme("custom-7");
    });

    expect(result.current.currentTheme).toBe("custom-7");
    expect(localStorage.getItem("app-theme")).toBe("custom-7");
    expect(rootBackground()).toBe("#101010");
  });

  it("still refuses a key no theme has", async () => {
    const { result } = renderTheme(signedIn());
    await waitFor(() => {
      expect(result.current.customThemes).toEqual([customTheme]);
    });

    act(() => {
      result.current.changeTheme("custom-99");
    });

    expect(result.current.currentTheme).not.toBe("custom-99");
    expect(localStorage.getItem("app-theme")).not.toBe("custom-99");
    expect(themeSaves()).toHaveLength(0);
  });
});
