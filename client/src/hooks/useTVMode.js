import { useContext } from "react";
import { TVModeContext } from "../contexts/TVModeContext.js";

export const useTVMode = () => {
  const context = useContext(TVModeContext);
  if (!context) {
    throw new Error("useTVMode must be used within a TVModeProvider");
  }
  return context;
};
