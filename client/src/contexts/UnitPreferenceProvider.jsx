import { useState, useCallback, useEffect } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { UnitPreferenceContext } from "./UnitPreferenceContext.js";
import { UNITS } from "../utils/unitConversions.js";

const api = axios.create({ baseURL: "/api", withCredentials: true });

export const UnitPreferenceProvider = ({ children }) => {
  const [unitPreference, setUnitPreferenceState] = useState(UNITS.METRIC);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUnitPreference = async () => {
      try {
        const response = await api.get("/user/settings");
        const { settings } = response.data;
        setUnitPreferenceState(settings.unitPreference || UNITS.METRIC);
      } catch {
        setUnitPreferenceState(UNITS.METRIC);
      } finally {
        setIsLoading(false);
      }
    };
    loadUnitPreference();
  }, []);

  const setUnitPreference = useCallback(async (newUnit) => {
    const previousUnit = unitPreference;
    setUnitPreferenceState(newUnit);
    try {
      await api.put("/user/settings", { unitPreference: newUnit });
    } catch (error) {
      console.error("Failed to save unit preference:", error);
      // Revert to previous value on error
      setUnitPreferenceState(previousUnit);
      toast.error("Failed to save unit preference");
    }
  }, [unitPreference]);

  const value = { unitPreference, setUnitPreference, isLoading };

  return (
    <UnitPreferenceContext.Provider value={value}>
      {children}
    </UnitPreferenceContext.Provider>
  );
};
