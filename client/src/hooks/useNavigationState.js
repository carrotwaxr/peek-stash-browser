import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Hook for contextual back navigation.
 *
 * Reads `fromPageTitle` from location state (set by navigating pages)
 * and provides utilities for back navigation with contextual text.
 *
 * @returns {Object} { fromPageTitle, backButtonText, goBack }
 *
 * @example
 * const { goBack, backButtonText } = useNavigationState();
 * <Button onClick={goBack}>{backButtonText}</Button>
 */
export const useNavigationState = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get the title of the page we came from
  const fromPageTitle = location.state?.fromPageTitle;

  // Generate back button text with graceful fallback
  const backButtonText =
    fromPageTitle && fromPageTitle.trim() !== ""
      ? `Back to ${fromPageTitle}`
      : "Back";

  // Go back using browser history
  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return {
    fromPageTitle,
    backButtonText,
    goBack,
  };
};
