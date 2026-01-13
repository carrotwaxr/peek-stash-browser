import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../services/api.js";

/**
 * Hook to get the user's wallPlayback preference.
 * Returns "autoplay" | "hover" | "static" and a setter to update local state
 */
export const useWallPlayback = () => {
  const [wallPlayback, setWallPlayback] = useState("autoplay");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSetting = async () => {
      try {
        const response = await apiGet("/user/settings");
        setWallPlayback(response.settings?.wallPlayback || "autoplay");
      } catch {
        // Default to autoplay on error
        setWallPlayback("autoplay");
      } finally {
        setLoading(false);
      }
    };

    loadSetting();
  }, []);

  // Update local state (called after API save succeeds in ContextSettings)
  const updateWallPlayback = useCallback((value) => {
    setWallPlayback(value);
  }, []);

  return { wallPlayback, loading, updateWallPlayback };
};
