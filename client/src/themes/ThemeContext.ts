import { createContext } from "react";
import type { ThemeConfig } from "./themes";

export interface ThemeDefinition {
  name: string;
  properties: Record<string, string>;
  isCustom?: boolean;
  id?: number;
}

export interface CustomTheme {
  id: number;
  name: string;
  config: ThemeConfig;
}

export interface AvailableTheme {
  key: string;
  name: string;
  isCustom: boolean;
}

export interface ThemeContextValue {
  currentTheme: string;
  changeTheme: (themeKey: string) => void;
  theme: ThemeDefinition | undefined;
  availableThemes: AvailableTheme[];
  customThemes: CustomTheme[];
  refreshCustomThemes: () => Promise<void>;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
