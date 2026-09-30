import type React from "react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Hook for card keyboard navigation (TV mode support)
 * @param {Object} options
 * @param {string} options.linkTo - Navigation URL, used when there is no onActivate
 * @param {Function} options.onActivate - What Enter or Space on the card does
 * @returns {Object} - { onKeyDown }
 */
interface UseCardKeyboardNavOptions {
  linkTo?: string;
  onActivate?: () => void;
}

export const useCardKeyboardNav = ({
  linkTo,
  onActivate,
}: UseCardKeyboardNavOptions) => {
  const navigate = useNavigate();

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      // Only the card itself: a button, link or input inside it keeps its own
      // Enter and Space
      if (e.target !== e.currentTarget) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();

        if (onActivate) {
          onActivate();
        } else if (linkTo) {
          void navigate(linkTo);
        }
      }
    },
    [linkTo, onActivate, navigate]
  );

  return { onKeyDown };
};
