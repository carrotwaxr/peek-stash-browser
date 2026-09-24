import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { apiGet, apiPut } from "../api";
import { useAuth } from "../hooks/useAuth";
import { UNITS } from "../utils/unitConversions";
import { UnitPreferenceContext } from "./UnitPreferenceContext";

export const UnitPreferenceProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [unitPreference, setUnitPreferenceState] = useState(UNITS.METRIC);
  const [isLoading, setIsLoading] = useState(true);

  // Load once auth has resolved, and only for a signed-in user: a signed-out
  // request answers 401, and apiFetch then reloads the page at /login while
  // the router is already redirecting there. Until auth resolves, isLoading
  // stays true.
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setUnitPreferenceState(UNITS.METRIC);
      setIsLoading(false);
      return;
    }

    // A response that lands after sign-out (or a later load) is dropped.
    let cancelled = false;
    setIsLoading(true);
    const loadUnitPreference = async () => {
      try {
        const data = await apiGet<{ settings: { unitPreference?: string } }>(
          "/user/settings"
        );
        if (cancelled) return;
        const { settings } = data;
        setUnitPreferenceState(settings.unitPreference || UNITS.METRIC);
      } catch {
        if (!cancelled) setUnitPreferenceState(UNITS.METRIC);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadUnitPreference();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authLoading]);

  const setUnitPreference = useCallback(
    async (newUnit: string) => {
      const previousUnit = unitPreference;
      setUnitPreferenceState(newUnit);
      try {
        await apiPut("/user/settings", { unitPreference: newUnit });
      } catch (error) {
        console.error("Failed to save unit preference:", error);
        // Revert to previous value on error
        setUnitPreferenceState(previousUnit);
        toast.error("Failed to save unit preference");
      }
    },
    [unitPreference]
  );

  const value = {
    unitPreference,
    setUnitPreference: setUnitPreference as unknown as () => void,
    isLoading,
  };

  return (
    <UnitPreferenceContext.Provider value={value}>
      {children}
    </UnitPreferenceContext.Provider>
  );
};
