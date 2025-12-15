import { useState, useCallback } from "react";
import axios from "axios";
import { UnitPreferenceContext } from "./UnitPreferenceContext.js";
import { UNITS } from "../utils/unitConversions.js";

const api = axios.create({ baseURL: "/api", withCredentials: true });

export const UnitPreferenceProvider = ({
  children,
  initialValue = UNITS.METRIC,
}) => {
  const [unitPreference, setUnitPreferenceState] = useState(initialValue);

  const setUnitPreference = useCallback(async (newUnit) => {
    setUnitPreferenceState(newUnit);
    try {
      await api.put("/user/settings", { unitPreference: newUnit });
    } catch (error) {
      console.error("Failed to save unit preference:", error);
    }
  }, []);

  const value = { unitPreference, setUnitPreference };

  return (
    <UnitPreferenceContext.Provider value={value}>
      {children}
    </UnitPreferenceContext.Provider>
  );
};
