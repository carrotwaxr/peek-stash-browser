import React, { useState } from "react";
import { TVModeContext } from "./TVModeContext.js";

export const TVModeProvider = ({ children }) => {
  /*const [isTVMode, setIsTVMode] = useState(() => {
    // Load TV mode preference from localStorage (default: false)
    const saved = localStorage.getItem("peek-tv-mode");
    return saved === "true";
  });*/
  const [isTVMode, setIsTVMode] = useState(true);

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
