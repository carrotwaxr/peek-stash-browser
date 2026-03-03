import { createContext } from "react";

export interface TVModeContextValue {
  isTVMode: boolean;
  toggleTVMode: () => void;
}

export const TVModeContext = createContext<TVModeContextValue | null>(null);
