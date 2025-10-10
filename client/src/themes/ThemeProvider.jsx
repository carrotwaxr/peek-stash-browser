import React, { useEffect, useState } from "react";
import { themes, defaultTheme } from "./themes.js";
import { ThemeContext } from "./ThemeContext.js";

export const ThemeProvider = ({ children }) => {
  const [currentTheme, setCurrentTheme] = useState(() => {
    // Load theme from localStorage or use default
    const saved = localStorage.getItem("app-theme");
    return saved && themes[saved] ? saved : defaultTheme;
  });

  const changeTheme = (themeKey) => {
    if (themes[themeKey]) {
      setCurrentTheme(themeKey);
      localStorage.setItem("app-theme", themeKey);
    }
  };

  // Apply CSS custom properties when theme changes
  useEffect(() => {
    const root = document.documentElement;
    const theme = themes[currentTheme];

    if (theme) {
      // Apply all theme properties to CSS custom properties
      Object.entries(theme.properties).forEach(([property, value]) => {
        root.style.setProperty(property, value);
      });
    }
  }, [currentTheme]);

  const value = {
    currentTheme,
    changeTheme,
    theme: themes[currentTheme],
    availableThemes: Object.keys(themes).map((key) => ({
      key,
      name: themes[key].name,
    })),
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};
