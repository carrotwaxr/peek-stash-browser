import { createContext, useContext } from "react";
import { UNITS } from "../utils/unitConversions";

export const UnitPreferenceContext = createContext({
  unitPreference: UNITS.METRIC,
  setUnitPreference: (_unit: string): Promise<void> => Promise.resolve(),
  isLoading: true,
});

export const useUnitPreference = () => useContext(UnitPreferenceContext);
