import React, { useEffect, useState } from "react";
import { themes as builtInThemes, defaultTheme, generateThemeCSSVars } from "./themes.js";
import { ThemeContext } from "./ThemeContext.js";
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

export const ThemeProvider = ({ children }) => {
  const [customThemes, setCustomThemes] = useState([]);
  const [allThemes, setAllThemes] = useState(builtInThemes);

  const [currentTheme, setCurrentTheme] = useState(() => {
    // Load theme from localStorage or use default
    const saved = localStorage.getItem("app-theme");
    return saved || defaultTheme;
  });

  // Load custom themes from API on mount
  useEffect(() => {
    const loadCustomThemes = async () => {
      try {
        const response = await api.get("/themes/custom");
        const themes = response.data.themes || [];
        setCustomThemes(themes);

        // Merge built-in themes with custom themes
        const merged = { ...builtInThemes };
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
        // If API call fails (not authenticated, etc.), just use built-in themes
        console.error("Failed to load custom themes:", error);
        setAllThemes(builtInThemes);
      }
    };

    loadCustomThemes();
  }, []);

  const changeTheme = (themeKey) => {
    if (allThemes[themeKey]) {
      setCurrentTheme(themeKey);
      localStorage.setItem("app-theme", themeKey);
    }
  };

  const refreshCustomThemes = async () => {
    try {
      const response = await api.get("/themes/custom");
      const themes = response.data.themes || [];
      setCustomThemes(themes);

      // Merge built-in themes with custom themes
      const merged = { ...builtInThemes };
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
    } else if (builtInThemes[currentTheme]) {
      // Fallback to built-in theme if custom theme not loaded yet
      Object.entries(builtInThemes[currentTheme].properties).forEach(([property, value]) => {
        root.style.setProperty(property, value);
      });
    }
  }, [currentTheme, allThemes]);

  const value = {
    currentTheme,
    changeTheme,
    theme: allThemes[currentTheme],
    availableThemes: Object.keys(allThemes).map((key) => ({
      key,
      name: allThemes[key].name,
      isCustom: allThemes[key].isCustom || false,
    })),
    customThemes,
    refreshCustomThemes,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
