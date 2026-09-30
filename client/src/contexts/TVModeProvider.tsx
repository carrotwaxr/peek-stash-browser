import React, { useEffect, useState } from "react";
import { TVModeContext } from "./TVModeContext";

export const TVModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isTVMode, setIsTVMode] = useState(() => {
    // Load TV mode preference from localStorage (default: false)
    const saved = localStorage.getItem("peek-tv-mode");
    return saved === "true";
  });

  // `html.tv-mode` scopes the TV focus styles (index.css)
  useEffect(() => {
    document.documentElement.classList.toggle("tv-mode", isTVMode);
  }, [isTVMode]);

  const toggleTVMode = () => {
    setIsTVMode((prev) => {
      const newValue = !prev;
      localStorage.setItem("peek-tv-mode", String(newValue));
      return newValue;
    });
  };

  const value = {
    isTVMode,
    toggleTVMode,
  };

  return (
    <TVModeContext.Provider value={value}>{children}</TVModeContext.Provider>
  );
};
