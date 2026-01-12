import { useEffect, useState } from "react";
import { apiGet } from "../services/api.js";

/**
 * Hook to get the user's wallPlayback preference.
 * Returns "autoplay" | "hover" | "static"
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

  return { wallPlayback, loading };
};
