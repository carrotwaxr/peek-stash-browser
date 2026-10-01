import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  customThemeKey,
  isBuiltInThemeKey,
  parseCustomThemeKey,
} from "@peek/shared-types/themes.js";
import { apiGet } from "../api";
import { getErrorMessage } from "../api/client";
import {
  useUpdateUserSettings,
  useUserSettings,
} from "../api/hooks/useUserSettings";
import { useAuth } from "../hooks/useAuth";
import { showError } from "../utils/toast";
import {
  type CustomTheme,
  ThemeContext,
  type ThemeDefinition,
} from "./ThemeContext";
import { readStoredThemeKey, writeCachedThemeVars } from "./themeCache";
import {
  themes as builtInThemes,
  defaultTheme,
  generateThemeCSSVars,
} from "./themes";

const builtIns = builtInThemes as Record<string, ThemeDefinition>;
const fallbackTheme: ThemeDefinition = builtInThemes[defaultTheme];

/** The built-in themes plus the user's custom ones, keyed `custom-<id>` */
const mergeThemes = (
  customThemes: CustomTheme[]
): Record<string, ThemeDefinition> => {
  const merged: Record<string, ThemeDefinition> = { ...builtIns };
  customThemes.forEach((customTheme) => {
    merged[customThemeKey(customTheme.id)] = {
      name: customTheme.name,
      properties: generateThemeCSSVars(customTheme.config),
      isCustom: true,
      id: customTheme.id,
    };
  });
  return merged;
};

/**
 * The theme follows the account: the stored theme from the user's settings,
 * else the key this browser last painted, else peek. A key that names no
 * theme paints peek, except a custom key while the custom themes are still
 * loading, which keeps what is painted (the cached variables `main.tsx`
 * applied, or base.css's peek defaults), so the page is never unstyled.
 */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { data: settingsData } = useUserSettings();
  const { mutate: saveSettings } = useUpdateUserSettings();
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [customThemesLoaded, setCustomThemesLoaded] = useState(false);
  const [allThemes, setAllThemesState] =
    useState<Record<string, ThemeDefinition>>(builtIns);
  // What changeTheme validates against: set with the state, so a caller that
  // awaits refreshCustomThemes and then selects the new key in the same tick
  // does not read the closure of the render before the refresh.
  const allThemesRef = useRef(allThemes);
  const setAllThemes = (next: Record<string, ThemeDefinition>) => {
    allThemesRef.current = next;
    setAllThemesState(next);
  };

  // The key this browser painted last; the provider keeps it current, so
  // after sign-out the last theme stays on the login page
  const [localKey, setLocalKey] = useState(readStoredThemeKey);
  // The key the browser held at load, the one uploaded once below
  const [initialKey] = useState(localKey);
  const uploadSettledRef = useRef(false);

  const storedTheme = isAuthenticated ? settingsData?.settings.theme : null;
  const requestedKey = storedTheme ?? localKey ?? defaultTheme;
  const customThemesPending =
    authLoading || (isAuthenticated && !customThemesLoaded);
  // null: a custom theme still loading, so what is painted stays
  const resolvedKey = allThemes[requestedKey]
    ? requestedKey
    : customThemesPending && parseCustomThemeKey(requestedKey) !== null
      ? null
      : defaultTheme;
  const currentTheme = resolvedKey ?? requestedKey;

  // Load custom themes once auth has resolved, and only for a signed-in user:
  // a signed-out request answers 401, and apiFetch then reloads the page at
  // /login while the router is already redirecting there.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setCustomThemes([]);
      setAllThemes(builtIns);
      setCustomThemesLoaded(false);
      return;
    }

    // A response that lands after sign-out (or a later load) is dropped.
    let cancelled = false;
    const loadCustomThemes = async () => {
      try {
        const data = await apiGet<{
          themes?: CustomTheme[];
        }>("/themes/custom");
        if (cancelled) return;
        const themes = data.themes ?? [];
        setCustomThemes(themes);
        setAllThemes(mergeThemes(themes));
      } catch (error) {
        if (cancelled) return;
        // If the API call fails, just use built-in themes
        console.error("Failed to load custom themes:", error);
        setAllThemes(builtIns);
      }
      setCustomThemesLoaded(true);
    };

    void loadCustomThemes();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading]);

  // Before the account held a theme it lived in each browser: upload this
  // browser's key once, when it is a theme of this user's (built-in or their
  // own custom theme). Another user's custom key is never saved.
  useEffect(() => {
    if (uploadSettledRef.current || !isAuthenticated || !settingsData) return;
    if (settingsData.settings.theme !== null || initialKey === null) {
      uploadSettledRef.current = true;
      return;
    }
    if (!isBuiltInThemeKey(initialKey) && !customThemesLoaded) return;
    uploadSettledRef.current = true;
    if (allThemes[initialKey]) saveSettings({ theme: initialKey });
  }, [
    isAuthenticated,
    settingsData,
    initialKey,
    customThemesLoaded,
    allThemes,
    saveSettings,
  ]);

  // Paint before the browser does, and remember what was painted
  useLayoutEffect(() => {
    if (resolvedKey === null) return;
    const theme = allThemes[resolvedKey] ?? fallbackTheme;
    const root = document.documentElement;
    Object.entries(theme.properties).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });
    writeCachedThemeVars(resolvedKey, theme.properties);
    setLocalKey(resolvedKey);
  }, [resolvedKey, allThemes]);

  const changeTheme = (themeKey: string) => {
    if (!allThemesRef.current[themeKey]) return;
    setLocalKey(themeKey);
    // The settings cache takes the key at once; a refused save refetches it,
    // so the stored theme applies again
    saveSettings(
      { theme: themeKey },
      {
        onError: (err) =>
          showError(getErrorMessage(err, "Couldn't save the theme")),
      }
    );
  };

  const refreshCustomThemes = async () => {
    try {
      const data = await apiGet<{
        themes?: CustomTheme[];
      }>("/themes/custom");
      const themes = data.themes ?? [];
      setCustomThemes(themes);
      setAllThemes(mergeThemes(themes));
      setCustomThemesLoaded(true);
    } catch (error) {
      console.error("Failed to refresh custom themes:", error);
    }
  };

  const value = {
    currentTheme,
    changeTheme,
    theme: allThemes[currentTheme],
    availableThemes: Object.entries(allThemes).map(([key, theme]) => ({
      key,
      name: theme.name,
      isCustom: theme.isCustom ?? false,
    })),
    customThemes,
    refreshCustomThemes,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
