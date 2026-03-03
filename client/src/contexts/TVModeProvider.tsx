import React, { useState } from "react";
import { TVModeContext } from "./TVModeContext";

export const TVModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isTVMode, setIsTVMode] = useState(() => {
    // Load TV mode preference from localStorage (default: false)
    const saved = localStorage.getItem("peek-tv-mode");
    return saved === "true";
  });

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
