import { createContext, useContext } from "react";
import { UNITS } from "../utils/unitConversions";

export const UnitPreferenceContext = createContext({
  unitPreference: UNITS.METRIC,
  setUnitPreference: () => {},
  isLoading: true,
});

export const useUnitPreference = () => useContext(UnitPreferenceContext);
