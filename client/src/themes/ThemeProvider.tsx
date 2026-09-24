import React, { useEffect, useState } from "react";
import { apiGet } from "../api";
import { useAuth } from "../hooks/useAuth";
import {
  type CustomTheme,
  ThemeContext,
  type ThemeDefinition,
} from "./ThemeContext";
import {
  themes as builtInThemes,
  defaultTheme,
  generateThemeCSSVars,
} from "./themes";

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([]);
  const [allThemes, setAllThemes] = useState<Record<string, ThemeDefinition>>(
    builtInThemes as Record<string, ThemeDefinition>
  );

  const [currentTheme, setCurrentTheme] = useState(() => {
    // Load theme from localStorage or use default
    const saved = localStorage.getItem("app-theme");
    return saved || defaultTheme;
  });

  // Load custom themes once auth has resolved, and only for a signed-in user:
  // a signed-out request answers 401, and apiFetch then reloads the page at
  // /login while the router is already redirecting there.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setCustomThemes([]);
      setAllThemes(builtInThemes as Record<string, ThemeDefinition>);
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

        // Merge built-in themes with custom themes
        const merged: Record<string, ThemeDefinition> = {
          ...(builtInThemes as Record<string, ThemeDefinition>),
        };
        themes.forEach((customTheme) => {
          const key = `custom-${customTheme.id}`;
          merged[key] = {
            name: customTheme.name,
            properties: generateThemeCSSVars(customTheme.config),
            isCustom: true,
            id: customTheme.id,
          };
        });
        setAllThemes(merged);
      } catch (error) {
        if (cancelled) return;
        // If the API call fails, just use built-in themes
        console.error("Failed to load custom themes:", error);
        setAllThemes(builtInThemes as Record<string, ThemeDefinition>);
      }
    };

    void loadCustomThemes();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading]);

  const changeTheme = (themeKey: string) => {
    if (allThemes[themeKey]) {
      setCurrentTheme(themeKey);
      localStorage.setItem("app-theme", themeKey);
    }
  };

  const refreshCustomThemes = async () => {
    try {
      const data = await apiGet<{
        themes?: CustomTheme[];
      }>("/themes/custom");
      const themes = data.themes ?? [];
      setCustomThemes(themes);

      // Merge built-in themes with custom themes
      const merged: Record<string, ThemeDefinition> = {
        ...(builtInThemes as Record<string, ThemeDefinition>),
      };
      themes.forEach((customTheme) => {
        const key = `custom-${customTheme.id}`;
        merged[key] = {
          name: customTheme.name,
          properties: generateThemeCSSVars(customTheme.config),
          isCustom: true,
          id: customTheme.id,
        };
      });
      setAllThemes(merged);
    } catch (error) {
      console.error("Failed to refresh custom themes:", error);
    }
  };

  // Apply CSS custom properties when theme changes
  useEffect(() => {
    const root = document.documentElement;
    const theme = allThemes[currentTheme];

    if (theme) {
      // Apply all theme properties to CSS custom properties
      Object.entries(theme.properties).forEach(([property, value]) => {
        root.style.setProperty(property, value);
      });
    } else {
      // Fallback to built-in theme if custom theme not loaded yet
      const builtIn = (builtInThemes as Record<string, ThemeDefinition>)[
        currentTheme
      ];
      if (builtIn) {
        Object.entries(builtIn.properties).forEach(([property, value]) => {
          root.style.setProperty(property, value);
        });
      }
    }
  }, [currentTheme, allThemes]);

  const value = {
    currentTheme,
    changeTheme,
    theme: allThemes[currentTheme],
    availableThemes: Object.entries(allThemes).map(([key, theme]) => ({
      key,
      name: theme.name,
      isCustom: theme.isCustom || false,
    })),
    customThemes,
    refreshCustomThemes,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
